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
      <View pointerEvents="none" style={themed($resultGlow)} />

      <Text size="xxs" style={themed($expressionLabel)}>
        {expressionLabel}
      </Text>

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
  minHeight: 244,
  justifyContent: "flex-end",
  paddingTop: spacing.xs,
  paddingBottom: spacing.md,
});

const $resultGlow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  right: 2,
  bottom: 12,
  width: 280,
  height: 132,
  borderRadius: 999,
  backgroundColor: "rgba(255, 79, 163, 0.26)",
  opacity: 0.92,
});

const $expressionLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: "#ff9ad0",
  fontFamily: typography.primary.medium,
  fontSize: 14,
  lineHeight: 18,
  letterSpacing: -0.2,
  textAlign: "right",
  marginBottom: 6,
  opacity: 0.9,
});

const $expressionPreview: ThemedStyle<TextStyle> = ({ colors, spacing, typography }) => ({
  color: "#ff8fcc",
  textAlign: "right",
  marginBottom: spacing.xs,
  fontFamily: typography.primary.normal,
  fontSize: 34,
  lineHeight: 38,
  letterSpacing: -1.2,
  opacity: 0.96,
});

const $expressionPlaceholder: ThemedStyle<TextStyle> = ({ colors, spacing, typography }) => ({
  color: "#9f8895",
  textAlign: "right",
  marginBottom: spacing.xs,
  fontFamily: typography.primary.normal,
  fontSize: 18,
  lineHeight: 24,
  opacity: 0.64,
});

const $resultText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: "#ff9cda",
  textAlign: "right",
  fontFamily: typography.primary.light,
  fontSize: 104,
  lineHeight: 110,
  letterSpacing: -6.4,
  textShadowColor: "rgba(255, 79, 163, 0.62)",
  textShadowRadius: 28,
  textShadowOffset: { width: 0, height: 0 },
});
