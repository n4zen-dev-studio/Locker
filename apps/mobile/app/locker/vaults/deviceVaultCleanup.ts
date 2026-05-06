import { clearVaultAttachmentCache } from "@/locker/attachments/attachmentCache"
import { clearSearchIndex } from "@/locker/search/searchRepo"
import { clearRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { removeNotesForVault } from "@/locker/storage/notesRepo"
import { removeRemoteVaultRecord, setVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { cancelVault } from "@/locker/sync/syncCoordinator"
import { clearVaultSyncState } from "@/locker/sync/syncStateRepo"

export async function removeVaultFromCurrentDevice(vaultId: string, vaultName?: string | null): Promise<void> {
  cancelVault(vaultId)
  await clearRemoteVaultKey(vaultId)
  clearVaultSyncState(vaultId)
  removeNotesForVault(vaultId)
  clearSearchIndex(vaultId)
  await clearVaultAttachmentCache(vaultId)
  if (vaultName) {
    setVaultEnabledOnDevice(vaultId, false, { name: vaultName })
  } else {
    removeRemoteVaultRecord(vaultId)
  }
}

export async function forgetDeletedVaultLocally(vaultId: string): Promise<void> {
  await removeVaultFromCurrentDevice(vaultId)
  removeRemoteVaultRecord(vaultId)
}
