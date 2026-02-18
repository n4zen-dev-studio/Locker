import { load, remove, save } from "@/utils/storage"

const KEY_PREFIX = "locker:pending-updates:v1:"

function keyFor(vaultId: string): string {
  return `${KEY_PREFIX}${vaultId}`
}

export function hasPendingUpdates(vaultId: string): boolean {
  return load<boolean>(keyFor(vaultId)) === true
}

export function flagPendingUpdatesForVault(vaultId: string): void {
  if (!vaultId) return
  save(keyFor(vaultId), true)
}

export function clearPendingUpdatesForVault(vaultId: string): void {
  if (!vaultId) return
  remove(keyFor(vaultId))
}
