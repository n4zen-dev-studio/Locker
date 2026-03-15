import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { SecurityStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import {
  createOrUpdateKeyBackup,
  deleteKeyBackup,
  getKeyBackupStatus,
  recoverUserKeypair,
} from "@/locker/keys/keyBackup"
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey"
import { getMeta } from "@/locker/storage/vaultMetaRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { getSyncStatus } from "@/locker/sync/syncEngine"
import { getTrustSnapshot, subscribeTrust } from "@/locker/security/trustRepo"
import { ensureElevatedSession } from "@/locker/security/stepUp"
import { getTamperIndicators } from "@/locker/security/tamperIndicators"
import { getPrivacyPrefs, setPrivacyPrefs } from "@/locker/security/privacyPrefsRepo"
import {
  recentSecurityAuditEvents,
  recordSecurityEvent,
  SecurityAuditEvent,
} from "@/locker/security/auditLogRepo"

type RecoveryState = {
  configured: boolean
  updatedAt: string | null
}

export const SecurityDashboardScreen: FC<SecurityStackScreenProps<"SecurityDashboard">> =
  function SecurityDashboardScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const [passphrase, setPassphrase] = useState("")
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [recovery, setRecovery] = useState<RecoveryState>({ configured: false, updatedAt: null })
    const [passkeyReady, setPasskeyReady] = useState<boolean | null>(null)
    const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null)
    const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
    const [privacyPrefs, setLocalPrivacyPrefs] = useState(() => getPrivacyPrefs())
    const [trust, setTrust] = useState(() => getTrustSnapshot())
    const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([])
    const [tamperIndicators, setLocalTamperIndicators] = useState<string[]>([])

    const refreshStatus = useCallback(async () => {
      try {
        const backupStatus = await getKeyBackupStatus()
        setRecovery(backupStatus)
      } catch {
        setRecovery({ configured: false, updatedAt: null })
      }

      const enabled = await isPasskeyEnabled()
      setPasskeyReady(enabled)
      const meta = getMeta()
      setMetaVersion(meta ? meta.v : null)
      setSyncStatus(getSyncStatus())
      setLocalPrivacyPrefs(getPrivacyPrefs())
      setTrust(getTrustSnapshot())
      setAuditEvents(recentSecurityAuditEvents(12))
      setLocalTamperIndicators(getTamperIndicators())
    }, [])

    useFocusEffect(
      useCallback(() => {
        if (!vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
          return
        }
        void refreshStatus()
      }, [navigation, refreshStatus]),
    )

    useEffect(() => {
      const unsub = subscribeTrust(() => setTrust(getTrustSnapshot()))
      const timer = setInterval(() => {
        setSyncStatus(getSyncStatus())
        setTrust(getTrustSnapshot())
      }, 1000)
      return () => {
        unsub()
        clearInterval(timer)
      }
    }, [])

    const handleSetBackup = useCallback(async () => {
      setError(null)
      setStatus(null)
      try {
        await ensureElevatedSession("recovery backup update")
        await createOrUpdateKeyBackup(passphrase)
        recordSecurityEvent({
          type: "recovery_configured",
          message: "Recovery backup configured or updated.",
          severity: "info",
        })
        setStatus("Recovery backup saved.")
        setPassphrase("")
        await refreshStatus()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save backup"
        setError(message)
      }
    }, [passphrase, refreshStatus])

    const handleRecover = useCallback(async () => {
      setError(null)
      setStatus(null)
      try {
        await ensureElevatedSession("recovery restore")
        await recoverUserKeypair(passphrase)
        recordSecurityEvent({
          type: "recovery_recovered",
          message: "Recovery flow restored user keys.",
          severity: "warning",
        })
        setStatus("Keys recovered. Vault keys will sync now.")
        setPassphrase("")
        await refreshStatus()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Recovery failed"
        setError(message)
      }
    }, [passphrase, refreshStatus])

    const handleDeleteBackup = useCallback(async () => {
      setError(null)
      setStatus(null)
      try {
        await ensureElevatedSession("recovery backup removal")
        await deleteKeyBackup()
        recordSecurityEvent({
          type: "recovery_removed",
          message: "Recovery backup removed.",
          severity: "warning",
        })
        setStatus("Recovery backup removed.")
        await refreshStatus()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to remove backup"
        setError(message)
      }
    }, [refreshStatus])

    const handleElevate = useCallback(async () => {
      setError(null)
      setStatus(null)
      try {
        await ensureElevatedSession("manual elevation")
        setStatus("Elevated session active for sensitive actions.")
        setTrust(getTrustSnapshot())
        setAuditEvents(recentSecurityAuditEvents(12))
      } catch (err) {
        const message = err instanceof Error ? err.message : "Elevation failed"
        setError(message)
      }
    }, [])

    const handlePanic = useCallback(() => {
      recordSecurityEvent({
        type: "panic_action",
        message: "Panic action triggered.",
        severity: "critical",
      })
      vaultSession.clear()
      navigation.popToTop()
      navigation.replace("Calculator")
    }, [navigation])

    const handlePrivacyToggle = useCallback(
      (next: Partial<typeof privacyPrefs>) => {
        const updated = setPrivacyPrefs(next)
        setLocalPrivacyPrefs(updated)
        setStatus("Privacy protections updated.")
      },
      [privacyPrefs],
    )

    const overviewWarnings = useMemo(() => {
      const warnings: string[] = []
      if (!passkeyReady) warnings.push("Passkey is not enabled.")
      if (!recovery.configured) warnings.push("Recovery backup is not configured.")
      warnings.push(...tamperIndicators)
      return warnings
    }, [passkeyReady, recovery.configured, tamperIndicators])

    return (
      <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
        <AnimatedBlobBackground>
          <View style={themed($headerWrap)}>
            <GlassHeader>
              <Text preset="heading" style={themed($title)}>
                Security Center
              </Text>
              <Text preset="subheading" style={themed($subtitle)}>
                Trust state, audit history, recovery health, and privacy controls
              </Text>
            </GlassHeader>
          </View>

          <View style={themed($content)}>
            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Security Overview
              </Text>
              <MetaRow label="Passkey" value={passkeyReady ? "Enabled" : "Not enabled"} />
              <MetaRow label="Recovery" value={recovery.configured ? "Configured" : "Not configured"} />
              <MetaRow label="Sync" value={syncStatus.state} />
              <MetaRow label="Auto-lock" value={privacyPrefs.lockOnBackground ? "On background" : `${privacyPrefs.inactivityLockSeconds}s inactivity`} />
              <MetaRow label="Trust" value={trust.state} />
              <MetaRow label="Last unlock" value={formatTimestamp(trust.lastUnlockAt)} />
              <MetaRow label="Vault meta" value={metaVersion ? `v${metaVersion}` : "n/a"} />
              {overviewWarnings.length > 0 ? (
                <View style={themed($warningBox)}>
                  {overviewWarnings.map((warning) => (
                    <Text key={warning} style={themed($warningText)}>
                      {warning}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={themed($metaText)}>No active warnings.</Text>
              )}
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Session Trust / Step-up Auth
              </Text>
              <MetaRow label="Current state" value={trust.state} />
              <MetaRow label="Elevated until" value={formatTimestamp(trust.elevatedUntil)} />
              <Text style={themed($metaText)}>
                Elevated sessions are required for permanent delete and recovery-changing actions.
              </Text>
              <Pressable style={themed($primaryButton)} onPress={handleElevate}>
                <Text preset="bold" style={themed($primaryButtonText)}>
                  Elevate Session
                </Text>
              </Pressable>
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Recovery Health
              </Text>
              <MetaRow label="Configured" value={recovery.configured ? "Yes" : "No"} />
              <MetaRow label="Last updated" value={formatTimestamp(recovery.updatedAt)} />
              <Text style={themed($metaText)}>
                {recovery.configured
                  ? "Recovery is available if you lose the device-specific private key."
                  : "Without recovery, device loss may require manual pairing or cause lockout."}
              </Text>
              <TextField
                label="Recovery Passphrase"
                placeholder="Enter recovery passphrase"
                secureTextEntry
                value={passphrase}
                onChangeText={setPassphrase}
              />
              <Pressable style={themed($primaryButton)} onPress={handleSetBackup}>
                <Text preset="bold" style={themed($primaryButtonText)}>
                  Set / Update Backup
                </Text>
              </Pressable>
              <Pressable style={themed($secondaryButton)} onPress={handleRecover}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Recover Keys
                </Text>
              </Pressable>
              <Pressable style={themed($dangerButton)} onPress={handleDeleteBackup}>
                <Text preset="bold" style={themed($dangerButtonText)}>
                  Remove Backup
                </Text>
              </Pressable>
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Auto-lock & Privacy Protections
              </Text>
              <ToggleRow
                label="Lock on app background"
                value={privacyPrefs.lockOnBackground}
                onPress={() => handlePrivacyToggle({ lockOnBackground: !privacyPrefs.lockOnBackground })}
              />
              <ToggleRow
                label={`Hide sensitive previews (${privacyPrefs.hideSensitivePreviews ? "On" : "Off"})`}
                value={privacyPrefs.hideSensitivePreviews}
                onPress={() =>
                  handlePrivacyToggle({ hideSensitivePreviews: !privacyPrefs.hideSensitivePreviews })
                }
              />
              <Pressable
                style={themed($secondaryButton)}
                onPress={() =>
                  handlePrivacyToggle({
                    inactivityLockSeconds:
                      privacyPrefs.inactivityLockSeconds === 15
                        ? 30
                        : privacyPrefs.inactivityLockSeconds === 30
                          ? 60
                          : 15,
                  })
                }
              >
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Inactivity Lock: {privacyPrefs.inactivityLockSeconds}s
                </Text>
              </Pressable>
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Panic Action
              </Text>
              <Text style={themed($metaText)}>
                Immediately relock and return to the calculator disguise.
              </Text>
              <Pressable style={themed($dangerButton)} onPress={handlePanic}>
                <Text preset="bold" style={themed($dangerButtonText)}>
                  Panic Relock
                </Text>
              </Pressable>
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Decoy Vault
              </Text>
              <Text style={themed($metaText)}>
                Open a believable decoy content path that does not use real vault state.
              </Text>
              <Pressable
                style={themed($secondaryButton)}
                onPress={() => {
                  recordSecurityEvent({
                    type: "decoy_vault_open",
                    message: "Decoy vault opened.",
                    severity: "info",
                  })
                  navigation.navigate("DecoyVault")
                }}
              >
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Open Decoy Vault
                </Text>
              </Pressable>
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Tamper Indicators
              </Text>
              {tamperIndicators.length === 0 ? (
                <Text style={themed($metaText)}>No suspicious recent indicators.</Text>
              ) : (
                tamperIndicators.map((warning) => (
                  <Text key={warning} style={themed($warningText)}>
                    {warning}
                  </Text>
                ))
              )}
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Audit Log
              </Text>
              {auditEvents.length === 0 ? (
                <Text style={themed($metaText)}>No recent security events.</Text>
              ) : (
                auditEvents.map((event) => (
                  <View key={event.id} style={themed($auditRow)}>
                    <Text preset="bold" style={themed($auditTitle)}>
                      {event.message}
                    </Text>
                    <Text style={themed($auditMeta)}>
                      {event.type} · {formatTimestamp(event.createdAt)}
                    </Text>
                  </View>
                ))
              )}
            </GlassCard>

            {__DEV__ ? (
              <GlassCard>
                <Text preset="bold" style={themed($sectionTitle)}>
                  Developer Controls
                </Text>
                <Pressable
                  style={themed($secondaryButton)}
                  onPress={async () => {
                    await disablePasskeyDevOnly()
                    await refreshStatus()
                  }}
                >
                  <Text preset="bold" style={themed($secondaryButtonText)}>
                    Disable Passkey (Dev)
                  </Text>
                </Pressable>
              </GlassCard>
            ) : null}

            {error ? <Text style={themed($errorText)}>{error}</Text> : null}
            {status ? <Text style={themed($statusText)}>{status}</Text> : null}
          </View>
        </AnimatedBlobBackground>
      </Screen>
    )
  }

const MetaRow = ({ label, value }: { label: string; value: string }) => {
  const { themed } = useAppTheme()
  return (
    <View style={themed($metaRow)}>
      <Text style={themed($metaLabel)}>{label}</Text>
      <Text style={themed($metaValue)}>{value}</Text>
    </View>
  )
}

const ToggleRow = ({
  label,
  value,
  onPress,
}: {
  label: string
  value: boolean
  onPress: () => void
}) => {
  const { themed } = useAppTheme()
  return (
    <Pressable style={themed($toggleRow)} onPress={onPress}>
      <Text style={themed($metaLabel)}>{label}</Text>
      <View style={themed([value ? $toggleOn : $toggleOff, $togglePill])}>
        <Text style={themed($toggleText)}>{value ? "On" : "Off"}</Text>
      </View>
    </Pressable>
  )
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "n/a"
  return new Date(value).toLocaleString()
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $headerWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  marginBottom: spacing.md,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
  gap: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  fontSize: 12,
  marginBottom: spacing.sm,
})

const $metaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.md,
  marginBottom: spacing.xs,
})

const $metaLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  flex: 1,
})

const $metaValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  flex: 1,
  textAlign: "right",
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginTop: spacing.md,
  marginBottom: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 90, 90, 0.15)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 90, 90, 0.4)",
  marginBottom: spacing.sm,
})

const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})

const $warningBox: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.sm,
})

const $warningText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
  fontSize: 12,
})

const $toggleRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.sm,
})

const $togglePill: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 64,
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  alignItems: "center",
})

const $toggleOn: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.accentPink,
})

const $toggleOff: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.glassHeavy,
})

const $toggleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 12,
})

const $auditRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderTopWidth: 1,
  borderTopColor: colors.glassBorder,
  paddingTop: spacing.sm,
  marginTop: spacing.sm,
})

const $auditTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $auditMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
  marginTop: 4,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.sm,
})
