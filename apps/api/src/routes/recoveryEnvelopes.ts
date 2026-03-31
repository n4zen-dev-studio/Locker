import crypto from "crypto"
import { FastifyInstance } from "fastify"
import { z } from "zod"

import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { rateLimit } from "../middleware/rateLimit"
import { recordAuditEvent } from "../db/audit"
import { signToken } from "../auth/jwt"
import { ensureDeviceVaultAccess, userOwnsVault } from "./access"

const kdfSchema = z.object({
  alg: z.literal("SCRYPT"),
  N: z.number().int().positive(),
  r: z.number().int().positive(),
  p: z.number().int().positive(),
  dkLen: z.number().int().positive(),
  saltB64: z.string().min(1),
})

const upsertSchema = z.object({
  recoveryId: z.string().min(8).max(64),
  version: z.literal(1),
  keyVersion: z.string().min(1).max(16),
  alg: z.literal("XCHACHA20-POLY1305"),
  kdf: kdfSchema,
  verifierB64: z.string().min(1),
  nonceB64: z.string().min(1),
  ciphertextB64: z.string().min(1),
})

const redeemSchema = z.object({
  proofB64: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1),
  platform: z.enum(["ios", "android"]),
})

type RecoveryRow = {
  vaultId: string
  recoveryId: string
  version: number
  keyVersion: string
  alg: string
  kdf: string
  verifierB64: string
  nonceB64: string
  ciphertextB64: string
  createdAt: string
  rotatedAt: string
}

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

    const now = new Date().toISOString()
    const existing = db
      .prepare("SELECT createdAt FROM vault_recovery_envelopes WHERE vaultId = ?")
      .get(vaultId) as { createdAt?: string } | undefined

    db.prepare(
      `INSERT INTO vault_recovery_envelopes
       (vaultId, recoveryId, version, keyVersion, alg, kdf, verifierB64, nonceB64, ciphertextB64, createdAt, rotatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vaultId) DO UPDATE SET
         recoveryId = excluded.recoveryId,
         version = excluded.version,
         keyVersion = excluded.keyVersion,
         alg = excluded.alg,
         kdf = excluded.kdf,
         verifierB64 = excluded.verifierB64,
         nonceB64 = excluded.nonceB64,
         ciphertextB64 = excluded.ciphertextB64,
         rotatedAt = excluded.rotatedAt`
    ).run(
      vaultId,
      parse.data.recoveryId,
      parse.data.version,
      parse.data.keyVersion,
      parse.data.alg,
      JSON.stringify(parse.data.kdf),
      parse.data.verifierB64,
      parse.data.nonceB64,
      parse.data.ciphertextB64,
      existing?.createdAt ?? now,
      now,
    )

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
      envelope: {
        vaultId: row.vaultId,
        recoveryId: row.recoveryId,
        version: row.version,
        keyVersion: row.keyVersion,
        alg: row.alg,
        kdf: JSON.parse(row.kdf),
        nonceB64: row.nonceB64,
        ciphertextB64: row.ciphertextB64,
        createdAt: row.createdAt,
        rotatedAt: row.rotatedAt,
        vaultName: row.vaultName,
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
    const row = db
      .prepare(
        `SELECT
           r.vaultId,
           r.recoveryId,
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
          recoveryId: string
          verifierB64: string
          ownerUserId: string
          vaultName: string | null
        }
      | undefined

    if (!row || !timingSafeEqual(row.verifierB64, parse.data.proofB64)) {
      reply.code(400).send({ error: "Invalid recovery proof" })
      return
    }

    const user = db
      .prepare("SELECT id, email, createdAt FROM users WHERE id = ?")
      .get(row.ownerUserId) as { id: string; email: string | null; createdAt: string } | undefined
    if (!user) {
      reply.code(400).send({ error: "User not found" })
      return
    }

    const nowIso = new Date().toISOString()
    const deviceId = parse.data.deviceId?.trim() || crypto.randomUUID()
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO devices (id, userId, name, platform, createdAt, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           platform = excluded.platform,
           lastSeenAt = excluded.lastSeenAt`
      ).run(deviceId, user.id, parse.data.deviceName, parse.data.platform, nowIso, nowIso)

      db.prepare(
        `INSERT INTO device_vaults (deviceId, vaultId, enabledAt)
         VALUES (?, ?, ?)
         ON CONFLICT(deviceId, vaultId) DO UPDATE SET enabledAt = excluded.enabledAt`,
      ).run(deviceId, row.vaultId, nowIso)
    })
    tx()

    recordAuditEvent(db, {
      userId: user.id,
      vaultId: row.vaultId,
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
      vault: {
        id: row.vaultId,
        name: row.vaultName ?? "Recovered vault",
      },
    })
  })
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) return false
  return crypto.timingSafeEqual(leftBytes, rightBytes)
}
