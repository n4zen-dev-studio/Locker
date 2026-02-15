import { FastifyInstance } from "fastify"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"

type MemberRow = { role: string }
type ChangeRow = { id: number; type: string; blobId: string | null; createdAt: string }

export async function registerChangeRoutes(app: FastifyInstance) {
  app.get(
    "/v1/vaults/:vaultId/changes",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const cursor = Number((request.query as { cursor?: string }).cursor ?? "0")
      const limit = Math.min(Number((request.query as { limit?: string }).limit ?? "50"), 200)

      const db = getDb()
      const vault = db.prepare("SELECT deletedAt FROM vaults WHERE id = ?").get(vaultId) as
        | { deletedAt?: string | null }
        | undefined
      if (!vault) {
        reply.code(404).send({ error: "Not found" })
        return
      }
      if (vault.deletedAt) {
        reply.code(404).send({ error: "Vault deleted" })
        return
      }

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as MemberRow | undefined

      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const rows = db
        .prepare(
          "SELECT id, type, blobId, createdAt FROM changes WHERE vaultId = ? AND id > ? ORDER BY id ASC LIMIT ?",
        )
        .all(vaultId, cursor, limit) as ChangeRow[]

      const nextCursor = rows.length ? rows[rows.length - 1].id : cursor
      reply.send({ nextCursor, changes: rows })
    },
  )
}
