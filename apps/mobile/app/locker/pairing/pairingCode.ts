import { decryptBlobBytesToJson, encryptJsonToBlobBytes } from "@/locker/sync/remoteCodec"
import { randomBytes } from "@/locker/crypto/random"
import { sha256Bytes } from "@/locker/crypto/sha"
import { base64ToBytes, bytesToBase64, utf8ToBytes } from "@/locker/crypto/encoding"

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const PAIRING_CODE_LENGTH = 8

type PairingPayload = {
  v: 1
  type: "vault-pairing"
  vaultId: string
  rvkB64: string
  createdAt: string
}

export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, "")
}

export function formatPairingCode(input: string): string {
  const normalized = normalizePairingCode(input)
  if (normalized.length <= 4) return normalized
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`
}

export function isValidPairingCode(input: string): boolean {
  return normalizePairingCode(input).length === PAIRING_CODE_LENGTH
}

export function generatePairingCode(): string {
  const bytes = randomBytes(PAIRING_CODE_LENGTH)
  let value = ""
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    value += PAIRING_ALPHABET[bytes[index] % PAIRING_ALPHABET.length]
  }
  return value
}

export function buildWrappedVaultKeyPayload(input: {
  pairingCode: string
  vaultId: string
  rvk: Uint8Array
}): string {
  const normalized = normalizePairingCode(input.pairingCode)
  if (!isValidPairingCode(normalized)) {
    throw new Error("Invalid pairing code")
  }

  const payload: PairingPayload = {
    v: 1,
    type: "vault-pairing",
    vaultId: input.vaultId,
    rvkB64: bytesToBase64(input.rvk),
    createdAt: new Date().toISOString(),
  }

  const bytes = encryptJsonToBlobBytes(derivePairingKey(normalized), payload)
  return bytesToBase64(bytes)
}

export function unwrapVaultKeyPayload(input: {
  pairingCode: string
  wrappedVaultKeyB64: string
}): { vaultId: string; rvk: Uint8Array } {
  const normalized = normalizePairingCode(input.pairingCode)
  if (!isValidPairingCode(normalized)) {
    throw new Error("Invalid pairing code")
  }

  const bytes = base64ToBytes(input.wrappedVaultKeyB64)
  const payload = decryptBlobBytesToJson<PairingPayload>(derivePairingKey(normalized), bytes)
  if (payload?.v !== 1 || payload?.type !== "vault-pairing" || !payload.vaultId || !payload.rvkB64) {
    throw new Error("Invalid pairing payload")
  }

  return {
    vaultId: payload.vaultId,
    rvk: base64ToBytes(payload.rvkB64),
  }
}

function derivePairingKey(pairingCode: string): Uint8Array {
  return sha256Bytes(utf8ToBytes(`locker:pairing-code:${pairingCode}`))
}
