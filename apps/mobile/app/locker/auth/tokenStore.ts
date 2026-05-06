import * as Keychain from "react-native-keychain"

const SERVICE = "com.n4zen.calculator.locker.token.v1"

export async function getToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: SERVICE })
  if (!creds) return null
  return creds.password
}

export async function setToken(token: string): Promise<void> {
  const ok = await Keychain.setGenericPassword("locker", token, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  if (!ok) throw new Error("Failed to store token")
}

export async function clearToken(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE })
}
