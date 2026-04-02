import { FC, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
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
          width="5.2"
          height="5.2"
          patternUnits="userSpaceOnUse"
        >
          <Circle cx="1.3" cy="1.3" r="0.2" fill={color} opacity={opacity} />
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
  const driftA = useSharedValue(0);
  const driftB = useSharedValue(0);
  const dotShift = useSharedValue(0);
  const bloom = useSharedValue(reducedMotion ? 0.94 : 0.88);

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
        withTiming(-1, { duration: 9800, easing: ease }),
        withTiming(1, { duration: 9100, easing: ease }),
      ),
      -1,
      true,
    );

    dotShift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 14000, easing: ease }),
        withTiming(-1, { duration: 14000, easing: ease }),
      ),
      -1,
      true,
    );

    bloom.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4800, easing: ease }),
        withTiming(0.88, { duration: 4800, easing: ease }),
      ),
      -1,
      true,
    );
  }, [bloom, dotShift, driftA, driftB, reducedMotion]);

  const dotPatternStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(dotShift.value, [-1, 1], [-4, 4]) },
      { translateY: interpolate(dotShift.value, [-1, 1], [3, -3]) },
    ],
    opacity: interpolate(dotShift.value, [-1, 1], [0.4, 0.52]),
  }));

  const bloomTopStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftA.value, [-1, 1], [-18, 14]) },
      { translateY: interpolate(driftA.value, [-1, 1], [14, -10]) },
      { scale: interpolate(bloom.value, [0.88, 1], [0.98, 1.04]) },
    ],
    opacity: interpolate(bloom.value, [0.88, 1], [0.18, 0.28]),
  }));

  const bloomBottomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftB.value, [-1, 1], [16, -12]) },
      { translateY: interpolate(driftB.value, [-1, 1], [-10, 14]) },
      { scale: interpolate(driftB.value, [-1, 1], [0.97, 1.03]) },
    ],
    opacity: interpolate(bloom.value, [0.88, 1], [0.12, 0.2]),
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={styles.base} />

      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.dotPatternWrap,
          dotPatternStyle,
        ]}
      >
        <DotPatternBackground color="rgba(255, 201, 229, 0.66)" opacity={1} />
      </Animated.View>

      <View style={styles.vignette} />
      <View style={styles.edgeVignetteLeft} />
      <View style={styles.edgeVignetteRight} />

      <Animated.View style={[styles.bloomTop, bloomTopStyle]}>
        <View style={styles.bloomHot} />
      </Animated.View>

      <Animated.View style={[styles.bloomBottom, bloomBottomStyle]}>
        <View style={styles.bloomSoft} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#060607",
  },
  dotPatternWrap: {
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
  },
  bloomTop: {
    position: "absolute",
    top: -70,
    right: -110,
  },
  bloomBottom: {
    position: "absolute",
    left: -90,
    bottom: 140,
  },
  bloomHot: {
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: "rgba(255, 79, 163, 0.94)",
  },
  bloomSoft: {
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(255, 79, 163, 0.72)",
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  edgeVignetteLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -36,
    width: 92,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  edgeVignetteRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: -36,
    width: 92,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.46)",
  },
});
