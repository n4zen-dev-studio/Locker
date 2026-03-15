import { recentSecurityAuditEvents } from "./auditLogRepo"

export function getTamperIndicators(now = Date.now()): string[] {
  const events = recentSecurityAuditEvents(50)
  const failures = events.filter(
    (event) =>
      event.type === "unlock_failure" &&
      now - new Date(event.createdAt).getTime() <= 10 * 60 * 1000,
  )
  const syncTargetChanged = events.find(
    (event) =>
      event.type === "sync_target_changed" &&
      now - new Date(event.createdAt).getTime() <= 24 * 60 * 60 * 1000,
  )
  const backupRemoved = events.find(
    (event) =>
      event.type === "recovery_removed" &&
      now - new Date(event.createdAt).getTime() <= 24 * 60 * 60 * 1000,
  )

  const warnings: string[] = []
  if (failures.length >= 3) warnings.push("Multiple failed unlock attempts in the last 10 minutes.")
  if (syncTargetChanged) warnings.push("Sync target changed recently. Verify the connected personal vault.")
  if (backupRemoved) warnings.push("Recovery backup was removed recently.")
  return warnings
}
