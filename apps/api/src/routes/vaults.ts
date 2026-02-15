import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"

const vaultSchema = z.object({
  name: z.string().min(1)
})

export async function registerVaultRoutes(app: FastifyInstance) {
  app.post("/v1/vaults", { preHandler: authMiddleware }, async (request, reply) => {
    const parse = vaultSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }
    const user = request.user!
    const db = getDb()
    const now = new Date().toISOString()
    const vaultId = crypto.randomUUID()

    db.prepare("INSERT INTO vaults (id, ownerUserId, name, createdAt) VALUES (?, ?, ?, ?)")
      .run(vaultId, user.id, parse.data.name, now)
    db.prepare("INSERT INTO vault_members (vaultId, userId, role, createdAt) VALUES (?, ?, ?, ?)")
      .run(vaultId, user.id, "owner", now)

    const vault = { id: vaultId, ownerUserId: user.id, name: parse.data.name, createdAt: now }
    reply.send({ vault })
  })

  app.get("/v1/vaults", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const rows = db.prepare(
      "SELECT v.id, v.ownerUserId, v.name, v.createdAt FROM vaults v INNER JOIN vault_members m ON v.id = m.vaultId WHERE m.userId = ?"
    ).all(user.id)
    reply.send({ vaults: rows })
  })
}
