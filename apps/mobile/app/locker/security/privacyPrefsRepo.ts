import { load, save } from "@/utils/storage"

const PRIVACY_PREFS_KEY = "locker:security:privacy-prefs:v1"

export type PrivacyPrefs = {
  lockOnBackground: boolean
  inactivityLockSeconds: number
  hideSensitivePreviews: boolean
}

const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  lockOnBackground: true,
  inactivityLockSeconds: 30,
  hideSensitivePreviews: true,
}

export function getPrivacyPrefs(): PrivacyPrefs {
  const stored = load<Partial<PrivacyPrefs>>(PRIVACY_PREFS_KEY)
  return {
    ...DEFAULT_PRIVACY_PREFS,
    ...stored,
  }
}

export function setPrivacyPrefs(next: Partial<PrivacyPrefs>): PrivacyPrefs {
  const merged = {
    ...getPrivacyPrefs(),
    ...next,
  }
  save(PRIVACY_PREFS_KEY, merged)
  return merged
}
