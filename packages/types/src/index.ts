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
  current?: boolean
}

export type VaultDTO = {
  id: string
  ownerUserId: string
  name: string
  createdAt: string
  enabledOnDevice?: boolean
  enabledAt?: string | null
  lastSyncAt?: string | null
  lastAccessedAt?: string | null
}

export type DeviceVaultDTO = {
  vaultId: string
  deviceId: string
  enabledAt: string
}

export type VaultAccessRequestDTO = {
  id: string
  vaultId: string
  vaultName?: string | null
  requestingDeviceId: string
  requestingDeviceName?: string | null
  approvedByDeviceId?: string | null
  approvedByDeviceName?: string | null
  requesterPublicKey?: string | null
  status: "pending" | "approved" | "rejected" | "redeemed" | "expired"
  createdAt: string
  expiresAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
  redeemedAt?: string | null
}

export type UserKeyDTO = {
  userId: string
  alg: string
  publicKey: string
  createdAt: string
  rotatedAt?: string | null
}

export type VaultInviteDTO = {
  id: string
  vaultId: string
  vaultName?: string
  inviterUserId: string
  inviterEmail?: string | null
  inviteeEmail: string
  role: string
  status: string
  createdAt: string
  acceptedAt?: string | null
  revokedAt?: string | null
}

export type VaultMemberDTO = {
  userId: string
  email?: string | null
  role: string
  createdAt: string
}

export type VaultKeyEnvelopeDTO = {
  id?: string
  vaultId?: string
  userId: string
  alg: string
  envelopeB64?: string
  createdAt?: string
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
