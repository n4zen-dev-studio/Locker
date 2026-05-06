import nacl from "tweetnacl"
import { load, save } from "@/utils/storage"
import { bytesToBase64 } from "@/locker/crypto/encoding"
import { encryptV1, decryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { vaultSession } from "@/locker/session"

const PUBLIC_KEY_STORAGE = "locker:user-key:public:v1"
const PRIVATE_KEY_WRAP_STORAGE = "locker:user-key:private-wrap:v1"
const CREATED_AT_STORAGE = "locker:user-key:created-at:v1"

type StoredWrap = EnvelopeV1

export function getUserPublicKey(): string | null {
  return load(PUBLIC_KEY_STORAGE) as string | null
}

export function decryptPrivateKeyWithVMK(): Uint8Array {
  const vmk = vaultSession.getKey()
  if (!vmk) throw new Error("Vault locked")
  const wrapped = load(PRIVATE_KEY_WRAP_STORAGE) as StoredWrap | null
  if (!wrapped) throw new Error("Missing private key")
  return decryptV1(vmk, wrapped)
}

export function ensureUserKeypair(): { publicKeyB64: string; createdAt: string } {
  const vmk = vaultSession.getKey()
  if (!vmk) throw new Error("Vault locked")

  const existingPub = load(PUBLIC_KEY_STORAGE) as string | null
  const existingWrap = load(PRIVATE_KEY_WRAP_STORAGE) as StoredWrap | null
  const existingCreatedAt = load(CREATED_AT_STORAGE) as string | null

  if (existingPub && existingWrap && existingCreatedAt) {
    try {
      decryptV1(vmk, existingWrap)
      return { publicKeyB64: existingPub, createdAt: existingCreatedAt }
    } catch {
      // Fall through to regenerate
    }
  }

  const kp = nacl.box.keyPair()
  const createdAt = new Date().toISOString()
  const publicKeyB64 = bytesToBase64(kp.publicKey)
  const wrapped = encryptV1(vmk, kp.secretKey)

  save(PUBLIC_KEY_STORAGE, publicKeyB64)
  save(PRIVATE_KEY_WRAP_STORAGE, wrapped)
  save(CREATED_AT_STORAGE, createdAt)

  return { publicKeyB64, createdAt }
}

export function getUserKeyMetadata(): { publicKeyB64: string; createdAt: string } | null {
  const publicKeyB64 = load(PUBLIC_KEY_STORAGE) as string | null
  const createdAt = load(CREATED_AT_STORAGE) as string | null
  if (!publicKeyB64 || !createdAt) return null
  return { publicKeyB64, createdAt }
}
