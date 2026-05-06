import { useEffect, useRef } from "react"
import { AppState, AppStateStatus } from "react-native"
import { requestSync, cancelVault } from "./syncCoordinator"
import { subscribeRemoteVaultChanges } from "@/locker/storage/remoteVaultRepo"

export function useAutoSync(): void {
  const lastState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = lastState.current
      lastState.current = nextState
      if (prev !== "active" && nextState === "active") {
        void requestSync("app_active")
      }
    })

    const unsubscribe = subscribeRemoteVaultChanges((nextVaultId, prevVaultId) => {
      if (prevVaultId && prevVaultId !== nextVaultId) {
        cancelVault(prevVaultId)
      }
      if (nextVaultId) {
        void requestSync("vault_switch", nextVaultId)
      }
    })

    return () => {
      sub.remove()
      unsubscribe()
    }
  }, [])
}
