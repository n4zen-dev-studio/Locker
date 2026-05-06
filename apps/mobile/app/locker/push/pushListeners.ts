import * as Notifications from "expo-notifications"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { vaultSession } from "@/locker/session"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { flagPendingUpdatesForVault } from "@/locker/bg/pendingUpdatesRepo"
import { scheduleVaultChangedNotification } from "@/locker/bg/updateCheck"
import { ensureAndroidChannel } from "./expoPushManager"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

async function handleVaultChanged(vaultId?: string): Promise<void> {
  try {
    const effectiveVaultId = vaultId ?? getRemoteVaultId() ?? undefined
    if (effectiveVaultId) flagPendingUpdatesForVault(effectiveVaultId)

    const rvk = effectiveVaultId ? await getRemoteVaultKey(effectiveVaultId) : null
    if (effectiveVaultId && vaultSession.isUnlocked() && rvk) {
      void requestSync("push", effectiveVaultId)
      return
    }

    await ensureAndroidChannel()
    await scheduleVaultChangedNotification(effectiveVaultId)
  } catch (err) {
    if (__DEV__) console.log("[push] handler failed", err)
  }
}

export function setupPushListeners(): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as { type?: string; vaultId?: string } | undefined
    if (data?.type === "vault_changed") {
      void handleVaultChanged(data.vaultId)
    }
  })

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string; vaultId?: string } | undefined
    if (data?.type === "vault_changed") {
      void handleVaultChanged(data.vaultId)
    }
  })

  return () => {
    receivedSub.remove()
    responseSub.remove()
  }
}
