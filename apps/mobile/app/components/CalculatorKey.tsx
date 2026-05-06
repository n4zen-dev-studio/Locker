import { FC } from "react";
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/Text";
import { createSoftShadow } from "@/theme/calculatorStyling";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";

type CalculatorKeyVariant = "number" | "operator" | "utility" | "equals";

export interface CalculatorKeyProps
  extends Pick<
    PressableProps,
    "onPress" | "onLongPress" | "delayLongPress" | "disabled"
  > {
  label: string;
  variant: CalculatorKeyVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export const CalculatorKey: FC<CalculatorKeyProps> = ({
  label,
  variant,
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  style,
  textStyle,
  accessibilityLabel,
}) => {
  const { themed, theme } = useAppTheme();

  const progress = useSharedValue(0);

  const handlePressIn = () => {
    progress.value = withTiming(1, { duration: 140 });
  };

  const handlePressOut = () => {
    progress.value = withTiming(0, { duration: 220 });
  };

  const animatedShellStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 0.968]) },
      { translateY: interpolate(progress.value, [0, 1], [0, 2]) },
    ],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.28, 0.55]),
  }));

  const animatedFaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.92]),
  }));

  const shellGradient = theme.colors.calculator.keyGradients[variant];
  const faceGradient = theme.colors.calculator.keyFaceGradients[variant];
  const pearlescentGradient =
    variant === "operator" || variant === "equals"
      ? theme.colors.calculator.keyPearlescentGradient[variant]
      : null;

  return (
    <Animated.View
      style={[
        themed($shell),
        themed($shellByVariant[variant]),
        disabled && themed($shellDisabled),
        animatedShellStyle,
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={themed($pressable)}
      >
        <LinearGradient
          colors={shellGradient}
          start={{ x: 0.18, y: 0.04 }}
          end={{ x: 0.86, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <Animated.View
          pointerEvents="none"
          style={[themed($ambientGlow), themed($ambientGlowByVariant[variant]), animatedGlowStyle]}
        />
        <View pointerEvents="none" style={themed($topRim)} />
        <View pointerEvents="none" style={themed($edgeRim)} />
        <View pointerEvents="none" style={themed($bottomDepth)} />

        <Animated.View
          pointerEvents="none"
          style={[themed($face), animatedFaceStyle]}
        >
          <LinearGradient
            colors={faceGradient}
            start={{ x: 0.14, y: 0.04 }}
            end={{ x: 0.84, y: 0.96 }}
            style={StyleSheet.absoluteFillObject}
          />

          {pearlescentGradient ? (
            <LinearGradient
              colors={pearlescentGradient}
              start={{ x: 0.1, y: 0.12 }}
              end={{ x: 0.9, y: 0.94 }}
              style={[StyleSheet.absoluteFillObject, themed($pearlescent)]}
            />
          ) : null}

          <LinearGradient
            colors={theme.colors.calculator.keyGlossGradient}
            start={{ x: 0.18, y: 0 }}
            end={{ x: 0.82, y: 1 }}
            style={[StyleSheet.absoluteFillObject, themed($faceGloss)]}
          />

          <View pointerEvents="none" style={themed($faceTopRim)} />
          <View pointerEvents="none" style={themed($faceBottomShade)} />
          <View pointerEvents="none" style={themed($faceOutline)} />
        </Animated.View>

        <Text
          preset={variant === "equals" ? "heading" : "subheading"}
          style={[
            themed($label),
            themed($labelByVariant[variant]),
            disabled && themed($labelDisabled),
            textStyle,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

const OUTER_RADIUS = 999;
const INNER_RADIUS = 999;

const $shell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  minHeight: 84,
  aspectRatio: 1,
  borderRadius: OUTER_RADIUS,
  overflow: "visible",
  ...createSoftShadow({
    color: colors.calculator.keyShadow,
    opacity: 0.24,
    radius: 18,
    offsetY: 10,
    elevation: 6,
  }),
});

const $shellByVariant: Record<CalculatorKeyVariant, ThemedStyle<ViewStyle>> = {
  number: ({ colors }) => ({
    shadowColor: colors.calculator.keyShadow,
  }),
  operator: ({ colors }) => ({
    shadowColor: colors.calculator.operatorShadow,
  }),
  utility: ({ colors }) => ({
    shadowColor: colors.calculator.utilityShadow,
  }),
  equals: ({ colors }) => ({
    shadowColor: colors.calculator.equalsShadow,
  }),
};

const $shellDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
});

const $pressable: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  borderRadius: OUTER_RADIUS,
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.md,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  backgroundColor: colors.calculator.keyFallback,
});

const $ambientGlow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: -2,
  right: -2,
  bottom: -8,
  top: -2,
  borderRadius: 999,
});

const $ambientGlowByVariant: Record<CalculatorKeyVariant, ThemedStyle<ViewStyle>> = {
  number: ({ colors }) => ({
    backgroundColor: "rgba(255, 77, 186, 0.12)",
  }),
  operator: ({ colors }) => ({
    backgroundColor: colors.calculator.accentGlow,
  }),
  utility: ({ colors }) => ({
    backgroundColor: "rgba(255, 77, 186, 0.1)",
  }),
  equals: ({ colors }) => ({
    backgroundColor: "rgba(255, 77, 186, 0.42)",
  }),
};

const $topRim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 1,
  left: 16,
  right: 16,
  height: 1,
  backgroundColor: colors.calculator.keyEdgeHighlight,
  opacity: 0.62,
});

const $edgeRim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 12,
  bottom: 12,
  left: 8,
  width: 1,
  backgroundColor: colors.calculator.keyRimLight,
  opacity: 0.3,
});

const $bottomDepth: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 10,
  height: 22,
  borderRadius: 999,
  backgroundColor: colors.calculator.keyBaseShadow,
  opacity: 0.34,
});

const $face: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  top: 4,
  right: 4,
  bottom: 4,
  left: 4,
  borderRadius: INNER_RADIUS,
  overflow: "hidden",
  backgroundColor: colors.calculator.keyFallback,
});

const $pearlescent: ThemedStyle<ViewStyle> = () => ({
  borderRadius: INNER_RADIUS,
  opacity: 0.9,
});

const $faceGloss: ThemedStyle<ViewStyle> = () => ({
  borderRadius: INNER_RADIUS,
  opacity: 0.18,
});

const $faceTopRim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 1,
  left: 14,
  right: 14,
  height: 1,
  backgroundColor: colors.calculator.surfaceHighlight,
  opacity: 0.52,
});

const $faceBottomShade: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 18,
  right: 18,
  bottom: 8,
  height: 26,
  borderRadius: 999,
  backgroundColor: colors.calculator.keyInnerShadow,
  opacity: 0.3,
});

const $faceOutline: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: INNER_RADIUS,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
});

const $label: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.medium,
  letterSpacing: -0.45,
  includeFontPadding: false,
  textAlign: "center",
});

const $labelByVariant: Record<CalculatorKeyVariant, ThemedStyle<TextStyle>> = {
  number: ({ colors }) => ({
    color: colors.calculator.accentPinkSoft,
    fontSize: 30,
    lineHeight: 34,
    textShadowColor: "rgba(255, 77, 186, 0.26)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  }),
  operator: ({ colors }) => ({
    color: "#2B0A1F",
    fontSize: 34,
    lineHeight: 38,
    textShadowColor: "rgba(255,255,255,0.22)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  }),
  utility: ({ colors }) => ({
    color: colors.calculator.accentPinkSoft,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 0,
    textShadowColor: "rgba(255, 77, 186, 0.22)",
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  }),
  equals: ({ colors }) => ({
    color: "#220817",
    fontSize: 38,
    lineHeight: 42,
    textShadowColor: "rgba(255,255,255,0.28)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  }),
};

const $labelDisabled: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
});
