import { FastifyInstance } from "fastify"
import { z } from "zod"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"

const upsertKeySchema = z.object({
  alg: z.string().min(1),
  publicKey: z.string().min(1),
})

export async function registerUserKeyRoutes(app: FastifyInstance) {
  app.post("/v1/me/keys", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const parse = upsertKeySchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const now = new Date().toISOString()
    const existing = db
      .prepare("SELECT userId, alg, publicKey, createdAt, rotatedAt FROM user_keys WHERE userId = ?")
      .get(user.id) as
      | { userId: string; alg: string; publicKey: string; createdAt: string; rotatedAt?: string | null }
      | undefined

    if (!existing) {
      db.prepare("INSERT INTO user_keys (userId, alg, publicKey, createdAt) VALUES (?, ?, ?, ?)")
        .run(user.id, parse.data.alg, parse.data.publicKey, now)
    } else {
      const rotatedAt = existing.publicKey === parse.data.publicKey ? existing.rotatedAt : now
      db.prepare(
        "UPDATE user_keys SET alg = ?, publicKey = ?, rotatedAt = ? WHERE userId = ?"
      ).run(parse.data.alg, parse.data.publicKey, rotatedAt, user.id)
    }

    reply.send({ ok: true })
  })

  app.get("/v1/me/keys", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const row = db
      .prepare("SELECT userId, alg, publicKey, createdAt, rotatedAt FROM user_keys WHERE userId = ?")
      .get(user.id) as
      | { userId: string; alg: string; publicKey: string; createdAt: string; rotatedAt?: string | null }
      | undefined

    reply.send({ key: row ?? null })
  })

  app.get(
    "/v1/users/:userId/public-key",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { userId } = request.params as { userId: string }
      const db = getDb()

      const target = db
        .prepare("SELECT id, email FROM users WHERE id = ?")
        .get(userId) as { id: string; email: string | null } | undefined

      if (!target) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      const sharesVault = db
        .prepare(
          `SELECT 1
           FROM vault_members m1
           INNER JOIN vault_members m2 ON m1.vaultId = m2.vaultId
           WHERE m1.userId = ? AND m2.userId = ?
           LIMIT 1`
        )
        .get(user.id, userId)

      let canAccess = !!sharesVault
      if (!canAccess && target.email) {
        const inviteExists = db
          .prepare(
            `SELECT 1
             FROM vault_invites vi
             INNER JOIN vault_members vm ON vm.vaultId = vi.vaultId
             WHERE vi.inviteeEmail = ? AND vi.inviterUserId = ? AND vm.userId = ? AND vm.role IN ('owner','admin')
             LIMIT 1`
          )
          .get(target.email.toLowerCase(), user.id, user.id)
        canAccess = !!inviteExists
      }

      if (!canAccess) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const row = db
        .prepare("SELECT userId, alg, publicKey, createdAt, rotatedAt FROM user_keys WHERE userId = ?")
        .get(userId) as
        | { userId: string; alg: string; publicKey: string; createdAt: string; rotatedAt?: string | null }
        | undefined

      if (!row) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      reply.send({ key: row })
    }
  )
}
