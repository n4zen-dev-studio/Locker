import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { authMiddleware } from "../middleware/auth"
import { getDb } from "../db/db"
import { recordAuditEvent } from "../db/audit"

const pushTokenSchema = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(1),
  deviceId: z.string().min(1).optional(),
})

const pushTokenDeleteSchema = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
})

function resolveDeviceId(request: any, fallback?: string): string | null {
  const headerValue = request.headers["x-device-id"]
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue.trim()
  if (fallback && fallback.trim()) return fallback.trim()
  return null
}

export async function registerPushTokenRoutes(app: FastifyInstance) {
  app.post("/v1/me/push-tokens", { preHandler: authMiddleware }, async (request, reply) => {
    const parse = pushTokenSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const user = request.user!
    const deviceId = resolveDeviceId(request, parse.data.deviceId)
    if (!deviceId) {
      reply.code(400).send({ error: "Missing deviceId" })
      return
    }

    const db = getDb()
    const now = new Date().toISOString()
    const id = crypto.randomUUID()

    db.prepare(
      `INSERT INTO push_tokens (id, userId, deviceId, platform, token, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(userId, deviceId, platform) DO UPDATE SET
         token=excluded.token,
         updatedAt=excluded.updatedAt`
    ).run(id, user.id, deviceId, parse.data.platform, parse.data.token, now, now)

    recordAuditEvent(db, {
      userId: user.id,
      type: "push_token_set",
      meta: { deviceId, platform: parse.data.platform },
    })

    reply.send({ ok: true })
  })

  app.delete("/v1/me/push-tokens", { preHandler: authMiddleware }, async (request, reply) => {
    const parse = pushTokenDeleteSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const user = request.user!
    const deviceId = resolveDeviceId(request, parse.data.deviceId)
    if (!deviceId) {
      reply.code(400).send({ error: "Missing deviceId" })
      return
    }

    const db = getDb()
    if (parse.data.token) {
      db.prepare(
        "DELETE FROM push_tokens WHERE userId = ? AND deviceId = ? AND platform = ? AND token = ?"
      ).run(user.id, deviceId, parse.data.platform, parse.data.token)
    } else {
      db.prepare(
        "DELETE FROM push_tokens WHERE userId = ? AND deviceId = ? AND platform = ?"
      ).run(user.id, deviceId, parse.data.platform)
    }

    recordAuditEvent(db, {
      userId: user.id,
      type: "push_token_delete",
      meta: { deviceId, platform: parse.data.platform },
    })

    reply.send({ ok: true })
  })
}
