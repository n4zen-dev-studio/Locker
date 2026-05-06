import { randomBytes } from "@/locker/crypto/random"
import { bytesToBase64 } from "@/locker/crypto/encoding"
import { sha256Hex } from "@/locker/crypto/sha"
import { encryptJsonToBlobBytes } from "./remoteCodec"
import { getOutbox, nextLamport, setOutbox, OutboxOp } from "./syncStateRepo"
import type { Note } from "../storage/notesRepo"

const CONTENT_TYPE = "application/octet-stream"

type NotePayload = {
  v: 1
  type: "note"
  note: Note
  deviceId: string
  lamport: number
  deleted?: boolean
}

type TombstonePayload = {
  v: 1
  type: "note-delete"
  noteId: string
  deletedAt: string
  deviceId: string
  lamport: number
}

type IndexPayload = {
  v: 1
  type: "notes-index"
  ids: string[]
  updatedAt: string
  deviceId: string
  lamport: number
}

export function enqueueUpsertNoteData(
  note: Note,
  vaultId: string,
  rvk: Uint8Array,
  deviceId: string,
): void {
  const lamport = nextLamport()
  const payload: NotePayload = {
    v: 1,
    type: "note",
    note,
    deviceId,
    lamport,
  }
  const bytes = encryptJsonToBlobBytes(rvk, payload)
  const blobId = `note-v1-${note.id}`
  const op: OutboxOp = {
    id: randomId(),
    type: "upsert_note",
    noteId: note.id,
    deviceId,
    vaultId,
    blobId,
    bytesB64: bytesToBase64(bytes),
    sha256Hex: sha256Hex(bytes),
    contentType: CONTENT_TYPE,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextRetryAt: undefined,
    noteUpdatedAt: note.updatedAt,
    lamport,
  }
  setOutbox([op, ...getOutbox()])
}

export function enqueueDeleteNoteData(
  noteId: string,
  createdAt: string,
  vaultId: string,
  rvk: Uint8Array,
  deviceId: string,
): void {
  const lamport = nextLamport()
  const now = new Date().toISOString()
  const payload: TombstonePayload = {
    v: 1,
    type: "note-delete",
    noteId,
    deletedAt: now,
    deviceId,
    lamport,
  }
  const bytes = encryptJsonToBlobBytes(rvk, payload)
  const blobId = `note-delete-v1-${noteId}`
  const op: OutboxOp = {
    id: randomId(),
    type: "delete_note",
    noteId,
    deviceId,
    vaultId,
    blobId,
    bytesB64: bytesToBase64(bytes),
    sha256Hex: sha256Hex(bytes),
    contentType: CONTENT_TYPE,
    createdAt: now,
    attempts: 0,
    nextRetryAt: undefined,
    noteUpdatedAt: now,
    lamport,
  }
  setOutbox([op, ...getOutbox()])
}

export function enqueueUpdateIndexData(
  noteIds: string[],
  vaultId: string,
  rvk: Uint8Array,
  deviceId: string,
): void {
  const lamport = nextLamport()
  const payload: IndexPayload = {
    v: 1,
    type: "notes-index",
    ids: noteIds,
    updatedAt: new Date().toISOString(),
    deviceId,
    lamport,
  }
  const bytes = encryptJsonToBlobBytes(rvk, payload)
  const op: OutboxOp = {
    id: randomId(),
    type: "update_index",
    deviceId,
    vaultId,
    blobId: "notes-index-v1",
    bytesB64: bytesToBase64(bytes),
    sha256Hex: sha256Hex(bytes),
    contentType: CONTENT_TYPE,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextRetryAt: undefined,
    lamport,
  }
  setOutbox([op, ...getOutbox()])
}

function randomId(): string {
  return bytesToBase64(randomBytes(12))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}
