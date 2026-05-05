import { EnvelopeV1 } from "../crypto/aead"
import { base64ToBytes, bytesToBase64 } from "../crypto/encoding"
import { deriveKek, KdfAlg, KdfParams } from "../crypto/kdf"
import { randomBytes } from "../crypto/random"
import { unwrapVmk, wrapVmk } from "../crypto/keywrap"
import { load, remove, save } from "@/utils/storage"

const META_KEY = "locker:meta:v1"

type VaultMetaState =
  | { status: "empty" }
  | { status: "ready"; meta: VaultMeta }
  | { status: "corrupt" }

export type VaultMeta = {
  v: 1
  kdf: {
    alg: KdfAlg
    iterations: number
    dkLen: number
    salt: string
  }
  wrappedVmk: EnvelopeV1
}

export function getVaultMeta(): VaultMeta | null {
  const meta = load<VaultMeta>(META_KEY)
  if (!meta) return null
  return isValidMeta(meta) ? meta : null
}

export function getVaultMetaState(): VaultMetaState {
  const meta = load<VaultMeta>(META_KEY)
  if (!meta) return { status: "empty" }
  if (!isValidMeta(meta)) return { status: "corrupt" }
  return { status: "ready", meta }
}

export function initializeVault(pin: string): Uint8Array {
  const salt = randomBytes(16)
  const kdfParams: KdfParams = {
    alg: "HASH-STRETCH-SHA256",
    iterations: 1500,
    dkLen: 32,
    salt,
  }

  const kek = deriveKek(pin, kdfParams)
  const vmk = randomBytes(32)
  const wrappedVmk = wrapVmk(kek, vmk)

  const meta: VaultMeta = {
    v: 1,
    kdf: {
      alg: "HASH-STRETCH-SHA256",
      iterations: kdfParams.iterations,
      dkLen: kdfParams.dkLen,
      salt: bytesToBase64(kdfParams.salt),
    },
    wrappedVmk,
  }

  save(META_KEY, meta)
  return vmk
}

export function unlockVault(pin: string): { vmk: Uint8Array } | { error: "incorrect" | "corrupt" } {
  console.log("Attempting to unlock vault with provided PIN")
  const state = getVaultMetaState()
  console.log("Vault meta state:", state.status)
  if (state.status !== "ready") return { error: "corrupt" }
  console.log("Vault meta loaded successfully, deriving KEK...")
  const meta = state.meta
  try {
    const kdfParams: KdfParams = {
      alg: meta.kdf.alg,
      iterations: meta.kdf.iterations,
      dkLen: meta.kdf.dkLen,
      salt: base64ToBytes(meta.kdf.salt),
    }

const t0 = Date.now()
console.log("KDF iterations:", meta.kdf.iterations)

const kek = deriveKek(pin, kdfParams)
const t1 = Date.now()
console.log("deriveKek ms:", t1 - t0)


    // const kek = deriveKek(pin, kdfParams)
    const vmk = unwrapVmk(kek, meta.wrappedVmk)
    console.log("Vault unlocked successfully")
    return { vmk }
  } catch (e) {
    console.log("Failed to unlock vault with provided PIN", e)
    return { error: "incorrect" }
  }
}

export function resetVaultMeta(): void {
  remove(META_KEY)
}

function isValidMeta(meta: any): meta is VaultMeta {
  if (!meta || meta.v !== 1) return false
  if (!meta.kdf) return false

  const alg = meta.kdf.alg
  if (alg !== "PBKDF2-SHA256" && alg !== "HASH-STRETCH-SHA256") return false

  if (typeof meta.kdf.salt !== "string") return false
  if (typeof meta.kdf.iterations !== "number") return false
  if (typeof meta.kdf.dkLen !== "number") return false

  if (!meta.wrappedVmk || meta.wrappedVmk.v !== 1) return false
  return true
}
