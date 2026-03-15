import type { AppStackParamList } from "./navigationTypes"

import { hasCompletedPrivacyOnboarding } from "@/locker/storage/onboardingRepo"

export function getPostUnlockRoute():
  | { name: "VaultOnboarding" }
  | { name: "VaultTabs"; params: AppStackParamList["VaultTabs"] } {
  if (!hasCompletedPrivacyOnboarding()) {
    return { name: "VaultOnboarding" }
  }

  return {
    name: "VaultTabs",
    params: { screen: "Vault" },
  }
}
