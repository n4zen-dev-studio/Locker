import { EnvelopeV1 } from "../crypto/aead"
import { base64ToBytes, bytesToBase64 } from "../crypto/encoding"
import { deriveKek, KdfParams } from "../crypto/kdf"
import { unwrapVmk, wrapVmk } from "../crypto/keywrap"
import { load, remove, save } from "@/utils/storage"

const META_KEY = "locker:meta:v1"

export type KdfParamsV1 =
  | {
      alg: "PBKDF2-SHA256"
      iterations: number
      dkLen: number
      salt: string
    }
  | {
      alg: "HASH-STRETCH-SHA256"
      iterations: number
      salt: string
    }
  | {
      alg: "SCRYPT"
      N: number
      r: number
      p: number
      dkLen: number
      salt: string
    }

export type VaultMetaV1 = {
  v: 1
  kdf: KdfParamsV1
  wrappedVmk: EnvelopeV1
}

export type VaultMetaV2 = {
  v: 2
  vmkWrap: EnvelopeV1
  dwkRef: {
    keychainService: string
  }
  legacy?: VaultMetaV1
}

export type VaultMeta = VaultMetaV1 | VaultMetaV2

export function getMeta(): VaultMeta | null {
  const meta = load<VaultMeta>(META_KEY)
  if (!meta) return null
  if (meta.v === 1) return isValidV1(meta) ? meta : null
  if (meta.v === 2) return isValidV2(meta) ? meta : null
  return null
}

export function setMetaV2(meta: VaultMetaV2): void {
  save(META_KEY, meta)
}

export function setMetaV1(meta: VaultMetaV1): void {
  save(META_KEY, meta)
}

export function removeMeta(): void {
  remove(META_KEY)
}

export function unlockLegacyVault(pin: string):
  | { vmk: Uint8Array; legacy: VaultMetaV1 }
  | { error: "incorrect" | "corrupt" } {
  const meta = getMeta()
  if (!meta || meta.v !== 1) return { error: "corrupt" }
  try {
    const params = kdfParamsFromMeta(meta.kdf)
    const kek = deriveKek(pin, params)
    const vmk = unwrapVmk(kek, meta.wrappedVmk)
    return { vmk, legacy: meta }
  } catch {
    return { error: "incorrect" }
  }
}

export function makeLegacyMetaWithKek(
  kek: Uint8Array,
  kdf: KdfParamsV1,
  vmk: Uint8Array,
): VaultMetaV1 {
  return {
    v: 1,
    kdf,
    wrappedVmk: wrapVmk(kek, vmk),
  }
}

function kdfParamsFromMeta(kdf: KdfParamsV1): KdfParams {
  if (kdf.alg === "PBKDF2-SHA256") {
    return {
      alg: kdf.alg,
      iterations: kdf.iterations,
      dkLen: kdf.dkLen,
      salt: base64ToBytes(kdf.salt),
    }
  }

  if (kdf.alg === "HASH-STRETCH-SHA256") {
    return {
      alg: kdf.alg,
      iterations: kdf.iterations,
      salt: base64ToBytes(kdf.salt),
    }
  }

  return {
    alg: kdf.alg,
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    dkLen: kdf.dkLen,
    salt: base64ToBytes(kdf.salt),
  }
}

export function buildLegacyKdfRecord(params: KdfParams): KdfParamsV1 {
  if (params.alg === "PBKDF2-SHA256") {
    return {
      alg: params.alg,
      iterations: params.iterations,
      dkLen: params.dkLen,
      salt: bytesToBase64(params.salt),
    }
  }

  if (params.alg === "HASH-STRETCH-SHA256") {
    return {
      alg: params.alg,
      iterations: params.iterations,
      salt: bytesToBase64(params.salt),
    }
  }

  return {
    alg: params.alg,
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: params.dkLen,
    salt: bytesToBase64(params.salt),
  }
}

function isValidV1(meta: VaultMetaV1): boolean {
  if (meta.v !== 1) return false
  if (!meta.kdf || typeof meta.kdf.alg !== "string") return false
  if (!meta.wrappedVmk || meta.wrappedVmk.v !== 1) return false
  if (meta.kdf.alg === "PBKDF2-SHA256") {
    return typeof meta.kdf.iterations === "number" && typeof meta.kdf.dkLen === "number"
  }
  if (meta.kdf.alg === "HASH-STRETCH-SHA256") {
    return typeof meta.kdf.iterations === "number"
  }
  if (meta.kdf.alg === "SCRYPT") {
    return (
      typeof meta.kdf.N === "number" &&
      typeof meta.kdf.r === "number" &&
      typeof meta.kdf.p === "number" &&
      typeof meta.kdf.dkLen === "number"
    )
  }
  return false
}

function isValidV2(meta: VaultMetaV2): boolean {
  if (meta.v !== 2) return false
  if (!meta.vmkWrap || meta.vmkWrap.v !== 1) return false
  if (!meta.dwkRef || typeof meta.dwkRef.keychainService !== "string") return false
  if (meta.legacy && !isValidV1(meta.legacy)) return false
  return true
}
