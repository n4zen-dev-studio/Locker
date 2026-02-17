import { encryptJsonToBlobBytes, decryptBlobBytesToJson } from "@/locker/sync/remoteCodec"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"
import { randomBytes } from "@/locker/crypto/random"

export type AttachmentPayload = {
  v: 1
  type: "attachment"
  noteId: string
  attId: string
  mime: string
  filename: string | null
  bytesB64: string
}

export function buildAttachmentBlobId(noteId: string, attId: string): string {
  return `att-v1-${noteId}-${attId}`
}

export function generateAttachmentId(): string {
  const bytes = randomBytes(12)
  const base64 = bytesToBase64(bytes)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function buildAttachmentBlobBytes(input: {
  rvk: Uint8Array
  noteId: string
  attId: string
  fileBytes: Uint8Array
  filename?: string | null
  mime: string
}): Uint8Array {
  const payload: AttachmentPayload = {
    v: 1,
    type: "attachment",
    noteId: input.noteId,
    attId: input.attId,
    mime: input.mime,
    filename: input.filename ?? null,
    bytesB64: bytesToBase64(input.fileBytes),
  }
  return encryptJsonToBlobBytes(input.rvk, payload)
}

export function parseAttachmentBlobBytes(
  bytes: Uint8Array,
  rvk: Uint8Array,
): { noteId: string; attId: string; filename: string | null; mime: string; fileBytes: Uint8Array } {
  const payload = decryptBlobBytesToJson<AttachmentPayload>(rvk, bytes)
  assertValidAttachmentPayload(payload)
  return {
    noteId: payload.noteId,
    attId: payload.attId,
    filename: payload.filename ?? null,
    mime: payload.mime,
    fileBytes: base64ToBytes(payload.bytesB64),
  }
}

function assertValidAttachmentPayload(obj: any): asserts obj is AttachmentPayload {
  if (!obj || obj.v !== 1 || obj.type !== "attachment") {
    throw new Error("Invalid attachment payload header")
  }
  if (typeof obj.noteId !== "string" || !obj.noteId) throw new Error("Invalid attachment noteId")
  if (typeof obj.attId !== "string" || !obj.attId) throw new Error("Invalid attachment attId")
  if (typeof obj.mime !== "string" || !obj.mime) throw new Error("Invalid attachment mime")
  if (obj.filename !== null && obj.filename !== undefined && typeof obj.filename !== "string") {
    throw new Error("Invalid attachment filename")
  }
  if (typeof obj.bytesB64 !== "string" || !obj.bytesB64) throw new Error("Invalid attachment bytesB64")
}
