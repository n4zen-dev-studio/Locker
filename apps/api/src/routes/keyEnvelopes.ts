import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { recordAuditEvent } from "../db/audit"

const upsertEnvelopeSchema = z.object({
  userId: z.string().min(1),
  alg: z.string().min(1),
  envelopeB64: z.string().min(1),
})

export async function registerKeyEnvelopeRoutes(app: FastifyInstance) {
  app.post(
    "/v1/vaults/:vaultId/key-envelopes",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const parse = upsertEnvelopeSchema.safeParse(request.body)
      if (!parse.success) {
        reply.code(400).send({ error: "Invalid body" })
        return
      }

      const db = getDb()
      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as { role?: string } | undefined

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const now = new Date().toISOString()
      const id = crypto.randomUUID()

      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO vault_key_envelopes (id, vaultId, userId, alg, envelopeB64, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(vaultId, userId) DO UPDATE SET
             alg=excluded.alg,
             envelopeB64=excluded.envelopeB64,
             createdAt=excluded.createdAt`
        ).run(id, vaultId, parse.data.userId, parse.data.alg, parse.data.envelopeB64, now)

        db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
          .run(vaultId, "vault_meta", null, now)
      })

      tx()
      recordAuditEvent(db, {
        userId: user.id,
        vaultId,
        type: "key_envelope_upsert",
        meta: { targetUserId: parse.data.userId, alg: parse.data.alg },
      })

      reply.send({ ok: true })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/key-envelopes/me",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id)
      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const row = db
        .prepare(
          "SELECT id, vaultId, userId, alg, envelopeB64, createdAt FROM vault_key_envelopes WHERE vaultId = ? AND userId = ?"
        )
        .get(vaultId, user.id) as
        | { id: string; vaultId: string; userId: string; alg: string; envelopeB64: string; createdAt: string }
        | undefined

      if (!row) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      reply.send({ envelope: row })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/key-envelopes",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as { role?: string } | undefined

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const rows = db
        .prepare(
          "SELECT userId, alg, createdAt FROM vault_key_envelopes WHERE vaultId = ? ORDER BY createdAt DESC"
        )
        .all(vaultId) as Array<{ userId: string; alg: string; createdAt: string }>

      reply.send({ envelopes: rows })
    }
  )
}
