import { xchacha20poly1305 } from "@noble/ciphers/chacha"
import { bytesToBase64, base64ToBytes } from "./encoding"
import { randomBytes } from "./random"

export type EnvelopeV1 = {
  v: 1
  alg: "XCHACHA20-POLY1305"
  nonce: string
  ct: string
}

const AAD = new TextEncoder().encode("locker:v1")

const aeadFactory = xchacha20poly1305 as unknown as any

export function encryptV1(key: Uint8Array, plaintext: Uint8Array): EnvelopeV1 {
  const nonce = randomBytes(24)
  const ciphertext = encryptWithFallback(key, nonce, plaintext)

  return {
    v: 1,
    alg: "XCHACHA20-POLY1305",
    nonce: bytesToBase64(nonce),
    ct: bytesToBase64(ciphertext),
  }
}

export function decryptV1(key: Uint8Array, envelope: EnvelopeV1): Uint8Array {
  if (envelope.v !== 1 || envelope.alg !== "XCHACHA20-POLY1305") {
    throw new Error("Unsupported envelope")
  }
  const nonce = base64ToBytes(envelope.nonce)
  const ciphertext = base64ToBytes(envelope.ct)
  return decryptWithFallback(key, nonce, ciphertext)
}

function encryptWithFallback(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const direct = aeadFactory(key, nonce, AAD)
  if (direct && typeof direct.encrypt === "function") {
    return direct.encrypt(plaintext)
  }

  const alt = aeadFactory(key)
  if (alt && typeof alt.encrypt === "function") {
    return alt.encrypt(nonce, plaintext, AAD)
  }

  throw new Error("Cipher unavailable")
}

function decryptWithFallback(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const direct = aeadFactory(key, nonce, AAD)
  if (direct && typeof direct.decrypt === "function") {
    return direct.decrypt(ciphertext)
  }

  const alt = aeadFactory(key)
  if (alt && typeof alt.decrypt === "function") {
    return alt.decrypt(nonce, ciphertext, AAD)
  }

  throw new Error("Cipher unavailable")
}
