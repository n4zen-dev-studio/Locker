import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex } from "@noble/hashes/utils"

export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data)
}

export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data))
}
