import { Pressable, TextStyle, ViewStyle } from "react-native";
import Animated, { FadeInLeft } from "react-native-reanimated";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

import { FILTER_OPTIONS, VaultFilter } from "./vaultUi";

type VaultFilterRailProps = {
  filter: VaultFilter;
  onChangeFilter: (filter: VaultFilter) => void;
  reducedMotion?: boolean;
};

export function VaultFilterRail(props: VaultFilterRailProps) {
  const { filter, onChangeFilter, reducedMotion } = props;
  const { themed } = useAppTheme();

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInLeft.duration(280)} style={themed($rail)}>
      {FILTER_OPTIONS.map((option) => {
        const selected = option.value === filter;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${option.label}`}
            onPress={() => onChangeFilter(option.value)}
            style={({ pressed }) => [
              themed($button),
              selected && themed($buttonSelected),
              pressed && themed($buttonPressed),
            ]}
          >
            <Text style={themed(selected ? $labelSelected : $label)}>
              {option.shortLabel}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const $rail: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: 0,
  top: "20%",
  transform: [{ translateY: -174 }],
  gap: spacing.sm,
  zIndex: 10,
});

const $button: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minWidth: 54,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 18,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  backgroundColor: "rgba(10, 10, 14, 0.72)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $buttonSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 77, 186, 0.15)",
  borderColor: "rgba(255, 154, 219, 0.48)",
  shadowColor: colors.vaultHub.vaultHubGlow,
  shadowOpacity: 0.32,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
});

const $buttonPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.97 }],
});

const $label: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
  fontSize: 10,
  letterSpacing: 0.8,
});

const $labelSelected: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 10,
  letterSpacing: 0.8,
});
