import { FC, ReactNode } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import Animated, { Easing, FadeInDown, FadeInUp } from "react-native-reanimated"
import {
  ChevronRight,
  Cloud,
  Fingerprint,
  KeyRound,
  Link2,
  RotateCcw,
  Server,
  ShieldAlert,
  Stethoscope,
} from "lucide-react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { VaultHubBackground } from "@/components/VaultHubBackground"
import { resetDeviceLocally } from "@/locker/device/deviceLocalReset"
import { resetSetupOnboardingState } from "@/locker/storage/onboardingRepo"
import type { SettingsStackScreenProps } from "@/navigators/navigationTypes"
import { resetRoot } from "@/navigators/navigationUtilities"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { spacing } from "@/theme/spacing"
import { useSessionIntroAnimation } from "@/utils/useSessionIntroAnimation"

export const SettingsHomeScreen: FC<SettingsStackScreenProps<"SettingsHome">> =
  function SettingsHomeScreen(props) {
    const { navigation } = props
    const { themed, theme } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top"])
    const shouldAnimateIntro = useSessionIntroAnimation("settings-home-intro")

    const handleReplayOnboarding = () => {
      Alert.alert(
        "Reset setup gate",
        "This will require setup selection again on the next unlock without clearing vault data.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reset",
            onPress: () => {
              resetSetupOnboardingState()
              navigation.navigate("VaultSelection")
            },
          },
        ],
      )
    }

    const handleLogout = () => {
      Alert.alert(
        "Log out on this device?",
        "This clears passkey setup, linked account state, local vault keys, cached vault data, and sync state on this device only. Your Locker account and remote vaults stay intact.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Log out",
            style: "destructive",
            onPress: () => {
              void resetDeviceLocally().then(() => {
                resetRoot({ index: 0, routes: [{ name: "Calculator" }] })
              })
            },
          },
        ],
      )
    }

    return (
      <Screen
        preset="scroll"
        backgroundColor={theme.colors.vaultHub.vaultHubBg}
        keyboardAware={false}
        keyboardAvoidingEnabled={false}
        style={themed($screen)}
        contentContainerStyle={themed([$content, $insets, { paddingBottom: spacing.xxxl + 28 }])}
        systemBarStyle="light"
      >
        {/* <VaultHubBackground /> */}

        <Animated.View
          entering={
            shouldAnimateIntro
              ? FadeInDown.duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
              : undefined
          }
          // style={themed($hero)}
        >
                <VaultHubBackground reducedMotion={true} />

          <View style={themed($heroTopRow)}>
              <Text size="xs" style={themed($heroEyebrow)}>
                Settings
              </Text>

            <View style={themed($heroStatusPill)}>
              <Text style={themed($heroStatusText)}>Vault Control</Text>
            </View>
          </View>

          <Text preset="heading" style={themed($heroTitle)}>
            System Controls
          </Text>

          <Text style={themed($heroSubtitle)}>
            Sync, access, diagnostics, and vault tools control hub.
          </Text>

          <View style={themed($heroMetaRow)}>
            <HeroChip label="Sync" tone="blue" />
            <HeroChip label="Access" tone="pink" />
            <HeroChip label="Tools" tone="warm" />
          </View>
        </Animated.View>

        <Animated.View
          entering={
            shouldAnimateIntro
              ? FadeInUp.delay(30).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))
              : undefined
          }
          style={themed($stack)}
        >
          <PanelCard
            title="Primary Controls"
            subtitle="Core setup and vault access."
            compact
          >
            <View style={themed($grid)}>
              <ControlTile
                label="Vaults & Devices"
                caption="Sync and availability"
                accent="blue"
                icon={<Cloud size={18} color={theme.colors.vaultHub.vaultHubAccentPink} />}
                onPress={() => navigation.navigate("RemoteVault")}
              />

              <ControlTile
                label="Recovery Key"
                caption="Generate or rotate"
                accent="pink"
                icon={<KeyRound size={18} color={theme.colors.vaultHub.vaultHubAccentPinkSoft} />}
                onPress={() =>navigation.navigate("VaultRecoverySetup")}
              />

             {__DEV__ && <ControlTile
                label="Server URL"
                caption="API endpoint"
                accent="warm"
                icon={<Server size={18} color={theme.colors.vaultHub.vaultHubAccentPink} />}
                onPress={() => navigation.navigate("ServerUrl")}
              />}

              {__DEV__ && <ControlTile
                label="Add Another Device"
                caption="Link new device"
                accent="pink"
                icon={<Link2 size={18} color={theme.colors.vaultHub.vaultHubAccentPinkSoft} />}
                onPress={() => navigation.navigate("VaultLinkDevice")}
              />}

              <ControlTile
                label="Entry Codes"
                caption="Calculator access"
                accent="pink"
                icon={<Fingerprint size={18} color={theme.colors.vaultHub.vaultHubAccentPink} />}
                onPress={() => navigation.navigate("CalculatorEntryCodes")}
              />
            </View>
          </PanelCard>

          <PanelCard
            title="Vault Tools"
            subtitle="Diagnostics, security, and reset tools."
            compact
          >
            <View style={themed($toolStack)}>

              <MiniToolRow
                label="Export & Diagnostics"
                value="Backup, logs"
                accent="blue"
                icon={<Stethoscope size={16} color={theme.colors.vaultHub.vaultHubAccentPink} />}
                onPress={() => navigation.navigate("VaultDiagnostics")}
              />

              <MiniToolRow
                label="Threat Model"
                value="Security guide"
                accent="warm"
                icon={<ShieldAlert size={16} color={theme.colors.vaultHub.vaultHubAccentPink} />}
                onPress={() => navigation.navigate("ThreatModel")}
              />

              <MiniToolRow
                label="Log out"
                value="Reset this device"
                accent="warm"
                icon={<ShieldAlert size={16} color={theme.colors.vaultHub.vaultHubAccentPink} />}
                onPress={handleLogout}
              />
            </View>
          </PanelCard>
        </Animated.View>
      </Screen>
    )
  }

function PanelCard({
  children,
  subtitle,
  title,
  compact = false,
}: {
  children: ReactNode
  subtitle?: string
  title: string
  compact?: boolean
}) {
  const { themed } = useAppTheme()

  return (
    <View style={themed([$panel, compact && $panelCompact])}>
      <View style={themed($panelHeader)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          {title}
        </Text>
        {subtitle ? <Text style={themed($sectionSubtitle)}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  )
}

function ControlTile({
  accent,
  caption,
  icon,
  label,
  onPress,
}: {
  accent: "pink" | "blue" | "warm" | "neutral"
  caption: string
  icon: ReactNode
  label: string
  onPress: () => void
}) {
  const { themed, theme } = useAppTheme()

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [themed($tile), pressed && themed($tilePressed)]}>
      <View
        style={themed([
          $tileIconWrap,
          accent === "pink" && $tileIconWrapPink,
          accent === "blue" && $tileIconWrapBlue,
          accent === "warm" && $tileIconWrapWarm,
          accent === "neutral" && $tileIconWrapNeutral,
        ])}
      >
        {icon}
      </View>

      <View style={themed($tileCopy)}>
        <Text preset="bold" style={themed($tileTitle)}>
          {label}
        </Text>
        <Text style={themed($tileCaption)}>{caption}</Text>
      </View>

      <View style={themed($tileChevron)}>
        <ChevronRight size={16} color={theme.colors.vaultHub.vaultHubMuted} />
      </View>
    </Pressable>
  )
}

function MiniToolRow({
  accent,
  icon,
  label,
  onPress,
  value,
}: {
  accent: "pink" | "blue" | "warm" | "neutral"
  icon: ReactNode
  label: string
  onPress: () => void
  value: string
}) {
  const { themed, theme } = useAppTheme()

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [themed($miniRow), pressed && themed($miniRowPressed)]}>
      <View
        style={themed([
          $miniRowIconWrap,
          accent === "pink" && $tileIconWrapPink,
          accent === "blue" && $tileIconWrapBlue,
          accent === "warm" && $tileIconWrapWarm,
          accent === "neutral" && $tileIconWrapNeutral,
        ])}
      >
        {icon}
      </View>

      <View style={themed($miniRowCopy)}>
        <Text preset="bold" style={themed($miniRowTitle)}>
          {label}
        </Text>
        <Text style={themed($miniRowValue)}>{value}</Text>
      </View>

      <ChevronRight size={16} color={theme.colors.vaultHub.vaultHubMuted} />
    </Pressable>
  )
}

function HeroChip({
  label,
  tone,
}: {
  label: string
  tone: "pink" | "blue" | "warm"
}) {
  const { themed } = useAppTheme()

  return (
    <View
      style={themed([
        $chip,
        // tone === "pink" && $chipPink,
        // tone === "blue" && $chipBlue,
        // tone === "warm" && $chipWarm,
      ])}
    >
      <Text style={themed($chipText)}>{label}</Text>
    </View>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.vaultHub.vaultHubBg,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
  paddingBottom: spacing.xl * 2,
  gap: spacing.md,
})

const $hero: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.sm,
  padding: spacing.md,
  borderRadius: 24,
  backgroundColor: "rgba(24, 27, 37, 0.46)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  shadowColor: "rgba(0,0,0,0.82)",
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
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

const $heroMetaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
  marginTop: 4,
})

const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 2,
  borderWidth: 1,
  borderColor: "rgba(123, 117, 121, 0.42)",
  backgroundColor: "rgba(116, 115, 117, 0.08)",
})

const $chipPink: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(102, 101, 101, 0.14)",
  borderColor: "rgba(123, 117, 121, 0.42)",
})

const $chipBlue: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(123, 211, 255, 0.12)",
  borderColor: "rgba(123, 211, 255, 0.32)",
})

const $chipWarm: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 214, 90, 0.14)",
  borderColor: colors.accentYellow,
})

const $chipText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 11,
})

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 24,
  padding: spacing.md,
  gap: spacing.md,
  backgroundColor: "rgba(24, 27, 37, 0.56)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  shadowColor: "rgba(0,0,0,0.82)",
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
})

const $panelCompact: ThemedStyle<ViewStyle> = () => ({
  gap: 12,
})

const $panelHeader: ThemedStyle<ViewStyle> = () => ({
  gap: 2,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 15,
})

const $sectionSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
  lineHeight: 17,
})

const $grid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $tile: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "48%",
  minHeight: 112,
  borderRadius: 20,
  padding: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  justifyContent: "space-between",
})

const $tilePressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.9,
  transform: [{ scale: 0.985 }],
})

const $tileIconWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 38,
  height: 38,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
})

const $tileIconWrapPink: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.12)",
  borderColor: "rgba(255, 154, 219, 0.28)",
})

const $tileIconWrapBlue: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(123, 211, 255, 0.08)",
  borderColor: "rgba(123, 211, 255, 0.22)",
})

const $tileIconWrapWarm: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 214, 90, 0.10)",
  borderColor: "rgba(255, 214, 90, 0.24)",
})

const $tileIconWrapNeutral: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255,255,255,0.06)",
  borderColor: "rgba(114, 115, 115, 0.22)",
})

const $tileCopy: ThemedStyle<ViewStyle> = () => ({
  gap: 3,
})

const $tileTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 13,
})

const $tileCaption: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
  lineHeight: 15,
})

const $tileChevron: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  right: 10,
  bottom: 10,
  opacity: 0.9,
})

const $toolStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $miniRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 58,
  borderRadius: 18,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $miniRowPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.9,
})

const $miniRowIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 34,
  height: 34,
  borderRadius: 11,
  alignItems: "center",
  justifyContent: "center",
})

const $miniRowCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 2,
})

const $miniRowTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontSize: 13,
})

const $miniRowValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 11,
  lineHeight: 15,
})
