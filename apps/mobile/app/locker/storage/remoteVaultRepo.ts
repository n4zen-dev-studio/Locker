import { load, remove, save } from "@/utils/storage"

const REMOTE_VAULT_KEY = "locker:remote:vault-id:v1"

export function getRemoteVaultId(): string | null {
  return load<string>(REMOTE_VAULT_KEY)
}

export function setRemoteVaultId(vaultId: string): void {
  save(REMOTE_VAULT_KEY, vaultId)
}

export function clearRemoteVaultId(): void {
  remove(REMOTE_VAULT_KEY)
}
