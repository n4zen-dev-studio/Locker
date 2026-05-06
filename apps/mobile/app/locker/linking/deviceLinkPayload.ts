import { randomBytes } from "@/locker/crypto/random"
import { sha256Bytes } from "@/locker/crypto/sha"
import { utf8ToBytes } from "@/locker/crypto/encoding"
import { encryptJsonToBlobBytes, decryptBlobBytesToJson } from "@/locker/sync/remoteCodec"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 12

type ProvisionedVault = {
  vaultId: string
  name?: string | null
  rvkB64: string
}

type DeviceProvisioningPayload = {
  v: 1
  type: "device-link"
  createdAt: string
  vaults: ProvisionedVault[]
}

export function generateDeviceLinkCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let value = ""
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    value += ALPHABET[bytes[index] % ALPHABET.length]
  }
  return value
}

export function normalizeDeviceLinkCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, "")
}

export function formatDeviceLinkCode(input: string): string {
  const normalized = normalizeDeviceLinkCode(input)
  if (normalized.length <= 4) return normalized
  if (normalized.length <= 8) return `${normalized.slice(0, 4)}-${normalized.slice(4)}`
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`
}

export function buildProvisioningPayload(input: {
  linkCode: string
  vaults: Array<{ vaultId: string; name?: string | null; rvk: Uint8Array }>
}): string {
  const payload: DeviceProvisioningPayload = {
    v: 1,
    type: "device-link",
    createdAt: new Date().toISOString(),
    vaults: input.vaults.map((vault) => ({
      vaultId: vault.vaultId,
      name: vault.name ?? null,
      rvkB64: bytesToBase64(vault.rvk),
    })),
  }
  const bytes = encryptJsonToBlobBytes(deriveKey(input.linkCode), payload)
  return bytesToBase64(bytes)
}

export function unwrapProvisioningPayload(input: {
  linkCode: string
  provisioningPayload: string
}): Array<{ vaultId: string; name?: string | null; rvk: Uint8Array }> {
  const payload = decryptBlobBytesToJson<DeviceProvisioningPayload>(
    deriveKey(input.linkCode),
    base64ToBytes(input.provisioningPayload),
  )
  if (payload?.v !== 1 || payload?.type !== "device-link" || !Array.isArray(payload.vaults)) {
    throw new Error("Invalid device provisioning payload")
  }
  return payload.vaults.map((vault) => ({
    vaultId: vault.vaultId,
    name: vault.name ?? null,
    rvk: base64ToBytes(vault.rvkB64),
  }))
}

function deriveKey(linkCode: string): Uint8Array {
  return sha256Bytes(utf8ToBytes(`locker:device-link:${normalizeDeviceLinkCode(linkCode)}`))
}
