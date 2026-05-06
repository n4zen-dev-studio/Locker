import { load, save } from "@/utils/storage"

const PRIVACY_ONBOARDING_KEY = "locker:onboarding:privacy:v1"

export function hasCompletedPrivacyOnboarding(): boolean {
  return load<boolean>(PRIVACY_ONBOARDING_KEY) === true
}

export function completePrivacyOnboarding(): void {
  save(PRIVACY_ONBOARDING_KEY, true)
}

export function resetPrivacyOnboarding(): void {
  save(PRIVACY_ONBOARDING_KEY, false)
}
