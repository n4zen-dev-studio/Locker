import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { getApiEnv } from "@locker/config"
import fs from "fs/promises"
import path from "path"
import { authMiddleware } from "../middleware/auth"
import { recordAuditEvent } from "../db/audit"

const vaultSchema = z.object({
  name: z.string().min(1)
})

export async function registerVaultRoutes(app: FastifyInstance) {
  const env = getApiEnv()
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
      "SELECT v.id, v.ownerUserId, v.name, v.createdAt, m.role FROM vaults v INNER JOIN vault_members m ON v.id = m.vaultId WHERE m.userId = ? AND v.deletedAt IS NULL"
    ).all(user.id)
    reply.send({ vaults: rows })
  })

  app.delete(
    "/v1/vaults/:vaultId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || member.role !== "owner") {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const now = new Date().toISOString()

      db.prepare(
        "UPDATE vaults SET deletedAt = ?, deletedByUserId = ? WHERE id = ? AND deletedAt IS NULL"
      ).run(now, user.id, vaultId)

      db.prepare(
        "INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)"
      ).run(vaultId, "vault_meta", null, now)

      recordAuditEvent(db, {
        userId: user.id,
        vaultId,
        type: "vault_delete",
        meta: { deletedAt: now },
      })

      reply.send({ ok: true })
    }
  )

  app.delete(
    "/v1/vaults/:vaultId/purge",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }

      if (env.ADMIN_PURGE_ENABLED !== true) {
        reply.code(403).send({ error: "Purge disabled" })
        return
      }

      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || member.role !== "owner") {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      await deleteVaultBlobFolder(vaultId)

      const tx = db.transaction(() => {
        db.prepare("DELETE FROM blobs WHERE vaultId = ?").run(vaultId)
        db.prepare("DELETE FROM changes WHERE vaultId = ?").run(vaultId)
        db.prepare("DELETE FROM vault_members WHERE vaultId = ?").run(vaultId)
        db.prepare("DELETE FROM vaults WHERE id = ?").run(vaultId)
      })

      tx()

      reply.send({ ok: true })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/devices",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
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

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const rows = db.prepare(
        `SELECT d.id, d.userId, d.name, d.platform, d.createdAt, d.lastSeenAt
         FROM devices d
         WHERE d.userId IN (SELECT userId FROM vault_members WHERE vaultId = ?)
         ORDER BY d.lastSeenAt DESC`
      ).all(vaultId)

      reply.send({ devices: rows })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/notes",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
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

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const rows = db.prepare(
        "SELECT id FROM blobs WHERE vaultId = ? AND id LIKE 'note-v1-%' ORDER BY createdAt DESC"
      ).all(vaultId) as Array<{ id: string }>

      reply.send({ notes: rows.map((row) => row.id) })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/members",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const rows = db.prepare(
        `SELECT vm.userId, u.email, vm.role, vm.createdAt
         FROM vault_members vm
         LEFT JOIN users u ON u.id = vm.userId
         WHERE vm.vaultId = ?
         ORDER BY vm.createdAt ASC`
      ).all(vaultId)

      reply.send({ members: rows })
    }
  )

  app.delete(
    "/v1/vaults/:vaultId/members/:userId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId, userId } = request.params as { vaultId: string; userId: string }
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || member.role !== "owner") {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const now = new Date().toISOString()
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM vault_members WHERE vaultId = ? AND userId = ?")
          .run(vaultId, userId)
        db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
          .run(vaultId, "vault_meta", null, now)
      })

      tx()
      recordAuditEvent(db, {
        userId: user.id,
        vaultId,
        type: "member_revoke",
        meta: { targetUserId: userId },
      })

      reply.send({ ok: true })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/audit",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const query = request.query as { cursor?: string; limit?: string }
      const cursor = Number(query.cursor ?? 0)
      const limit = Math.min(Number(query.limit ?? 50), 100)
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const rows = db.prepare(
        `SELECT id, userId, vaultId, type, meta, createdAt
         FROM audit_events
         WHERE vaultId = ? AND id > ?
         ORDER BY id ASC
         LIMIT ?`
      ).all(vaultId, cursor, limit) as Array<{ id: number; userId: string; vaultId: string | null; type: string; meta: string | null; createdAt: string }>

      const events = rows.map((row) => ({
        ...row,
        meta: row.meta ? safeParseJson(row.meta) : null,
      }))

      reply.send({ events, nextCursor: events.length > 0 ? events[events.length - 1].id : cursor })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/health",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const blobCount = db.prepare("SELECT COUNT(*) as count FROM blobs WHERE vaultId = ?")
        .get(vaultId) as { count: number }
      const changeCount = db.prepare("SELECT COUNT(*) as count FROM changes WHERE vaultId = ?")
        .get(vaultId) as { count: number }
      const memberCount = db.prepare("SELECT COUNT(*) as count FROM vault_members WHERE vaultId = ?")
        .get(vaultId) as { count: number }
      const lastActivity = db.prepare(
        "SELECT MAX(createdAt) as lastActivity FROM changes WHERE vaultId = ?"
      ).get(vaultId) as { lastActivity?: string | null }

      reply.send({
        vaultId,
        blobCount: blobCount.count,
        changeCount: changeCount.count,
        memberCount: memberCount.count,
        lastActivity: lastActivity.lastActivity ?? null,
      })
    }
  )

  app.post(
    "/v1/vaults/:vaultId/rotate-rvk",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || member.role !== "owner") {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const now = new Date().toISOString()
      const tx = db.transaction(() => {
        db.prepare(
          "INSERT INTO vault_rotation_requests (vaultId, requestedAt, requestedByUserId) VALUES (?, ?, ?)"
        ).run(vaultId, now, user.id)
        db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
          .run(vaultId, "vault_meta", null, now)
      })

      tx()
      recordAuditEvent(db, { userId: user.id, vaultId, type: "rvk_rotate_request", meta: { requestedAt: now } })
      reply.send({ ok: true })
    }
  )

  app.post(
    "/v1/vaults/:vaultId/envelope-requests",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const db = getDb()

      const member = db.prepare(
        "SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?"
      ).get(vaultId, user.id) as { role?: string } | undefined

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const now = new Date().toISOString()
      db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
        .run(vaultId, "vault_meta", null, now)
      recordAuditEvent(db, { userId: user.id, vaultId, type: "envelope_resend_request", meta: { requestedAt: now } })
      reply.send({ ok: true })
    }
  )
}

async function deleteVaultBlobFolder(vaultId: string): Promise<void> {
  const base = path.join(process.cwd(), ".data", "blobs", vaultId)
  await fs.rm(base, { recursive: true, force: true })
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
