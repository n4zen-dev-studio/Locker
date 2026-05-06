import { load, save } from "@/utils/storage"

const STATE_KEY = "locker:sync:v1:state"

export type NoteRemoteMeta = {
  lastLamport: number
  lastUpdatedAt: string
  lastSeenChangeId: number
  lastConflictResolvedLamport?: number
  lastDeviceId?: string
}

export type OutboxOp = {
  id: string
  type: "upsert_note" | "delete_note" | "update_index" | "upsert_attachment_blob"
  noteId?: string
  deviceId?: string
  vaultId: string
  blobId: string
  bytesB64: string
  sha256Hex: string
  contentType: string
  createdAt: string
  attempts: number
  nextRetryAt?: string
  lastError?: string
  lastAttemptAt?: string
  noteUpdatedAt?: string
  lamport?: number
}

export type Tombstone = {
  noteId: string
  vaultId: string
  deletedAt: string
  deviceId: string
  lamport: number
}

export type SyncState = {
  lastCursor: number
  lamportClock: number
  noteRemoteMeta: Record<string, NoteRemoteMeta>
  tombstones: Record<string, Tombstone>
  outbox: OutboxOp[]
  lastSyncAt?: string
  lastSyncDurationMs?: number
  lastChangesProcessed?: number
  lastIndexSize?: number
  lastTombstonesCount?: number
}

const DEFAULT_STATE: SyncState = {
  lastCursor: 0,
  lamportClock: 0,
  noteRemoteMeta: {},
  tombstones: {},
  outbox: [],
}

export function getState(): SyncState {
  const raw = load<Partial<SyncState>>(STATE_KEY) ?? {}

  return {
    lastCursor: typeof raw.lastCursor === "number" ? raw.lastCursor : DEFAULT_STATE.lastCursor,
    lamportClock: typeof raw.lamportClock === "number" ? raw.lamportClock : DEFAULT_STATE.lamportClock,

    noteRemoteMeta: raw.noteRemoteMeta && typeof raw.noteRemoteMeta === "object" ? raw.noteRemoteMeta : {},
    tombstones: raw.tombstones && typeof raw.tombstones === "object" ? raw.tombstones : {},
    outbox: Array.isArray(raw.outbox) ? raw.outbox : [],

    lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : undefined,
    lastSyncDurationMs: typeof raw.lastSyncDurationMs === "number" ? raw.lastSyncDurationMs : undefined,
    lastChangesProcessed: typeof raw.lastChangesProcessed === "number" ? raw.lastChangesProcessed : undefined,
    lastIndexSize: typeof raw.lastIndexSize === "number" ? raw.lastIndexSize : undefined,
    lastTombstonesCount: typeof raw.lastTombstonesCount === "number" ? raw.lastTombstonesCount : undefined,
  }
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
  return getState().outbox ?? []
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

export function setSyncDiagnostics(input: {
  lastSyncDurationMs?: number
  lastChangesProcessed?: number
  lastIndexSize?: number
  lastTombstonesCount?: number
}): void {
  updateState((state) => ({ ...state, ...input }))
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

export function getTombstone(noteId: string, vaultId: string): Tombstone | undefined {
  const tombstone = getState().tombstones[noteId]
  if (!tombstone) return undefined
  if (tombstone.vaultId !== vaultId) return undefined
  return tombstone
}

export function setTombstone(noteId: string, tombstone: Tombstone): void {
  updateState((state) => ({
    ...state,
    tombstones: {
      ...state.tombstones,
      [noteId]: tombstone,
    },
  }))
}

export function clearTombstone(noteId: string): void {
  updateState((state) => {
    const next = { ...state.tombstones }
    delete next[noteId]
    return { ...state, tombstones: next }
  })
}

export function clearTombstonesForVault(vaultId: string): void {
  updateState((state) => {
    const next: Record<string, Tombstone> = {}
    for (const [key, value] of Object.entries(state.tombstones ?? {})) {
      if (value.vaultId !== vaultId) next[key] = value
    }
    return { ...state, tombstones: next }
  })
}
