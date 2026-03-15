import { recordSecurityEvent } from "./security/auditLogRepo"
import { activateStandardSession, clearSessionTrust } from "./security/trustRepo"

let vmk: Uint8Array | null = null

export const vaultSession = {
  setKey(next: Uint8Array) {
    vmk = new Uint8Array(next)
    activateStandardSession()
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
  },
}
