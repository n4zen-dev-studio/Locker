import React, { FC, useMemo } from "react";
import {
  ColorValue,
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
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import Svg, { Defs, Stop, Circle, RadialGradient as SvgRadialGradient, } from "react-native-svg";

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
  const { themed } = useAppTheme();

  const progress = useSharedValue(0);
  const AnimatedView = Animated.createAnimatedComponent(View)
    const press = useSharedValue(0)

    const blobPulse = useSharedValue(0)

  const handlePressIn = () => {
    progress.value = withTiming(1, { duration: 140 });
  };

  const handlePressOut = () => {
    progress.value = withTiming(0, { duration: 220 });
  };

  const animatedShellStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 0.952]) },
      { translateY: interpolate(progress.value, [0, 1], [0, 3.5]) },
    ],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.42, 0.82]),
  }));

  const animatedFaceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.975]) }],
  }));

    const haloStyle = useAnimatedStyle(() => ({
      opacity: interpolate(blobPulse.value, [0, 1], [0.72, 1]) * interpolate(press.value, [0, 1], [1, 1.18]),
      transform: [
        { scale: interpolate(blobPulse.value, [0, 1], [0.94, 1.08]) },
        { scale: interpolate(press.value, [0, 1], [1, 1.06]) },
      ],
    }))
  const pressGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(press.value, [-0.14, 0, 1], [0.24, 0.14, 0.3]),
    transform: [{ scale: interpolate(press.value, [-0.14, 0, 1], [1.04, 0.98, 1.08]) }],
  }))
  const palette = getKeyPalette(variant);

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


        <Animated.View
          pointerEvents="none"
          style={[themed($ambientGlow), themed($ambientGlowByVariant[variant]), animatedGlowStyle]}
        />
        {/* <View pointerEvents="none" style={themed($topRim)} /> */}
        {/* <View pointerEvents="none" style={themed($edgeRim)} /> */}
        {/* <View pointerEvents="none" style={themed($bottomDepth)} /> */}
           <AnimatedView pointerEvents="none" style={[styles.satellitePressGlow, pressGlowStyle]}>
        <GlowBlob size={104} color={"#FFF7FD"} opacity={0.78} />
      </AnimatedView>
 
      <AnimatedView style={[styles.satelliteHaloWrap, haloStyle]}>
        <GlowBlob size={96} color={"#FFF7FD"} opacity={0.8} />
      </AnimatedView> 

        <Animated.View
          pointerEvents="none"
          style={[themed($face), animatedFaceStyle]}
        >
          <LinearGradient
            colors={palette.innerGradient}
            start={{ x: 0.12, y: 0.05 }}
            end={{ x: 0.82, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          <LinearGradient
            colors={palette.highlightGradient}
            start={{ x: 0.2, y: 0.04 }}
            end={{ x: 0.84, y: 0.94 }}
            style={[StyleSheet.absoluteFillObject, themed($faceGloss)]}
          />

          <AnimatedView style={[styles.satelliteHaloWrap, haloStyle]}>
        <GlowBlob size={96} color={palette.coreGlow} opacity={0.8} />
      </AnimatedView> 
          <View pointerEvents="none" style={themed($faceTopRim)} />
          <View
            pointerEvents="none"
            style={[themed($faceOutline), { borderColor: palette.outline }]}
          />
        </Animated.View>

        <Text
          preset={variant === "equals" ? "heading" : "subheading"}
          style={[
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


function GlowBlob({
  size,
  color,
  opacity = 1,
}: {
  size: number
  color: string
  opacity?: number
}) {
  const id = useMemo(
    () => `grad-${color.replace(/[^a-zA-Z0-9]/g, "")}-${size}-${Math.round(opacity * 1000)}`,
    [color, opacity, size],
  )

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <SvgRadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.96 * opacity} />
          <Stop offset="28%" stopColor={color} stopOpacity={0.68 * opacity} />
          <Stop offset="58%" stopColor={color} stopOpacity={0.24 * opacity} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgRadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  )
}

type KeyPalette = {
  outerGradient: readonly [string, string, ...string[]];
  innerGradient: readonly [string, string, ...string[]];
  highlightGradient: readonly [string, string, ...string[]];
  coreGlow: ColorValue;
  outline: ColorValue;
};

function getKeyPalette(variant: CalculatorKeyVariant): KeyPalette {
  switch (variant) {
    case "operator":
      return {
        outerGradient: ["#ffb8df", "#ff6bb8", "#fd3294"],
        innerGradient: ["#ffe4f2", "#fb4aa9", "#fd369a"],
        highlightGradient: [
          "rgba(255,255,255,0.34)",
          "rgba(255,255,255,0.14)",
          "rgba(255,255,255,0)",
        ],
        coreGlow: "rgba(255, 255, 255, 0.2)",
        outline: "rgba(255, 232, 243, 0.36)",
      };
    case "equals":
      return {
        outerGradient: ["#ffd0ea", "#ff7dc4", "#ff4fa3"],
        innerGradient: ["#fff0f8", "#ffb0dc", "#ff5eaf"],
        highlightGradient: [
          "rgba(255,255,255,0.4)",
          "rgba(255,255,255,0.16)",
          "rgba(255,255,255,0)",
        ],
        coreGlow: "rgba(255, 255, 255, 0.24)",
        outline: "rgba(255, 244, 248, 0.4)",
      };
    case "utility":
      return {
        outerGradient: ["#25131f", "#100a10", "#0a0709"],
        innerGradient: ["#1f121a", "#120b12", "#0c090c"],
        highlightGradient: [
          "rgba(255, 188, 224, 0.14)",
          "rgba(255, 188, 224, 0.04)",
          "rgba(0,0,0,0)",
        ],
        coreGlow: "rgba(255, 79, 163, 0.12)",
        outline: "rgba(255, 145, 205, 0.26)",
      };
    case "number":
    default:
      return {
        outerGradient: ["#22131d", "#100a10", "#090708"],
        innerGradient: ["#1a1117", "#100a10", "#0b080b"],
        highlightGradient: [
          "rgba(255, 192, 226, 0.12)",
          "rgba(255, 192, 226, 0.03)",
          "rgba(0,0,0,0)",
        ],
        coreGlow: "rgba(255, 79, 163, 0.14)",
        outline: "rgba(255, 150, 210, 0.2)",
      };
  }
}

const OUTER_RADIUS = 999;
const INNER_RADIUS = 999;

const $shell: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 92,
  aspectRatio: 1,
  borderRadius: OUTER_RADIUS,
  overflow: "visible",
  shadowColor: "#000",
  shadowOpacity: 0.18,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
});

const $shellByVariant: Record<CalculatorKeyVariant, ThemedStyle<ViewStyle>> = {
  number: () => ({
    shadowColor: "#000",
  }),
  operator: () => ({
    shadowColor: "#ff4fa3",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  }),
  utility: () => ({
    shadowColor: "#000",
  }),
  equals: () => ({
    shadowColor: "#ff4fa3",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  }),
};

const $shellDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
});

const $pressable: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  borderRadius: OUTER_RADIUS,
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.md,
  borderWidth: 1,
  // borderColor: "rgba(255, 170, 218, 0.14)",
  backgroundColor: "#0d090d",
});

const $ambientGlow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: -8,
  right: -8,
  bottom: -10,
  top: -8,
  borderRadius: 999,
  opacity: 0.7,
});

const $ambientGlowByVariant: Record<CalculatorKeyVariant, ThemedStyle<ViewStyle>> = {
  number: () => ({ backgroundColor: "rgba(255, 79, 163, 0.1)" }),
  operator: () => ({ backgroundColor: "rgba(255, 79, 163, 0.38)" }),
  utility: () => ({ backgroundColor: "rgba(255, 79, 163, 0.12)" }),
  equals: () => ({ backgroundColor: "rgba(255, 79, 163, 0.54)" }),
};

const $topRim: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 2,
  left: 18,
  right: 18,
  height: 1,
  backgroundColor: "rgba(255, 226, 241, 0.34)",
  opacity: 1,
});

const $edgeRim: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 16,
  bottom: 16,
  left: 10,
  width: 1,
  backgroundColor: "rgba(255, 200, 228, 0.08)",
  opacity: 1,
});

const $bottomDepth: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: 18,
  right: 18,
  bottom: 8,
  height: 20,
  borderRadius: 999,
  backgroundColor: "rgba(0,0,0,0.56)",
  opacity: 1,
});

const $face: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  top: 3,
  right: 3,
  bottom: 3,
  left: 3,
  borderRadius: INNER_RADIUS,
  overflow: "hidden",
  backgroundColor: "#0f0a0f",
});

const $faceGloss: ThemedStyle<ViewStyle> = () => ({
  borderRadius: INNER_RADIUS,
  opacity: 0.18,
});

const $coreGlow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: "28%",
  right: "28%",
  top: "28%",
  bottom: "28%",
  borderRadius: 999,
});

const $faceTopRim: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 1,
  left: 16,
  right: 16,
  height: 1,
  backgroundColor: "rgba(255,255,255,0.14)",
  opacity: 1,
});

const $faceBottomShade: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: 20,
  right: 20,
  bottom: 10,
  height: 18,
  borderRadius: 999,
  backgroundColor: "rgba(0,0,0,0.34)",
  opacity: 1,
});

const $faceOutline: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  borderRadius: INNER_RADIUS,
  borderWidth: 1,
  borderColor: "rgba(255, 164, 212, 0.16)",
});

const $label: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.medium,
  letterSpacing: -0.4,
  includeFontPadding: false,
  textAlign: "center",
});

const $labelByVariant: Record<CalculatorKeyVariant, ThemedStyle<TextStyle>> = {
  number: () => ({
    color: "#ffa8df",
    fontSize: 32,
    lineHeight: 36,
    textShadowColor: "rgba(255, 79, 163, 0.16)",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 0 },
  }),
  operator: () => ({
    color: "#26131d",
    fontSize: 38,
    lineHeight: 42,
    textShadowColor: "rgba(255,255,255,0.08)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  }),
  utility: () => ({
    color: "#ffa1db",
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: 0,
    textShadowColor: "rgba(255, 79, 163, 0.12)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  }),
  equals: () => ({
    color: "#27111c",
    fontSize: 42,
    lineHeight: 46,
    textShadowColor: "rgba(255,255,255,0.1)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 0 },
  }),
};

const $labelDisabled: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
});

const styles = StyleSheet.create({
//   gestureRoot: {
//     flex: 1,
//   },
//   root: {
//     width: "100%",
//     height: "100%",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   canvas: {
//     width: CANVAS_SIZE,
//     height: CANVAS_SIZE,
//     alignItems: "center",
//     justifyContent: "center",
//     overflow: "visible",
//   },
//   heroDotField: {
//     ...StyleSheet.absoluteFillObject,
//     alignItems: "center",
//     justifyContent: "center",
//     zIndex: 0,
//   },
//   auroraLayer: {
//     ...StyleSheet.absoluteFillObject,
//     zIndex: 0,
//   },
//   auroraBlob: {
//     position: "absolute",
//     left: "50%",
//     top: "50%",
//     marginLeft: -152,
//     marginTop: -152,
//   },
//   orbitLayer: {
//     ...StyleSheet.absoluteFillObject,
//     alignItems: "center",
//     justifyContent: "center",
//     zIndex: 8,
//   },
//   connectorLayer: {
//     position: "absolute",
//     width: CANVAS_SIZE,
//     height: CANVAS_SIZE,
//     alignItems: "center",
//     justifyContent: "center",
//     zIndex: 1,
//   },
//   centerWrap: {
//     width: CENTER_SIZE,
//     height: CENTER_SIZE,
//     borderRadius: CENTER_SIZE / 2,
//     alignItems: "center",
//     justifyContent: "center",
//     zIndex: 10,
//   },
//   centerOuterGlow: {
//     position: "absolute",
//     width: 162,
//     height: 162,
//     opacity: 0.72,
//   },
//   centerShell: {
//     width: CENTER_SIZE,
//     height: CENTER_SIZE,
//     borderRadius: CENTER_SIZE / 2,
//     padding: 3,
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.12)",
//     shadowColor: "#8F9DFF",
//     shadowOpacity: 0.16,
//     shadowRadius: 18,
//     shadowOffset: { width: 0, height: 10 },
//     elevation: 10,
//   },
//   centerCore: {
//     flex: 1,
//     borderRadius: 999,
//     overflow: "hidden",
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: "#66297e",
//     borderWidth: 1,
//     borderColor: "rgba(255,255,255,0.08)",
//   },
//   centerTopHighlight: {
//     position: "absolute",
//     top: 4,
//     left: 10,
//     right: 30,
//     height: 20,
//     borderRadius: 999,
//     backgroundColor: "rgba(255, 255, 255, 0.16)",
//   },
//   centerBlobWrap: {
//     position: "absolute",
//     width: 66,
//     height: 66,
//   },
//   centerSymbolRing: {
//     width: 56,
//     height: 56,
//     borderRadius: 28,
//     alignItems: "center",
//     justifyContent: "center",
//     borderWidth: 0,
//     borderColor: "rgba(255,255,255,0.82)",
//   },
//   satelliteWrap: {
//     position: "absolute",
//     left: "50%",
//     top: "50%",
//     width: SATELLITE_SIZE,
//     height: SATELLITE_SIZE,
//     zIndex: 20,
//     alignItems: "center",
//     justifyContent: "center",
//   },
  satellitePressGlow: {
    position: "absolute",
    width: 104,
    height: 104,
  },
  satelliteHaloWrap: {
    position: "absolute",
    width: 96,
    height: 96,
  },
//   satelliteOuterRing: {
//     width: SATELLITE_SIZE,
//     height: SATELLITE_SIZE,
//     borderRadius: SATELLITE_RADIUS,
//     borderWidth: 1,
//     backgroundColor: "rgba(253, 251, 251, 0.01)",
//     shadowOpacity: 0.2,
//     shadowRadius: 14,
//     shadowOffset: { width: 0, height: 8 },
//     elevation: 8,
//   },
//   satelliteShell: {
//     flex: 1,
//     borderRadius: SATELLITE_RADIUS,
//     padding: 3,
//   },
//   satelliteCore: {
//     flex: 1,
//     borderRadius: 999,
//     overflow: "hidden",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   satelliteHighlightOverlay: {
//   ...StyleSheet.absoluteFillObject,
//   alignItems: "stretch",
//   justifyContent: "flex-start",
// },

//   satelliteTopHighlight: {
//     position: "absolute",
//     top: 0,
//     left: 7,
//     right: 30,
//     height: 15,
//     borderRadius: 999,
//     backgroundColor: "rgba(255, 255, 255, 0.16)",
//     transform: [{ rotate: "-15deg" }, { translateX: -2 }],

//   },
//   satelliteBlobWrap: {
//     position: "absolute",
//     width: 70,
//     height: 70,
//   },
})