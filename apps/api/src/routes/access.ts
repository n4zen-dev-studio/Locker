import type { FastifyReply, FastifyRequest } from "fastify"

import { getDb } from "../db/db"

export function getRequestDeviceId(request: FastifyRequest): string | null {
  const value = request.headers["x-device-id"]
  if (typeof value === "string" && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim()
  return null
}

export function userOwnsVault(userId: string, vaultId: string): boolean {
  const db = getDb()
  const row = db
    .prepare("SELECT id FROM vaults WHERE id = ? AND ownerUserId = ? AND deletedAt IS NULL")
    .get(vaultId, userId) as { id?: string } | undefined
  return !!row?.id
}

export function ensureVaultOwner(request: FastifyRequest, reply: FastifyReply, vaultId: string): boolean {
  const user = request.user!
  if (userOwnsVault(user.id, vaultId)) return true
  reply.code(403).send({ error: "Forbidden" })
  return false
}

export function deviceBelongsToUser(userId: string, deviceId: string): boolean {
  const db = getDb()
  const row = db
    .prepare("SELECT id FROM devices WHERE id = ? AND userId = ?")
    .get(deviceId, userId) as { id?: string } | undefined
  return !!row?.id
}
