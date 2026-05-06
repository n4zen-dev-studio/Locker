import * as Notifications from "expo-notifications"
import { fetchJson } from "@/locker/net/apiClient"
import { getState as getSyncState } from "@/locker/sync/syncStateRepo"
import { vaultSession } from "@/locker/session"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { getToken } from "@/locker/auth/tokenStore"
import { flagPendingUpdatesForVault } from "./pendingUpdatesRepo"
import { ensureAndroidChannel } from "@/locker/push/expoPushManager"

const DEFAULT_NOTIFICATION = {
  title: "Locker has updates",
  body: "Unlock to sync your vault.",
}
export type UpdateCheckMode = "foreground" | "background"
export type UpdateCheckSource = "app_active" | "background_fetch" | "push"

export async function scheduleVaultChangedNotification(vaultId?: string): Promise<void> {
  await ensureAndroidChannel()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: DEFAULT_NOTIFICATION.title,
      body: DEFAULT_NOTIFICATION.body,
      data: { type: "vault_changed", vaultId },
      android: { channelId: "locker-updates" },
    },
    trigger: null,
  })
}

export async function checkForRemoteUpdates(
  vaultId: string,
  options: { mode: UpdateCheckMode; source: UpdateCheckSource },
): Promise<boolean> {
  if (!vaultId) return false

  const token = await getToken()
  if (!token) return false

  const cursor = getSyncState().lastCursor ?? 0
  const res = await fetchJson<{ changes?: Array<{ id: number }>; nextCursor?: number }>(
    `/v1/vaults/${vaultId}/changes?cursor=${cursor}&limit=1`,
    {},
    { token },
  )

  const hasUpdates = (res.changes?.length ?? 0) > 0
  if (!hasUpdates) return false

  flagPendingUpdatesForVault(vaultId)

  if (options.mode === "background") {
    await scheduleVaultChangedNotification(vaultId)
    return true
  }

  const rvk = await getRemoteVaultKey(vaultId)
  if (vaultSession.isUnlocked() && rvk) {
    void requestSync("push", vaultId)
  } else {
    await scheduleVaultChangedNotification(vaultId)
  }

  return true
}
