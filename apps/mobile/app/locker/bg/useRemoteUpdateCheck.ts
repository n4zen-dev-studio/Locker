import { useEffect, useRef } from "react"
import { AppState, AppStateStatus } from "react-native"
import { getEnabledRemoteVaultIds } from "@/locker/storage/remoteVaultRepo"
import { checkForRemoteUpdates } from "./updateCheck"

export function useRemoteUpdateCheck(): void {
  const lastState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = lastState.current
      lastState.current = nextState

      if (prev !== "active" && nextState === "active") {
        for (const vaultId of getEnabledRemoteVaultIds()) {
          void checkForRemoteUpdates(vaultId, { mode: "foreground", source: "app_active" }).catch((err) => {
            if (__DEV__) console.log("[bg] remote check failed", err)
          })
        }
      }
    })

    return () => {
      sub.remove()
    }
  }, [])
}
