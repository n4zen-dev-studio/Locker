import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { Clock3, KeyRound, Shield, Siren, TriangleAlert } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { VaultHubBackground } from "@/components/VaultHubBackground";
import type { SecurityStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { vaultSession } from "@/locker/session";
import {
  createOrUpdateKeyBackup,
  deleteKeyBackup,
  getKeyBackupStatus,
  recoverUserKeypair,
} from "@/locker/keys/keyBackup";
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey";
import { getMeta } from "@/locker/storage/vaultMetaRepo";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { getSyncStatus } from "@/locker/sync/syncEngine";
import { getTrustSnapshot, subscribeTrust } from "@/locker/security/trustRepo";
import { ensureElevatedSession } from "@/locker/security/stepUp";
import { getTamperIndicators } from "@/locker/security/tamperIndicators";
import { getPrivacyPrefs, setPrivacyPrefs } from "@/locker/security/privacyPrefsRepo";
import {
  recentSecurityAuditEvents,
  recordSecurityEvent,
  SecurityAuditEvent,
  SecurityEventType,
} from "@/locker/security/auditLogRepo";
import { Ionicons } from "@expo/vector-icons"
import { spacing } from "@/theme/spacing";


type RecoveryState = {
  configured: boolean;
  updatedAt: string | null;
};

const ACTIVITY_BUCKETS = 12;
const ACTIVITY_ROWS = 10;
const ACTIVITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 2;

export const SecurityDashboardScreen: FC<SecurityStackScreenProps<"SecurityDashboard">> = function SecurityDashboardScreen(
  props,
) {
  const { navigation } = props;
  const { themed, theme } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState>({ configured: false, updatedAt: null });
  const [passkeyReady, setPasskeyReady] = useState<boolean | null>(null);
  const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null);
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus());
  const [privacyPrefs, setLocalPrivacyPrefs] = useState(() => getPrivacyPrefs());
  const [trust, setTrust] = useState(() => getTrustSnapshot());
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([]);
  const [activityEvents, setActivityEvents] = useState<SecurityAuditEvent[]>([]);
  const [tamperIndicators, setLocalTamperIndicators] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
    const [showAuditLogs, setShowAuditLogs] = useState(false);


  const refreshStatus = useCallback(async () => {
    try {
      const backupStatus = await getKeyBackupStatus();
      setRecovery(backupStatus);
    } catch {
      setRecovery({ configured: false, updatedAt: null });
    }

    const enabled = await isPasskeyEnabled();
    const nextAuditEvents = recentSecurityAuditEvents(12);
    const nextActivityEvents = recentSecurityAuditEvents(48);

    setPasskeyReady(enabled);
    setMetaVersion(getMeta()?.v ?? null);
    setSyncStatus(getSyncStatus());
    setLocalPrivacyPrefs(getPrivacyPrefs());
    setTrust(getTrustSnapshot());
    setAuditEvents(nextAuditEvents);
    setActivityEvents(nextActivityEvents);
    setLocalTamperIndicators(getTamperIndicators());
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked");
        return;
      }
      void refreshStatus();
    }, [navigation, refreshStatus]),
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const unsub = subscribeTrust(() => setTrust(getTrustSnapshot()));
    const timer = setInterval(() => {
      setSyncStatus(getSyncStatus());
      setTrust(getTrustSnapshot());
    }, 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const handleSetBackup = useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      await ensureElevatedSession("recovery backup update");
      await createOrUpdateKeyBackup(passphrase);
      recordSecurityEvent({
        type: "recovery_configured",
        message: "Recovery backup configured or updated.",
        severity: "info",
      });
      setStatus("Recovery backup saved.");
      setPassphrase("");
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save backup";
      setError(message);
    }
  }, [passphrase, refreshStatus]);

  const handleRecover = useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      await ensureElevatedSession("recovery restore");
      await recoverUserKeypair(passphrase);
      recordSecurityEvent({
        type: "recovery_recovered",
        message: "Recovery flow restored user keys.",
        severity: "warning",
      });
      setStatus("Keys recovered. Vault keys will sync now.");
      setPassphrase("");
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recovery failed";
      setError(message);
    }
  }, [passphrase, refreshStatus]);

  const handleDeleteBackup = useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      await ensureElevatedSession("recovery backup removal");
      await deleteKeyBackup();
      recordSecurityEvent({
        type: "recovery_removed",
        message: "Recovery backup removed.",
        severity: "warning",
      });
      setStatus("Recovery backup removed.");
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove backup";
      setError(message);
    }
  }, [refreshStatus]);

  const handleElevate = useCallback(async () => {
    setError(null);
    setStatus(null);
    try {
      await ensureElevatedSession("manual elevation");
      setStatus("Elevated session active for sensitive actions.");
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Elevation failed";
      setError(message);
    }
  }, [refreshStatus]);

  const handlePanic = useCallback(() => {
    recordSecurityEvent({
      type: "panic_action",
      message: "Panic action triggered.",
      severity: "critical",
    });
    vaultSession.clear();
    navigation.popToTop();
    navigation.replace("Calculator");
  }, [navigation]);

  const handlePrivacyToggle = useCallback((next: Partial<typeof privacyPrefs>) => {
    const updated = setPrivacyPrefs(next);
    setLocalPrivacyPrefs(updated);
    setStatus("Privacy protections updated.");
  }, []);

  const overviewWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!passkeyReady) warnings.push("Passkey is not enabled.");
    if (!recovery.configured) warnings.push("Recovery backup is not configured.");
    warnings.push(...tamperIndicators);
    return warnings;
  }, [passkeyReady, recovery.configured, tamperIndicators]);

  const heroChips = useMemo<Array<{ label: string; tone: "accent" | "warning" | "neutral" }>>(
    () => [
      { label: `Trust ${trust.state}`, tone: trust.state === "elevated" ? "accent" : "neutral" },
      {
        label: passkeyReady ? "Passkey enabled" : "Passkey not enabled",
        tone: passkeyReady ? "neutral" : "warning",
      },
      {
        label: recovery.configured ? "Recovery ready" : "Recovery missing",
        tone: recovery.configured ? "neutral" : "warning",
      },
    ],
    [passkeyReady, recovery.configured, trust.state],
  );

  function SummaryStatV2({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  const { themed } = useAppTheme()

  return (
    <View style={themed([$summaryStatCardV2, accent && $summaryStatCardAccentV2])}>
      <Text style={themed($summaryStatLabelV2)}>{label}</Text>
      <Text style={themed(accent ? $summaryStatValueAccentV2 : $summaryStatValueV2)}>{value}</Text>
    </View>
  )
}

  const activitySummary = useMemo(() => {
    const counts = {
      unlocks: 0,
      autoLocks: 0,
      elevated: 0,
      alerts: 0,
    };

    activityEvents.forEach((event) => {
      if (event.type === "unlock_success") counts.unlocks += 1;
      if (event.type === "auto_lock") counts.autoLocks += 1;
      if (event.type === "step_up_success" || event.type === "trust_cleared") counts.elevated += 1;
      if (event.severity !== "info") counts.alerts += 1;
    });

    return counts;
  }, [activityEvents]);

  const activityGrid = useMemo(() => buildActivityGrid(activityEvents), [activityEvents]);

  return (
    <Screen
      preset="scroll"
      style={themed($screen)}
      contentContainerStyle={themed([$content, $insets, {paddingBottom: spacing.xxxl+30}])}
      systemBarStyle="light"
    >
      <VaultHubBackground reducedMotion={reducedMotion} />
      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeInDown.duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
        style={themed($hero)}
      >
        <Text size="xxs" style={themed($heroEyebrow)}>
          Security
        </Text>
        <Text preset="heading" style={themed($heroTitle)}>
          Security Center
        </Text>
        <Text style={themed($heroSubtitle)}>
          Trust state, recovery health, recent security activity, and protective controls for the vault.
        </Text>

        {/* <View style={themed($chipRow)}>
          {heroChips.map((chip) => (
            <StatusChip key={chip.label} label={chip.label} tone={chip.tone} />
          ))}
        </View> */}

        <View style={themed($metricRow)}>
          <MetricTile icon={<Shield size={18} color={theme.colors.vaultHub.vaultHubTextPrimary} />} label="Trust" value={trust.state} tone={"neutral"}/>
          <MetricTile
            icon={<KeyRound size={18} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
            label="Recovery"
            value={recovery.configured ? "Ready" : "Missing"}
            tone={recovery.configured ? "accent": "warning"}
          />
          <MetricTile
            icon={<Clock3 size={18} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
            label="Auto-lock"
            value={privacyPrefs.lockOnBackground ? "Background" : `${privacyPrefs.inactivityLockSeconds}s`}
            tone={"neutral"}
          />
        </View>
      </Animated.View>

      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeInUp.delay(40).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
      >
        <PanelCard
  title="Activity Overview"
  // subtitle="Recent security movement derived from existing audit events."
  contentContainerStyle={themed($activityPanelContent)}
>
  <View style={themed($activityChartShellV2)}>
    <View style={themed($activityChartHeaderV2)}>
      <View>
        {/* <Text style={themed($activityEyebrowV2)}>Security movement</Text> */}
        <Text style={themed($activityHintV2)}>Last recorded audit windows</Text>
      </View>
    </View>

    <View style={themed($activityChartFrameV2)}>
      <View style={themed($activityGridWrapV2)}>
        {activityGrid.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={themed($activityRowV2)}>
            {row.map((cell, cellIndex) => (
              <View
                key={`cell-${rowIndex}-${cellIndex}`}
                style={themed([
                  $activityCellV2,
                  cell.active && $activityCellActiveV2,
                  cell.tone === "warning" && $activityCellWarningV2,
                  cell.tone === "critical" && $activityCellCriticalV2,
                ])}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  </View>

  <View style={themed($activitySummaryRowV2)}>
    <SummaryStatV2 label="Unlocks" value={String(activitySummary.unlocks)} />
    <SummaryStatV2 label="Auto-locks" value={String(activitySummary.autoLocks)} />
    <SummaryStatV2 label="Step-up / Trust" value={String(activitySummary.elevated)} />
    <SummaryStatV2 label="Alerts" value={String(activitySummary.alerts)} accent />
  </View>

  <View style={themed($legendRowV2)}>
    <LegendDot label="Baseline" tone="muted" />
    <LegendDot label="Events" tone="accent" />
    <LegendDot label="Warnings" tone="warning" />
    <Text style={themed($legendText)}>{"Activity"}</Text>
    <TouchableOpacity onPress={() =>  setShowAuditLogs((v) => !v)} style={[themed($chip), {flexDirection: 'row', paddingHorizontal: 5, paddingVertical: 5}]}>

    <Ionicons
      name={showAuditLogs? "chevron-up": "chevron-down"}
      size={18}
      color={'#fff'}
      // style={{ paddingVertical: 5 }}
      
    />
    </TouchableOpacity>

  </View>

{showAuditLogs &&
  //  <PanelCard
  //           title="Audit Log"
  //           subtitle="Recent security events in their existing order."
  //         >
  <>
            {auditEvents.length === 0 ? (
              <Text style={themed($supportText)}>No recent security events.</Text>
            ) : (
              <View style={themed($auditList)}>
                {auditEvents.map((event) => (
                  <AuditItem key={event.id} event={event} />
                ))}
              </View>
            )}
    
          </>
          }
</PanelCard>
      </Animated.View>

      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeInUp.delay(80).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
        style={themed($stack)}
      >
          <PanelCard title="Security Overview" subtitle="Compact view of the current protection posture.">
            <InfoRow label="Passkey" value={passkeyReady ? "Enabled" : "Not enabled"} />
            <InfoRow label="Recovery" value={recovery.configured ? "Configured" : "Not configured"} />
            <InfoRow label="Sync" value={syncStatus.state} />
            <InfoRow
              label="Auto-lock"
              value={
                privacyPrefs.lockOnBackground ? "On background" : `${privacyPrefs.inactivityLockSeconds}s inactivity`
              }
            />
            <InfoRow label="Trust" value={trust.state} />
            <InfoRow label="Last unlock" value={formatTimestamp(trust.lastUnlockAt)} />
            <InfoRow label="Vault meta" value={metaVersion ? `v${metaVersion}` : "n/a"} />

            {overviewWarnings.length > 0 ? (
              <View style={themed($alertStack)}>
                {overviewWarnings.map((warning) => (
                  <AlertRow key={warning} label={warning} />
                ))}
              </View>
            ) : (
              <Text style={themed($supportText)}>No active warnings.</Text>
            )}
          </PanelCard>

          <PanelCard
            title="Session Trust / Step-up Auth"
            subtitle="Elevated sessions are required for recovery-changing actions and other sensitive flows."
          >
            <InfoRow label="Current state" value={trust.state} />
            <InfoRow label="Elevated until" value={formatTimestamp(trust.elevatedUntil)} />
            <ActionButton label="Elevate Session" onPress={handleElevate} variant="primary" />
          </PanelCard>

          <PanelCard
            title="Recovery / Backup"
            subtitle={
              recovery.configured
                ? "Recovery is available if you lose the device-specific private key."
                : "Without recovery, device loss may require manual pairing or cause lockout."
            }
          >
            <InfoRow label="Configured" value={recovery.configured ? "Yes" : "No"} />
            <InfoRow label="Last updated" value={formatTimestamp(recovery.updatedAt)} />

            <TextField
              label="Recovery Passphrase"
              placeholder="Enter recovery passphrase"
              secureTextEntry
              value={passphrase}
              onChangeText={setPassphrase}
              containerStyle={themed($textFieldContainer)}
              inputWrapperStyle={themed($textFieldWrapper)}
              style={themed($textFieldInput)}
              LabelTextProps={{ style: themed($textFieldLabel) }}
            />

            <View style={themed($buttonStack)}>
              <ActionButton label="Set / Update Backup" onPress={handleSetBackup} variant="primary" />
              <ActionButton label="Recover Keys" onPress={handleRecover} variant="secondary" />
              <ActionButton label="Remove Backup" onPress={handleDeleteBackup} variant="danger" />
            </View>
          </PanelCard>

          <PanelCard
            title="Auto-lock & Privacy Protections"
            subtitle="Session hardening and preview privacy controls."
          >
            <SettingRow
              label="Lock on app background"
              description="Immediately seals the vault when the app loses focus."
              value={privacyPrefs.lockOnBackground ? "On" : "Off"}
              active={privacyPrefs.lockOnBackground}
              onPress={() => handlePrivacyToggle({ lockOnBackground: !privacyPrefs.lockOnBackground })}
            />
            <SettingRow
              label="Hide sensitive previews"
              description="Redacts note previews for sensitive classifications."
              value={privacyPrefs.hideSensitivePreviews ? "On" : "Off"}
              active={privacyPrefs.hideSensitivePreviews}
              onPress={() =>
                handlePrivacyToggle({ hideSensitivePreviews: !privacyPrefs.hideSensitivePreviews })
              }
            />
            <SettingRow
              label="Inactivity lock"
              description="Cycles the timeout between 15s, 30s, and 60s."
              value={`${privacyPrefs.inactivityLockSeconds}s`}
              active
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
            />
          </PanelCard>

          <PanelCard
            title="Panic Action"
            subtitle="Immediately relock the vault and return to the calculator disguise."
          >
            <ActionButton label="Panic Relock" onPress={handlePanic} variant="danger" />
          </PanelCard>

          <PanelCard
            title="Decoy Vault"
            subtitle="Open a believable decoy content path that does not use real vault state."
          >
            <ActionButton
              label="Open Decoy Vault"
              onPress={() => {
                recordSecurityEvent({
                  type: "decoy_vault_open",
                  message: "Decoy vault opened.",
                  severity: "info",
                });
                navigation.navigate("DecoyVault");
              }}
              variant="secondary"
            />
          </PanelCard>

          <PanelCard
            title="Tamper Indicators"
            subtitle="Recent signals that deserve a closer look."
          >
            {tamperIndicators.length === 0 ? (
              <Text style={themed($supportText)}>No suspicious recent indicators.</Text>
            ) : (
              <View style={themed($alertStack)}>
                {tamperIndicators.map((warning) => (
                  <AlertRow key={warning} label={warning} />
                ))}
              </View>
            )}
          </PanelCard>

          {/* <PanelCard
            title="Audit Log"
            subtitle="Recent security events in their existing order."
          >
            {auditEvents.length === 0 ? (
              <Text style={themed($supportText)}>No recent security events.</Text>
            ) : (
              <View style={themed($auditList)}>
                {auditEvents.map((event) => (
                  <AuditItem key={event.id} event={event} />
                ))}
              </View>
            )}
          </PanelCard> */}

          {__DEV__ ? (
            <PanelCard title="Developer Controls" subtitle="Development-only safety and testing controls.">
              <ActionButton
                label="Disable Passkey (Dev)"
                onPress={async () => {
                  await disablePasskeyDevOnly();
                  await refreshStatus();
                }}
                variant="secondary"
              />
            </PanelCard>
          ) : null}

          {error ? (
            <PanelCard title="Security Error" subtitle="The last action did not complete successfully." tone="critical">
              <Text style={themed($errorText)}>{error}</Text>
            </PanelCard>
          ) : null}

          {status ? (
            <PanelCard title="Security Status" subtitle="Latest result from the previous action.">
              <Text style={themed($statusText)}>{status}</Text>
            </PanelCard>
          ) : null}
      </Animated.View>
    </Screen>
  );
};

function PanelCard({
  children,
  subtitle,
  title,
  tone = "default",
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
  tone?: "default" | "critical";
}) {
  const { themed } = useAppTheme();

  return (
    <View style={themed([$panel, tone === "critical" && $panelCritical])}>
      <Text preset="bold" style={themed($sectionTitle)}>
        {title}
      </Text>
      {subtitle ? <Text style={themed($sectionSubtitle)}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function MetricTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "accent" | "warning" | "neutral";
}) {
  const { themed } = useAppTheme();

  return (
     <View style={themed([$metricTile,
         tone === "accent" && $chipAccent,
         tone === "warning" && $chipWarning])}>

      <Text style={themed($metricLabel)}>{label}</Text>
      <View style={themed($metricIconWrap)}>{icon}</View>
      <Text preset="bold" style={themed($metricValue)}>
        {value}
      </Text>
    </View>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "accent" | "warning" | "neutral";
}) {
  const { themed } = useAppTheme();

  return (
    <View
      style={themed([
        $chip,
        tone === "accent" && $chipAccent,
        tone === "warning" && $chipWarning,
      ])}
    >
      <Text style={themed($chipText)}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { themed } = useAppTheme();

  return (
    <View style={themed($infoRow)}>
      <Text style={themed($infoLabel)}>{label}</Text>
      <Text style={themed($infoValue)}>{value}</Text>
    </View>
  );
}

function SettingRow({
  active,
  description,
  label,
  onPress,
  value,
}: {
  active: boolean;
  description: string;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const { themed } = useAppTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [themed($settingRow), pressed && themed($settingRowPressed)]}>
      <View style={themed($settingCopy)}>
        <Text preset="bold" style={themed($settingLabel)}>
          {label}
        </Text>
        <Text style={themed($settingDescription)}>{description}</Text>
      </View>
      <View style={themed([active ? $settingPillActive : $settingPill, $settingPillBase])}>
        <Text style={themed(active ? $settingPillTextActive : $settingPillText)}>{value}</Text>
      </View>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  variant: "primary" | "secondary" | "danger";
}) {
  const { themed } = useAppTheme();

  return (
    <Pressable
      onPress={() => void onPress()}
      style={({ pressed }) => [
        themed([
          $actionButton,
          variant === "primary" && $actionButtonPrimary,
          variant === "secondary" && $actionButtonSecondary,
          variant === "danger" && $actionButtonDanger,
        ]),
        pressed && themed($actionButtonPressed),
      ]}
    >
      <Text
        preset="bold"
        style={themed(
          variant === "danger"
            ? $actionButtonTextDanger
            : variant === "primary"
              ? $actionButtonTextPrimary
              : $actionButtonTextSecondary,
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AlertRow({ label }: { label: string }) {
  const { themed, theme } = useAppTheme();

  return (
    <View style={themed($alertRow)}>
      <TriangleAlert size={16} color={theme.colors.accentYellow} />
      <Text style={themed($alertText)}>{label}</Text>
    </View>
  );
}

function SummaryStat({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  const { themed } = useAppTheme();

  return (
    <View style={themed($summaryStat)}>
      <Text style={themed($summaryLabel)}>{label}</Text>
      <Text preset="bold" style={themed(accent ? $summaryValueAccent : $summaryValue)}>
        {value}
      </Text>
    </View>
  );
}

function LegendDot({
  label,
  tone,
}: {
  label: string;
  tone: "muted" | "accent" | "warning";
}) {
  const { themed } = useAppTheme();

  return (
    <View style={themed($legendItem)}>
      <View
        style={themed([
          $legendDot,
          tone === "accent" && $legendDotAccent,
          tone === "warning" && $legendDotWarning,
        ])}
      />
      <Text style={themed($legendText)}>{label}</Text>
    </View>
  );
}

function AuditItem({ event }: { event: SecurityAuditEvent }) {
  const { themed, theme } = useAppTheme();
  const iconColor =
    event.severity === "critical"
      ? theme.colors.error
      : event.severity === "warning"
        ? theme.colors.accentYellow
        : theme.colors.vaultHub.vaultHubAccentPinkSoft;

  return (
    <View style={themed($auditRow)}>
      <View style={themed($auditIconWrap)}>
        {event.severity === "critical" ? (
          <Siren size={16} color={iconColor} />
        ) : event.severity === "warning" ? (
          <TriangleAlert size={16} color={iconColor} />
        ) : (
          <Shield size={16} color={iconColor} />
        )}
      </View>

      <View style={themed($auditCopy)}>
        <Text preset="bold" style={themed($auditTitle)}>
          {event.message}
        </Text>
        <Text style={themed($auditMeta)}>
          {prettyEventType(event.type)} · {formatTimestamp(event.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function prettyEventType(type: SecurityEventType): string {
  return type.replaceAll("_", " ");
}

function buildActivityGrid(events: SecurityAuditEvent[]) {
  const now = Date.now();
  const buckets = Array.from({ length: ACTIVITY_BUCKETS }, () => ({
    score: 0,
    tone: "muted" as "muted" | "accent" | "warning" | "critical",
  }));

  events.forEach((event) => {
    const delta = now - new Date(event.createdAt).getTime();
    if (delta < 0 || delta > ACTIVITY_WINDOW_MS) return;

    const bucketIndex = ACTIVITY_BUCKETS - 1 - Math.floor(delta / (ACTIVITY_WINDOW_MS / ACTIVITY_BUCKETS));
    if (bucketIndex < 0 || bucketIndex >= ACTIVITY_BUCKETS) return;

    const nextScore =
      event.severity === "critical" ? 6 : event.severity === "warning" ? 4 : 2;
    buckets[bucketIndex].score = Math.min(ACTIVITY_ROWS, buckets[bucketIndex].score + nextScore / 2);

    if (event.severity === "critical") {
      buckets[bucketIndex].tone = "critical";
    } else if (event.severity === "warning" && buckets[bucketIndex].tone !== "critical") {
      buckets[bucketIndex].tone = "warning";
    } else if (buckets[bucketIndex].tone === "muted") {
      buckets[bucketIndex].tone = "accent";
    }
  });

  return Array.from({ length: ACTIVITY_ROWS }, (_, rowIndex) => {
    const threshold = ACTIVITY_ROWS - rowIndex;
    return buckets.map((bucket) => ({
      active: bucket.score >= threshold,
      tone: bucket.tone,
    }));
  });
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  // backgroundColor: colors.vaultHub.vaultHubBg,
// paddingBottom: spacing.xl + 40,
});

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.xl * 2,
  gap: spacing.lg,
});

const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $heroEyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.3,
  marginBottom: -15,
});

const $heroTitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,

});

const $heroSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 13,
  lineHeight: 15,
});

const $chipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
});

const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $chipAccent: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderColor: "rgba(255, 154, 219, 0.42)",
});

const $chipWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 214, 90, 0.14)",
  borderColor: colors.accentYellow,
});

const $chipText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $metricRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
});

const $metricTile: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  borderRadius: 22,
  padding: spacing.xs,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  gap: spacing.xxs,
  alignItems: 'center',
});

const $metricIconWrap: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 2,
});

const $metricLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $metricValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 12
});

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
});

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 26,
  padding: spacing.md,
  gap: spacing.md,
  backgroundColor: '#1e1f2c8b',
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  shadowColor: "rgba(0,0,0,0.82)",
  shadowOpacity: 0.34,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 16 },
  elevation: 10,
});

const $panelCritical: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255, 122, 158, 0.28)",
});

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 14,
});

const $sectionSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: -4,
  lineHeight: 19,
  fontSize: 13,
});

const $activityLayout: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
});

const $activityGridWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
});

const $activityRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
});

const $activityCell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  aspectRatio: 1,
  borderRadius: 6,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $activityCellActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vaultHub.vaultHubAccentPink,
  borderColor: "rgba(255, 154, 219, 0.46)",
});

const $activityCellWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.accentYellow,
  borderColor: colors.accentYellow,
});

const $activityCellCritical: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.error,
  borderColor: colors.error,
});

const $activitySummaryColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 108,
  gap: spacing.sm,
});

const $summaryStat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 18,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $summaryLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
});

const $summaryValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  marginTop: 4,
});

const $summaryValueAccent: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.accentYellow,
  marginTop: 4,
});

const $legendRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.md,
});

const $legendItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
});

const $legendDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $legendDotAccent: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "#F5B435",
  borderColor: "#F5B435",
});

const $legendDotWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "#FF7A7A",
  borderColor: "#FF7A7A",
});

const $legendText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $infoRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
  paddingBottom: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(255,255,255,0.05)",
});

const $infoLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 14,
  flex: 1,
});

const $infoValue: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  flex: 1,
  textAlign: "right",
  fontSize: 14,
  fontFamily: typography.primary.medium,
});

const $supportText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  lineHeight: 20,
});

const $textFieldContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
});

const $textFieldWrapper: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 18,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  backgroundColor: "rgba(10, 9, 14, 0.82)",
  paddingHorizontal: spacing.md,
  minHeight: 54,
});

const $textFieldInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 15,
});

const $textFieldLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $buttonStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
});

const $actionButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 22,
  paddingVertical: spacing.sm,
  alignItems: "center",
  justifyContent: "center",
});

const $actionButtonPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vaultHub.vaultHubAccentPink,
});

const $actionButtonSecondary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $actionButtonDanger: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 122, 158, 0.12)",
  borderWidth: 1,
  borderColor: "rgba(255, 122, 158, 0.34)",
});

const $actionButtonPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.986 }],
});

const $actionButtonTextPrimary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
});

const $actionButtonTextSecondary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $actionButtonTextDanger: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
});

const $settingRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(255,255,255,0.05)",
});

const $settingRowPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.88,
});

const $settingCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $settingLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $settingDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: 4,
  fontSize: 12,
  lineHeight: 18,
});

const $settingPillBase: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 76,
  borderRadius: 999,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs + 2,
});

const $settingPill: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $settingPillActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderWidth: 1,
  borderColor: "rgba(255, 154, 219, 0.4)",
});

const $settingPillText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $settingPillTextActive: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $alertStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
});

const $alertRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
  borderRadius: 22,
  padding: spacing.sm,
  backgroundColor: "rgba(255, 214, 90, 0.09)",
  borderWidth: 1,
  borderColor: "rgba(255, 214, 90, 0.18)",
});

const $alertText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  flex: 1,
  lineHeight: 19,
  fontSize: 15
});

const $auditList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
});

const $auditRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  borderRadius: 18,
  padding: spacing.md,
  backgroundColor: "rgba(255,255,255,0.03)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $auditIconWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: 2,
});

const $auditCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $auditTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  lineHeight: 20,
});

const $auditMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
  marginTop: 4,
});

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
});

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});
const $activityPanelContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
})

const $activityChartShellV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $activityChartHeaderV2: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
})

const $activityEyebrowV2: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.textDim ?? "rgba(255,255,255,0.58)",
  fontFamily: typography.primary.medium,
  fontSize: 13,
  letterSpacing: 0.3,
  textTransform: "uppercase",
})

const $activityHintV2: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.textDim ?? "rgba(255,255,255,0.4)",
  fontFamily: typography.primary.normal,
  fontSize: 12,
  marginTop: 4,
})

const $activityChartFrameV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 28,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
  minHeight: 250,
  justifyContent: "center",
  // backgroundColor: "rgba(255,255,255,0.02)",
  // borderWidth: 1,
  // borderColor: "rgba(255,255,255,0.05)",
})

const $activityGridWrapV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "center",
  gap: spacing.xs,
})

const $activityRowV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xs,
})

const $activityCellV2: ThemedStyle<ViewStyle> = () => ({
  width: 20,
  height: 20,
  borderRadius: 2,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
})

const $activityCellActiveV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#F5B435",
  borderColor: "#f5b5357e",
  shadowColor: "#c1a161",
  shadowOpacity: 0.35,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
})

const $activityCellWarningV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#f6976b",
  borderColor: "rgba(246, 181, 107, 0.85)",
  shadowColor: "#f6a56b",
  shadowOpacity: 0.28,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
})

const $activityCellCriticalV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#FF7A7A",
  borderColor: "rgba(255,122,122,0.85)",
  shadowColor: "#FF7A7A",
  shadowOpacity: 0.28,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
})

const $activitySummaryRowV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $summaryStatCardV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  minWidth: 70,
  maxWidth: 75,
  borderRadius: 12,
  paddingHorizontal: spacing.xxs,
  paddingVertical: spacing.xs,
  backgroundColor: "rgba(255,255,255,0.03)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
})

const $summaryStatCardAccentV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(245, 230, 92, 0.06)",
  borderColor: "rgba(245, 230, 92, 0.16)",
})

const $summaryStatLabelV2: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.textDim ?? "rgba(255,255,255,0.52)",
  fontFamily: typography.primary.normal,
  fontSize: 12,
  marginBottom: 2,
  height: 50,
})

const $summaryStatValueV2: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.text ?? "#FFFFFF",
  fontFamily: typography.primary.bold,
  fontSize: 20,
  // textAlignVertical: 'bottom',
  lineHeight: 36,
})

const $summaryStatValueAccentV2: ThemedStyle<TextStyle> = ({ typography }) => ({
  color: "#F6DC6B",
  fontFamily: typography.primary.bold,
  fontSize: 20,
  lineHeight: 36,
})

const $legendRowV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.md,
  paddingTop: spacing.xs,
})