import { FC, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

import { useAppTheme } from "@/theme/context";

type AnimatedScreenBackgroundProps = {
  reducedMotion?: boolean;
};

type GlowOrbProps = {
  size: number;
  color: string;
  coreColor: string;
  opacity?: number;
};

type DotPatternBackgroundProps = {
  color: string;
  opacity?: number;
};

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export const DotPatternBackground: FC<DotPatternBackgroundProps> = ({
  color,
  opacity = 1,
}) => {
  const patternId = useMemo(
    () => `calculator-dot-pattern-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFillObject}
    >
      <Defs>
        <Pattern
          id={patternId}
          x="0"
          y="0"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <Circle cx="1" cy="1" r="0.26" fill={color} opacity={opacity} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
    </Svg>
  );
};

export const GlowOrb: FC<GlowOrbProps> = ({
  size,
  color,
  coreColor,
  opacity = 0.75,
}) => {
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, opacity, overflow: "hidden" }}
    >
      <AnimatedSvg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect
          x="0"
          y="0"
          width={size}
          height={size}
          fill={coreColor}
          opacity={0.14}
          rx={size / 2}
        />
        <Circle cx={size * 0.5} cy={size * 0.5} r={size * 0.5} fill={color} opacity={0.18} />
        <Circle cx={size * 0.44} cy={size * 0.44} r={size * 0.24} fill={coreColor} opacity={0.56} />
      </AnimatedSvg>
    </View>
  );
};

export const AnimatedScreenBackground: FC<AnimatedScreenBackgroundProps> = ({
  reducedMotion = false,
}) => {
  const { theme } = useAppTheme();

  const driftA = useSharedValue(0);
  const driftB = useSharedValue(0);
  const driftC = useSharedValue(0);
  const dotShift = useSharedValue(0);
  const bloom = useSharedValue(reducedMotion ? 0.92 : 0.84);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const ease = Easing.inOut(Easing.quad);

    driftA.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 7600, easing: ease }),
        withTiming(-1, { duration: 8200, easing: ease }),
      ),
      -1,
      true,
    );

    driftB.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 9200, easing: ease }),
        withTiming(1, { duration: 8600, easing: ease }),
      ),
      -1,
      true,
    );

    driftC.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 10400, easing: ease }),
        withTiming(-1, { duration: 9600, easing: ease }),
      ),
      -1,
      true,
    );

    dotShift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 12000, easing: ease }),
        withTiming(-1, { duration: 12000, easing: ease }),
      ),
      -1,
      true,
    );

    bloom.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200, easing: ease }),
        withTiming(0.84, { duration: 4200, easing: ease }),
      ),
      -1,
      true,
    );
  }, [bloom, dotShift, driftA, driftB, driftC, reducedMotion]);

  const dotPatternStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(dotShift.value, [-1, 1], [-5, 5]) },
      { translateY: interpolate(dotShift.value, [-1, 1], [4, -4]) },
    ],
    opacity: interpolate(dotShift.value, [-1, 1], [0.24, 0.32]),
  }));

  const orbAStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftA.value, [-1, 1], [-18, 24]) },
      { translateY: interpolate(driftA.value, [-1, 1], [20, -16]) },
      { scale: interpolate(bloom.value, [0.84, 1], [0.98, 1.04]) },
    ],
    opacity: interpolate(bloom.value, [0.84, 1], [0.68, 0.92]),
  }));

  const orbBStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftB.value, [-1, 1], [22, -18]) },
      { translateY: interpolate(driftB.value, [-1, 1], [-16, 20]) },
      { scale: interpolate(driftB.value, [-1, 1], [0.98, 1.06]) },
    ],
    opacity: interpolate(bloom.value, [0.84, 1], [0.52, 0.72]),
  }));

  const orbCStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftC.value, [-1, 1], [-12, 12]) },
      { translateY: interpolate(driftC.value, [-1, 1], [14, -10]) },
      { scale: interpolate(driftC.value, [-1, 1], [0.94, 1.02]) },
    ],
    opacity: interpolate(driftC.value, [-1, 1], [0.24, 0.4]),
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        colors={theme.colors.calculator.backgroundGradient}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.86, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={theme.colors.calculator.backgroundFieldGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.dotPatternWrap,
          dotPatternStyle,
        ]}
      >
        <DotPatternBackground color={theme.colors.calculator.dotPattern} opacity={1} />
      </Animated.View>

      <Animated.View style={[styles.orbTopRight, orbAStyle]}>
        <GlowOrb
          size={420}
          color={theme.colors.calculator.accentGlow}
          coreColor={theme.colors.calculator.accentPink}
          opacity={0.92}
        />
      </Animated.View>

      <Animated.View style={[styles.orbBottomLeft, orbBStyle]}>
        <GlowOrb
          size={360}
          color={theme.colors.calculator.accentPurpleSoft}
          coreColor={theme.colors.calculator.accentPurple}
          opacity={0.7}
        />
      </Animated.View>

      <Animated.View style={[styles.orbCenter, orbCStyle]}>
        <GlowOrb
          size={320}
          color={theme.colors.calculator.surfaceGlow}
          coreColor={theme.colors.calculator.accentPinkSoft}
          opacity={0.44}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  dotPatternWrap: {
    top: -12,
    left: -12,
    right: -12,
    bottom: -12,
  },
  orbTopRight: {
    position: "absolute",
    top: -84,
    right: -120,
  },
  orbBottomLeft: {
    position: "absolute",
    left: -110,
    bottom: 112,
  },
  orbCenter: {
    position: "absolute",
    right: -56,
    top: "36%",
  },
});
