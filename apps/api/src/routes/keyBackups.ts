import { FastifyInstance } from "fastify"
import { z } from "zod"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { recordAuditEvent } from "../db/audit"

const kdfSchema = z.object({
  alg: z.string().min(1),
  N: z.number().optional(),
  r: z.number().optional(),
  p: z.number().optional(),
  dkLen: z.number().optional(),
  saltB64: z.string().min(1),
  iterations: z.number().optional(),
})

const upsertBackupSchema = z.object({
  alg: z.string().min(1),
  kdf: kdfSchema,
  wrappedPrivateKeyB64: z.string().min(1),
})

export async function registerKeyBackupRoutes(app: FastifyInstance) {
  app.post("/v1/me/key-backup", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const parse = upsertBackupSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const now = new Date().toISOString()
    const existing = db
      .prepare("SELECT userId FROM user_key_backups WHERE userId = ?")
      .get(user.id) as { userId: string } | undefined

    if (!existing) {
      db.prepare(
        "INSERT INTO user_key_backups (userId, alg, kdf, wrappedPrivateKeyB64, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(user.id, parse.data.alg, JSON.stringify(parse.data.kdf), parse.data.wrappedPrivateKeyB64, now, now)
    } else {
      db.prepare(
        "UPDATE user_key_backups SET alg = ?, kdf = ?, wrappedPrivateKeyB64 = ?, updatedAt = ? WHERE userId = ?"
      ).run(parse.data.alg, JSON.stringify(parse.data.kdf), parse.data.wrappedPrivateKeyB64, now, user.id)
    }

    recordAuditEvent(db, {
      userId: user.id,
      type: "key_backup_set",
      meta: { alg: parse.data.alg },
    })

    reply.send({ ok: true })
  })

  app.get("/v1/me/key-backup", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const row = db
      .prepare(
        "SELECT userId, alg, kdf, wrappedPrivateKeyB64, createdAt, updatedAt FROM user_key_backups WHERE userId = ?"
      )
      .get(user.id) as
      | {
          userId: string
          alg: string
          kdf: string
          wrappedPrivateKeyB64: string
          createdAt: string
          updatedAt: string
        }
      | undefined

    if (!row) {
      reply.code(404).send({ error: "Not found" })
      return
    }

    reply.send({
      alg: row.alg,
      kdf: JSON.parse(row.kdf),
      wrappedPrivateKeyB64: row.wrappedPrivateKeyB64,
      updatedAt: row.updatedAt,
    })
  })

  app.delete("/v1/me/key-backup", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const res = db.prepare("DELETE FROM user_key_backups WHERE userId = ?").run(user.id)

    if (res.changes > 0) {
      recordAuditEvent(db, {
        userId: user.id,
        type: "key_backup_delete",
        meta: null,
      })
    }

    reply.send({ ok: true })
  })
}
