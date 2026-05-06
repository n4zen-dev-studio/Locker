import { recordSecurityEvent } from "@/locker/security/auditLogRepo"
import { load, remove, save } from "@/utils/storage"

const REMOTE_VAULT_STATE_KEY = "locker:remote:vault-state:v2"

export type RemoteVaultRecord = {
  id: string
  name?: string | null
  enabledOnDevice: boolean
  enabledAt?: string | null
  lastSyncAt?: string | null
  lastAccessedAt?: string | null
}

type RemoteVaultState = {
  currentVaultId: string | null
  vaults: Record<string, RemoteVaultRecord>
}

type VaultListener = (nextVaultId: string | null, prevVaultId: string | null) => void

const listeners = new Set<VaultListener>()

function getDefaultState(): RemoteVaultState {
  return { currentVaultId: null, vaults: {} }
}

function readState(): RemoteVaultState {
  const raw = load<Partial<RemoteVaultState>>(REMOTE_VAULT_STATE_KEY)
  if (!raw || typeof raw !== "object") return getDefaultState()
  const vaults =
    raw.vaults && typeof raw.vaults === "object"
      ? Object.fromEntries(
          Object.entries(raw.vaults).map(([id, value]) => [
            id,
            {
              id,
              name: typeof value?.name === "string" ? value.name : null,
              enabledOnDevice: value?.enabledOnDevice === true,
              enabledAt: typeof value?.enabledAt === "string" ? value.enabledAt : null,
              lastSyncAt: typeof value?.lastSyncAt === "string" ? value.lastSyncAt : null,
              lastAccessedAt: typeof value?.lastAccessedAt === "string" ? value.lastAccessedAt : null,
            } satisfies RemoteVaultRecord,
          ]),
        )
      : {}
  const currentVaultId =
    typeof raw.currentVaultId === "string" && raw.currentVaultId.trim() ? raw.currentVaultId : null
  return { currentVaultId, vaults }
}

function writeState(state: RemoteVaultState): void {
  save(REMOTE_VAULT_STATE_KEY, state)
}

function chooseFallbackCurrentVault(state: RemoteVaultState): string | null {
  const enabled = Object.values(state.vaults).filter((vault) => vault.enabledOnDevice)
  if (!enabled.length) return null
  enabled.sort((a, b) => {
    const accessA = a.lastAccessedAt ?? a.enabledAt ?? ""
    const accessB = b.lastAccessedAt ?? b.enabledAt ?? ""
    return accessA < accessB ? 1 : -1
  })
  return enabled[0]?.id ?? null
}

export function getRemoteVaultId(): string | null {
  const state = readState()
  if (state.currentVaultId && state.vaults[state.currentVaultId]?.enabledOnDevice) return state.currentVaultId
  return chooseFallbackCurrentVault(state)
}

export function getRemoteVaultName(): string | null {
  const current = getRemoteVaultId()
  if (!current) return null
  return readState().vaults[current]?.name ?? null
}

export function listRemoteVaults(): RemoteVaultRecord[] {
  return Object.values(readState().vaults).sort((a, b) => a.name?.localeCompare(b.name ?? "") ?? 0)
}

export function getEnabledRemoteVaultIds(): string[] {
  return listRemoteVaults()
    .filter((vault) => vault.enabledOnDevice)
    .map((vault) => vault.id)
}

export function isVaultEnabledOnDevice(vaultId: string): boolean {
  return readState().vaults[vaultId]?.enabledOnDevice === true
}

export function setRemoteVaultCatalog(
  vaults: Array<{
    id: string
    name?: string | null
    enabledOnDevice?: boolean
    enabledAt?: string | null
    lastSyncAt?: string | null
    lastAccessedAt?: string | null
  }>,
): void {
  const prev = getRemoteVaultId()
  const state = readState()
  const nextVaults: Record<string, RemoteVaultRecord> = {}
  for (const vault of vaults) {
    const existing = state.vaults[vault.id]
    nextVaults[vault.id] = {
      id: vault.id,
      name: vault.name ?? existing?.name ?? null,
      enabledOnDevice: vault.enabledOnDevice ?? existing?.enabledOnDevice ?? false,
      enabledAt: vault.enabledAt ?? existing?.enabledAt ?? null,
      lastSyncAt: vault.lastSyncAt ?? existing?.lastSyncAt ?? null,
      lastAccessedAt: vault.lastAccessedAt ?? existing?.lastAccessedAt ?? null,
    }
  }
  const nextState: RemoteVaultState = {
    currentVaultId: state.currentVaultId,
    vaults: nextVaults,
  }
  if (!nextState.currentVaultId || !nextState.vaults[nextState.currentVaultId]?.enabledOnDevice) {
    nextState.currentVaultId = chooseFallbackCurrentVault(nextState)
  }
  writeState(nextState)
  const next = getRemoteVaultId()
  if (prev !== next) listeners.forEach((listener) => listener(next, prev))
}

export function setRemoteVaultId(vaultId: string, name?: string | null): void {
  const prev = getRemoteVaultId()
  const state = readState()
  const existing = state.vaults[vaultId]
  state.vaults[vaultId] = {
    id: vaultId,
    name: name ?? existing?.name ?? null,
    enabledOnDevice: existing?.enabledOnDevice ?? true,
    enabledAt: existing?.enabledAt ?? new Date().toISOString(),
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastAccessedAt: new Date().toISOString(),
  }
  state.currentVaultId = vaultId
  writeState(state)
  if (prev !== vaultId) {
    recordSecurityEvent({
      type: "sync_target_changed",
      message: "Current device vault changed.",
      severity: prev ? "warning" : "info",
      meta: { previousVaultId: prev, nextVaultId: vaultId, name: name ?? null },
    })
    listeners.forEach((listener) => listener(vaultId, prev))
  }
}

export function setVaultEnabledOnDevice(
  vaultId: string,
  enabled: boolean,
  input?: {
    name?: string | null
    enabledAt?: string | null
  },
): void {
  const prev = getRemoteVaultId()
  const state = readState()
  const existing = state.vaults[vaultId]
  state.vaults[vaultId] = {
    id: vaultId,
    name: input?.name ?? existing?.name ?? null,
    enabledOnDevice: enabled,
    enabledAt: enabled ? input?.enabledAt ?? existing?.enabledAt ?? new Date().toISOString() : null,
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastAccessedAt: existing?.lastAccessedAt ?? null,
  }
  if (enabled) {
    state.currentVaultId = state.currentVaultId ?? vaultId
  } else if (state.currentVaultId === vaultId) {
    state.currentVaultId = chooseFallbackCurrentVault(state)
  }
  writeState(state)
  const next = getRemoteVaultId()
  if (prev !== next) listeners.forEach((listener) => listener(next, prev))
}

export function renameRemoteVault(vaultId: string, name: string): void {
  const state = readState()
  const existing = state.vaults[vaultId]
  if (!existing) return
  state.vaults[vaultId] = { ...existing, name }
  writeState(state)
}

export function removeRemoteVaultRecord(vaultId: string): void {
  const prev = getRemoteVaultId()
  const state = readState()
  if (!state.vaults[vaultId]) return
  delete state.vaults[vaultId]
  if (state.currentVaultId === vaultId) {
    state.currentVaultId = chooseFallbackCurrentVault(state)
  }
  writeState(state)
  const next = getRemoteVaultId()
  if (prev !== next) listeners.forEach((listener) => listener(next, prev))
}

export function markVaultSynced(vaultId: string, syncedAt: string): void {
  const state = readState()
  const existing = state.vaults[vaultId]
  if (!existing) return
  state.vaults[vaultId] = { ...existing, lastSyncAt: syncedAt }
  writeState(state)
}

export function markVaultAccessed(vaultId: string, accessedAt = new Date().toISOString()): void {
  const state = readState()
  const existing = state.vaults[vaultId]
  if (!existing) return
  state.vaults[vaultId] = { ...existing, lastAccessedAt: accessedAt }
  writeState(state)
}

export function clearRemoteVaultId(): void {
  const prev = getRemoteVaultId()
  remove(REMOTE_VAULT_STATE_KEY)
  if (prev) {
    recordSecurityEvent({
      type: "sync_target_changed",
      message: "Device vault access cleared.",
      severity: "warning",
      meta: { previousVaultId: prev, nextVaultId: null },
    })
  }
  listeners.forEach((listener) => listener(null, prev))
}

export function subscribeRemoteVaultChanges(listener: VaultListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
