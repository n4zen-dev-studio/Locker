import { load, save } from "@/utils/storage"

const STATE_KEY = "locker:sync:v2:state"

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

type SyncStateRoot = {
  vaults: Record<string, SyncState>
}

const DEFAULT_STATE: SyncState = {
  lastCursor: 0,
  lamportClock: 0,
  noteRemoteMeta: {},
  tombstones: {},
  outbox: [],
}

function readRoot(): SyncStateRoot {
  const raw = load<Partial<SyncStateRoot>>(STATE_KEY)
  if (!raw?.vaults || typeof raw.vaults !== "object") return { vaults: {} }
  return { vaults: raw.vaults as Record<string, SyncState> }
}

function writeRoot(root: SyncStateRoot): void {
  save(STATE_KEY, root)
}

function ensureState(vaultId: string, root = readRoot()): SyncState {
  const raw = root.vaults[vaultId]
  if (!raw) return { ...DEFAULT_STATE }
  return {
    lastCursor: typeof raw.lastCursor === "number" ? raw.lastCursor : 0,
    lamportClock: typeof raw.lamportClock === "number" ? raw.lamportClock : 0,
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

function writeVaultState(vaultId: string, state: SyncState): void {
  const root = readRoot()
  root.vaults[vaultId] = state
  writeRoot(root)
}

export function listVaultSyncStates(): Record<string, SyncState> {
  const root = readRoot()
  const next: Record<string, SyncState> = {}
  for (const vaultId of Object.keys(root.vaults)) {
    next[vaultId] = ensureState(vaultId, root)
  }
  return next
}

export function getState(vaultId: string): SyncState {
  return ensureState(vaultId)
}

export function updateState(vaultId: string, updater: (state: SyncState) => SyncState): SyncState {
  const next = updater(getState(vaultId))
  writeVaultState(vaultId, next)
  return next
}

export function clearVaultSyncState(vaultId: string): void {
  const root = readRoot()
  delete root.vaults[vaultId]
  writeRoot(root)
}

export function getOutbox(vaultId: string): OutboxOp[] {
  return getState(vaultId).outbox ?? []
}

export function setOutbox(vaultId: string, outbox: OutboxOp[]): void {
  updateState(vaultId, (state) => ({ ...state, outbox }))
}

export function setLastCursor(vaultId: string, cursor: number): void {
  updateState(vaultId, (state) => ({ ...state, lastCursor: cursor }))
}

export function setLastSyncAt(vaultId: string, iso: string): void {
  updateState(vaultId, (state) => ({ ...state, lastSyncAt: iso }))
}

export function setSyncDiagnostics(
  vaultId: string,
  input: {
    lastSyncDurationMs?: number
    lastChangesProcessed?: number
    lastIndexSize?: number
    lastTombstonesCount?: number
  },
): void {
  updateState(vaultId, (state) => ({ ...state, ...input }))
}

export function nextLamport(vaultId: string): number {
  let value = 0
  updateState(vaultId, (state) => {
    value = state.lamportClock + 1
    return { ...state, lamportClock: value }
  })
  return value
}

export function getNoteRemoteMeta(vaultId: string, noteId: string): NoteRemoteMeta | undefined {
  return getState(vaultId).noteRemoteMeta[noteId]
}

export function setNoteRemoteMeta(vaultId: string, noteId: string, meta: NoteRemoteMeta): void {
  updateState(vaultId, (state) => ({
    ...state,
    noteRemoteMeta: {
      ...state.noteRemoteMeta,
      [noteId]: meta,
    },
  }))
}

export function clearNoteRemoteMeta(vaultId: string, noteId: string): void {
  updateState(vaultId, (state) => {
    const next = { ...state.noteRemoteMeta }
    delete next[noteId]
    return { ...state, noteRemoteMeta: next }
  })
}

export function getTombstone(vaultId: string, noteId: string): Tombstone | undefined {
  const tombstone = getState(vaultId).tombstones[noteId]
  if (!tombstone || tombstone.vaultId !== vaultId) return undefined
  return tombstone
}

export function setTombstone(vaultId: string, noteId: string, tombstone: Tombstone): void {
  updateState(vaultId, (state) => ({
    ...state,
    tombstones: {
      ...state.tombstones,
      [noteId]: tombstone,
    },
  }))
}

export function clearTombstone(vaultId: string, noteId: string): void {
  updateState(vaultId, (state) => {
    const next = { ...state.tombstones }
    delete next[noteId]
    return { ...state, tombstones: next }
  })
}

export function clearTombstonesForVault(vaultId: string): void {
  updateState(vaultId, (state) => ({ ...state, tombstones: {} }))
}
