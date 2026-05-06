import crypto from "crypto"
import { FastifyInstance } from "fastify"
import { z } from "zod"

import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { rateLimit } from "../middleware/rateLimit"
import { recordAuditEvent } from "../db/audit"
import { signToken } from "../auth/jwt"
import { deviceBelongsToUser, ensureDeviceVaultAccess, getRequestDeviceId, userOwnsVault } from "./access"

const kdfSchema = z.object({
  alg: z.literal("SCRYPT"),
  N: z.number().int().positive(),
  r: z.number().int().positive(),
  p: z.number().int().positive(),
  dkLen: z.number().int().positive(),
  saltB64: z.string().min(1),
})

const artifactEnvelopeSchema = z.object({
  vaultId: z.string().min(1),
  role: z.enum(["target", "personal"]),
  nonceB64: z.string().min(1),
  ciphertextB64: z.string().min(1),
})

const upsertSchema = z.object({
  recoveryId: z.string().min(8).max(64),
  version: z.number().int().positive(),
  keyVersion: z.string().min(1).max(16),
  alg: z.literal("XCHACHA20-POLY1305"),
  kdf: kdfSchema,
  verifierB64: z.string().min(1),
  envelopes: z.array(artifactEnvelopeSchema).min(1),
})

const redeemSchema = z.object({
  proofB64: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1),
  platform: z.enum(["ios", "android"]),
})

const redeemVaultSchema = z.object({
  proofB64: z.string().min(1),
})

const PERSONAL_VAULT_NAME = "Personal"

export async function registerRecoveryEnvelopeRoutes(app: FastifyInstance) {
  const redeemLimiter = rateLimit({
    enabled: false,
    windowMs: 60_000,
    max: 10,
    getKey: (req) => `recovery:${req.ip}`,
  })

  app.get("/v1/vaults/:vaultId/recovery-envelope", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { vaultId } = request.params as { vaultId: string }
    if (!userOwnsVault(user.id, vaultId)) {
      reply.code(403).send({ error: "Forbidden" })
      return
    }

    const db = getDb()
    const artifactRow = db
      .prepare(
        `SELECT
           a.recoveryId,
           a.version,
           a.keyVersion,
           a.alg,
           a.kdf,
           a.createdAt,
           a.rotatedAt
         FROM vault_recovery_artifacts a
         INNER JOIN vault_recovery_artifact_envelopes e
           ON e.recoveryId = a.recoveryId
         WHERE e.vaultId = ? AND e.role = 'target'
         ORDER BY a.rotatedAt DESC
         LIMIT 1`,
      )
      .get(vaultId) as
      | {
          recoveryId: string
          version: number
          keyVersion: string
          alg: string
          kdf: string
          createdAt: string
          rotatedAt: string
        }
      | undefined

    if (artifactRow) {
      reply.send({
        configured: true,
        envelope: {
          vaultId,
          recoveryId: artifactRow.recoveryId,
          version: artifactRow.version,
          keyVersion: artifactRow.keyVersion,
          alg: artifactRow.alg,
          kdf: JSON.parse(artifactRow.kdf),
          createdAt: artifactRow.createdAt,
          rotatedAt: artifactRow.rotatedAt,
        },
      })
      return
    }

    const row = db
      .prepare(
        `SELECT vaultId, recoveryId, version, keyVersion, alg, kdf, createdAt, rotatedAt
         FROM vault_recovery_envelopes
         WHERE vaultId = ?`,
      )
      .get(vaultId) as
      | {
          vaultId: string
          recoveryId: string
          version: number
          keyVersion: string
          alg: string
          kdf: string
          createdAt: string
          rotatedAt: string
        }
      | undefined

    if (!row) {
      reply.send({ configured: false })
      return
    }

    reply.send({
      configured: true,
      envelope: {
        vaultId: row.vaultId,
        recoveryId: row.recoveryId,
        version: row.version,
        keyVersion: row.keyVersion,
        alg: row.alg,
        kdf: JSON.parse(row.kdf),
        createdAt: row.createdAt,
        rotatedAt: row.rotatedAt,
      },
    })
  })

  app.post("/v1/vaults/:vaultId/recovery-envelope", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { vaultId } = request.params as { vaultId: string }
    const parse = upsertSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    if (!userOwnsVault(user.id, vaultId)) {
      reply.code(403).send({ error: "Forbidden" })
      return
    }
    if (!ensureDeviceVaultAccess(request, reply, vaultId)) {
      return
    }
    const targetEnvelope = parse.data.envelopes.find((envelope) => envelope.vaultId === vaultId && envelope.role === "target")
    if (!targetEnvelope) {
      reply.code(400).send({ error: "Invalid recovery artifact" })
      return
    }

    const distinctVaultIds = [...new Set(parse.data.envelopes.map((envelope) => envelope.vaultId))]
    const ownedVaults = db
      .prepare(
        `SELECT id
         FROM vaults
         WHERE ownerUserId = ? AND deletedAt IS NULL AND id IN (${distinctVaultIds.map(() => "?").join(",")})`,
      )
      .all(user.id, ...distinctVaultIds) as Array<{ id: string }>
    if (ownedVaults.length !== distinctVaultIds.length) {
      reply.code(403).send({ error: "Forbidden" })
      return
    }

    const now = new Date().toISOString()
    const existingArtifactIds = db
      .prepare(
        `SELECT a.recoveryId
         FROM vault_recovery_artifacts a
         INNER JOIN vault_recovery_artifact_envelopes e
           ON e.recoveryId = a.recoveryId
         WHERE e.vaultId = ? AND e.role = 'target'`,
      )
      .all(vaultId) as Array<{ recoveryId: string }>

    const tx = db.transaction(() => {
      for (const existing of existingArtifactIds) {
        db.prepare("DELETE FROM vault_recovery_artifact_envelopes WHERE recoveryId = ?").run(existing.recoveryId)
        db.prepare("DELETE FROM vault_recovery_artifacts WHERE recoveryId = ?").run(existing.recoveryId)
      }
      db.prepare("DELETE FROM vault_recovery_envelopes WHERE vaultId = ?").run(vaultId)

      db.prepare(
        `INSERT INTO vault_recovery_artifacts
         (recoveryId, ownerUserId, version, keyVersion, alg, kdf, verifierB64, createdAt, rotatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(recoveryId) DO UPDATE SET
           ownerUserId = excluded.ownerUserId,
           version = excluded.version,
           keyVersion = excluded.keyVersion,
           alg = excluded.alg,
           kdf = excluded.kdf,
           verifierB64 = excluded.verifierB64,
           rotatedAt = excluded.rotatedAt`,
      ).run(
        parse.data.recoveryId,
        user.id,
        parse.data.version,
        parse.data.keyVersion,
        parse.data.alg,
        JSON.stringify(parse.data.kdf),
        parse.data.verifierB64,
        now,
        now,
      )

      const insertEnvelope = db.prepare(
        `INSERT INTO vault_recovery_artifact_envelopes
         (recoveryId, vaultId, role, nonceB64, ciphertextB64, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const envelope of parse.data.envelopes) {
        insertEnvelope.run(
          parse.data.recoveryId,
          envelope.vaultId,
          envelope.role,
          envelope.nonceB64,
          envelope.ciphertextB64,
          now,
        )
      }
    })
    tx()

    recordAuditEvent(db, {
      userId: user.id,
      vaultId,
      type: "vault_recovery_rotated",
      meta: { recoveryId: parse.data.recoveryId, keyVersion: parse.data.keyVersion },
    })

    reply.send({ ok: true, rotatedAt: now })
  })

  app.get("/v1/recovery-envelopes/:recoveryId", async (request, reply) => {
    const { recoveryId } = request.params as { recoveryId: string }
    const db = getDb()
    const artifact = db
      .prepare(
        `SELECT recoveryId, ownerUserId, version, keyVersion, alg, kdf, verifierB64, createdAt, rotatedAt
         FROM vault_recovery_artifacts
         WHERE recoveryId = ?`,
      )
      .get(recoveryId) as
      | {
          recoveryId: string
          ownerUserId: string
          version: number
          keyVersion: string
          alg: string
          kdf: string
          verifierB64: string
          createdAt: string
          rotatedAt: string
        }
      | undefined

    if (artifact) {
      const envelopes = db
        .prepare(
          `SELECT e.vaultId, e.role, e.nonceB64, e.ciphertextB64, v.name AS vaultName
           FROM vault_recovery_artifact_envelopes e
           INNER JOIN vaults v ON v.id = e.vaultId
           WHERE e.recoveryId = ? AND v.deletedAt IS NULL
           ORDER BY CASE e.role WHEN 'target' THEN 0 ELSE 1 END, v.createdAt ASC`,
        )
        .all(recoveryId) as Array<{
          vaultId: string
          role: "target" | "personal"
          nonceB64: string
          ciphertextB64: string
          vaultName: string | null
        }>
      if (envelopes.length === 0) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      reply.send({
        artifact: {
          recoveryId: artifact.recoveryId,
          version: artifact.version,
          keyVersion: artifact.keyVersion,
          alg: artifact.alg,
          kdf: JSON.parse(artifact.kdf),
          verifierB64: artifact.verifierB64,
          createdAt: artifact.createdAt,
          rotatedAt: artifact.rotatedAt,
          envelopes,
          legacyLimited: false,
        },
      })
      return
    }

    const row = db
      .prepare(
        `SELECT
           r.vaultId,
           r.recoveryId,
           r.version,
           r.keyVersion,
           r.alg,
           r.kdf,
           r.nonceB64,
           r.ciphertextB64,
           r.createdAt,
           r.rotatedAt,
           v.name AS vaultName
         FROM vault_recovery_envelopes r
         INNER JOIN vaults v ON v.id = r.vaultId
         WHERE r.recoveryId = ? AND v.deletedAt IS NULL`,
      )
      .get(recoveryId) as
      | {
          vaultId: string
          recoveryId: string
          version: number
          keyVersion: string
          alg: string
          kdf: string
          nonceB64: string
          ciphertextB64: string
          createdAt: string
          rotatedAt: string
          vaultName: string | null
        }
      | undefined

    if (!row) {
      reply.code(404).send({ error: "Not found" })
      return
    }

    reply.send({
      artifact: {
        recoveryId: row.recoveryId,
        version: row.version,
        keyVersion: row.keyVersion,
        alg: row.alg,
        kdf: JSON.parse(row.kdf),
        verifierB64: "",
        createdAt: row.createdAt,
        rotatedAt: row.rotatedAt,
        envelopes: [
          {
            vaultId: row.vaultId,
            role: "target",
            nonceB64: row.nonceB64,
            ciphertextB64: row.ciphertextB64,
            vaultName: row.vaultName,
          },
        ],
        legacyLimited: row.vaultName !== PERSONAL_VAULT_NAME,
      },
    })
  })

  app.post("/v1/recovery-envelopes/:recoveryId/redeem", async (request, reply) => {
    await redeemLimiter(request, reply)
    if (reply.sent) return

    const { recoveryId } = request.params as { recoveryId: string }
    const parse = redeemSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const resolved = resolveRecoveryForBootstrap(db, recoveryId)
    if (!resolved || !timingSafeEqual(resolved.verifierB64, parse.data.proofB64)) {
      reply.code(400).send({ error: "Invalid recovery proof" })
      return
    }

    const user = db
      .prepare("SELECT id, email, createdAt FROM users WHERE id = ?")
      .get(resolved.ownerUserId) as { id: string; email: string | null; createdAt: string } | undefined
    if (!user) {
      reply.code(400).send({ error: "User not found" })
      return
    }

    const nowIso = new Date().toISOString()
    const deviceId = parse.data.deviceId?.trim() || crypto.randomUUID()
    const linkedVaults = resolved.linkedVaults
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO devices (id, userId, name, platform, createdAt, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           platform = excluded.platform,
           lastSeenAt = excluded.lastSeenAt`
      ).run(deviceId, user.id, parse.data.deviceName, parse.data.platform, nowIso, nowIso)

      const enableVault = db.prepare(
        `INSERT INTO device_vaults (deviceId, vaultId, enabledAt)
         VALUES (?, ?, ?)
         ON CONFLICT(deviceId, vaultId) DO UPDATE SET enabledAt = excluded.enabledAt`,
      )
      for (const vault of linkedVaults) {
        enableVault.run(deviceId, vault.id, nowIso)
      }
    })
    tx()

    recordAuditEvent(db, {
      userId: user.id,
      vaultId: resolved.recoveredVault.id,
      type: "vault_recovery_redeemed",
      meta: { recoveryId, deviceId, platform: parse.data.platform },
    })

    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    reply.send({
      token,
      user,
      device: {
        id: deviceId,
        userId: user.id,
        name: parse.data.deviceName,
        platform: parse.data.platform,
        createdAt: nowIso,
        lastSeenAt: nowIso,
      },
      recoveredVault: {
        id: resolved.recoveredVault.id,
        name: resolved.recoveredVault.name,
      },
      linkedVaults,
      personalVaultMissing: resolved.personalVaultMissing,
      legacyLimited: resolved.legacyLimited,
    })
  })

  app.post("/v1/recovery-envelopes/:recoveryId/redeem-vault", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { recoveryId } = request.params as { recoveryId: string }
    const parse = redeemVaultSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const deviceId = getRequestDeviceId(request)
    if (!deviceId || !deviceBelongsToUser(user.id, deviceId)) {
      reply.code(403).send({ error: "Device not recognized" })
      return
    }

    const db = getDb()
    const resolved = resolveRecoveryForVaultAccess(db, recoveryId)
    if (!resolved || resolved.ownerUserId !== user.id || !timingSafeEqual(resolved.verifierB64, parse.data.proofB64)) {
      reply.code(400).send({ error: "Invalid recovery proof" })
      return
    }

    const enabledAt = new Date().toISOString()
    db.prepare(
      `INSERT INTO device_vaults (deviceId, vaultId, enabledAt)
       VALUES (?, ?, ?)
       ON CONFLICT(deviceId, vaultId) DO UPDATE SET enabledAt = excluded.enabledAt`,
    ).run(deviceId, resolved.vault.id, enabledAt)

    recordAuditEvent(db, {
      userId: user.id,
      vaultId: resolved.vault.id,
      type: "vault_recovery_redeemed",
      meta: { recoveryId, deviceId, mode: "vault" },
    })

    reply.send({
      vault: {
        id: resolved.vault.id,
        name: resolved.vault.name,
      },
      enabledAt,
      legacyLimited: resolved.legacyLimited,
    })
  })
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) return false
  return crypto.timingSafeEqual(leftBytes, rightBytes)
}

function resolveRecoveryForBootstrap(db: ReturnType<typeof getDb>, recoveryId: string):
  | {
      ownerUserId: string
      verifierB64: string
      recoveredVault: { id: string; name: string }
      linkedVaults: Array<{ id: string; name: string }>
      personalVaultMissing: boolean
      legacyLimited: boolean
    }
  | null {
  const artifact = db
    .prepare(
      `SELECT recoveryId, ownerUserId, verifierB64
       FROM vault_recovery_artifacts
       WHERE recoveryId = ?`,
    )
    .get(recoveryId) as { recoveryId: string; ownerUserId: string; verifierB64: string } | undefined

  if (artifact) {
    const envelopes = db
      .prepare(
        `SELECT e.vaultId, e.role, v.name AS vaultName
         FROM vault_recovery_artifact_envelopes e
         INNER JOIN vaults v ON v.id = e.vaultId
         WHERE e.recoveryId = ? AND v.deletedAt IS NULL
         ORDER BY CASE e.role WHEN 'target' THEN 0 ELSE 1 END, v.createdAt ASC`,
      )
      .all(recoveryId) as Array<{ vaultId: string; role: "target" | "personal"; vaultName: string | null }>
    const target = envelopes.find((envelope) => envelope.role === "target") ?? envelopes[0]
    if (!target) return null
    return {
      ownerUserId: artifact.ownerUserId,
      verifierB64: artifact.verifierB64,
      recoveredVault: {
        id: target.vaultId,
        name: target.vaultName ?? "Recovered vault",
      },
      linkedVaults: envelopes.map((envelope) => ({
        id: envelope.vaultId,
        name: envelope.vaultName ?? (envelope.role === "personal" ? PERSONAL_VAULT_NAME : "Recovered vault"),
      })),
      personalVaultMissing: target.vaultName !== PERSONAL_VAULT_NAME && !envelopes.some((envelope) => envelope.role === "personal"),
      legacyLimited: false,
    }
  }

  const legacy = db
    .prepare(
      `SELECT
         r.vaultId,
         r.verifierB64,
         v.ownerUserId,
         v.name AS vaultName
       FROM vault_recovery_envelopes r
       INNER JOIN vaults v ON v.id = r.vaultId
       WHERE r.recoveryId = ? AND v.deletedAt IS NULL`,
    )
    .get(recoveryId) as
    | {
        vaultId: string
        verifierB64: string
        ownerUserId: string
        vaultName: string | null
      }
    | undefined
  if (!legacy) return null
  return {
    ownerUserId: legacy.ownerUserId,
    verifierB64: legacy.verifierB64,
    recoveredVault: {
      id: legacy.vaultId,
      name: legacy.vaultName ?? "Recovered vault",
    },
    linkedVaults: [
      {
        id: legacy.vaultId,
        name: legacy.vaultName ?? "Recovered vault",
      },
    ],
    personalVaultMissing: legacy.vaultName !== PERSONAL_VAULT_NAME,
    legacyLimited: legacy.vaultName !== PERSONAL_VAULT_NAME,
  }
}

// RemoteVault recovery is intentionally restricted to the artifact's target envelope only.
function resolveRecoveryForVaultAccess(db: ReturnType<typeof getDb>, recoveryId: string):
  | {
      ownerUserId: string
      verifierB64: string
      vault: { id: string; name: string }
      legacyLimited: boolean
    }
  | null {
  const bootstrap = resolveRecoveryForBootstrap(db, recoveryId)
  if (!bootstrap) return null
  return {
    ownerUserId: bootstrap.ownerUserId,
    verifierB64: bootstrap.verifierB64,
    vault: bootstrap.recoveredVault,
    legacyLimited: bootstrap.legacyLimited,
  }
}
