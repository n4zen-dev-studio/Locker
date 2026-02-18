import { Platform } from "react-native"
import * as Notifications from "expo-notifications"
import * as Device from "expo-device"
import { fetchJson } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"

const ANDROID_CHANNEL_ID = "locker-updates"

export async function requestPermissionsAsync(): Promise<boolean> {
  // Expo push tokens require a physical device in most cases
  if (!Device.isDevice) return false

  // Check existing permissions
  const existing = await Notifications.getPermissionsAsync()
  if (existing.granted || existing.status === "granted") return true

  const requested = await Notifications.requestPermissionsAsync(
    Platform.OS === "ios"
      ? {
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        }
      : undefined,
  )

  return requested.granted || requested.status === "granted"
}

export async function getExpoPushTokenAsync(): Promise<string | null> {
  if (!Device.isDevice) return null
  const token = await Notifications.getExpoPushTokenAsync()
  return token.data ?? null
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Locker updates",
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

export async function registerPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null

    const account = getAccount()
    if (!account?.device?.id) return null

    const ok = await requestPermissionsAsync()
    if (!ok) return null

    await ensureAndroidChannel()

    const token = await getExpoPushTokenAsync()
    if (!token) return null

    await fetchJson(
      "/v1/me/push-tokens",
      {
        method: "POST",
        body: JSON.stringify({
          platform: Platform.OS === "ios" ? "ios" : "android",
          token,
          deviceId: account.device.id,
        }),
      },
      { auth: "required" },
    )

    return token
  } catch (err) {
    if (__DEV__) console.log("[push] register failed", err)
    return null
  }
}

export async function unregisterPushToken(token?: string): Promise<void> {
  try {
    if (!Device.isDevice) return

    const account = getAccount()
    if (!account?.device?.id) return

    await fetchJson(
      "/v1/me/push-tokens",
      {
        method: "DELETE",
        body: JSON.stringify({
          platform: Platform.OS === "ios" ? "ios" : "android",
          token,
          deviceId: account.device.id,
        }),
      },
      { auth: "required" },
    )
  } catch (err) {
    if (__DEV__) console.log("[push] unregister failed", err)
  }
}
