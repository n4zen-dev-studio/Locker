import * as Keychain from "react-native-keychain"

import { decryptV1, encryptV1 } from "../crypto/aead"
import { base64ToBytes, bytesToBase64 } from "../crypto/encoding"
import { randomBytes } from "../crypto/random"
import { vaultSession } from "../session"
import { getMeta, setMetaV1, setMetaV2, VaultMetaV2, removeMeta } from "../storage/vaultMetaRepo"

const SERVICE = "com.n4zen.calculator.locker.dwk.v2" // bump service to avoid any old weak entry


export async function enablePasskey(vmkBytes: Uint8Array): Promise<void> {
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

  const dwk = await readDwk()
  const vmk = decryptV1(dwk, meta.vmkWrap)
  return vmk
}

export async function disablePasskeyDevOnly(): Promise<void> {
  if (!__DEV__) return
  const meta = getMeta()
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


export async function isPasskeyEnabled(): Promise<boolean> {
  const services = await Keychain.getAllGenericPasswordServices()
  return services.includes(SERVICE)
}

async function storeDwk(dwk: Uint8Array): Promise<void> {
  const password = bytesToBase64(dwk)

  // wipe any previously stored entry (including weak ones)
  await Keychain.resetGenericPassword({ service: SERVICE })

  const ok = await Keychain.setGenericPassword("locker", password, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED, // Android-safe
    accessControl: Keychain.ACCESS_CONTROL.USER_PRESENCE, // strongest "always prompt" option
    authenticationType: Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
  })

  if (!ok) throw new Error("Failed to store passkey-protected key")
}


async function readDwk(): Promise<Uint8Array> {
  const creds = await Keychain.getGenericPassword({
    service: SERVICE,
    authenticationPrompt: {
      title: "Unlock Locker",
      subtitle: "Confirm your device passcode or biometrics",
      description: "Authenticate to unlock your vault",
      cancel: "Cancel",
    },
  })

  if (!creds) throw new Error("Passkey not available or user canceled")
  return base64ToBytes(creds.password)
}

