import { decryptV1, encryptV1, EnvelopeV1 } from "./aead"
import { utf8ToBytes } from "./encoding"

const VMK_AAD = utf8ToBytes("locker:vmk")

export function wrapVmk(kek: Uint8Array, vmk: Uint8Array): EnvelopeV1 {
  const wrapped = encryptV1(kek, combineAad(VMK_AAD, vmk))
  return wrapped
}

export function unwrapVmk(kek: Uint8Array, wrapped: EnvelopeV1): Uint8Array {
  const payload = decryptV1(kek, wrapped)
  const expectedPrefix = VMK_AAD
  for (let i = 0; i < expectedPrefix.length; i += 1) {
    if (payload[i] !== expectedPrefix[i]) {
      throw new Error("Invalid VMK payload")
    }
  }
  return payload.slice(expectedPrefix.length)
}

function combineAad(prefix: Uint8Array, vmk: Uint8Array): Uint8Array {
  const out = new Uint8Array(prefix.length + vmk.length)
  out.set(prefix)
  out.set(vmk, prefix.length)
  return out
}
