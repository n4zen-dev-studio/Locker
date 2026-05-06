import { FC, PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { createMoldedSurface, createSoftShadow } from "@/theme/calculatorStyling";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

type CalculatorKeypadPanelProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export const CalculatorKeypadPanel: FC<CalculatorKeypadPanelProps> = ({
  children,
  style,
}) => {
  const { themed, theme } = useAppTheme();

  return (
    <View style={[themed($panel), style]}>
      <LinearGradient
        colors={theme.colors.calculator.surfaceInsetGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={themed($topEdge)} />
      <View pointerEvents="none" style={themed($bottomGlow)} />
      <View pointerEvents="none" style={themed($outline)} />
      {children}
    </View>
  );
};

const $panel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.surfaceElevated,
    radius: 34,
  }),
  padding: spacing.md,
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
  ...createSoftShadow({
    color: colors.calculator.shadowLg,
    opacity: 0.32,
    radius: 20,
    offsetY: 14,
    elevation: 8,
  }),
});

const $topEdge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  left: 26,
  right: 26,
  height: 1,
  backgroundColor: colors.calculator.accentPinkSoft,
  opacity: 0.46,
});

const $bottomGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 18,
  right: 18,
  bottom: -18,
  height: 80,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentGlow,
  opacity: 0.12,
});

const $outline: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: 34,
  borderTopWidth: 1,
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderTopColor: colors.calculator.surfaceHighlight,
  borderLeftColor: colors.calculator.surfaceHighlight,
  borderRightColor: colors.calculator.borderStrong,
  borderBottomColor: colors.calculator.borderStrong,
  opacity: 0.16,
});
