import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"

const deviceSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(["ios", "android", "web"])
})

export async function registerDeviceRoutes(app: FastifyInstance) {
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
}
