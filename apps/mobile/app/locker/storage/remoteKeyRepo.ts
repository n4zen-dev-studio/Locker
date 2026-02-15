import * as Keychain from "react-native-keychain"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"

const SERVICE_PREFIX = "com.n4zen.calculator.locker.rvk.v1"

function serviceName(vaultId: string): string {
  return `${SERVICE_PREFIX}.${vaultId}`
}

export async function getRemoteVaultKey(vaultId: string): Promise<Uint8Array | null> {
  const creds = await Keychain.getGenericPassword({ service: serviceName(vaultId) })
  if (!creds) return null
  try {
    return base64ToBytes(creds.password)
  } catch {
    return null
  }
}

export async function setRemoteVaultKey(vaultId: string, key: Uint8Array): Promise<void> {
  const ok = await Keychain.setGenericPassword("locker", bytesToBase64(key), {
    service: serviceName(vaultId),
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  if (!ok) throw new Error("Failed to store remote vault key")
}

export async function clearRemoteVaultKey(vaultId: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: serviceName(vaultId) })
}
