import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { signToken } from "../auth/jwt"
import { rateLimit } from "../middleware/rateLimit"
import { getApiEnv } from "@locker/config"
import { recordAuditEvent } from "../db/audit"

const deviceSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(["ios", "android", "web"])
})

const redeemSchema = z.object({
  linkCode: z.string().min(1),
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
    const id = crypto.randomUUID()
    
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
    const db = getDb()
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const expiresAt = new Date(nowMs + LINK_CODE_TTL_MS).toISOString()
    const linkCode = crypto.randomBytes(24).toString("base64url")

    db.prepare(
      "INSERT INTO device_link_codes (code, userId, expiresAt, usedAt, createdAt) VALUES (?, ?, ?, ?, ?)"
    ).run(linkCode, user.id, expiresAt, null, now)

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
      .prepare("SELECT code, userId, expiresAt, usedAt FROM device_link_codes WHERE code = ?")
      .get(parse.data.linkCode) as
      | { code: string; userId: string; expiresAt: string; usedAt: string | null }
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

    const deviceId = crypto.randomUUID()
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
        "INSERT INTO devices (id, userId, name, platform, createdAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(device.id, device.userId, device.name, device.platform, device.createdAt, device.lastSeenAt)
    })

    tx()

    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    recordAuditEvent(db, {
      userId: user.id,
      type: "linkcode_redeem",
      meta: { deviceId: device.id, platform: device.platform },
    })
    reply.send({ token, user, device })
  })
}
