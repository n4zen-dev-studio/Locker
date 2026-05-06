import { Pressable, TextStyle, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, FadeInUp } from "react-native-reanimated";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

import { formatVaultDate, VaultListItem } from "./vaultUi";

type VaultListViewProps = {
  items: VaultListItem[];
  reducedMotion?: boolean;
  emptyLabel: string;
  onOpenItem: (item: VaultListItem) => void;
};

export function VaultListView(props: VaultListViewProps) {
  const { items, reducedMotion, emptyLabel, onOpenItem } = props;
  const { themed } = useAppTheme();

  if (items.length === 0) {
    return (
      <View style={themed($emptyCard)}>
        <Text style={themed($emptyText)}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={themed($list)}>
      {items.map((item, index) => (
        <Animated.View
          key={item.id}
          entering={
            reducedMotion
              ? undefined
              : FadeInUp.delay(140 + index * 20)
                  .duration(320)
                  .easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
        >
          <Pressable
            onPress={() => onOpenItem(item)}
            style={({ pressed }) => [themed($cardShell), pressed && themed($cardPressed)]}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.01)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={themed($cardGradient)}
            >
              <View style={themed($cardChrome)} />

              <View style={themed($header)}>
                <View style={themed($copy)}>
                  <Text preset="bold" style={themed($title)} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={themed($meta)}>
                    Updated {formatVaultDate(item.updatedAt)}
                  </Text>
                </View>

                <View style={themed($badgeRow)}>
                  <Badge label={item.type.toUpperCase()} />
                  <Badge label={item.classification} />
                  <Badge label={item.syncStatus} active={item.syncStatus === "cloud"} />
                </View>
              </View>

              <Text numberOfLines={2} style={themed($preview)}>
                {item.preview || "No preview available"}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

function Badge({ label, active = false }: { label: string; active?: boolean }) {
  const { themed } = useAppTheme();

  return (
    <View style={themed([$badge, active && $badgeActive])}>
      <Text style={themed(active ? $badgeTextActive : $badgeText)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $cardShell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderRadius: 24,
  overflow: "hidden",
  backgroundColor: colors.vaultHub.vaultHubCard,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
  shadowColor: "rgba(0,0,0,0.86)",
  shadowOpacity: 0.38,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 16 },
  elevation: 10,
});

const $cardPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.986 }],
});

const $cardGradient: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  gap: spacing.sm,
  position: "relative",
});

const $cardChrome: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 0,
  right: 0,
  width: "52%",
  height: 96,
  borderTopRightRadius: 24,
  borderBottomLeftRadius: 42,
  backgroundColor: "rgba(255, 154, 219, 0.08)",
});

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: spacing.sm,
});

const $copy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  gap: spacing.xs,
});

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
});

const $meta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontSize: 12,
});

const $badgeRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: spacing.xs,
  maxWidth: "46%",
});

const $badge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $badgeActive: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderColor: "rgba(255, 154, 219, 0.42)",
});

const $badgeText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
  fontSize: 10,
});

const $badgeTextActive: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 10,
});

const $preview: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubTextSecondary,
  lineHeight: 22,
});

const $emptyCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 24,
  padding: spacing.lg,
  backgroundColor: colors.vaultHub.vaultHubSurface,
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vaultHub.vaultHubMuted,
});
