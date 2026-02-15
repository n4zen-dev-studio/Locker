import { decryptV1, encryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"

export function encodeEnvelopeToBytes(env: EnvelopeV1): Uint8Array {
  return utf8ToBytes(JSON.stringify(env))
}

export function decodeBytesToEnvelope(bytes: Uint8Array): EnvelopeV1 {
  const raw = bytesToUtf8(bytes)
  const obj = JSON.parse(raw) as EnvelopeV1
  if (!obj || obj.v !== 1 || typeof obj.alg !== "string") {
    throw new Error("Invalid envelope")
  }
  return obj
}

// export function encryptJsonToBlobBytes<T>(vmk: Uint8Array, obj: T): Uint8Array {
//   const plaintext = utf8ToBytes(JSON.stringify(obj))
//   const envelope = encryptV1(vmk, plaintext)
//   return encodeEnvelopeToBytes(envelope)
// }

// export function decryptBlobBytesToJson<T>(vmk: Uint8Array, bytes: Uint8Array): T {
//   const envelope = decodeBytesToEnvelope(bytes)
//   const plaintext = decryptV1(vmk, envelope)
//   const raw = bytesToUtf8(plaintext)
//   return JSON.parse(raw) as T
// }

export function encryptJsonToBlobBytes<T>(key: Uint8Array, obj: T): Uint8Array {
  const plaintext = utf8ToBytes(JSON.stringify(obj))
  const envelope = encryptV1(key, plaintext)
  return encodeEnvelopeToBytes(envelope)
}

export function decryptBlobBytesToJson<T>(key: Uint8Array, bytes: Uint8Array): T {
  const envelope = decodeBytesToEnvelope(bytes)
  const plaintext = decryptV1(key, envelope)
  const raw = bytesToUtf8(plaintext)
  return JSON.parse(raw) as T
}
