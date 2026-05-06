import crypto from "crypto"
import { FastifyInstance } from "fastify"
import { z } from "zod"

import { VaultAccessRequestDTO } from "@locker/types"
import { getDb } from "../db/db"
import { recordAuditEvent } from "../db/audit"
import { authMiddleware } from "../middleware/auth"
import { deviceBelongsToUser, ensureVaultOwner, getRequestDeviceId } from "./access"

const createSchema = z.object({
  requestingDeviceId: z.string().min(1).optional(),
  requesterPublicKey: z.string().min(1),
})

const approveSchema = z.object({
  wrappedVaultKeyB64: z.string().min(1),
})

const VAULT_ACCESS_REQUEST_TTL_MS = 10 * 60 * 1000

type VaultAccessRequestRow = {
  id: string
  userId: string
  vaultId: string
  requestingDeviceId: string
  requesterPublicKey: string
  wrappedVaultKeyB64: string | null
  status: string
  expiresAt: string
  createdAt: string
  approvedAt: string | null
  approvedByDeviceId: string | null
  rejectedAt: string | null
  redeemedAt: string | null
  vaultName: string | null
  requestingDeviceName: string | null
  approvedByDeviceName: string | null
}

export async function registerVaultAccessRequestRoutes(app: FastifyInstance) {
  app.post("/v1/vaults/:vaultId/access-requests", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { vaultId } = request.params as { vaultId: string }
    const parse = createSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }
    if (!ensureVaultOwner(request, reply, vaultId)) return

    const db = getDb()
    const requestingDeviceId = parse.data.requestingDeviceId ?? getRequestDeviceId(request)
    if (!requestingDeviceId || !deviceBelongsToUser(user.id, requestingDeviceId)) {
      reply.code(400).send({ error: "Requesting device not found" })
      return
    }

    const enabled = db
      .prepare("SELECT enabledAt FROM device_vaults WHERE deviceId = ? AND vaultId = ?")
      .get(requestingDeviceId, vaultId) as { enabledAt?: string } | undefined
    if (enabled?.enabledAt) {
      reply.code(400).send({ error: "Vault already available on that device" })
      return
    }

    const nowMs = Date.now()
    const createdAt = new Date(nowMs).toISOString()
    const expiresAt = new Date(nowMs + VAULT_ACCESS_REQUEST_TTL_MS).toISOString()
    const requestId = crypto.randomUUID()

    db.prepare(
      `UPDATE vault_access_requests
       SET status = 'expired'
       WHERE userId = ? AND (expiresAt <= ? OR status IN ('pending', 'approved') AND requestingDeviceId = ? AND vaultId = ?)`
    ).run(user.id, createdAt, requestingDeviceId, vaultId)

    db.prepare(
      `INSERT INTO vault_access_requests
       (id, userId, vaultId, requestingDeviceId, requesterPublicKey, wrappedVaultKeyB64, status, expiresAt, createdAt, approvedAt, approvedByDeviceId, rejectedAt, redeemedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      requestId,
      user.id,
      vaultId,
      requestingDeviceId,
      parse.data.requesterPublicKey,
      null,
      "pending",
      expiresAt,
      createdAt,
      null,
      null,
      null,
      null,
    )

    recordAuditEvent(db, {
      userId: user.id,
      vaultId,
      type: "vault_access_requested",
      meta: { requestId, requestingDeviceId, expiresAt },
    })

    reply.send({
      request: {
        id: requestId,
        vaultId,
        requestingDeviceId,
        requesterPublicKey: parse.data.requesterPublicKey,
        status: "pending",
        createdAt,
        expiresAt,
      },
    })
  })

  app.get("/v1/vault-access-requests", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare("UPDATE vault_access_requests SET status = 'expired' WHERE userId = ? AND status IN ('pending', 'approved') AND expiresAt <= ?").run(
      user.id,
      now,
    )

    const rows = db
      .prepare(
        `SELECT
           r.id,
           r.userId,
           r.vaultId,
           r.requestingDeviceId,
           r.requesterPublicKey,
           r.wrappedVaultKeyB64,
           r.status,
           r.expiresAt,
           r.createdAt,
           r.approvedAt,
           r.approvedByDeviceId,
           r.rejectedAt,
           r.redeemedAt,
           v.name AS vaultName,
           d.name AS requestingDeviceName,
           ad.name AS approvedByDeviceName
         FROM vault_access_requests r
         INNER JOIN vaults v ON v.id = r.vaultId
         LEFT JOIN devices d ON d.id = r.requestingDeviceId
         LEFT JOIN devices ad ON ad.id = r.approvedByDeviceId
         WHERE r.userId = ? AND v.deletedAt IS NULL
         ORDER BY r.createdAt DESC`
      )
      .all(user.id) as VaultAccessRequestRow[]

    reply.send({
      requests: rows.map(mapVaultAccessRequestRow),
    })
  })

  app.post("/v1/vault-access-requests/:requestId/approve", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { requestId } = request.params as { requestId: string }
    const parse = approveSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const row = db
      .prepare(
        `SELECT id, userId, vaultId, requestingDeviceId, status, expiresAt
         FROM vault_access_requests
         WHERE id = ?`
      )
      .get(requestId) as
      | {
          id: string
          userId: string
          vaultId: string
          requestingDeviceId: string
          status: string
          expiresAt: string
        }
      | undefined
    if (!row || row.userId !== user.id) {
      reply.code(404).send({ error: "Request not found" })
      return
    }
    if (row.status !== "pending") {
      reply.code(400).send({ error: "Request is no longer pending" })
      return
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      db.prepare("UPDATE vault_access_requests SET status = 'expired' WHERE id = ?").run(requestId)
      reply.code(400).send({ error: "Request expired" })
      return
    }
    if (!ensureVaultOwner(request, reply, row.vaultId)) return

    const approverDeviceId = getRequestDeviceId(request)
    if (!approverDeviceId || !deviceBelongsToUser(user.id, approverDeviceId)) {
      reply.code(400).send({ error: "Approving device not found" })
      return
    }

    const approverEnabled = db
      .prepare("SELECT enabledAt FROM device_vaults WHERE deviceId = ? AND vaultId = ?")
      .get(approverDeviceId, row.vaultId) as { enabledAt?: string } | undefined
    if (!approverEnabled?.enabledAt) {
      reply.code(403).send({ error: "This device does not have that vault enabled" })
      return
    }

    const approvedAt = new Date().toISOString()
    db.prepare(
      `UPDATE vault_access_requests
       SET status = 'approved',
           wrappedVaultKeyB64 = ?,
           approvedAt = ?,
           approvedByDeviceId = ?
       WHERE id = ?`
    ).run(parse.data.wrappedVaultKeyB64, approvedAt, approverDeviceId, requestId)

    recordAuditEvent(db, {
      userId: user.id,
      vaultId: row.vaultId,
      type: "vault_access_approved",
      meta: { requestId, requestingDeviceId: row.requestingDeviceId, approvedByDeviceId: approverDeviceId },
    })

    reply.send({ ok: true, approvedAt })
  })

  app.post("/v1/vault-access-requests/:requestId/reject", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { requestId } = request.params as { requestId: string }
    const db = getDb()
    const row = db
      .prepare("SELECT id, userId, vaultId, status FROM vault_access_requests WHERE id = ?")
      .get(requestId) as { id: string; userId: string; vaultId: string; status: string } | undefined
    if (!row || row.userId !== user.id) {
      reply.code(404).send({ error: "Request not found" })
      return
    }
    if (!ensureVaultOwner(request, reply, row.vaultId)) return
    if (row.status !== "pending") {
      reply.code(400).send({ error: "Request is no longer pending" })
      return
    }

    const rejectedAt = new Date().toISOString()
    db.prepare("UPDATE vault_access_requests SET status = 'rejected', rejectedAt = ? WHERE id = ?").run(rejectedAt, requestId)

    recordAuditEvent(db, {
      userId: user.id,
      vaultId: row.vaultId,
      type: "vault_access_rejected",
      meta: { requestId },
    })

    reply.send({ ok: true, rejectedAt })
  })

  app.post("/v1/vault-access-requests/:requestId/redeem", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { requestId } = request.params as { requestId: string }
    const db = getDb()
    const row = db
      .prepare(
        `SELECT id, userId, vaultId, requestingDeviceId, wrappedVaultKeyB64, status, expiresAt
         FROM vault_access_requests
         WHERE id = ?`
      )
      .get(requestId) as
      | {
          id: string
          userId: string
          vaultId: string
          requestingDeviceId: string
          wrappedVaultKeyB64: string | null
          status: string
          expiresAt: string
        }
      | undefined
    if (!row || row.userId !== user.id) {
      reply.code(404).send({ error: "Request not found" })
      return
    }
    const deviceId = getRequestDeviceId(request)
    if (!deviceId || row.requestingDeviceId !== deviceId) {
      reply.code(403).send({ error: "Request belongs to another device" })
      return
    }
    if (row.status !== "approved" || !row.wrappedVaultKeyB64) {
      reply.code(400).send({ error: "Request is not ready to redeem" })
      return
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      db.prepare("UPDATE vault_access_requests SET status = 'expired' WHERE id = ?").run(requestId)
      reply.code(400).send({ error: "Request expired" })
      return
    }

    const redeemedAt = new Date().toISOString()
    const tx = db.transaction(() => {
      db.prepare("UPDATE vault_access_requests SET status = 'redeemed', redeemedAt = ? WHERE id = ?").run(redeemedAt, requestId)
      db.prepare("INSERT OR REPLACE INTO device_vaults (deviceId, vaultId, enabledAt) VALUES (?, ?, ?)").run(
        deviceId,
        row.vaultId,
        redeemedAt,
      )
    })
    tx()

    recordAuditEvent(db, {
      userId: user.id,
      vaultId: row.vaultId,
      type: "vault_access_redeemed",
      meta: { requestId, deviceId },
    })

    reply.send({
      ok: true,
      vaultId: row.vaultId,
      wrappedVaultKeyB64: row.wrappedVaultKeyB64,
      enabledAt: redeemedAt,
    })
  })
}

function mapVaultAccessRequestRow(row: VaultAccessRequestRow): VaultAccessRequestDTO {
  return {
    id: row.id,
    vaultId: row.vaultId,
    vaultName: row.vaultName,
    requestingDeviceId: row.requestingDeviceId,
    requestingDeviceName: row.requestingDeviceName,
    approvedByDeviceId: row.approvedByDeviceId,
    approvedByDeviceName: row.approvedByDeviceName,
    requesterPublicKey: row.requesterPublicKey,
    status: row.status as VaultAccessRequestDTO["status"],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt,
    rejectedAt: row.rejectedAt,
    redeemedAt: row.redeemedAt,
  }
}
