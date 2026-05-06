import { getBootstrapState } from "@/locker/bootstrap/bootstrapRepo"
import { getAccount } from "@/locker/storage/accountRepo"
import { load, remove, save } from "@/utils/storage"

const LEGACY_PRIVACY_ONBOARDING_KEY = "locker:onboarding:privacy:v1"
const INITIAL_ONBOARDING_KEY = "locker:onboarding:intro:v1"
const VAULT_SELECTION_COMPLETE_KEY = "locker:onboarding:selection-complete:v1"

export function hasSeenInitialOnboarding(): boolean {
  return load<boolean>(INITIAL_ONBOARDING_KEY) === true || load<boolean>(LEGACY_PRIVACY_ONBOARDING_KEY) === true
}

export function markInitialOnboardingSeen(): void {
  save(INITIAL_ONBOARDING_KEY, true)
}

export function hasCompletedVaultSelectionFlow(): boolean {
  if (load<boolean>(VAULT_SELECTION_COMPLETE_KEY) === true) return true
  if (getAccount()) return true
  if (getBootstrapState()?.completedAt) return true
  return false
}

export function completeVaultSelectionFlow(): void {
  save(VAULT_SELECTION_COMPLETE_KEY, true)
}

export function resetSetupOnboardingState(): void {
  remove(INITIAL_ONBOARDING_KEY)
  remove(VAULT_SELECTION_COMPLETE_KEY)
  remove(LEGACY_PRIVACY_ONBOARDING_KEY)
}
