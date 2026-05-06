import { FastifyInstance } from "fastify"
import { z } from "zod"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { recordAuditEvent } from "../db/audit"

const createSchema = z.object({
  pairingCode: z.string().min(8).max(9),
  wrappedVaultKeyB64: z.string().min(1),
})

const redeemSchema = z.object({
  pairingCode: z.string().min(8).max(9),
})

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000

export async function registerPairingRoutes(app: FastifyInstance) {
  app.post(
    "/v1/vaults/:vaultId/pairing-codes",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId } = request.params as { vaultId: string }
      const parse = createSchema.safeParse(request.body)
      if (!parse.success) {
        reply.code(400).send({ error: "Invalid body" })
        return
      }

      const db = getDb()
      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as { role?: string } | undefined

      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const nowMs = Date.now()
      const createdAt = new Date(nowMs).toISOString()
      const expiresAt = new Date(nowMs + PAIRING_CODE_TTL_MS).toISOString()
      const pairingCode = normalizePairingCode(parse.data.pairingCode)
      if (pairingCode.length !== 8) {
        reply.code(400).send({ error: "Invalid pairing code" })
        return
      }

      db.prepare("DELETE FROM device_pairing_codes WHERE userId = ? OR expiresAt <= ? OR usedAt IS NOT NULL").run(
        user.id,
        createdAt,
      )

      db.prepare(
        `INSERT INTO device_pairing_codes
         (code, vaultId, userId, wrappedVaultKeyB64, expiresAt, usedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(pairingCode, vaultId, user.id, parse.data.wrappedVaultKeyB64, expiresAt, null, createdAt)

      recordAuditEvent(db, {
        userId: user.id,
        vaultId,
        type: "pairing_code_created",
        meta: { expiresAt },
      })

      reply.send({ pairingCode, expiresAt })
    },
  )

  app.post("/v1/pairing-codes/redeem", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const parse = redeemSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const nowIso = new Date().toISOString()
    const pairingCode = normalizePairingCode(parse.data.pairingCode)
    if (pairingCode.length !== 8) {
      reply.code(400).send({ error: "Invalid pairing code" })
      return
    }

    const row = db
      .prepare(
        `SELECT code, vaultId, userId, wrappedVaultKeyB64, expiresAt, usedAt
         FROM device_pairing_codes
         WHERE code = ?`
      )
      .get(pairingCode) as
      | {
          code: string
          vaultId: string
          userId: string
          wrappedVaultKeyB64: string
          expiresAt: string
          usedAt: string | null
        }
      | undefined

    if (!row) {
      reply.code(404).send({ error: "Pairing code not found" })
      return
    }
    if (row.userId !== user.id) {
      reply.code(403).send({ error: "Pairing code belongs to another account" })
      return
    }
    if (row.usedAt) {
      reply.code(400).send({ error: "Pairing code already used" })
      return
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      reply.code(400).send({ error: "Pairing code expired" })
      return
    }

    const member = db
      .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
      .get(row.vaultId, user.id) as { role?: string } | undefined

    if (!member) {
      reply.code(403).send({ error: "Forbidden" })
      return
    }

    db.prepare("UPDATE device_pairing_codes SET usedAt = ? WHERE code = ?").run(nowIso, pairingCode)
    recordAuditEvent(db, {
      userId: user.id,
      vaultId: row.vaultId,
      type: "pairing_code_redeemed",
      meta: null,
    })

    reply.send({
      vaultId: row.vaultId,
      wrappedVaultKeyB64: row.wrappedVaultKeyB64,
    })
  })
}

function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, "")
}
