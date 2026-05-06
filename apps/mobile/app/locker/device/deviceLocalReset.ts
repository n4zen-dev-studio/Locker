import { clearVaultAttachmentCache } from "@/locker/attachments/attachmentCache"
import { clearPasskey } from "@/locker/auth/passkey"
import { clearToken } from "@/locker/auth/tokenStore"
import { clearBootstrapState } from "@/locker/bootstrap/bootstrapRepo"
import { clearSearchIndex } from "@/locker/search/searchRepo"
import { vaultSession } from "@/locker/session"
import { clearAccount } from "@/locker/storage/accountRepo"
import { resetNotes } from "@/locker/storage/notesRepo"
import { resetSetupOnboardingState } from "@/locker/storage/onboardingRepo"
import { clearRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { clearRemoteVaultId, listRemoteVaults } from "@/locker/storage/remoteVaultRepo"
import { clearServerUrl } from "@/locker/storage/serverConfigRepo"
import { cancelVault } from "@/locker/sync/syncCoordinator"
import { clearVaultSyncState } from "@/locker/sync/syncStateRepo"
import { clear, remove } from "@/utils/storage"

const NAVIGATION_PERSISTENCE_KEY = "NAVIGATION_STATE"

export async function resetDeviceLocally(): Promise<void> {
  const knownVaults = listRemoteVaults()

  for (const vault of knownVaults) {
    cancelVault(vault.id)
    clearVaultSyncState(vault.id)
    clearSearchIndex(vault.id)
    await clearVaultAttachmentCache(vault.id)
    await clearRemoteVaultKey(vault.id)
  }

  resetNotes()
  clearRemoteVaultId()
  clearAccount()
  clearServerUrl()
  clearBootstrapState()
  resetSetupOnboardingState()
  await clearToken()
  await clearPasskey()
  vaultSession.clear()
  remove(NAVIGATION_PERSISTENCE_KEY)
  clear()
}
