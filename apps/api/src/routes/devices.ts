import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { signToken } from "../auth/jwt"
import { rateLimit } from "../middleware/rateLimit"
import { getApiEnv } from "@locker/config"
import { recordAuditEvent } from "../db/audit"
import { deviceBelongsToUser } from "./access"

const deviceSchema = z.object({
  deviceId: z.string().min(1).optional(),
  name: z.string().min(1),
  platform: z.enum(["ios", "android", "web"])
})

const createLinkCodeSchema = z.object({
  linkCode: z.string().min(1).optional(),
  provisioningPayload: z.string().min(1).optional(),
})

const redeemSchema = z.object({
  linkCode: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1),
  platform: z.enum(["ios", "android"])
})

const LINK_CODE_TTL_MS = 10 * 60 * 1000

export async function registerDeviceRoutes(app: FastifyInstance) {
  const env = getApiEnv()
  const redeemLimiter = rateLimit({
    enabled: env.RATE_LIMIT_ENABLED,
    windowMs: 60_000,
    max: env.RATE_LIMIT_PER_MINUTE,
    getKey: (req) => `redeem:${req.ip}`,
  })
  app.post("/v1/devices/register", { preHandler: authMiddleware }, async (request, reply) => {
    const parse = deviceSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }
    const user = request.user!
    const db = getDb()
    const now = new Date().toISOString()
    const requestedId = parse.data.deviceId?.trim()
    if (requestedId) {
      const existing = db
        .prepare("SELECT id, userId, name, platform, createdAt, lastSeenAt FROM devices WHERE id = ? AND userId = ?")
        .get(requestedId, user.id) as
        | { id: string; userId: string; name: string; platform: string; createdAt: string; lastSeenAt: string }
        | undefined
      if (existing) {
        db.prepare("UPDATE devices SET name = ?, platform = ?, lastSeenAt = ? WHERE id = ? AND userId = ?").run(
          parse.data.name,
          parse.data.platform,
          now,
          existing.id,
          user.id,
        )
        reply.send({
          device: {
            ...existing,
            name: parse.data.name,
            platform: parse.data.platform,
            lastSeenAt: now,
          },
        })
        return
      }
    }
    const id = requestedId || crypto.randomUUID()
    
    const device = {
      id,
      userId: user.id,
      name: parse.data.name,
      platform: parse.data.platform,
      createdAt: now,
      lastSeenAt: now
    }
    db.prepare(
      "INSERT INTO devices (id, userId, name, platform, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(device.id, device.userId, device.name, device.platform, device.createdAt, device.lastSeenAt)
    reply.send({ device })
  })

  app.post("/v1/devices/link-code", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const parse = createLinkCodeSchema.safeParse(request.body ?? {})
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }
    const db = getDb()
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const expiresAt = new Date(nowMs + LINK_CODE_TTL_MS).toISOString()
    const linkCode = parse.data.linkCode?.trim() || crypto.randomBytes(24).toString("base64url")

    db.prepare(
      `INSERT INTO device_link_codes (code, userId, provisioningPayload, expiresAt, usedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         userId = excluded.userId,
         provisioningPayload = excluded.provisioningPayload,
         expiresAt = excluded.expiresAt,
         usedAt = excluded.usedAt,
         createdAt = excluded.createdAt`
    ).run(linkCode, user.id, parse.data.provisioningPayload ?? null, expiresAt, null, now)

    reply.send({ linkCode, expiresAt })
  })

  app.post("/v1/devices/link-code/redeem", async (request, reply) => {
    await redeemLimiter(request, reply)
    if (reply.sent) return
    const parse = redeemSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const now = new Date()
    const row = db
      .prepare("SELECT code, userId, provisioningPayload, expiresAt, usedAt FROM device_link_codes WHERE code = ?")
      .get(parse.data.linkCode) as
      | { code: string; userId: string; provisioningPayload?: string | null; expiresAt: string; usedAt: string | null }
      | undefined

    if (!row) {
      reply.code(400).send({ error: "Invalid link code" })
      return
    }

    if (row.usedAt) {
      reply.code(400).send({ error: "Link code already used" })
      return
    }

    if (new Date(row.expiresAt).getTime() < now.getTime()) {
      reply.code(400).send({ error: "Link code expired" })
      return
    }

    const deviceId = parse.data.deviceId?.trim() || crypto.randomUUID()
    const nowIso = now.toISOString()
    const device = {
      id: deviceId,
      userId: row.userId,
      name: parse.data.deviceName,
      platform: parse.data.platform,
      createdAt: nowIso,
      lastSeenAt: nowIso
    }

    const user = db
      .prepare("SELECT id, email, createdAt FROM users WHERE id = ?")
      .get(row.userId) as { id: string; email: string | null; createdAt: string } | undefined

    if (!user) {
      reply.code(400).send({ error: "User not found" })
      return
    }

    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE device_link_codes SET usedAt = ? WHERE code = ?"
      ).run(nowIso, row.code)
      db.prepare(
        `INSERT INTO devices (id, userId, name, platform, createdAt, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           platform = excluded.platform,
           lastSeenAt = excluded.lastSeenAt`
      ).run(device.id, device.userId, device.name, device.platform, device.createdAt, device.lastSeenAt)

      const personalVault = db
        .prepare(
          "SELECT id FROM vaults WHERE ownerUserId = ? AND name = 'Personal' AND deletedAt IS NULL ORDER BY createdAt ASC LIMIT 1",
        )
        .get(row.userId) as { id?: string } | undefined
      if (personalVault?.id) {
        db.prepare("INSERT OR IGNORE INTO device_vaults (deviceId, vaultId, enabledAt) VALUES (?, ?, ?)").run(
          device.id,
          personalVault.id,
          nowIso,
        )
      }
    })

    tx()

    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    recordAuditEvent(db, {
      userId: user.id,
      type: "linkcode_redeem",
      meta: { deviceId: device.id, platform: device.platform },
    })
    reply.send({ token, user, device, provisioningPayload: row.provisioningPayload ?? null })
  })

  app.get("/v1/devices", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const currentDeviceId = typeof request.headers["x-device-id"] === "string" ? request.headers["x-device-id"] : null
    const db = getDb()
    if (!currentDeviceId || !deviceBelongsToUser(user.id, currentDeviceId)) {
      reply.code(403).send({ error: "Device not recognized" })
      return
    }
    const rows = db
      .prepare(
        "SELECT id, userId, name, platform, createdAt, lastSeenAt FROM devices WHERE userId = ? ORDER BY lastSeenAt DESC, createdAt DESC",
      )
      .all(user.id) as Array<{
      id: string
      userId: string
      name: string
      platform: string
      createdAt: string
      lastSeenAt?: string
    }>

    reply.send({
      devices: rows.map((row) => ({
        ...row,
        current: currentDeviceId ? row.id === currentDeviceId : false,
      })),
    })
  })

  app.delete("/v1/devices/:deviceId", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { deviceId } = request.params as { deviceId: string }
    if (!deviceBelongsToUser(user.id, deviceId)) {
      reply.code(404).send({ error: "Not found" })
      return
    }

    const db = getDb()
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM device_vaults WHERE deviceId = ?").run(deviceId)
      db.prepare("DELETE FROM push_tokens WHERE deviceId = ? AND userId = ?").run(deviceId, user.id)
      db.prepare("DELETE FROM devices WHERE id = ? AND userId = ?").run(deviceId, user.id)
    })
    tx()

    recordAuditEvent(db, {
      userId: user.id,
      type: "device_removed",
      meta: { deviceId },
    })

    reply.send({ ok: true })
  })

  app.put("/v1/devices/:deviceId/vaults/:vaultId", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { deviceId, vaultId } = request.params as { deviceId: string; vaultId: string }
    if (!deviceBelongsToUser(user.id, deviceId)) {
      reply.code(404).send({ error: "Device not found" })
      return
    }

    const db = getDb()
    const vault = db
      .prepare("SELECT id FROM vaults WHERE id = ? AND ownerUserId = ? AND deletedAt IS NULL")
      .get(vaultId, user.id) as { id?: string } | undefined
    if (!vault?.id) {
      reply.code(404).send({ error: "Vault not found" })
      return
    }

    const enabledAt = new Date().toISOString()
    db.prepare(
      `INSERT INTO device_vaults (deviceId, vaultId, enabledAt)
       VALUES (?, ?, ?)
       ON CONFLICT(deviceId, vaultId) DO UPDATE SET enabledAt = excluded.enabledAt`,
    ).run(deviceId, vaultId, enabledAt)

    recordAuditEvent(db, {
      userId: user.id,
      vaultId,
      type: "device_vault_enabled",
      meta: { deviceId, enabledAt },
    })

    reply.send({ ok: true, enabledAt })
  })

  app.delete("/v1/devices/:deviceId/vaults/:vaultId", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { deviceId, vaultId } = request.params as { deviceId: string; vaultId: string }
    if (!deviceBelongsToUser(user.id, deviceId)) {
      reply.code(404).send({ error: "Device not found" })
      return
    }

    const db = getDb()
    db.prepare("DELETE FROM device_vaults WHERE deviceId = ? AND vaultId = ?").run(deviceId, vaultId)

    recordAuditEvent(db, {
      userId: user.id,
      vaultId,
      type: "device_vault_disabled",
      meta: { deviceId },
    })

    reply.send({ ok: true })
  })
}
