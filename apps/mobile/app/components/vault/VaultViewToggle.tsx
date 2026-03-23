import { Pressable, TextStyle, View, ViewStyle } from "react-native";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

import type { VaultViewMode } from "./vaultUi";

type VaultViewToggleProps = {
  mode: VaultViewMode;
  onChangeMode: (mode: VaultViewMode) => void;
};

const VIEW_MODES: Array<{ label: string; value: VaultViewMode }> = [
  { label: "List", value: "list" },
  { label: "Stack", value: "stack" },
];

export function VaultViewToggle(props: VaultViewToggleProps) {
  const { mode, onChangeMode } = props;
  const { themed } = useAppTheme();

  return (
    <View style={themed($toggleShell)}>
      {VIEW_MODES.map((entry) => {
        const selected = entry.value === mode;
        return (
          <Pressable
            key={entry.value}
            onPress={() => onChangeMode(entry.value)}
            style={({ pressed }) => [
              themed($segment),
              selected && themed($segmentSelected),
              pressed && themed($segmentPressed),
            ]}
          >
            <Text style={themed(selected ? $segmentTextSelected : $segmentText)}>
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const $toggleShell: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  borderRadius: 999,
  padding: 4,
  gap: spacing.xs,
  backgroundColor: "rgba(8, 7, 12, 0.78)",
  borderWidth: 1,
  borderColor: colors.vaultHub.vaultHubBorderSubtle,
});

const $segment: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 74,
  borderRadius: 999,
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs + 2,
});

const $segmentSelected: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 77, 186, 0.14)",
  borderWidth: 1,
  borderColor: "rgba(255, 154, 219, 0.4)",
});

const $segmentPressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.98 }],
});

const $segmentText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubMuted,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});

const $segmentTextSelected: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vaultHub.vaultHubTextPrimary,
  fontFamily: typography.primary.medium,
  fontSize: 12,
});
