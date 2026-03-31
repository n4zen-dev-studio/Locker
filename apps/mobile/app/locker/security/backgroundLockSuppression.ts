import { useFocusEffect } from "@react-navigation/native"
import { useCallback } from "react"

const activeSuppressionReasons = new Set<string>()

export function enableBackgroundLockSuppression(reason: string) {
  activeSuppressionReasons.add(reason)
}

export function disableBackgroundLockSuppression(reason: string) {
  activeSuppressionReasons.delete(reason)
}

export function isBackgroundLockSuppressed() {
  return activeSuppressionReasons.size > 0
}

export function useBackgroundLockSuppression(reason: string, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return

      enableBackgroundLockSuppression(reason)

      return () => {
        disableBackgroundLockSuppression(reason)
      }
    }, [enabled, reason]),
  )
}
