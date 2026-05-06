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
import { createMoldedSurface, createSoftShadow } from "@/theme/calculatorStyling";
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

const OUTER_RADIUS = 22;
const INNER_RADIUS = 17;

const $shell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  minHeight: 78,
  borderRadius: OUTER_RADIUS,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: colors.calculator.keyBorder,
  ...createSoftShadow({
    color: colors.calculator.keyShadow,
    opacity: 0.28,
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
  ...createMoldedSurface({
    backgroundColor: colors.calculator.keyFallback,
    radius: OUTER_RADIUS,
  }),
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.md,
});

const $ambientGlow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: 10,
  right: 10,
  bottom: -18,
  height: 54,
  borderRadius: 999,
});

const $ambientGlowByVariant: Record<CalculatorKeyVariant, ThemedStyle<ViewStyle>> = {
  number: ({ colors }) => ({
    backgroundColor: colors.calculator.surfaceGlow,
  }),
  operator: ({ colors }) => ({
    backgroundColor: colors.calculator.accentPurpleSoft,
  }),
  utility: ({ colors }) => ({
    backgroundColor: colors.calculator.accentPurpleSoft,
  }),
  equals: ({ colors }) => ({
    backgroundColor: colors.calculator.accentGlow,
  }),
};

const $topRim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  left: 8,
  right: 8,
  height: 1,
  backgroundColor: colors.calculator.keyEdgeHighlight,
  opacity: 0.9,
});

const $edgeRim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 8,
  bottom: 10,
  left: 0,
  width: 1,
  backgroundColor: colors.calculator.keyRimLight,
  opacity: 0.6,
});

const $bottomDepth: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 10,
  right: 10,
  bottom: 4,
  height: 14,
  borderRadius: 999,
  backgroundColor: colors.calculator.keyBaseShadow,
  opacity: 0.3,
});

const $face: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  top: 6,
  right: 6,
  bottom: 8,
  left: 6,
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
  opacity: 0.22,
});

const $faceTopRim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  left: 7,
  right: 7,
  height: 1,
  backgroundColor: colors.calculator.surfaceHighlight,
  opacity: 0.72,
});

const $faceBottomShade: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 10,
  right: 10,
  bottom: 0,
  height: 14,
  borderRadius: 999,
  backgroundColor: colors.calculator.keyInnerShadow,
  opacity: 0.22,
});

const $faceOutline: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: INNER_RADIUS,
  borderWidth: 1,
  borderColor: colors.calculator.keyInnerBorder,
});

const $label: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.medium,
  letterSpacing: -0.45,
  includeFontPadding: false,
  textAlign: "center",
});

const $labelByVariant: Record<CalculatorKeyVariant, ThemedStyle<TextStyle>> = {
  number: ({ colors }) => ({
    color: colors.calculator.keyText,
    fontSize: 29,
    lineHeight: 34,
  }),
  operator: ({ colors }) => ({
    color: colors.calculator.operatorText,
    fontSize: 29,
    lineHeight: 34,
  }),
  utility: ({ colors }) => ({
    color: colors.calculator.utilityText,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 0,
  }),
  equals: ({ colors }) => ({
    color: colors.calculator.equalsText,
    fontSize: 33,
    lineHeight: 38,
  }),
};

const $labelDisabled: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
});
