import * as Keychain from "react-native-keychain"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"

const SERVICE_PREFIX = "com.n4zen.calculator.locker.rvk.v1"

function serviceName(vaultId: string): string {
  return `${SERVICE_PREFIX}.${vaultId}`
}

function isValidRvk(bytes: Uint8Array | null | undefined): bytes is Uint8Array {
  return !!bytes && bytes.length === 32
}

export async function getRemoteVaultKey(vaultId: string): Promise<Uint8Array | null> {
  if (!vaultId) return null
  const creds = await Keychain.getGenericPassword({ service: serviceName(vaultId) })
  if (!creds?.password) return null

  try {
    const bytes = base64ToBytes(creds.password)
    return isValidRvk(bytes) ? bytes : null
  } catch {
    return null
  }
}

export async function setRemoteVaultKey(vaultId: string, key: Uint8Array): Promise<void> {
  if (!vaultId) throw new Error("vaultId required")
  if (!isValidRvk(key)) throw new Error("RVK must be exactly 32 bytes")

  const ok = await Keychain.setGenericPassword("locker", bytesToBase64(key), {
    service: serviceName(vaultId),
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  if (!ok) throw new Error("Failed to store remote vault key")
}

export async function clearRemoteVaultKey(vaultId: string): Promise<void> {
  if (!vaultId) return
  await Keychain.resetGenericPassword({ service: serviceName(vaultId) })
}
