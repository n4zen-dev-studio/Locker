import { concatBytes } from "@noble/hashes/utils"

import { decryptV1, encryptV1 } from "@/locker/crypto/aead"
import { bytesToBase64, base64ToBytes, utf8ToBytes } from "@/locker/crypto/encoding"
import { deriveKek } from "@/locker/crypto/kdf"
import { randomBytes } from "@/locker/crypto/random"
import { sha256Bytes } from "@/locker/crypto/sha"

const RECOVERY_PREFIX = "RK1"
const RECOVERY_KEY_VERSION = 1
const RECOVERY_ARTIFACT_VERSION = 2
const RECOVERY_ID_BYTES = 8
const RECOVERY_SECRET_BYTES = 16
const RECOVERY_CHECKSUM_BYTES = 2
const GROUP_SIZE = 4
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const KDF_PARAMS = {
  alg: "SCRYPT" as const,
  N: 32768,
  r: 8,
  p: 1,
  dkLen: 32,
}

export type RecoveryKdfParams = typeof KDF_PARAMS & { saltB64: string }

export type RecoveryEnvelopeRole = "target" | "personal"

export type RecoveryArtifactEnvelopePayload = {
  vaultId: string
  role: RecoveryEnvelopeRole
  nonceB64: string
  ciphertextB64: string
}

export type RecoveryArtifactPayload = {
  recoveryId: string
  version: number
  keyVersion: string
  alg: "XCHACHA20-POLY1305"
  kdf: RecoveryKdfParams
  verifierB64: string
  envelopes: RecoveryArtifactEnvelopePayload[]
}

export type RecoveryArtifactEnvelopeRecord = RecoveryArtifactEnvelopePayload & {
  vaultName?: string | null
}

export type RecoveryArtifactRecord = RecoveryArtifactPayload & {
  envelopes: RecoveryArtifactEnvelopeRecord[]
  createdAt?: string
  rotatedAt?: string
  legacyLimited?: boolean
}

export type RecoveryKeyMaterial = {
  recoveryId: string
  canonicalKey: string
  displayKey: string
}

export function generateRecoveryKey(): RecoveryKeyMaterial {
  const header = new Uint8Array([RECOVERY_KEY_VERSION])
  const recoveryIdBytes = randomBytes(RECOVERY_ID_BYTES)
  const secretBytes = randomBytes(RECOVERY_SECRET_BYTES)
  const body = concatBytes(header, recoveryIdBytes, secretBytes)
  const checksum = recoveryChecksum(body)
  const encoded = base32Encode(concatBytes(body, checksum))
  const canonicalKey = `${RECOVERY_PREFIX}${encoded}`
  return {
    recoveryId: base32Encode(recoveryIdBytes),
    canonicalKey,
    displayKey: formatRecoveryKey(canonicalKey),
  }
}

export function formatRecoveryKey(value: string): string {
  const normalized = normalizeRecoveryKey(value)
  if (!normalized) return ""
  const parts = [normalized.slice(0, RECOVERY_PREFIX.length)]
  const body = normalized.slice(RECOVERY_PREFIX.length)
  for (let i = 0; i < body.length; i += GROUP_SIZE) {
    parts.push(body.slice(i, i + GROUP_SIZE))
  }
  return parts.join("-")
}

export function normalizeRecoveryKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[O]/g, "0").replace(/[IL]/g, "1")
}

export function parseRecoveryKey(value: string): RecoveryKeyMaterial {
  const normalized = normalizeRecoveryKey(value)
  if (!normalized.startsWith(RECOVERY_PREFIX)) {
    throw new Error("INVALID_RECOVERY_KEY")
  }

  const body = normalized.slice(RECOVERY_PREFIX.length)
  const bytes = base32Decode(body)
  const expectedLength = 1 + RECOVERY_ID_BYTES + RECOVERY_SECRET_BYTES + RECOVERY_CHECKSUM_BYTES
  if (bytes.length !== expectedLength) {
    throw new Error("INVALID_RECOVERY_KEY")
  }

  const payload = bytes.slice(0, bytes.length - RECOVERY_CHECKSUM_BYTES)
  const checksum = bytes.slice(bytes.length - RECOVERY_CHECKSUM_BYTES)
  const version = payload[0]
  if (version !== RECOVERY_KEY_VERSION) {
    throw new Error("INVALID_RECOVERY_KEY")
  }
  const expectedChecksum = recoveryChecksum(payload)
  if (!byteArrayEqual(checksum, expectedChecksum)) {
    throw new Error("INVALID_RECOVERY_KEY")
  }

  const recoveryIdBytes = payload.slice(1, 1 + RECOVERY_ID_BYTES)
  return {
    recoveryId: base32Encode(recoveryIdBytes),
    canonicalKey: normalized,
    displayKey: formatRecoveryKey(normalized),
  }
}

export function createRecoveryArtifact(
  entries: Array<{ vaultId: string; vaultKey: Uint8Array; role: RecoveryEnvelopeRole }>,
  canonicalKey: string,
): RecoveryArtifactPayload {
  if (entries.length === 0) throw new Error("RECOVERY_ARTIFACT_EMPTY")
  const salt = randomBytes(16)
  const kek = deriveRecoveryKek(canonicalKey, salt)
  const envelopes = entries.map((entry) => {
    const wrapped = encryptV1(kek, entry.vaultKey)
    return {
      vaultId: entry.vaultId,
      role: entry.role,
      nonceB64: wrapped.nonce,
      ciphertextB64: wrapped.ct,
    }
  })
  return {
    recoveryId: parseRecoveryKey(canonicalKey).recoveryId,
    version: RECOVERY_ARTIFACT_VERSION,
    keyVersion: RECOVERY_PREFIX,
    alg: "XCHACHA20-POLY1305",
    kdf: {
      ...KDF_PARAMS,
      saltB64: bytesToBase64(salt),
    },
    verifierB64: bytesToBase64(createRecoveryVerifierFromKek(kek)),
    envelopes,
  }
}

export function openRecoveryArtifact(
  artifact: RecoveryArtifactRecord,
  canonicalKey: string,
): Array<{ vaultId: string; role: RecoveryEnvelopeRole; vaultKey: Uint8Array; vaultName?: string | null }> {
  const kek = deriveRecoveryKek(canonicalKey, base64ToBytes(artifact.kdf.saltB64))
  return artifact.envelopes.map((envelope) => ({
    vaultId: envelope.vaultId,
    role: envelope.role,
    vaultName: envelope.vaultName,
    vaultKey: decryptV1(kek, {
      v: 1,
      alg: artifact.alg,
      nonce: envelope.nonceB64,
      ct: envelope.ciphertextB64,
    }),
  }))
}

export function createRecoveryProof(canonicalKey: string, artifact: RecoveryArtifactRecord): string {
  const kek = deriveRecoveryKek(canonicalKey, base64ToBytes(artifact.kdf.saltB64))
  return bytesToBase64(createRecoveryVerifierFromKek(kek))
}

function deriveRecoveryKek(canonicalKey: string, salt: Uint8Array): Uint8Array {
  return deriveKek(canonicalKey, { ...KDF_PARAMS, salt })
}

function recoveryChecksum(bytes: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(utf8ToBytes("locker:recovery-key:v1"), bytes)).slice(0, RECOVERY_CHECKSUM_BYTES)
}

function createRecoveryVerifierFromKek(kek: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(utf8ToBytes("locker:recovery-proof:v1"), kek))
}

function base32Encode(bytes: Uint8Array): string {
  let output = ""
  let buffer = 0
  let bits = 0
  for (const value of bytes) {
    buffer = (buffer << 8) | value
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(value: string): Uint8Array {
  if (!value) return new Uint8Array()
  let buffer = 0
  let bits = 0
  const bytes: number[] = []
  for (const char of value) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) throw new Error("INVALID_RECOVERY_KEY")
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(bytes)
}

function byteArrayEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}
