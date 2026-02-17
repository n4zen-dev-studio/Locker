import { load, remove, save } from "@/utils/storage"

const REMOTE_VAULT_KEY = "locker:remote:vault-id:v1"
const REMOTE_VAULT_NAME_KEY = "locker:remote:vault-name:v1"

type VaultListener = (nextVaultId: string | null, prevVaultId: string | null) => void
const listeners = new Set<VaultListener>()

export function getRemoteVaultId(): string | null {
  return load<string>(REMOTE_VAULT_KEY)
}

export function setRemoteVaultId(vaultId: string, name?: string | null): void {
  const prev = getRemoteVaultId()
  save(REMOTE_VAULT_KEY, vaultId)
  if (name) save(REMOTE_VAULT_NAME_KEY, name)
  listeners.forEach((listener) => listener(vaultId, prev))
}

export function clearRemoteVaultId(): void {
  const prev = getRemoteVaultId()
  remove(REMOTE_VAULT_KEY)
  remove(REMOTE_VAULT_NAME_KEY)
  listeners.forEach((listener) => listener(null, prev))
}

export function subscribeRemoteVaultChanges(listener: VaultListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRemoteVaultName(): string | null {
  return load<string>(REMOTE_VAULT_NAME_KEY)
}
