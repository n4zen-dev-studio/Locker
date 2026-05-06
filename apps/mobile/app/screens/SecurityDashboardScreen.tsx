import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  InteractionManager,
  Pressable,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
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
import { BlobGlassButton } from "@/components/BlobGlassButton";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  Rect,
  RadialGradient,
  LinearGradient as SvgLinearGradient,
  Stop,
  Circle,
  Path,
  G,
  Line,
} from "react-native-svg"
import { useSessionIntroAnimation } from "@/utils/useSessionIntroAnimation";
import { useSafeAreaInsets } from "react-native-safe-area-context";


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
  const $insets = useSafeAreaInsetsStyle(["top"]);
  const isFocused = useIsFocused();

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
  const shouldAnimateIntro = useSessionIntroAnimation("security-dashboard-intro", !reducedMotion);


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
      const task = InteractionManager.runAfterInteractions(() => {
        void refreshStatus();
      });

      return () => task.cancel();
    }, [refreshStatus]),
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    const unsub = subscribeTrust(() => setTrust(getTrustSnapshot()));
    const timer = setInterval(() => {
      setSyncStatus(getSyncStatus());
      setTrust(getTrustSnapshot());
    }, 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [isFocused]);

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
  }, []);

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
      backgroundColor={theme.colors.vaultHub.vaultHubBg}
      keyboardAware={false}
      keyboardAvoidingEnabled={false}
      style={themed($screen)}
      contentContainerStyle={themed([$content, $insets, { paddingBottom:  105 + useSafeAreaInsets().bottom   }])}
      systemBarStyle="light"
    >
      <VaultHubBackground reducedMotion={reducedMotion} />
      <Animated.View
        entering={
          reducedMotion || !shouldAnimateIntro
            ? undefined
            : FadeInDown.duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
        style={themed($hero)}
      >
        {/* <Text size="xs" style={themed($heroEyebrow)}>
          Security
        </Text> */}

        <View style={themed($heroTopRow)}>
                      <Text size="xs" style={themed($heroEyebrow)}>
                        Settings
                      </Text>
        
                    <View style={themed($heroStatusPill)}>
                      <Text style={themed($heroStatusText)}>Vault Security</Text>
                    </View>
                  </View>
        {/* <Text preset="heading" style={themed($heroTitle)}>
          Security Center
        </Text> */}

          <Text preset="heading" style={themed($heroTitle)}>
                    Security Center
                  </Text>
        
                  <Text style={themed($heroSubtitle)}>
                    Activity and Security Overview.
                  </Text>

        
        {/* <Text style={themed($heroSubtitle)}>
          Trust state, recovery health, recent security activity, and protective controls for the vault.
        </Text> */}

        {/* <View style={themed($chipRow)}>
          {heroChips.map((chip) => (
            <StatusChip key={chip.label} label={chip.label} tone={chip.tone} />
          ))}
        </View> */}

        {/* <View style={themed($metricRow)}>
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
        </View> */}
      </Animated.View>

      <Animated.View
        entering={
          reducedMotion || !shouldAnimateIntro
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
    <Text style={themed($activityHintV2)}>Last recorded audit windows</Text>

    {/* <View style={themed($activityChartHeaderV2)}>
      <View>
        <Text style={themed($activityEyebrowV2)}>Security movement</Text>
        <Text style={themed($activityHintV2)}>Last recorded audit windows</Text>
      </View>
    </View> */}

    <View style={themed($activitySummaryRowV2)}>
    <SummaryStatV2 label="Unlocks" value={String(activitySummary.unlocks)} />
    <SummaryStatV2 label="Auto-locks" value={String(activitySummary.autoLocks)} />
    <SummaryStatV2 label="Step-up / Trust" value={String(activitySummary.elevated)} />
    <SummaryStatV2 label="Alerts" value={String(activitySummary.alerts)} accent />
  </View>

    <View style={themed($activityChartFrameV2)}>
  <View style={themed($activityGridWrapV2)}>
    {activityGrid.map((row, rowIndex) => (
      <View key={`row-${rowIndex}`} style={themed($activityRowV2)}>
        {row.map((cell, cellIndex) => (
          <GlassActivityCell
            key={`cell-${rowIndex}-${cellIndex}`}
            cell={cell}
            themed={themed}
          />
        ))}
      </View>
    ))}
  </View>
</View>
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
          reducedMotion || !shouldAnimateIntro
            ? undefined
            : FadeInUp.delay(80).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
        style={themed($stack)}
      >
          <View style={themed($stack)}>

             <AccordionSection
    title="Auto-lock & Privacy"
    defaultOpen
    subtitle="Session hardening"
    icon={<Shield size={16} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
    rightValue="3 controls"
    tone="neutral"
  >
    <View style={themed($toggleCardGrid)}>
      <CompactToggleCard
        label="Lock on Background"
        value={privacyPrefs.lockOnBackground ? "On" : "Off"}
        active={privacyPrefs.lockOnBackground}
        onPress={() =>
          handlePrivacyToggle({ lockOnBackground: !privacyPrefs.lockOnBackground })
        }
      />

      <CompactToggleCard
        label="Hide Previews"
        value={privacyPrefs.hideSensitivePreviews ? "On" : "Off"}
        active={privacyPrefs.hideSensitivePreviews}
        onPress={() =>
          handlePrivacyToggle({
            hideSensitivePreviews: !privacyPrefs.hideSensitivePreviews,
          })
        }
      />

      <CompactToggleCard
        label="Inactivity Lock"
        value={`${privacyPrefs.inactivityLockSeconds}s`}
        active
        full
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
    </View>
  </AccordionSection>
  <AccordionSection
    title="Security Overview"
    subtitle="Protection posture"
    // defaultOpen
    icon={<Shield size={16} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
    rightValue={overviewWarnings.length > 0 ? `${overviewWarnings.length} warnings` : "Healthy"}
    // tone={overviewWarnings.length > 0 ? "warning" : "neutral"}
  >
    <View style={themed($overviewGrid)}>
      <CompactInfoPill label="Passkey" value={passkeyReady ? "Enabled" : "Off"} />
      <CompactInfoPill label="Recovery" value={recovery.configured ? "Ready" : "Missing"} />
      <CompactInfoPill label="Sync" value={syncStatus.state} />
      <CompactInfoPill
        label="Auto-lock"
        value={
          privacyPrefs.lockOnBackground
            ? "Background"
            : `${privacyPrefs.inactivityLockSeconds}s`
        }
      />
      <CompactInfoPill label="Trust" value={trust.state} />
      <CompactInfoPill label="Vault Meta" value={metaVersion ? `v${metaVersion}` : "n/a"} />
      <CompactInfoPill label="Last Unlock" value={formatTimestamp(trust.lastUnlockAt)} full />
    </View>

    {overviewWarnings.length > 0 ? (
      <View style={themed($compactAlertWrap)}>
        {overviewWarnings.map((warning) => (
          <CompactWarningChip key={warning} label={warning} />
        ))}
      </View>
    ) : (
      <Text style={themed($sectionFootnote)}>No active warnings.</Text>
    )}
  </AccordionSection>

  <AccordionSection
    title="Session Trust"
    subtitle="Step-up authentication"
    icon={<KeyRound size={16} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
    rightValue={trust.state}
    tone={trust.state === "elevated" ? "accent" : "neutral"}
  >
    <View style={themed($compactMetricRow)}>
      <CompactInfoPill label="State" value={trust.state} />
      <CompactInfoPill label="Elevated Until" value={formatTimestamp(trust.elevatedUntil)} />
    </View>

    <View style={themed($singleActionRow)}>
      <ActionButton label="Elevate Session" onPress={handleElevate} variant="primary" />
    </View>

    <Text style={themed($sectionFootnote)}>
      Sensitive actions such as backup changes and recovery require step-up.
    </Text>
  </AccordionSection>

  {/* <AccordionSection
    title="Recovery & Backup"
    subtitle="Restore access if device keys are lost"
    icon={<Clock3 size={16} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
    rightValue={recovery.configured ? "Configured" : "Not set"}
    tone={recovery.configured ? "accent" : "warning"}
  >
    <View style={themed($compactMetricRow)}>
      <CompactInfoPill label="Configured" value={recovery.configured ? "Yes" : "No"} />
      <CompactInfoPill label="Updated" value={formatTimestamp(recovery.updatedAt)}  />
    </View>

    <View style={themed($recoveryInputShell)}>
      <TextField
        label="Recovery Passphrase"
        placeholder="Enter recovery passphrase"
        secureTextEntry
        value={passphrase}
        onChangeText={setPassphrase}
        containerStyle={themed($textFieldContainerCompact)}
        inputWrapperStyle={themed($textFieldWrapperCompact)}
        style={themed($textFieldInputCompact)}
        LabelTextProps={{ style: themed($textFieldLabelCompact) }}
      />
    </View>

    <View style={themed($actionGrid)}>
      <ActionButton label="Save Backup" onPress={handleSetBackup} variant="primary" />
      <ActionButton label="Recover Keys" onPress={handleRecover} variant="secondary" />
      <ActionButton label="Remove" onPress={handleDeleteBackup} variant="danger" />
    </View>
  </AccordionSection> */}

 
</View>

          <View style={themed($securityTileGrid)}>
  <SecurityTileCard
    title="Panic Action"
    subtitle="Immediately relock the vault and return to the calculator disguise."
    tone="critical"
    icon="warning-outline"
  >
    <ActionButton label="Panic Relock" onPress={handlePanic} variant="danger" />
  </SecurityTileCard>

  {/* <SecurityTileCard
    title="Decoy Vault"
    subtitle="Open a believable decoy content path that does not use real vault state."
    tone="accent"
    icon="lock-open-outline"
  >
    <ActionButton
      label="Open Decoy Vault"
      onPress={() => {
        recordSecurityEvent({
          type: "decoy_vault_open",
          message: "Decoy vault opened.",
          severity: "info",
        })
        navigation.navigate("DecoyVault")
      }}
      variant="secondary"
    />
  </SecurityTileCard> */}

  <SecurityTileCard
    title="Tamper Indicators"
    subtitle="Recent signals that deserve a closer look."
    tone="accent"
    icon="pulse-outline"
  >
    {tamperIndicators.length === 0 ? (
      <Text style={themed($securityTileBodyText)}>No suspicious recent indicators.</Text>
    ) : (
      <View style={themed($securityTileAlertStack)}>
        {tamperIndicators.map((warning) => (
          <AlertRow key={warning} label={warning} />
        ))}
      </View>
    )}
  </SecurityTileCard>

  {__DEV__ ? (
    <SecurityTileCard
      title="Developer Controls"
      subtitle="Development-only safety and testing controls."
      tone="violet"
      icon="settings-outline"
    >
      <ActionButton
        label="Disable Passkey (Dev)"
        onPress={async () => {
          await disablePasskeyDevOnly()
          await refreshStatus()
        }}
        variant="secondary"
      />
    </SecurityTileCard>
  ) : null}

  {error ? (
    <SecurityTileCard
      title="Security Error"
      subtitle="The last action did not complete successfully."
      tone="critical"
      icon="alert-outline"
    >
      <Text style={themed($securityTileErrorText)}>{error}</Text>
    </SecurityTileCard>
  ) : null}

  {status ? (
    <SecurityTileCard
      title="Security Status"
      subtitle="Latest result from the previous action."
      tone="violet"
      icon="information"
    >
      <Text style={themed($securityTileStatusText)}>{status}</Text>
    </SecurityTileCard>
  ) : null}
</View>
      </Animated.View>
    </Screen>
  );
};

function PanelCard({
  children,
  contentContainerStyle,
  subtitle,
  title,
  tone = "default",
}: {
  children: ReactNode;
  contentContainerStyle?: ViewStyle;
  subtitle?: string;
  title: string;
  tone?: "default" | "critical";
}) {
  const { themed } = useAppTheme();

  return (
    <View style={themed([$panel, tone === "critical" && $panelCritical, contentContainerStyle])}>
      <Text preset="bold" style={themed($sectionTitle)}>
        {title}
      </Text>
      {subtitle ? <Text style={themed($sectionSubtitle)}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}


function AccordionSection({
  children,
  defaultOpen = false,
  icon,
  rightValue,
  subtitle,
  title,
  tone = "neutral",
}: {
  children: ReactNode
  defaultOpen?: boolean
  icon?: ReactNode
  rightValue?: string
  subtitle?: string
  title: string
  tone?: "neutral" | "accent" | "warning"
}) {
  const { themed } = useAppTheme()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <View
      style={themed([
        $accordionCard,
        tone === "accent" && $accordionCardAccent,
        tone === "warning" && $accordionCardWarning,
      ])}
    >
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [themed($accordionHeader), pressed && themed($accordionHeaderPressed)]}
      >
        <View style={themed($accordionHeaderLeft)}>
          {icon ? <View style={themed($accordionIconWrap)}>{icon}</View> : null}
          <View style={themed($accordionTitleWrap)}>
            <Text preset="bold" style={themed($accordionTitle)}>
              {title}
            </Text>
            {subtitle ? <Text style={themed($accordionSubtitle)}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={themed($accordionHeaderRight)}>
          {rightValue ? <Text style={themed($accordionRightValue)}>{rightValue}</Text> : null}
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color="#FFFFFF"
          />
        </View>
      </Pressable>

      {open ? <View style={themed($accordionBody)}>{children}</View> : null}
    </View>
  )
}

function CompactInfoPill({
  label,
  value,
  full = false,
}: {
  label: string
  value: string
  full?: boolean
}) {
  const { themed } = useAppTheme()

  return (
    <View style={themed([$compactInfoPill, full && $compactInfoPillFull])}>
      <Text style={themed($compactInfoLabel)}>{label}</Text>
      <Text numberOfLines={1} style={themed($compactInfoValue)}>
        {value}
      </Text>
    </View>
  )
}

function CompactWarningChip({ label }: { label: string }) {
  const { themed, theme } = useAppTheme()

  return (
    <View style={themed($compactWarningChip)}>
      <TriangleAlert size={13} color={theme.colors.accentYellow} />
      <Text style={themed($compactWarningText)}>{label}</Text>
    </View>
  )
}

function CompactToggleCard({
  active,
  full = false,
  label,
  onPress,
  value,
}: {
  active: boolean
  full?: boolean
  label: string
  onPress: () => void
  value: string
}) {
  const { themed } = useAppTheme()

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        themed([
          $compactToggleCard,
          active && $compactToggleCardActive,
          full && $compactToggleCardFull,
        ]),
        pressed && themed($compactToggleCardPressed),
      ]}
    >
      <View style={themed($compactToggleTopRow)}>
        <Text preset="bold" style={themed($compactToggleLabel)}>
          {label}
        </Text>
        <View style={themed([active ? $compactToggleBadgeActive : $compactToggleBadge, $compactToggleBadgeBase])}>
          <Text style={themed(active ? $compactToggleBadgeTextActive : $compactToggleBadgeText)}>
            {value}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

function SecurityTileTint({
  tone = "default",
}: {
  tone?: "default" | "critical" | "accent" | "violet" | "blue" | "green"
}) {
  const palette = {
    default: {
      edgeA: "#4d62ffe5",
      edgeB: "#27137873",
      edgeC: "#223aa58e",
      line: "rgba(37, 59, 146, 0.55)",
    },
    critical: {
      edgeA: "#ff5a4e74",
      edgeB: "#530f2679",
      edgeC: "#9a123b6b",
      line: "rgba(255,210,210,0.52)",
    },
    accent: {
      edgeA: "#d177b0",
      edgeB: "#af2766",
      edgeC: "#842156",
      line: "rgba(235,216,255,0.55)",
    },
    violet: {
      edgeA: "#9924689b",
      edgeB: "#491568",
      edgeC: "#6A1598",
      line: "rgba(255,210,238,0.55)",
    },
    blue: {
      edgeA: "#14a5ff72",
      edgeB: "#203e5f89",
      edgeC: "#0b45b882",
      line: "rgba(208,236,255,0.52)",
    },
    green: {
      edgeA: "#80d63a8f",
      edgeB: "#1f5631",
      edgeC: "#1D6E18",
      line: "rgba(230,255,204,0.52)",
    },
  }[tone]

  return (
    <Svg
      pointerEvents="none"
      width="102%"
      height="110%"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
      style={{flex:1, position: "absolute", top: 0, left: 0 }}
    >
      <Defs>
        {/* top-left edge wash */}
        <RadialGradient id={`tl-${tone}`} cx="0%" cy="0%" r="95%">
          <Stop offset="0%" stopColor={palette.edgeA} stopOpacity="0.95" />
          <Stop offset="38%" stopColor={palette.edgeB} stopOpacity="0.35" />
          <Stop offset="70%" stopColor={palette.edgeC} stopOpacity="0.10" />
          <Stop offset="100%" stopColor={palette.edgeC} stopOpacity="0" />
        </RadialGradient>

        {/* top-right edge wash */}
        <RadialGradient id={`tr-${tone}`} cx="100%" cy="0%" r="95%">
          <Stop offset="0%" stopColor={palette.edgeB} stopOpacity="0.78" />
          <Stop offset="40%" stopColor={palette.edgeA} stopOpacity="0.24" />
          <Stop offset="75%" stopColor={palette.edgeC} stopOpacity="0.08" />
          <Stop offset="100%" stopColor={palette.edgeC} stopOpacity="0" />
        </RadialGradient>

        {/* bottom-left edge wash */}
        <RadialGradient id={`bl-${tone}`} cx="0%" cy="100%" r="95%">
          <Stop offset="0%" stopColor={palette.edgeC} stopOpacity="0.55" />
          <Stop offset="42%" stopColor={palette.edgeB} stopOpacity="0.20" />
          <Stop offset="100%" stopColor={palette.edgeA} stopOpacity="0" />
        </RadialGradient>

        {/* bottom-right edge wash */}
        <RadialGradient id={`br-${tone}`} cx="100%" cy="100%" r="95%">
          <Stop offset="0%" stopColor={palette.edgeA} stopOpacity="0.42" />
          <Stop offset="36%" stopColor={palette.edgeB} stopOpacity="0.18" />
          <Stop offset="100%" stopColor={palette.edgeC} stopOpacity="0" />
        </RadialGradient>

        {/* darker center veil */}
        <RadialGradient id={`center-dark-${tone}`} cx="50%" cy="52%" r="44%">
          <Stop offset="0%" stopColor="#030714" stopOpacity="0.78" />
          <Stop offset="55%" stopColor="#050A1C" stopOpacity="0.42" />
          <Stop offset="100%" stopColor="#071021" stopOpacity="0" />
        </RadialGradient>

        <SvgLinearGradient id={`sheen-${tone}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.08" />
          <Stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.02" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>

      <Rect x="0" y="0" width="100" height="100" fill={`url(#tl-${tone})`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#tr-${tone})`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#bl-${tone})`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#br-${tone})`} />

      {/* darken the center */}
      <Circle cx="50" cy="52" r="30" fill={`url(#center-dark-${tone})`} />

      {/* slight glass sheen */}
      <Rect x="0" y="0" width="100" height="100" fill={`url(#sheen-${tone})`} />
    </Svg>
  )
}

function SecurityTileCard({
  children,
  subtitle,
  title,
  tone = "default",
  icon,
}: {
  children: ReactNode
  subtitle?: string
  title: string
  tone?: "default" | "critical" | "accent" | "violet" | "blue" | "green"
  icon?: keyof typeof Ionicons.glyphMap
}) {
  const { themed } = useAppTheme()

  const gradientByTone = {
    default: ["rgba(112, 45, 134, 0.98)", "rgba(5,8,22,1)"],
    critical: ["rgba(202, 25, 55, 0.61)", "rgb(16, 5, 9)"],
    accent: ["rgba(213, 63, 175, 0.98)", "rgba(7,5,18,1)"],
    violet: ["rgba(141, 12, 131, 0.96)", "rgba(7,5,18,1)"],
    blue: ["rgb(56, 92, 219)", "rgba(4,7,18,1)"],
    green: ["rgba(58, 184, 148, 0.98)", "rgba(5,9,14,1)"],
  } as const

  return (
    <View style={themed($securityTileOuter)}>
      <LinearGradient
        colors={gradientByTone[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 0.4 }}
        style={themed($securityTileGradient)}
      >
        {/* <SecurityTileTint tone={tone} /> */}
{icon ? (
  <Ionicons
    name={icon}
    size={52}
    style={themed($securityTileIcon)}
  />
) : null}       
 <View style={themed($securityTileGlassVeil)} />

        <View style={themed($securityTileInner)}>
          <View style={themed($securityTileTextWrap)}>
            <Text preset="bold" style={themed($securityTileTitle)} numberOfLines={2}>
              {title}
            </Text>

            {subtitle ? (
              <Text style={themed($securityTileSubtitle)} numberOfLines={4}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={themed($securityTileFooter)}>{children}</View>
        </View>
      </LinearGradient>
    </View>
  )
}


function GlassActivityCell({
  cell,
  themed,
}: {
  cell: { active: boolean; tone: "muted" | "accent" | "warning" | "critical" }
  themed: <T>(style: T) => T
}) {
  const pulse = useSharedValue(cell.active ? 0 : 0)

  useEffect(() => {
    if (cell.active) {
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      )
    } else {
      pulse.value = withTiming(0, { duration: 180 })
    }
  }, [cell.active, pulse])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: cell.active ? 0.14 + pulse.value * 0.1 : 0,
    transform: [{ scale: cell.active ? 0.96 + pulse.value * 0.06 : 1 }],
  }))

  return (
    <View
      style={themed([
        $activityCellV2,
        cell.active && $activityCellActiveV2,
        cell.tone === "warning" && $activityCellWarningV2,
        cell.tone === "critical" && $activityCellCriticalV2,
      ])}
    >
      <View pointerEvents="none" style={styles.cellTint} />
      <View pointerEvents="none" style={styles.cellSheen} />
      <Animated.View pointerEvents="none" style={[styles.cellGlow, glowStyle]} />
      <View pointerEvents="none" style={styles.cellInnerBorder} />
    </View>
  )
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
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
  paddingBottom: spacing.xl,
  gap: spacing.md,
})

const $hero: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  // gap: spacing.sm,
})

const $heroTopRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
})

const $heroBadge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $heroStatusPill: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "rgba(255, 77, 186, 0.12)",
  borderWidth: 1,
  borderColor: "rgba(255, 154, 219, 0.28)",
})

const $heroStatusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 11,
  fontWeight: "600",
})

const $heroEyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.2,
})

const $heroTitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 32,
  marginTop: -5,
  // lineHeight: 4,
})

const $heroSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
  lineHeight: 22,
})


const $chipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs + 1,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $chipAccent: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderColor: "rgba(255, 154, 219, 0.42)",
})

const $chipWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 214, 90, 0.14)",
  borderColor: colors.accentYellow,
})

const $chipText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
})

const $metricRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})

const $metricTile: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  borderRadius: 24,
  padding: spacing.xxs,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  alignItems: "center",
})

const $metricIconWrap: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 2,
})

const $metricLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
})

const $metricValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 12,
})

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 22,
  padding: spacing.sm,
  gap: spacing.sm,
  backgroundColor: "rgba(12, 12, 24, 0.65)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  shadowColor: "rgba(0,0,0,0.82)",
  shadowOpacity: 0.34,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
})

const $panelCritical: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255, 122, 158, 0.28)",
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 14,
})

const $sectionSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: -4,
  lineHeight: 19,
  fontSize: 13,
})

const $activityLayout: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
})

const $activityGridWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
})

const $activityRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})

const $activityCell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  aspectRatio: 1,
  borderRadius: 6,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $activityCellActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vaultHub.vaultHubAccentPink,
  borderColor: "rgba(255, 154, 219, 0.46)",
})

const $activityCellWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.accentYellow,
  borderColor: colors.accentYellow,
})

const $activityCellCritical: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.error,
  borderColor: colors.error,
})

const $activitySummaryColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 108,
  gap: spacing.sm,
})

const $summaryStat: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 18,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $summaryLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
})

const $summaryValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  marginTop: 4,
})

const $summaryValueAccent: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.accentYellow,
  marginTop: 4,
})

const $legendRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.md,
})

const $legendItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $legendDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $legendDotAccent: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "#fa80d489",
  borderColor: "#f535c8",
})

const $legendDotWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "#FF7A7A",
  borderColor: "#FF7A7A",
})

const $legendText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
})

const $infoRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.md,
  paddingBottom: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(255,255,255,0.05)",
})

const $infoLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 14,
  flex: 1,
})

const $infoValue: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  flex: 1,
  textAlign: "right",
  fontSize: 14,
  fontFamily: typography.primary.medium,
})

const $supportText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  lineHeight: 20,
})

const $textFieldContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
})

const $textFieldWrapper: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 18,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  backgroundColor: "rgba(10, 9, 14, 0.82)",
  paddingHorizontal: spacing.md,
  minHeight: 54,
})

const $textFieldInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 15,
})

const $textFieldLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
})

const $buttonStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $actionButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 22,
  paddingVertical: spacing.xs,
  alignItems: "center",
  justifyContent: "center",
})

const $actionButtonPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "#7a366af1",
})

const $actionButtonSecondary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $actionButtonDanger: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 122, 158, 0.12)",
  borderWidth: 1,
  borderColor: "rgba(255, 122, 158, 0.34)",
})

const $actionButtonPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.986 }],
})

const $actionButtonTextPrimary: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.semiBold,
  fontSize: 14,
})

const $actionButtonTextSecondary: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.semiBold,
  fontSize: 14,
})

const $actionButtonTextDanger: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.error,
  fontFamily: typography.primary.semiBold,
  fontSize: 14,
})

const $settingRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(255,255,255,0.05)",
})

const $settingRowPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.88,
})

const $settingCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $settingLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
})

const $settingDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: 4,
  fontSize: 12,
  lineHeight: 18,
})

const $settingPillBase: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 76,
  borderRadius: 999,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs + 2,
})

const $settingPill: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $settingPillActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderWidth: 1,
  borderColor: "rgba(255, 154, 219, 0.4)",
})

const $settingPillText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
})

const $settingPillTextActive: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
})

const $alertStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $alertRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
  borderRadius: 22,
  padding: spacing.sm,
  backgroundColor: "rgba(255, 214, 90, 0.09)",
  borderWidth: 1,
  borderColor: "rgba(255, 214, 90, 0.18)",
})

const $alertText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  flex: 1,
  lineHeight: 19,
  fontSize: 15,
})

const $auditList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $auditRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  borderRadius: 18,
  padding: spacing.md,
  backgroundColor: "rgba(255,255,255,0.03)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $auditIconWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: 2,
})

const $auditCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $auditTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  lineHeight: 20,
})

const $auditMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: 2,
  fontSize: 12,
  lineHeight: 16,
})

const $securityTileGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  marginHorizontal: -6,
  marginTop: spacing.sm,
  alignItems: "stretch",
})

const $securityTileOuter: ThemedStyle<ViewStyle> = () => ({
  width: "50%",
  paddingHorizontal: 6,
  marginBottom: 8,
})

const $securityTileGlow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: 130,
  height: 130,
  borderRadius: 999,
  top: -26,
  right: -24,
  opacity: 1,
})

const $securityTileAlertStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $securityTileGlassVeil: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(255,255,255,0.02)",
})

const $securityTileTitle: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  lineHeight: 16,
  color: "#F8FAFF",
  marginBottom: 5,
  letterSpacing: -0.2,
})

const $securityTileSubtitle: ThemedStyle<TextStyle> = () => ({
  fontSize: 10.5,
  lineHeight: 14,
  color: "rgba(235,240,255,0.66)",
  maxWidth: "78%",
})

const $securityTileBodyText: ThemedStyle<TextStyle> = () => ({
  fontSize: 11,
  lineHeight: 15,
  color: "rgba(243,246,255,0.76)",
})

const $securityTileErrorText: ThemedStyle<TextStyle> = () => ({
  fontSize: 11,
  lineHeight: 15,
  color: "rgba(255,198,205,0.82)",
})

const $securityTileStatusText: ThemedStyle<TextStyle> = () => ({
  fontSize: 11,
  lineHeight: 15,
  color: "rgba(243,247,255,0.82)",
})

const $securityTileGradient: ThemedStyle<ViewStyle> = () => ({
  minHeight: 168,
  borderRadius: 22,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.07)",
  shadowColor: "#000",
  shadowOpacity: 0.26,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
})

const $securityTileInner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minHeight: 168,
  paddingHorizontal: 12,
  paddingTop: 10,
  paddingBottom: 10,
  justifyContent: "space-between",
})

const $securityTileTextWrap: ThemedStyle<ViewStyle> = () => ({
  paddingRight: 8,
  zIndex: 2,
})

const $securityTileFooter: ThemedStyle<ViewStyle> = () => ({
  marginTop: 8,
  zIndex: 2,
})

const $securityTileIcon: ThemedStyle<TextStyle> = () => ({
  position: "absolute",
  alignSelf: "center",
  top: "32%",
  opacity: 0.12,
  color: "#FFFFFF",
  zIndex: 1,
})

const $accordionCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 20,
  padding: spacing.sm,
  backgroundColor: "rgba(12, 12, 24, 0.56)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  gap: spacing.xs,
})

const $accordionCardAccent: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255, 154, 219, 0.22)",
})

const $accordionCardWarning: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: "rgba(221, 215, 125, 0.56)",
})

const $accordionHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.sm,
})

const $accordionHeaderPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.92,
})

const $accordionHeaderLeft: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $accordionIconWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 34,
  height: 34,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $accordionTitleWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $accordionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 13,
  lineHeight: 16,
})

const $accordionSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
  lineHeight: 14,
  marginTop: 2,
})

const $accordionHeaderRight: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $accordionRightValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
})

const $accordionBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  paddingTop: spacing.xs,
})

const $overviewGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $compactMetricRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $compactInfoPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "48.8%",
  minHeight: 54,
  borderRadius: 16,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  justifyContent: "center",
})

const $compactInfoPillFull: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $compactInfoLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 10.5,
  marginBottom: 3,
})

const $compactInfoValue: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
})

const $compactAlertWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $compactWarningChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  borderRadius: 14,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  backgroundColor: "rgba(255, 214, 90, 0.08)",
  borderWidth: 1,
  borderColor: "rgba(255, 214, 90, 0.14)",
})

const $compactWarningText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontSize: 11,
  flex: 1,
})

const $singleActionRow: ThemedStyle<ViewStyle> = () => ({
  marginTop: 2,
})

const $sectionFootnote: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
  lineHeight: 16,
})

const $recoveryInputShell: ThemedStyle<ViewStyle> = () => ({
  marginTop: 2,
})

const $textFieldContainerCompact: ThemedStyle<ViewStyle> = () => ({
  marginTop: 0,
})

const $textFieldWrapperCompact: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 16,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  backgroundColor: "rgba(10, 9, 14, 0.82)",
  paddingHorizontal: spacing.sm,
  minHeight: 48,
})

const $textFieldInputCompact: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 13,
})

const $textFieldLabelCompact: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontFamily: typography.primary.medium,
  fontSize: 11,
})

const $actionGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $toggleCardGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $compactToggleCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "31%",
  minHeight: 60,
  borderRadius: 16,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  justifyContent: "center",
})

const $compactToggleCardFull: ThemedStyle<ViewStyle> = () => ({
  width: "31%",
})

const $compactToggleCardActive: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.08)",
  borderColor: "rgba(255, 154, 219, 0.24)",
})

const $compactToggleCardPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.92,
})

const $compactToggleTopRow: ThemedStyle<ViewStyle> = () => ({
  gap: 6,
})

const $compactToggleLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 12,
})

const $compactToggleBadgeBase: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 5,
})

const $compactToggleBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $compactToggleBadgeActive: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderWidth: 1,
  borderColor: "rgba(255, 154, 219, 0.4)",
})

const $compactToggleBadgeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  fontSize: 11,
})

const $compactToggleBadgeTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 11,
})

const $activityPanelContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $activityChartShellV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $activityHintV2: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
  marginTop: -10,
  lineHeight: 14,
})

const $activityChartFrameV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 16,
  alignItems: 'center',
  padding: spacing.xs,
  backgroundColor: "rgba(255,255,255,0.025)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
})

const $activityGridWrapV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
})

const $activityRowV2: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xxs,
})

const $activityCellV2: ThemedStyle<ViewStyle> = () => ({
  width: 20,
  height: 20,
  borderRadius: 2,
  overflow: 'hidden',
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
})

const $activityCellActiveV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#f535cfa2",
  borderColor: "#f535927e",
  shadowColor: "#c161a4",
  shadowOpacity: 0.35,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
})

const $activityCellWarningV2: ThemedStyle<ViewStyle> = () => ({
  shadowColor: "#8b2860",
  backgroundColor: "rgba(255, 77, 187, 0.4)",
  borderColor: "rgba(255, 154, 219, 0.24)",
  shadowOpacity: 0.28,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
})

const $activityCellCriticalV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "#ff7a7a9d",
  borderColor: "rgba(255,122,122,0.85)",
  shadowColor: "#ff7ae07e",
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
  minWidth: '22.5%',
  maxWidth: 75,
  borderRadius: 12,
  paddingHorizontal: spacing.xxs,
  paddingVertical: spacing.xs,
  backgroundColor: "rgba(255,255,255,0.03)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.05)",
})

const $summaryStatCardAccentV2: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(245, 92, 184, 0.06)",
  borderColor: "rgba(245, 92, 214, 0.16)",
})

const $summaryStatLabelV2: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.textDim ?? "rgba(255,255,255,0.52)",
  fontFamily: typography.primary.normal,
  fontSize: 12,
  lineHeight: 20,
  marginBottom: 2,
  height: 45,
})

const $summaryStatValueV2: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.text ?? "#FFFFFF",
  fontFamily: typography.primary.bold,
  fontSize: 20,
  lineHeight: 36,
})

const $summaryStatValueAccentV2: ThemedStyle<TextStyle> = ({ typography }) => ({
  color: "#f66bbe",
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


const styles = StyleSheet.create({
  cellTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderRadius: 2,
  },

  cellSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "80%",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  cellGlow: {
    position: "absolute",
    top: "24%",
    left: "24%",
    width: "80%",
    height: "80%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  cellInnerBorder: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 1.5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.035)",
  },
})
