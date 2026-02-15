export type UserDTO = {
  id: string
  email?: string
  createdAt: string
}

export type DeviceDTO = {
  id: string
  userId: string
  name: string
  platform: string
  createdAt: string
  lastSeenAt?: string
}

export type VaultDTO = {
  id: string
  ownerUserId: string
  name: string
  createdAt: string
  role?: string
}

export type BlobRefDTO = {
  id: string
  vaultId: string
  sizeBytes: number
  contentType: string
  createdAt: string
  sha256: string
}

export type AuditEventDTO = {
  id: string
  userId: string
  type: string
  createdAt: string
  metadata: Record<string, unknown>
}
