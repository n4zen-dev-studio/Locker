import { unlockWithPasskey } from "@/locker/auth/passkey"

import { recordSecurityEvent } from "./auditLogRepo"
import { elevateSession, hasElevatedSession } from "./trustRepo"

export async function ensureElevatedSession(reason: string): Promise<boolean> {
  if (hasElevatedSession()) return true

  try {
    await unlockWithPasskey()
    elevateSession()
    recordSecurityEvent({
      type: "step_up_success",
      message: `Elevated session granted for ${reason}.`,
      severity: "info",
      meta: { reason },
    })
    return true
  } catch (err) {
    recordSecurityEvent({
      type: "step_up_failure",
      message: `Elevated session denied for ${reason}.`,
      severity: "warning",
      meta: { reason },
    })
    throw err
  }
}
