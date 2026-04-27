import { ReactNode } from "react";
import { Pressable, View, type TextStyle, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/Text";
import { VaultHubBackground } from "@/components/VaultHubBackground";
import { typography } from "@/theme/typography";
import type { ThemedStyle } from "@/theme/types";

import type { VaultThemed } from "./types";

type VaultScreenHeroProps = {
  themed: VaultThemed;
  badge: string;
  title: string;
  subtitle: string;
  icon?: ReactNode;
  metaLabel?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
};

type VaultBannerProps = {
  themed: VaultThemed;
  text: string;
  tone: "error" | "status";
};

type VaultGlassPanelProps = {
  themed: VaultThemed;
  children: ReactNode;
};

export function VaultScreenBackground() {
  return <VaultHubBackground reducedMotion dimmed />;
}

export function VaultScreenHero(props: VaultScreenHeroProps) {
  const { themed, badge, title, subtitle, icon, metaLabel } = props;

  return (
    <View style={themed($heroBlock)}>
      <View style={themed($heroTopRow)}>
        <View style={themed($heroLeftGroup)}>
          {props.showBackButton && (
            <Pressable onPress={props.onBackPress} style={themed($backButton)}>
              <Ionicons name="arrow-back" size={18} color="#FFF5FF" />
            </Pressable>
          )}

          <View style={themed($heroBadge)}>
            {icon ? <View style={themed($heroBadgeIcon)}>{icon}</View> : null}
            <Text style={themed($heroBadgeText)}>{badge}</Text>
          </View>
        </View>

        {metaLabel ? (
          <View style={themed($heroMetaPill)}>
            <Text style={themed($heroMetaText)}>{metaLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={themed($heroTitleRow)}>
        <View style={themed($heroTextWrap)}>
          <Text style={themed($heroTitle)}>{title}</Text>
          <Text style={themed($heroSubtitle)}>{subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

export function VaultBanner(props: VaultBannerProps) {
  const { themed, text, tone } = props;
  const isError = tone === "error";

  return (
    <View style={themed(isError ? $errorBanner : $statusBanner)}>
      <Ionicons
        name={isError ? "alert-circle-outline" : "sparkles-outline"}
        size={15}
        color={isError ? "#FFB6C7" : "#FFD4FF"}
      />
      <Text style={themed(isError ? $errorBannerText : $statusBannerText)}>
        {text}
      </Text>
    </View>
  );
}

export function VaultGlassPanel(props: VaultGlassPanelProps) {
  const { themed, children } = props;
  return <View style={themed($panel)}>{children}</View>;
}

const $heroBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $heroTopRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
});

const $heroBadge: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
});

const $heroBadgeIcon: ThemedStyle<ViewStyle> = () => ({
  width: 18,
  height: 18,
  alignItems: "center",
  justifyContent: "center",
});

const $heroBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#FFD8FA",
  fontSize: 11,
  letterSpacing: 1.2,
  fontFamily: typography.primary.semiBold,
});

const $heroMetaPill: ThemedStyle<ViewStyle> = () => ({
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
});

const $heroMetaText: ThemedStyle<TextStyle> = () => ({
  color: "#F7EFFF",
  fontSize: 11,
});

const $heroTitleRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "flex-start",
});

const $heroTextWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 8,
});

const $heroTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF5FF",
  fontSize: 32,
  lineHeight: 36,
  fontFamily: typography.primary.bold,
});

const $heroSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,236,255,0.76)",
  fontSize: 14,
  lineHeight: 22,
});

const $panel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  borderRadius: 22,
  gap: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
});

const $errorBanner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 16,
  backgroundColor: "rgba(255,82,124,0.1)",
  borderWidth: 1,
  borderColor: "rgba(255,128,164,0.16)",
});

const $statusBanner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
});

const $errorBannerText: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFD7E1",
  fontSize: 12,
  lineHeight: 18,
});

const $statusBannerText: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#F7EFFF",
  fontSize: 12,
  lineHeight: 18,
});
const $heroLeftGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $backButton: ThemedStyle<ViewStyle> = () => ({
  width: 36,
  height: 36,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})