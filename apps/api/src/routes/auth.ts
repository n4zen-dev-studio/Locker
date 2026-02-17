import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { signToken } from "../auth/jwt"
import { getApiEnv } from "@locker/config"
import { authMiddleware } from "../middleware/auth"
import { rateLimit } from "../middleware/rateLimit"
import { recordAuditEvent } from "../db/audit"

const loginSchema = z.object({
  email: z.string().email()
})

export async function registerAuthRoutes(app: FastifyInstance) {
  const env = getApiEnv()
  const devAuthEnabled = env.DEV_AUTH_ENABLED
  const authLimiter = rateLimit({
    enabled: env.RATE_LIMIT_ENABLED,
    windowMs: 60_000,
    max: env.RATE_LIMIT_PER_MINUTE,
    getKey: (req) => `auth:${req.ip}`,
  })
  app.post("/v1/auth/dev-login", async (request, reply) => {
    await authLimiter(request, reply)
    if (reply.sent) return
    if (!devAuthEnabled) {
      reply.code(403).send({ error: "Dev auth disabled" })
      return
    }

    const parse = loginSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const now = new Date().toISOString()
    type UserRow = { id: string; email: string; createdAt: string }

    const existing = db
      .prepare("SELECT id, email, createdAt FROM users WHERE email = ?")
      .get(parse.data.email) as UserRow | undefined

    let user: UserRow
    if (!existing) {
      const id = crypto.randomUUID()
      db.prepare("INSERT INTO users (id, email, createdAt) VALUES (?, ?, ?)").run(id, parse.data.email, now)
      user = { id, email: parse.data.email, createdAt: now }
    } else {
      user = existing
    }

    if (!user) {
      const id = crypto.randomUUID()
      db.prepare("INSERT INTO users (id, email, createdAt) VALUES (?, ?, ?)").run(id, parse.data.email, now)
      user = { id, email: parse.data.email, createdAt: now }
    }

    const token = signToken({ sub: user.id, email: user.email })
    const ip = request.ip
    recordAuditEvent(db, { userId: user.id, type: "login_dev", meta: { ip } })
    reply.send({ token, user })
  })

  app.get("/v1/me", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const row = db
      .prepare("SELECT id, email, createdAt, displayName FROM users WHERE id = ?")
      .get(user.id) as { id: string; email: string | null; createdAt: string; displayName?: string | null } | undefined

    if (!row) {
      reply.code(404).send({ error: "User not found" })
      return
    }
    reply.send({ user: row })
  })
}
