import { pbkdf2 } from "@noble/hashes/pbkdf2"
import { scrypt } from "@noble/hashes/scrypt"
import { sha256 } from "@noble/hashes/sha256"
import { concatBytes } from "@noble/hashes/utils"
import { utf8ToBytes } from "./encoding"

export type KdfParams =
  | {
      alg: "PBKDF2-SHA256"
      iterations: number
      dkLen: number
      salt: Uint8Array
    }
  | {
      alg: "HASH-STRETCH-SHA256"
      iterations: number
      salt: Uint8Array
    }
  | {
      alg: "SCRYPT"
      N: number
      r: number
      p: number
      dkLen: number
      salt: Uint8Array
    }

export const defaultKdfParams = (): KdfParams => ({
  alg: "SCRYPT",
  N: 16384,
  r: 8,
  p: 1,
  dkLen: 32,
  salt: new Uint8Array(),
})

export function deriveKek(pin: string, params: KdfParams): Uint8Array {
  const pinBytes = utf8ToBytes(pin)
  if (params.alg === "PBKDF2-SHA256") {
    return pbkdf2(sha256, pinBytes, params.salt, {
      c: params.iterations,
      dkLen: params.dkLen,
    })
  }

  if (params.alg === "HASH-STRETCH-SHA256") {
    return hashStretch(pinBytes, params.salt, params.iterations)
  }

  return scrypt(pinBytes, params.salt, {
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: params.dkLen,
  })
}

function hashStretch(pinBytes: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  let digest = sha256(concatBytes(pinBytes, salt))
  const rounds = Math.max(0, iterations)
  for (let i = 0; i < rounds; i += 1) {
    digest = sha256(digest)
  }
  return digest
}
