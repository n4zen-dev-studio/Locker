import * as Device from "expo-device"
import { Platform } from "react-native"
import DeviceInfo from "react-native-device-info"

export async function getSuggestedDeviceName() {
  try {
    // Best option (gives "Andy’s iPhone" on iOS)
    const name = await DeviceInfo.getDeviceName()
    if (name) return name
  } catch {}

  // Fallback (Expo)
  if (Device.modelName) {
    return Device.modelName
  }

  return Platform.OS === "ios" ? "iPhone" : "Android Device"
}