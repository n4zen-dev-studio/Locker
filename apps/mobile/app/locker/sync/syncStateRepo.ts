import { load, save } from "@/utils/storage"

const STATE_KEY = "locker:sync:v1:state"

export type NoteRemoteMeta = {
  lastLamport: number
  lastUpdatedAt: string
  lastSeenChangeId: number
}

export type OutboxOp = {
  id: string
  type: "upsert_note" | "delete_note" | "update_index"
  noteId?: string
  vaultId: string
  blobId: string
  bytesB64: string
  sha256Hex: string
  contentType: string
  createdAt: string
  attempts: number
  lastError?: string
  lastAttemptAt?: string
  noteUpdatedAt?: string
  lamport?: number
}

export type SyncState = {
  lastCursor: number
  lamportClock: number
  noteRemoteMeta: Record<string, NoteRemoteMeta>
  outbox: OutboxOp[]
  lastSyncAt?: string
}

const DEFAULT_STATE: SyncState = {
  lastCursor: 0,
  lamportClock: 0,
  noteRemoteMeta: {},
  outbox: [],
}

export function getState(): SyncState {
  return load<SyncState>(STATE_KEY) ?? { ...DEFAULT_STATE }
}

export function setState(state: SyncState): void {
  save(STATE_KEY, state)
}

export function updateState(updater: (state: SyncState) => SyncState): SyncState {
  const next = updater(getState())
  setState(next)
  return next
}

export function getOutbox(): OutboxOp[] {
  return getState().outbox
}

export function setOutbox(outbox: OutboxOp[]): void {
  updateState((state) => ({ ...state, outbox }))
}

export function setLastCursor(cursor: number): void {
  updateState((state) => ({ ...state, lastCursor: cursor }))
}

export function setLastSyncAt(iso: string): void {
  updateState((state) => ({ ...state, lastSyncAt: iso }))
}

export function nextLamport(): number {
  let value = 0
  updateState((state) => {
    value = state.lamportClock + 1
    return { ...state, lamportClock: value }
  })
  return value
}

export function getNoteRemoteMeta(noteId: string): NoteRemoteMeta | undefined {
  return getState().noteRemoteMeta[noteId]
}

export function setNoteRemoteMeta(noteId: string, meta: NoteRemoteMeta): void {
  updateState((state) => ({
    ...state,
    noteRemoteMeta: {
      ...state.noteRemoteMeta,
      [noteId]: meta,
    },
  }))
}

export function clearNoteRemoteMeta(noteId: string): void {
  updateState((state) => {
    const next = { ...state.noteRemoteMeta }
    delete next[noteId]
    return { ...state, noteRemoteMeta: next }
  })
}
