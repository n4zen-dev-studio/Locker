import { FC } from "react";
import { StyleProp, TextStyle, View, ViewStyle } from "react-native";

import { Text } from "@/components/Text";
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
  const { themed } = useAppTheme();

  return (
    <View style={[themed($card), style]}>
      <View pointerEvents="none" style={themed($resultAura)} />
      <View pointerEvents="none" style={themed($resultAuraSoft)} />

      <View style={themed($statusRow)}>
        <Text size="xxs" style={themed($statusLabel)}>
          Secure Calculator
        </Text>
        <View style={themed($livePill)}>
          <View style={themed($liveDot)} />
          <Text size="xxs" style={themed($liveLabel)}>
            Live
          </Text>
        </View>
      </View>

      <View style={themed($expressionMetaRow)}>
        <Text size="xxs" style={themed($expressionLabel)}>
          {expressionLabel}
        </Text>
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
        <Text size="sm" style={themed($expressionPlaceholder)} numberOfLines={1}>
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

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 232,
  justifyContent: "flex-end",
  paddingTop: spacing.md,
  paddingBottom: spacing.lg,
});

const $resultAura: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  right: 6,
  bottom: 8,
  width: 256,
  height: 128,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentGlow,
  opacity: 0.3,
});

const $resultAuraSoft: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  right: 54,
  bottom: 30,
  width: 168,
  height: 88,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentPinkSoft,
  opacity: 0.16,
});

const $statusRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.xl + spacing.xs,
});

const $statusLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textMuted,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.7,
  opacity: 0.84,
});

const $livePill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "rgba(20, 12, 26, 0.34)",
  borderWidth: 1,
  borderColor: "rgba(255, 154, 219, 0.18)",
});

const $liveDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 6,
  height: 6,
  borderRadius: 999,
  backgroundColor: colors.calculator.accentPink,
  shadowColor: colors.calculator.accentPink,
  shadowOpacity: 0.85,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 0 },
});

const $liveLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textSecondary,
  fontFamily: typography.primary.medium,
  letterSpacing: 0.3,
});

const $expressionMetaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
});

const $expressionLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.textMuted,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.25,
  textAlign: "right",
  opacity: 0.82,
});

const $expressionPreview: ThemedStyle<TextStyle> = ({ colors, spacing, typography }) => ({
  color: colors.calculator.accentPinkSoft,
  textAlign: "right",
  marginBottom: spacing.xs,
  fontFamily: typography.primary.normal,
  fontSize: 28,
  lineHeight: 34,
  letterSpacing: -1.1,
  opacity: 0.96,
});

const $expressionPlaceholder: ThemedStyle<TextStyle> = ({ colors, spacing, typography }) => ({
  color: colors.calculator.textMuted,
  textAlign: "right",
  marginBottom: spacing.xs,
  fontFamily: typography.primary.normal,
  fontSize: 18,
  lineHeight: 24,
  opacity: 0.64,
});

const $resultText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.calculator.accentPinkSoft,
  textAlign: "right",
  fontFamily: typography.primary.light,
  fontSize: 92,
  lineHeight: 100,
  letterSpacing: -5.5,
  textShadowColor: colors.calculator.accentGlow,
  textShadowRadius: 38,
  textShadowOffset: { width: 0, height: 0 },
});
