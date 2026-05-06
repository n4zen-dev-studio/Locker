import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { recordAuditEvent } from "../db/audit"

const inviteCreateSchema = z.object({
  inviteeEmail: z.string().email(),
  role: z.enum(["owner", "admin", "editor", "viewer"]),
})

export async function registerInviteRoutes(app: FastifyInstance) {
  app.post(
    "/v1/vaults/:vaultId/invites",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const parse = inviteCreateSchema.safeParse(request.body)
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
      const inviteId = crypto.randomUUID()
      const email = parse.data.inviteeEmail.toLowerCase()

      db.prepare(
        `INSERT INTO vault_invites
         (id, vaultId, inviterUserId, inviteeEmail, role, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(inviteId, vaultId, user.id, email, parse.data.role, "pending", now)

      recordAuditEvent(db, {
        userId: user.id,
        vaultId,
        type: "invite_create",
        meta: { inviteId, inviteeEmail: email, role: parse.data.role },
      })

      reply.send({
        invite: {
          id: inviteId,
          vaultId,
          inviterUserId: user.id,
          inviteeEmail: email,
          role: parse.data.role,
          status: "pending",
          createdAt: now,
        },
      })
    }
  )

  app.get("/v1/me/invites", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    if (!user.email) {
      reply.code(400).send({ error: "User email required" })
      return
    }

    const db = getDb()
    const email = user.email.toLowerCase()
    const rows = db
      .prepare(
        `SELECT vi.id, vi.vaultId, v.name as vaultName, vi.inviterUserId, u.email as inviterEmail,
                vi.inviteeEmail, vi.role, vi.status, vi.createdAt, vi.acceptedAt, vi.revokedAt
         FROM vault_invites vi
         INNER JOIN vaults v ON v.id = vi.vaultId
         LEFT JOIN users u ON u.id = vi.inviterUserId
         WHERE vi.inviteeEmail = ? AND vi.status = 'pending' AND v.deletedAt IS NULL
         ORDER BY vi.createdAt DESC`
      )
      .all(email) as Array<{
      id: string
      vaultId: string
      vaultName: string
      inviterUserId: string
      inviterEmail?: string | null
      inviteeEmail: string
      role: string
      status: string
      createdAt: string
      acceptedAt?: string | null
      revokedAt?: string | null
    }>

    reply.send({ invites: rows })
  })

  app.post(
    "/v1/invites/:inviteId/accept",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      if (!user.email) {
        reply.code(400).send({ error: "User email required" })
        return
      }

      const { inviteId } = request.params as { inviteId: string }
      const db = getDb()

      const invite = db
        .prepare(
          "SELECT id, vaultId, inviteeEmail, role, status FROM vault_invites WHERE id = ?"
        )
        .get(inviteId) as
        | { id: string; vaultId: string; inviteeEmail: string; role: string; status: string }
        | undefined

      if (!invite) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      if (invite.status !== "pending") {
        reply.code(400).send({ error: "Invite not pending" })
        return
      }

      if (invite.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const vault = db
        .prepare("SELECT deletedAt FROM vaults WHERE id = ?")
        .get(invite.vaultId) as { deletedAt?: string | null } | undefined

      if (!vault || vault.deletedAt) {
        reply.code(404).send({ error: "Vault not found" })
        return
      }

      const now = new Date().toISOString()
      const tx = db.transaction(() => {
        db.prepare(
          "INSERT OR IGNORE INTO vault_members (vaultId, userId, role, createdAt) VALUES (?, ?, ?, ?)"
        ).run(invite.vaultId, user.id, invite.role, now)

        db.prepare(
          "UPDATE vault_invites SET status = 'accepted', acceptedAt = ? WHERE id = ?"
        ).run(now, inviteId)

        db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
          .run(invite.vaultId, "vault_meta", null, now)
      })

      tx()
      recordAuditEvent(db, {
        userId: user.id,
        vaultId: invite.vaultId,
        type: "invite_accept",
        meta: { inviteId },
      })

      reply.send({ ok: true, vaultId: invite.vaultId })
    }
  )

  app.post(
    "/v1/invites/:inviteId/revoke",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { inviteId } = request.params as { inviteId: string }
      const db = getDb()

      const invite = db
        .prepare("SELECT id, vaultId, status FROM vault_invites WHERE id = ?")
        .get(inviteId) as { id: string; vaultId: string; status: string } | undefined

      if (!invite) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(invite.vaultId, user.id) as { role?: string } | undefined

      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const now = new Date().toISOString()
      db.prepare(
        "UPDATE vault_invites SET status = 'revoked', revokedAt = ? WHERE id = ?"
      ).run(now, inviteId)

      recordAuditEvent(db, {
        userId: user.id,
        vaultId: invite.vaultId,
        type: "invite_revoke",
        meta: { inviteId },
      })

      reply.send({ ok: true })
    }
  )
}
