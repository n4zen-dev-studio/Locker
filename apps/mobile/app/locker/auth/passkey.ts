import { Platform } from "react-native"
import * as Keychain from "react-native-keychain"

import { decryptV1, encryptV1, EnvelopeV1 } from "../crypto/aead"
import { base64ToBytes, bytesToBase64 } from "../crypto/encoding"
import { randomBytes } from "../crypto/random"
import { vaultSession } from "../session"
import { getMeta, removeMeta, setMetaV1, setMetaV2, VaultMetaV2 } from "../storage/vaultMetaRepo"
import {
  ensureKey,
  isSupported as isAndroidKeystoreSupported,
  unwrapVmkWithPrompt,
  wrapVmkWithPrompt,
  deleteKey,
  deleteKeyDevOnly,
} from "./androidKeystore"

const SERVICE = "com.n4zen.calculator.locker.dwk.v1"
const ANDROID_KEY_REF = "android-keystore:locker_vmk_wrap_v1"

export async function isPasskeyEnabled(): Promise<boolean> {
  const meta = getMeta()
  if (!meta || meta.v !== 2) return false

  if (Platform.OS === "android") {
    return isAndroidKeystoreSupported()
  }
  const creds = await Keychain.getGenericPassword({ service: SERVICE })
  return !!creds
}

export async function enablePasskey(vmkBytes: Uint8Array): Promise<void> {
  if (Platform.OS === "android") {
    await ensureKey()
    const vmkWrap = await wrapVmkWithPrompt(vmkBytes)
    const legacy = getMeta()
    const meta: VaultMetaV2 = {
      v: 2,
      vmkWrap: vmkWrap as EnvelopeV1,
      dwkRef: { keychainService: ANDROID_KEY_REF },
      legacy: legacy && legacy.v === 1 ? legacy : undefined,
    }
    setMetaV2(meta)
    vaultSession.setKey(vmkBytes)
    return
  }

  const dwk = randomBytes(32)
  await storeDwk(dwk)

  const vmkWrap = encryptV1(dwk, vmkBytes)
  const legacy = getMeta()
  const meta: VaultMetaV2 = {
    v: 2,
    vmkWrap,
    dwkRef: { keychainService: SERVICE },
    legacy: legacy && legacy.v === 1 ? legacy : undefined,
  }

  setMetaV2(meta)
  vaultSession.setKey(vmkBytes)
}

export async function unlockWithPasskey(): Promise<Uint8Array> {
  const meta = getMeta()
  if (!meta || meta.v !== 2) throw new Error("Passkey not configured")

  if (Platform.OS === "android") {
    const vmk = await unwrapVmkWithPrompt(meta.vmkWrap)
    return vmk
  }

  const dwk = await readDwk()
  const vmk = decryptV1(dwk, meta.vmkWrap)
  return vmk
}

export async function disablePasskeyDevOnly(): Promise<void> {
  if (!__DEV__) return
  const meta = getMeta()

  if (Platform.OS === "android") {
    await deleteKeyDevOnly()
    if (!meta) {
      removeMeta()
      return
    }
    if (meta.v === 2 && meta.legacy) {
      setMetaV1(meta.legacy)
      return
    }
    removeMeta()
    return
  }

  await Keychain.resetGenericPassword({ service: SERVICE })
  if (!meta) {
    removeMeta()
    return
  }
  if (meta.v === 2 && meta.legacy) {
    setMetaV1(meta.legacy)
    return
  }
  removeMeta()
}

export async function clearPasskey(): Promise<void> {
  if (Platform.OS === "android") {
    await deleteKey()
    removeMeta()
    vaultSession.clear()
    return
  }

  await Keychain.resetGenericPassword({ service: SERVICE })
  removeMeta()
  vaultSession.clear()
}

async function storeDwk(dwk: Uint8Array): Promise<void> {
  const password = bytesToBase64(dwk)
  const options = {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
  }

  try {
    const ok = await Keychain.setGenericPassword("locker", password, options)
    if (!ok) throw new Error("Failed to store passkey")
  } catch (err) {
    const fallbackOk = await Keychain.setGenericPassword("locker", password, {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
    if (!fallbackOk) throw err
  }
}

async function readDwk(): Promise<Uint8Array> {
  const creds = await Keychain.getGenericPassword({
    service: SERVICE,
    authenticationPrompt: {
      title: "Unlock Locker",
      subtitle: "Confirm your device passcode or biometrics",
      description: "Authenticate to unlock your vault",
    },
  })

  if (!creds) throw new Error("Passkey not available")
  return base64ToBytes(creds.password)
}
