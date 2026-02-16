import nacl from "tweetnacl"
import { bytesToBase64, base64ToBytes, utf8ToBytes, bytesToUtf8 } from "./encoding"
import { randomBytes } from "./random"

export type SealedBoxEnvelopeV1 = {
  v: 1
  alg: "X25519-SEALED-BOX"
  ephPubB64: string
  nonceB64: string
  ctB64: string
}

export function createSealedBoxEnvelope(
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array,
): SealedBoxEnvelopeV1 {
  const eph = nacl.box.keyPair()
  const nonce = randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(plaintext, nonce, recipientPublicKey, eph.secretKey)

  return {
    v: 1,
    alg: "X25519-SEALED-BOX",
    ephPubB64: bytesToBase64(eph.publicKey),
    nonceB64: bytesToBase64(nonce),
    ctB64: bytesToBase64(ciphertext),
  }
}

export function openSealedBoxEnvelope(
  recipientPrivateKey: Uint8Array,
  envelope: SealedBoxEnvelopeV1,
): Uint8Array {
  if (envelope.v !== 1 || envelope.alg !== "X25519-SEALED-BOX") {
    throw new Error("Unsupported envelope")
  }
  const ephPub = base64ToBytes(envelope.ephPubB64)
  const nonce = base64ToBytes(envelope.nonceB64)
  const ct = base64ToBytes(envelope.ctB64)
  const opened = nacl.box.open(ct, nonce, ephPub, recipientPrivateKey)
  if (!opened) throw new Error("Envelope decrypt failed")
  return opened
}

export function encodeEnvelopeToBase64(envelope: SealedBoxEnvelopeV1): string {
  return bytesToBase64(utf8ToBytes(JSON.stringify(envelope)))
}

export function decodeEnvelopeFromBase64(b64: string): SealedBoxEnvelopeV1 {
  const raw = bytesToUtf8(base64ToBytes(b64))
  const obj = JSON.parse(raw) as SealedBoxEnvelopeV1
  if (!obj || obj.v !== 1 || obj.alg !== "X25519-SEALED-BOX") {
    throw new Error("Invalid sealed box envelope")
  }
  return obj
}
