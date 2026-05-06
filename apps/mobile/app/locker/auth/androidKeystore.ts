import { requireNativeModule } from "expo-modules-core"
import { Platform } from "react-native"

import { base64ToBytes, bytesToBase64 } from "../crypto/encoding"

const MODULE_NAME = "LockerKeystore"
const KEY_ALIAS = "locker_vmk_wrap_v1"

type KeystoreModule = {
  isSupported(): Promise<boolean>
  ensureKey(alias: string): Promise<void>
  wrapVmk(
    alias: string,
    vmkB64: string,
    promptTitle: string,
    promptSubtitle: string,
  ): Promise<{ nonceB64: string; ctB64: string }>
  unwrapVmk(
    alias: string,
    nonceB64: string,
    ctB64: string,
    promptTitle: string,
    promptSubtitle: string,
  ): Promise<string>
  deleteKey(alias: string): Promise<void>
}

let nativeModule: KeystoreModule | undefined

if (Platform.OS === "android") {
  try {
    nativeModule = requireNativeModule<KeystoreModule>(MODULE_NAME)
  } catch {
    nativeModule = undefined
  }
}

export async function isSupported(): Promise<boolean> {
  if (Platform.OS !== "android" || !nativeModule) return false
  return nativeModule.isSupported()
}

export async function ensureKey(): Promise<void> {
  if (Platform.OS !== "android" || !nativeModule) return
  await nativeModule.ensureKey(KEY_ALIAS)
}

export async function wrapVmkWithPrompt(vmkBytes: Uint8Array): Promise<{ v: 1; alg: "AES-256-GCM"; nonce: string; ct: string }> {
  if (Platform.OS !== "android" || !nativeModule) {
    throw new Error("Android keystore not available")
  }
  const vmkB64 = bytesToBase64(vmkBytes)
  const result = await nativeModule.wrapVmk(
    KEY_ALIAS,
    vmkB64,
    "Unlock Locker",
    "Confirm device credential",
  )
  return {
    v: 1,
    alg: "AES-256-GCM",
    nonce: result.nonceB64,
    ct: result.ctB64,
  }
}

export async function unwrapVmkWithPrompt(envelope: { nonce: string; ct: string }): Promise<Uint8Array> {
  if (Platform.OS !== "android" || !nativeModule) {
    throw new Error("Android keystore not available")
  }
  const vmkB64 = await nativeModule.unwrapVmk(
    KEY_ALIAS,
    envelope.nonce,
    envelope.ct,
    "Unlock Locker",
    "Confirm device credential",
  )
  return base64ToBytes(vmkB64)
}

export async function deleteKeyDevOnly(): Promise<void> {
  if (Platform.OS !== "android" || !nativeModule) return
  await nativeModule.deleteKey(KEY_ALIAS)
}

export async function deleteKey(): Promise<void> {
  if (Platform.OS !== "android" || !nativeModule) return
  await nativeModule.deleteKey(KEY_ALIAS)
}
