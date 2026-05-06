import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { signToken } from "../auth/jwt"

const loginSchema = z.object({
  email: z.string().email()
})

const rateWindowMs = 60_000
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  if (!record || record.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + rateWindowMs })
    return false
  }
  record.count += 1
  return record.count > 10
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/dev-login", async (request, reply) => {
    const ip = request.ip
    if (isRateLimited(ip)) {
      reply.code(429).send({ error: "Too many attempts" })
      return
    }

    const parse = loginSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const now = new Date().toISOString()
    const existing = db.prepare("SELECT id, email, createdAt FROM users WHERE email = ?").get(parse.data.email)

    let user = existing
    if (!user) {
      const id = crypto.randomUUID()
      db.prepare("INSERT INTO users (id, email, createdAt) VALUES (?, ?, ?)").run(id, parse.data.email, now)
      user = { id, email: parse.data.email, createdAt: now }
    }

    const token = signToken({ sub: user.id, email: user.email })
    reply.send({ token, user })
  })
}
