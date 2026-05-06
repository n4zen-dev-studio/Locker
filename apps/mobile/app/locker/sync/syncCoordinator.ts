import { getToken } from "@/locker/auth/tokenStore"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { vaultSession } from "@/locker/session"
import { syncNow } from "./syncEngine"
import { clearPendingUpdatesForVault } from "@/locker/bg/pendingUpdatesRepo"

export type SyncReason = "app_active" | "note_change" | "manual" | "vault_switch" | "push"

type SyncState = {
  syncing: boolean
  pending: boolean
  lastRunAt?: string
  lastError?: string
}

type SyncEntry = {
  state: SyncState
  timer: ReturnType<typeof setTimeout> | null
  controller: AbortController | null
  inFlight: Promise<any> | null
}

const entries = new Map<string, SyncEntry>()

const NOTE_DEBOUNCE_MS = 2000
const APP_ACTIVE_THROTTLE_MS = 30_000

function getEntry(vaultId: string): SyncEntry {
  const existing = entries.get(vaultId)
  if (existing) return existing
  const created: SyncEntry = {
    state: { syncing: false, pending: false },
    timer: null,
    controller: null,
    inFlight: null,
  }
  entries.set(vaultId, created)
  return created
}

async function hasPrereqs(vaultId: string): Promise<boolean> {
  if (!vaultSession.isUnlocked()) return false
  const token = await getToken()
  if (!token) return false
  const rvk = await getRemoteVaultKey(vaultId)
  if (!rvk || rvk.length !== 32) return false
  return true
}

function clearTimer(entry: SyncEntry) {
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
}

async function runSync(vaultId: string, reason: SyncReason): Promise<any> {
  const entry = getEntry(vaultId)
  if (entry.state.syncing) {
    entry.state.pending = true
    return entry.inFlight
  }

  entry.state.syncing = true
  entry.state.pending = false
  const controller = new AbortController()
  entry.controller = controller

  const runPromise = syncNow({ vaultId, signal: controller.signal, reason })
  entry.inFlight = runPromise

  try {
    const result = await runPromise
    entry.state.lastRunAt = new Date().toISOString()
    entry.state.lastError = undefined
    clearPendingUpdatesForVault(vaultId)
    return result
  } catch (err) {
    entry.state.lastRunAt = new Date().toISOString()
    entry.state.lastError = err instanceof Error ? err.message : "Sync failed"
    throw err
  } finally {
    entry.state.syncing = false
    entry.controller = null
    entry.inFlight = null

    if (entry.state.pending) {
      entry.state.pending = false
      void runSync(vaultId, "note_change").catch(() => undefined)
    }
  }
}

export async function requestSync(reason: SyncReason, vaultId?: string): Promise<any> {
  const id = vaultId ?? getRemoteVaultId()
  if (!id) return

  const entry = getEntry(id)
  clearTimer(entry)

  if (reason !== "manual") {
    const ok = await hasPrereqs(id)
    if (!ok) return
  }

  if (reason === "note_change") {
    entry.timer = setTimeout(() => {
      void runSync(id, reason).catch(() => undefined)
    }, NOTE_DEBOUNCE_MS)
    return
  }

  if (reason === "app_active") {
    const lastRun = entry.state.lastRunAt ? new Date(entry.state.lastRunAt).getTime() : 0
    if (Date.now() - lastRun < APP_ACTIVE_THROTTLE_MS) return
  }

  const promise = runSync(id, reason)
  if (reason === "manual") return promise
  return promise.catch(() => undefined)
}

export function cancelVault(vaultId: string): void {
  const entry = entries.get(vaultId)
  if (!entry) return
  clearTimer(entry)
  if (entry.controller) {
    entry.controller.abort()
    entry.controller = null
  }
  entry.state.syncing = false
  entry.state.pending = false
}

export function getState(vaultId: string): SyncState {
  return { ...getEntry(vaultId).state }
}
