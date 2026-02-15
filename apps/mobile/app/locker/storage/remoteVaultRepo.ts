import { load, remove, save } from "@/utils/storage"

const REMOTE_VAULT_KEY = "locker:remote:vault-id:v1"
const REMOTE_VAULT_NAME_KEY = "locker:remote:vault-name:v1"

export function getRemoteVaultId(): string | null {
  return load<string>(REMOTE_VAULT_KEY)
}

export function setRemoteVaultId(vaultId: string, name?: string | null): void {
  save(REMOTE_VAULT_KEY, vaultId)
  if (name) save(REMOTE_VAULT_NAME_KEY, name)
}

export function clearRemoteVaultId(): void {
  remove(REMOTE_VAULT_KEY)
  remove(REMOTE_VAULT_NAME_KEY)
}

export function getRemoteVaultName(): string | null {
  return load<string>(REMOTE_VAULT_NAME_KEY)
}
