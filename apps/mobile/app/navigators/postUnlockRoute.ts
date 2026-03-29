import type { AppStackParamList } from "./navigationTypes"

import { isPasskeyEnabled } from "@/locker/auth/passkey"
import { getMeta } from "@/locker/storage/vaultMetaRepo"
import {
  hasCompletedVaultSelectionFlow,
  hasSeenInitialOnboarding,
} from "@/locker/storage/onboardingRepo"

export function getPostUnlockRoute():
  | { name: "VaultSelection" }
  | { name: "VaultTabs"; params: AppStackParamList["VaultTabs"] } {
  if (!hasCompletedVaultSelectionFlow()) {
    return { name: "VaultSelection" }
  }

  return {
    name: "VaultTabs",
    params: { screen: "Vault" },
  }
}

export async function resolveVaultEntryRoute(options?: { unlocked?: boolean }):
  Promise<
    | { name: "VaultOnboarding" }
    | { name: "VaultLocked" }
    | { name: "VaultPasskeySetup"; params: AppStackParamList["VaultPasskeySetup"] }
    | ReturnType<typeof getPostUnlockRoute>
  > {
  if (!hasSeenInitialOnboarding()) {
    return { name: "VaultOnboarding" }
  }

  const passkeyReady = await isPasskeyEnabled()
  if (!passkeyReady) {
    const meta = getMeta()
    return { name: "VaultPasskeySetup", params: { mode: meta?.v === 1 ? "migrate" : "fresh" } }
  }

  if (!options?.unlocked) {
    return { name: "VaultLocked" }
  }

  if (!hasCompletedVaultSelectionFlow()) {
    return { name: "VaultSelection" }
  }

  return {
    name: "VaultTabs",
    params: { screen: "Vault" },
  }
}
