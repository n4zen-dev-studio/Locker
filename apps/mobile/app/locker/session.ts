import { recordSecurityEvent } from "./security/auditLogRepo"
import { activateStandardSession, clearSessionTrust } from "./security/trustRepo"

let vmk: Uint8Array | null = null
const listeners = new Set<(unlocked: boolean) => void>()

function emitSessionState() {
  const unlocked = vmk !== null
  listeners.forEach((listener) => listener(unlocked))
}

export const vaultSession = {
  setKey(next: Uint8Array) {
    vmk = new Uint8Array(next)
    activateStandardSession()
    emitSessionState()
  },
  getKey(): Uint8Array | null {
    return vmk ? new Uint8Array(vmk) : null
  },
  isUnlocked(): boolean {
    return vmk !== null
  },
  clear() {
    if (vmk) {
      recordSecurityEvent({
        type: "trust_cleared",
        message: "Vault session cleared.",
        severity: "info",
      })
    }
    vmk = null
    clearSessionTrust()
    emitSessionState()
  },
  subscribe(listener: (unlocked: boolean) => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
