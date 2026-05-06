import { FC } from "react";
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Text } from "@/components/Text";
import { createMoldedSurface, createSoftShadow } from "@/theme/calculatorStyling";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

type CalculatorDisplayCardProps = {
  expressionLabel: string;
  completedExpression: string | null;
  resultText: string;
  style?: StyleProp<ViewStyle>;
};

export const CalculatorDisplayCard: FC<CalculatorDisplayCardProps> = ({
  expressionLabel,
  completedExpression,
  resultText,
  style,
}) => {
  const { themed, theme } = useAppTheme();

  return (
    <View style={[themed($card), style]}>
      <LinearGradient
        colors={theme.colors.calculator.surfaceGradient}
        start={{ x: 0.08, y: 0.02 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={theme.colors.calculator.shellGradient}
        start={{ x: 0.14, y: 0 }}
        end={{ x: 0.86, y: 1 }}
        style={[StyleSheet.absoluteFillObject, themed($shellGloss)]}
      />
      <View pointerEvents="none" style={themed($topLine)} />
      <View pointerEvents="none" style={themed($edgeGlow)} />
      <View pointerEvents="none" style={themed($innerGlow)} />

      <View style={themed($statusRow)}>
        <Text size="xxs" style={themed($eyebrow)}>
          Secure Calculator
        </Text>
        <View style={themed($statusPill)}>
          <View style={themed($statusDot)} />
          <Text size="xxs" style={themed($statusLabel)}>
            Live
          </Text>
        </View>
      </View>

      <View style={themed($labelRow)}>
        <Text size="xxs" style={themed($expressionLabel)}>
          {expressionLabel}
        </Text>
        <View style={themed($accentDivider)} />
      </View>

      {completedExpression ? (
        <Text
          size="sm"
          style={themed($expressionPreview)}
          numberOfLines={1}
          ellipsizeMode="head"
        >
          {completedExpression}
        </Text>
      ) : (
        <Text size="sm" style={themed($expressionPlaceholder)}>
          Ready for input
        </Text>
      )}

      <Text
        preset="heading"
        style={themed($resultText)}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.38}
      >
        {resultText}
      </Text>
    </View>
  );
};

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.surface,
    radius: 34,
  }),
  minHeight: 198,
  justifyContent: "flex-end",
  paddingHorizontal: spacing.xl,
  paddingTop: spacing.lg,
  paddingBottom: spacing.xl,
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
  ...createSoftShadow({
    color: colors.calculator.shadowLg,
    opacity: 0.42,
    radius: 28,
    offsetY: 20,
    elevation: 10,
  }),
});

const $shellGloss: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.68,
});

const $topLine: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  left: 22,
  right: 22,
  height: 1,
  backgroundColor: colors.calculator.accentPinkSoft,
  opacity: 0.54,
});

const $edgeGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  right: -28,
  top: -18,
  width: 220,
  height: 220,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentGlow,
  opacity: 0.24,
});

const $innerGlow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 18,
  right: 18,
  bottom: 18,
  height: 94,
  borderRadius: 28,
  backgroundColor: colors.calculator.surfaceGlow,
  opacity: 0.14,
});

const $statusRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.lg,
});

const $eyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textMuted,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.5,
});

const $statusPill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: 7,
  borderRadius: 999,
  backgroundColor: colors.calculator.surfaceElevated,
  borderWidth: 1,
  borderColor: colors.calculator.borderSubtle,
});

const $statusDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 7,
  height: 7,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentPink,
  shadowColor: colors.calculator.accentPink,
  shadowOpacity: 0.85,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 0 },
});

const $statusLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textSecondary,
  fontFamily: typography.primary.medium,
  letterSpacing: 0.4,
});

const $labelRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
});

const $expressionLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textMuted,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.1,
});

const $accentDivider: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  height: 1,
  backgroundColor: colors.calculator.borderSubtle,
});

const $expressionPreview: ThemedStyle<TextStyle> = ({ colors, spacing, typography }) => ({
  color: colors.calculator.textSecondary,
  textAlign: "right",
  marginTop: spacing.sm,
  marginBottom: spacing.md,
  fontFamily: typography.primary.normal,
});

const $expressionPlaceholder: ThemedStyle<TextStyle> = ({ colors, spacing, typography }) => ({
  color: colors.calculator.textMuted,
  textAlign: "right",
  marginTop: spacing.sm,
  marginBottom: spacing.md,
  fontFamily: typography.primary.normal,
});

const $resultText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textPrimary,
  textAlign: "right",
  fontFamily: typography.primary.light,
  fontSize: 64,
  lineHeight: 70,
  letterSpacing: -3,
  textShadowColor: colors.calculator.accentGlow,
  textShadowRadius: 24,
  textShadowOffset: { width: 0, height: 0 },
});
