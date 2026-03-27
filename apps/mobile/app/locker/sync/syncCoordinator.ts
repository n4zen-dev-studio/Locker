import { getToken } from "@/locker/auth/tokenStore"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { getEnabledRemoteVaultIds, getRemoteVaultId, isVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { vaultSession } from "@/locker/session"
import { clearPendingUpdatesForVault } from "@/locker/bg/pendingUpdatesRepo"
import { getOutbox } from "./syncStateRepo"
import { syncNow } from "./syncEngine"

export type SyncReason =
  | "app_active"
  | "note_change"
  | "manual"
  | "vault_switch"
  | "push"
  | "vault_enabled"
  | "device_linked"

type SyncState = {
  syncing: boolean
  pending: boolean
  lastRunAt?: string
  lastError?: string
}

type SyncEntry = {
  state: SyncState
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<any> | null
}

const NOTE_DEBOUNCE_MS = 2000
const APP_ACTIVE_THROTTLE_MS = 30_000

const entries = new Map<string, SyncEntry>()
const queue = new Set<string>()
let runningVaultId: string | null = null

function getEntry(vaultId: string): SyncEntry {
  const existing = entries.get(vaultId)
  if (existing) return existing
  const created: SyncEntry = { state: { syncing: false, pending: false }, timer: null, inFlight: null }
  entries.set(vaultId, created)
  return created
}

function clearTimer(entry: SyncEntry) {
  if (!entry.timer) return
  clearTimeout(entry.timer)
  entry.timer = null
}

async function hasPrereqs(vaultId: string): Promise<boolean> {
  if (!vaultSession.isUnlocked()) return false
  if (!isVaultEnabledOnDevice(vaultId)) return false
  const token = await getToken()
  if (!token) return false
  const rvk = await getRemoteVaultKey(vaultId)
  if (!rvk || rvk.length !== 32) return false
  return true
}

function getPriority(vaultId: string): number {
  const currentVaultId = getRemoteVaultId()
  if (vaultId === currentVaultId) return 0
  if (getOutbox(vaultId).length > 0) return 1
  return 2
}

async function processQueue(reason: SyncReason): Promise<any> {
  if (runningVaultId) return
  const pendingVaults = [...queue]
  if (!pendingVaults.length) return

  pendingVaults.sort((a, b) => getPriority(a) - getPriority(b))
  const vaultId = pendingVaults[0]
  queue.delete(vaultId)
  runningVaultId = vaultId

  const entry = getEntry(vaultId)
  entry.state.syncing = true
  entry.state.pending = false

  const run = (async () => {
    try {
      const ok = reason === "manual" ? true : await hasPrereqs(vaultId)
      if (ok) {
        const result = await syncNow({ vaultId, reason })
        entry.state.lastError = undefined
        clearPendingUpdatesForVault(vaultId)
        return result
      }
    } catch (err) {
      entry.state.lastError = err instanceof Error ? err.message : "Sync failed"
      if (reason === "manual") throw err
    } finally {
      entry.state.lastRunAt = new Date().toISOString()
      entry.state.syncing = false
      entry.inFlight = null
      runningVaultId = null
      if (queue.size > 0) {
        void processQueue("note_change").catch(() => undefined)
      }
    }
  })()

  entry.inFlight = run
  return run
}

async function enqueueVault(vaultId: string, reason: SyncReason): Promise<void> {
  const entry = getEntry(vaultId)
  if (reason !== "note_change") {
    clearTimer(entry)
  }

  if (reason === "app_active") {
    const lastRun = entry.state.lastRunAt ? new Date(entry.state.lastRunAt).getTime() : 0
    if (Date.now() - lastRun < APP_ACTIVE_THROTTLE_MS) return
  }

  if (reason === "note_change") {
    if (entry.state.syncing) {
      entry.state.pending = true
      queue.add(vaultId)
      return entry.inFlight ?? undefined
    }
    entry.timer = setTimeout(() => {
      entry.timer = null
      queue.add(vaultId)
      void processQueue(reason).catch(() => undefined)
    }, NOTE_DEBOUNCE_MS)
    return
  }

  if (entry.state.syncing) {
    entry.state.pending = true
    if (reason !== "manual") {
      queue.add(vaultId)
      return entry.inFlight ?? undefined
    }
    return entry.inFlight ?? undefined
  }

  if (queue.has(vaultId) && reason !== "manual") {
    entry.state.pending = true
    return entry.inFlight ?? undefined
  }

  queue.add(vaultId)
  await processQueue(reason)
}

export async function requestSync(reason: SyncReason, vaultId?: string): Promise<any> {
  const targets = vaultId ? [vaultId] : getEnabledRemoteVaultIds()
  if (!targets.length) return

  let result: any
  for (const id of targets) {
    const next = enqueueVault(id, reason)
    if (reason === "manual") {
      result = await next
    } else {
      void next.catch(() => undefined)
    }
  }
  return result
}

export function cancelVault(vaultId: string): void {
  const entry = entries.get(vaultId)
  if (!entry) return
  clearTimer(entry)
  queue.delete(vaultId)
  entry.state.syncing = false
  entry.state.pending = false
}

export function getState(vaultId: string): SyncState {
  return { ...getEntry(vaultId).state }
}
