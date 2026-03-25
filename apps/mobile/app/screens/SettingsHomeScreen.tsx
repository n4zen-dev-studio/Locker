import { FC, ReactNode } from "react";
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native";
import Animated, { Easing, FadeInDown, FadeInUp } from "react-native-reanimated";
import {
  BookOpen,
  ChevronRight,
  Cloud,
  Fingerprint,
  Link2,
  RotateCcw,
  Server,
  ShieldAlert,
  Stethoscope,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { VaultHubBackground } from "@/components/VaultHubBackground";
import { resetPrivacyOnboarding } from "@/locker/storage/onboardingRepo";
import type { SettingsStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { spacing } from "@/theme/spacing";

export const SettingsHomeScreen: FC<SettingsStackScreenProps<"SettingsHome">> = function SettingsHomeScreen(props) {
  const { navigation } = props;
  const { themed, theme } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

  const handleReplayOnboarding = () => {
    Alert.alert(
      "Replay onboarding",
      "This will reopen the privacy onboarding flow without changing your vault data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replay",
          onPress: () => {
            resetPrivacyOnboarding();
            navigation.navigate("VaultOnboarding");
          },
        },
      ],
    );
  };

  return (
    <Screen
      preset="scroll"
      style={themed($screen)}
      contentContainerStyle={themed([$content, $insets, {paddingBottom: spacing.xxxl+30}])}
      systemBarStyle="light"
    >
      <VaultHubBackground />

      <Animated.View
        entering={FadeInDown.duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))}
        style={themed($hero)}
      >
        <Text size="xxs" style={themed($heroEyebrow)}>
          Settings
        </Text>
        <Text preset="heading" style={themed($heroTitle)}>
          System Controls
        </Text>
        <Text style={themed($heroSubtitle)}>
          Connectivity, shortcuts, diagnostics, and vault tools arranged as a unified control surface.
        </Text>

        <View style={themed($chipRow)}>
          <HeroChip label="Connectivity" tone="blue" />
          <HeroChip label="Shortcuts" tone="warm" />
          <HeroChip label="Vault Tools" tone="pink" />
        </View>

        <View style={themed($summaryRow)}>
          <SummaryTile label="Sync & Device" value="3 controls" />
          <SummaryTile label="Entry" value="Shortcut setup" />
          <SummaryTile label="Utilities" value="Diagnostics + docs" accent />
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(40).duration(360).easing(Easing.bezier(0.22, 1, 0.36, 1))}
        style={themed($stack)}
      >
        <PanelCard title="Connectivity / Sync" subtitle="Device linking, remote vault selection, and API endpoint configuration.">
          <SettingsRow
            label="Sync Setup"
            description="Manage the single personal vault that syncs to your account."
            icon={<Cloud size={18} color={theme.colors.accentBlue} />}
            accent="blue"
            onPress={() => navigation.navigate("RemoteVault")}
          />
          <SettingsRow
            label="Link Device"
            description="Redeem a trusted-device link and attach this phone to your account."
            icon={<Link2 size={18} color={theme.colors.vaultHub.vaultHubAccentPinkSoft} />}
            accent="pink"
            onPress={() => navigation.navigate("VaultLinkDevice")}
          />
          <SettingsRow
            label="Server URL"
            description="Configure the API endpoint used for linking and personal-vault sync."
            icon={<Server size={18} color={theme.colors.accentYellow} />}
            accent="warm"
            onPress={() => navigation.navigate("ServerUrl")}
          />
        </PanelCard>

        <PanelCard title="Calculator Shortcuts" subtitle="Stealth entry points and calculator-triggered vault access settings.">
          <SettingsRow
            label="Calculator Entry Codes"
            description='Set the exact calculator shortcut codes for the real vault and the decoy vault. These do not replace passkey protection.'
            icon={<Fingerprint size={18} color={theme.colors.vaultHub.vaultHubAccentPink} />}
            accent="pink"
            onPress={() => navigation.navigate("CalculatorEntryCodes")}
          />
        </PanelCard>

        <PanelCard title="Vault Tools" subtitle="Diagnostics, documentation, and vault-facing operational utilities.">
          <SettingsRow
            label="Export & Diagnostics"
            description="Share demo-safe diagnostics and export an encrypted vault backup."
            icon={<Stethoscope size={18} color={theme.colors.accentBlue} />}
            accent="blue"
            onPress={() => navigation.navigate("VaultDiagnostics")}
          />
          <SettingsRow
            label="Threat Model"
            description="Read what Locker protects against, what it does not, and the security tradeoffs."
            icon={<ShieldAlert size={18} color={theme.colors.accentYellow} />}
            accent="warm"
            onPress={() => navigation.navigate("ThreatModel")}
          />
          <SettingsRow
            label="Replay Onboarding"
            description="Run the privacy-first onboarding flow again from Settings."
            icon={<RotateCcw size={18} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
            accent="neutral"
            onPress={handleReplayOnboarding}
          />
        </PanelCard>

        <PanelCard title="Guidance / Docs" subtitle="Reference surfaces that help explain the app and its security posture.">
          <InfoStrip
            icon={<BookOpen size={18} color={theme.colors.vaultHub.vaultHubTextPrimary} />}
            label="Documentation"
            value="Threat model and diagnostics stay one tap away from core settings."
          />
        </PanelCard>
      </Animated.View>
    </Screen>
  );
};

function PanelCard({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  const { themed } = useAppTheme();

  return (
    <View style={themed($panel)}>
      <Text preset="bold" style={themed($sectionTitle)}>
        {title}
      </Text>
      {subtitle ? <Text style={themed($sectionSubtitle)}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function SettingsRow({
  accent,
  description,
  icon,
  label,
  onPress,
}: {
  accent: "pink" | "blue" | "warm" | "neutral";
  description: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  const { themed, theme } = useAppTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [themed($row), pressed && themed($rowPressed)]}>
      <View
        style={themed([
          $iconWrap,
          accent === "pink" && $iconWrapBlue,
          accent === "blue" && $iconWrapBlue,
          accent === "warm" && $iconWrapBlue,
          $iconWrapBlue
        ])}
      >
        {icon}
      </View>

      <View style={themed($rowCopy)}>
        <Text preset="bold" style={themed($rowTitle)}>
          {label}
        </Text>
        <Text style={themed($rowDescription)}>{description}</Text>
      </View>

      <View style={themed($rowChevron)}>
        <ChevronRight size={18} color={theme.colors.vaultHub.vaultHubMuted} />
      </View>
    </Pressable>
  );
}

function HeroChip({
  label,
  tone,
}: {
  label: string;
  tone: "pink" | "blue" | "warm";
}) {
  const { themed } = useAppTheme();

  return (
    <View
      style={themed([
        $chip,
        tone === "pink" && $chipPink,
        tone === "blue" && $chipBlue,
        tone === "warm" && $chipWarm,
      ])}
    >
      <Text style={themed($chipText)}>{label}</Text>
    </View>
  );
}

function SummaryTile({
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
    <View style={themed([$summaryTile, accent && $summaryTileAccent])}>
      <Text style={themed($summaryLabel)}>{label}</Text>
      <Text preset="bold" style={themed(accent ? $summaryValueAccent : $summaryValue)}>
        {value}
      </Text>
    </View>
  );
}

function InfoStrip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const { themed } = useAppTheme();

  return (
    <View style={themed($infoStrip)}>
      <View style={themed($infoStripIcon)}>{icon}</View>
      <View style={themed($infoStripCopy)}>
        <Text preset="bold" style={themed($rowTitle)}>
          {label}
        </Text>
        <Text style={themed($rowDescription)}>{value}</Text>
      </View>
    </View>
  );
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.vaultHub.vaultHubBg,
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
  
});

const $heroTitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
});

const $heroSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  lineHeight: 20,
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
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  backgroundColor: "rgba(255,255,255,0.04)",
});

const $chipPink: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderColor: "rgba(255, 154, 219, 0.42)",
});

const $chipBlue: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(123, 211, 255, 0.12)",
  borderColor: "rgba(123, 211, 255, 0.32)",
});

const $chipWarm: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 214, 90, 0.14)",
  borderColor: colors.accentYellow,
});

const $chipText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $summaryRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
});

const $summaryTile: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  borderRadius: 22,
  padding: spacing.xs,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  gap: spacing.xs,
});

const $summaryTileAccent: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 214, 90, 0.08)",
  borderColor: "rgba(255, 214, 90, 0.22)",
});

const $summaryLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $summaryValue: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $summaryValueAccent: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.accentYellow,
});

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
});

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 26,
  padding: spacing.lg,
  gap: spacing.md,
  backgroundColor: "rgba(24, 27, 37, 0.56)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  shadowColor: "rgba(0,0,0,0.82)",
  shadowOpacity: 0.34,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 16 },
  elevation: 10,
});

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $sectionSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: -4,
  lineHeight: 19,
});

const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: "rgba(255,255,255,0.05)",
});

const $rowPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.88,
});

const $iconWrap: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 42,
  height: 42,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $iconWrapPink: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.12)",
  borderColor: "rgba(255, 154, 219, 0.32)",
});

const $iconWrapBlue: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(123, 211, 255, 0.1)",
  borderColor: "rgba(123, 211, 255, 0.24)",
});

const $iconWrapWarm: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 214, 90, 0.12)",
  borderColor: "rgba(255, 214, 90, 0.28)",
});

const $rowCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});

const $rowTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $rowDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  marginTop: 4,
  lineHeight: 19,
  fontSize: 12,
});

const $rowChevron: ThemedStyle<ViewStyle> = () => ({
  paddingLeft: 4,
});

const $infoStrip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.md,
  borderRadius: 18,
  padding: spacing.md,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $infoStripIcon: ThemedStyle<ViewStyle> = () => ({
  paddingTop: 2,
});

const $infoStripCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
});
