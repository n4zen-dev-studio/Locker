import { FC, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Text } from "@/components/Text";
import {
  createMoldedSurface,
  createPressedInset,
  createSoftShadow,
} from "@/theme/calculatorStyling";
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

  const progress = useRef(new Animated.Value(0)).current;
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => {
    setIsPressed(true);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      speed: 34,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    Animated.spring(progress, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start();
  };

  const animatedStyle = {
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.978],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1.6],
        }),
      },
    ],
  };

  const shellGradient = theme.colors.calculator.keyGradients[variant];
  const faceGradient = theme.colors.calculator.keyFaceGradients[variant];
  const pearlescentGradient =
    variant === "operator" || variant === "equals"
      ? theme.colors.calculator.keyPearlescentGradient[variant]
      : null;

  return (
    <Animated.View
      style={[
        themed($shadowBase),
        themed($shadowByVariant[variant]),
        isPressed && themed($shadowPressed),
        animatedStyle,
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
        style={({ pressed }) => [
          themed($buttonBase),
          pressed && themed($buttonPressed),
          disabled && themed($buttonDisabled),
        ]}
      >
        <LinearGradient
          colors={theme.colors.calculator.keyBodyGradient}
          start={{ x: 0.12, y: 0.04 }}
          end={{ x: 0.9, y: 1 }}
          style={[StyleSheet.absoluteFillObject, themed($baseShellWash)]}
        />

        <LinearGradient
          colors={shellGradient}
          start={{ x: 0.16, y: 0.03 }}
          end={{ x: 0.9, y: 1 }}
          style={[StyleSheet.absoluteFillObject, themed($baseShellColor)]}
        />

        <LinearGradient
          colors={theme.colors.calculator.keyGlossGradient}
          start={{ x: 0.18, y: 0 }}
          end={{ x: 0.82, y: 0.68 }}
          style={[StyleSheet.absoluteFillObject, themed($outerPlaneGloss)]}
        />

        <View pointerEvents="none" style={themed($outerTopEdge)} />
        <View pointerEvents="none" style={themed($outerLeftEdge)} />
        <View pointerEvents="none" style={themed($outerBottomDepth)} />

        <View
          pointerEvents="none"
          style={[themed($innerFace), isPressed && themed($innerFacePressed)]}
        >
          <LinearGradient
            colors={faceGradient}
            start={{ x: 0.18, y: 0.04 }}
            end={{ x: 0.86, y: 0.96 }}
            style={StyleSheet.absoluteFillObject}
          />

          {pearlescentGradient ? (
            <LinearGradient
              colors={pearlescentGradient}
              start={{ x: 0.08, y: 0.12 }}
              end={{ x: 0.92, y: 0.92 }}
              style={[StyleSheet.absoluteFillObject, themed($pearlescentLayer)]}
            />
          ) : null}

          <LinearGradient
            colors={theme.colors.calculator.keyConcaveHighlightGradient}
            start={{ x: 0.2, y: 0.05 }}
            end={{ x: 0.82, y: 1 }}
            style={[StyleSheet.absoluteFillObject, themed($concavePlane)]}
          />

          <View pointerEvents="none" style={themed($faceTopPlane)} />
          <View pointerEvents="none" style={themed($faceLeftPlane)} />
          <View pointerEvents="none" style={themed($faceRightDepth)} />
          <View pointerEvents="none" style={themed($faceBottomDepth)} />
          <View pointerEvents="none" style={themed($centerDip)} />
          <View pointerEvents="none" style={themed($centerDipShade)} />
          <View pointerEvents="none" style={themed($faceInsetContour)} />

          {variant === "equals" ? (
            <View pointerEvents="none" style={themed($equalsAura)} />
          ) : null}
        </View>

        <Text
          preset={variant === "equals" ? "heading" : "subheading"}
          style={[
            themed($labelBase),
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

const OUTER_RADIUS = 18;
const INNER_RADIUS = 12;

const $shadowBase: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  borderRadius: OUTER_RADIUS,
  ...createSoftShadow({
    color: colors.calculator.keyShadow,
    opacity: 0.12,
    radius: 16,
    offsetY: 9,
    elevation: 6,
  }),
});

const $shadowByVariant: Record<CalculatorKeyVariant, ThemedStyle<ViewStyle>> = {
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

const $shadowPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...createSoftShadow({
    color: colors.calculator.keyShadowPressed,
    opacity: 0.08,
    radius: 7,
    offsetY: 3,
    elevation: 3,
  }),
});

const $buttonBase: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  ...createMoldedSurface({
    backgroundColor: colors.calculator.keyFallback,
    radius: OUTER_RADIUS,
  }),
  minHeight: 74,
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.sm,
  overflow: "hidden",
});

const $buttonPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.988,
});

const $buttonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
});

const $baseShellWash: ThemedStyle<ViewStyle> = () => ({
  borderRadius: OUTER_RADIUS,
  opacity: 0.92,
});

const $baseShellColor: ThemedStyle<ViewStyle> = () => ({
  borderRadius: OUTER_RADIUS,
  opacity: 0.98,
});

const $outerPlaneGloss: ThemedStyle<ViewStyle> = () => ({
  borderRadius: OUTER_RADIUS,
  opacity: 0.18,
});

const $outerTopEdge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 1,
  left: 6,
  right: 6,
  height: 12,
  borderRadius: 10,
  backgroundColor: colors.calculator.surfaceHighlight,
  opacity: 0.38,
});

const $outerLeftEdge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 2,
  top: 8,
  bottom: 10,
  width: 8,
  borderRadius: 8,
  backgroundColor: colors.calculator.surfaceHighlight,
  opacity: 0.05,
});

const $outerBottomDepth: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 8,
  right: 8,
  bottom: 4,
  height: 14,
  borderRadius: 10,
  backgroundColor: colors.calculator.keyBaseShadow,
  opacity: 0.06,
});

const $innerFace: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  top: 6,
  right: 6,
  bottom: 8,
  left: 6,
  borderRadius: INNER_RADIUS,
  overflow: "hidden",
  backgroundColor: colors.calculator.keyFallback,
});

const $innerFacePressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...createPressedInset({
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
    radius: INNER_RADIUS,
  }),
  backgroundColor: colors.calculator.surfaceBloom,
});

const $pearlescentLayer: ThemedStyle<ViewStyle> = () => ({
  borderRadius: INNER_RADIUS,
  opacity: 0.88,
});

const $concavePlane: ThemedStyle<ViewStyle> = () => ({
  borderRadius: INNER_RADIUS,
  opacity: 0.56,
});

const $faceTopPlane: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 0,
  left: 8,
  right: 8,
  height: 8,
  borderRadius: 10,
  backgroundColor: colors.calculator.surfaceHighlight,
  opacity: 0.18,
});

const $faceLeftPlane: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 8,
  left: 0,
  bottom: 12,
  width: 10,
  borderRadius: 8,
  backgroundColor: colors.calculator.surfaceHighlight,
  opacity: 0.05,
});

const $faceRightDepth: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 8,
  right: -1,
  bottom: 10,
  width: 12,
  borderRadius: 10,
  backgroundColor: colors.calculator.keyInnerShadow,
  opacity: 0.08,
});

const $faceBottomDepth: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 8,
  right: 8,
  bottom: -1,
  height: 18,
  borderRadius: 12,
  backgroundColor: colors.calculator.keyInnerShadow,
  opacity: 0.06,
});

const $centerDip: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 18,
  left: 16,
  right: 16,
  bottom: 14,
  borderRadius: 8,
  backgroundColor: colors.calculator.surfaceBloom,
  opacity: 0.08,
});

const $centerDipShade: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: 20,
  left: 18,
  right: 18,
  bottom: 12,
  borderRadius: 6,
  backgroundColor: colors.calculator.keyInnerShadow,
  opacity: 0.025,
});

const $faceInsetContour: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: INNER_RADIUS,
  borderTopWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: colors.calculator.keyBorderHighlight,
  borderLeftColor: colors.calculator.keyBorderHighlight,
  borderBottomWidth: 1,
  borderRightWidth: 1,
  borderBottomColor: colors.calculator.keyInnerShadow,
  borderRightColor: colors.calculator.keyInnerShadow,
  opacity: 0.06,
});

const $equalsAura: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  right: -8,
  bottom: -8,
  width: 44,
  height: 44,
  borderRadius: 999,
  backgroundColor: colors.calculator.ambientBlue,
  opacity: 0.24,
});

const $labelBase: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.medium,
  letterSpacing: -0.35,
  includeFontPadding: false,
  textAlign: "center",
  textShadowColor: "rgba(255,255,255,0.18)",
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
});

const $labelByVariant: Record<CalculatorKeyVariant, ThemedStyle<TextStyle>> = {
  number: ({ colors }) => ({
    color: colors.calculator.keyText,
    fontSize: 29,
    lineHeight: 33,
  }),
  operator: ({ colors }) => ({
    color: colors.calculator.operatorText,
    fontSize: 31,
    lineHeight: 34,
  }),
  utility: ({ colors }) => ({
    color: colors.calculator.utilityText,
    fontSize: 21,
    lineHeight: 25,
  }),
  equals: ({ colors }) => ({
    color: colors.calculator.equalsText,
    fontSize: 33,
    lineHeight: 37,
  }),
};

const $labelDisabled: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
});