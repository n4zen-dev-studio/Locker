import type { EnvelopeV1 } from "@/locker/crypto/aead"
import type { Note } from "@/locker/storage/notesRepo"

export type RemotePayload =
  | { v: 1; type: "notes-index"; ids: string[]; updatedAt: string; deviceId: string; lamport: number }
  | { v: 1; type: "note"; note: Note; deviceId: string; lamport: number }
  | { v: 1; type: "note-delete"; noteId: string; deletedAt: string; deviceId: string; lamport: number }
  | { v: 1; type: "sync-key-check"; vaultId: string; createdAt: string; deviceId?: string }

export function assertValidEnvelopeV1(env: EnvelopeV1): void {
  if (!env || env.v !== 1) throw new Error("Invalid envelope v")
  if (typeof env.alg !== "string" || !env.alg) throw new Error("Invalid envelope alg")
  if (typeof env.nonce !== "string" || !env.nonce) throw new Error("Invalid envelope nonce")
  if (typeof env.ct !== "string" || !env.ct) throw new Error("Invalid envelope ct")
}

export function assertValidRemotePayload(obj: any): asserts obj is RemotePayload {
  if (!obj || obj.v !== 1 || typeof obj.type !== "string") {
    throw new Error("Invalid payload header")
  }

  if (obj.type === "notes-index") {
    if (!Array.isArray(obj.ids)) throw new Error("Invalid index ids")
    if (typeof obj.updatedAt !== "string") throw new Error("Invalid index updatedAt")
    if (typeof obj.deviceId !== "string") throw new Error("Invalid index deviceId")
    if (typeof obj.lamport !== "number") throw new Error("Invalid index lamport")
    return
  }

  if (obj.type === "note") {
    if (!obj.note || typeof obj.note.id !== "string") throw new Error("Invalid note id")
    if (typeof obj.note.title !== "string") throw new Error("Invalid note title")
    if (typeof obj.note.body !== "string") throw new Error("Invalid note body")
    if (typeof obj.note.createdAt !== "string") throw new Error("Invalid note createdAt")
    if (typeof obj.note.updatedAt !== "string") throw new Error("Invalid note updatedAt")
    if (obj.note.attachments !== undefined) {
      if (!Array.isArray(obj.note.attachments)) throw new Error("Invalid note attachments")
      for (const att of obj.note.attachments) {
        if (!isValidAttachment(att)) throw new Error("Invalid note attachment")
      }
    }
    if (typeof obj.deviceId !== "string") throw new Error("Invalid note deviceId")
    if (typeof obj.lamport !== "number") throw new Error("Invalid note lamport")
    return
  }

  if (obj.type === "note-delete") {
    if (typeof obj.noteId !== "string") throw new Error("Invalid delete noteId")
    if (typeof obj.deletedAt !== "string") throw new Error("Invalid delete deletedAt")
    if (typeof obj.deviceId !== "string") throw new Error("Invalid delete deviceId")
    if (typeof obj.lamport !== "number") throw new Error("Invalid delete lamport")
    return
  }

  if (obj.type === "sync-key-check") {
    if (typeof obj.vaultId !== "string") throw new Error("Invalid key check vaultId")
    if (typeof obj.createdAt !== "string") throw new Error("Invalid key check createdAt")
    return
  }

  throw new Error("Unknown payload type")
}

function isValidAttachment(att: any): boolean {
  if (!att || typeof att !== "object") return false
  if (typeof att.id !== "string") return false
  if (typeof att.mime !== "string") return false
  if (typeof att.sizeBytes !== "number") return false
  if (typeof att.sha256 !== "string") return false
  if (typeof att.blobId !== "string") return false
  if (typeof att.createdAt !== "string") return false
  if (att.durationMs !== undefined && att.durationMs !== null && typeof att.durationMs !== "number") {
    return false
  }
  if (att.filename !== undefined && att.filename !== null && typeof att.filename !== "string") return false
  return true
}
