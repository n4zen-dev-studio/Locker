import { pbkdf2 } from "@noble/hashes/pbkdf2"
import { sha256 } from "@noble/hashes/sha256"
import { concatBytes } from "@noble/hashes/utils"
import { utf8ToBytes } from "./encoding"

export type KdfAlg = "PBKDF2-SHA256" | "HASH-STRETCH-SHA256"

export type KdfParams = {
  alg: KdfAlg
  iterations: number
  dkLen: number
  salt: Uint8Array
}

export const defaultKdfParams = (): KdfParams => ({
  // Phase 2 default for mobile: fast and responsive.
  // Phase 3 will move away from PIN-derived keys anyway (passkey-keystore wrap).
  alg: "HASH-STRETCH-SHA256",
  iterations: 1500, // tune if needed; should be <500ms on most devices
  dkLen: 32,
  salt: new Uint8Array(),
})

export function deriveKek(pin: string, params: KdfParams): Uint8Array {
  const pinBytes = utf8ToBytes(pin)

  if (params.alg === "HASH-STRETCH-SHA256") {
    // Fast KDF for RN JS: SHA-256 stretching.
    // KEK = SHA256(pin || salt) then re-hash N times.
    let out = sha256(concatBytes(pinBytes, params.salt))
    for (let i = 0; i < params.iterations; i++) out = sha256(out)
    return out.slice(0, params.dkLen)
  }

  // Keep PBKDF2 available (web/desktop), but it's too slow in Hermes for UX.
  return pbkdf2(sha256, pinBytes, params.salt, {
    c: params.iterations,
    dkLen: params.dkLen,
  })
}
