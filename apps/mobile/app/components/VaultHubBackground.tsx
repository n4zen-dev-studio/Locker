import React, { FC, memo, useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { DeviceMotion } from "expo-sensors";
import Svg, {
  Circle,
  Defs,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "@/theme/context";

type VaultHubBackgroundProps = {
  reducedMotion?: boolean;
  dimmed?: boolean;
  active?: boolean;
};

const AnimatedView = Animated.View;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const clamp = (value: number, min: number, max: number) => {
  "worklet";
  return Math.min(Math.max(value, min), max);
};

const VaultHubBackgroundComponent: FC<VaultHubBackgroundProps> = ({
  reducedMotion = false,
  dimmed = false,
  active = true,
}) => {
  const { theme } = useAppTheme();

  const primaryPatternId = useMemo(
    () =>
      `vault-dot-pattern-primary-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const secondaryPatternId = useMemo(
    () =>
      `vault-dot-pattern-secondary-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const pulse = useSharedValue(reducedMotion ? 0.92 : 0.84);
  const shimmer = useSharedValue(0);

  // aurora motion
  const topBlobX = useSharedValue(0);
  const topBlobY = useSharedValue(0);
  const topBlobScale = useSharedValue(1);

  const bottomBlobX = useSharedValue(0);
  const bottomBlobY = useSharedValue(0);
  const bottomBlobScale = useSharedValue(1);

  const centerBlobX = useSharedValue(0);
  const centerBlobY = useSharedValue(0);
  const centerBlobScale = useSharedValue(1);

  // device tilt parallax
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  useEffect(() => {
    const motionValues = [
      pulse,
      shimmer,
      topBlobX,
      topBlobY,
      topBlobScale,
      bottomBlobX,
      bottomBlobY,
      bottomBlobScale,
      centerBlobX,
      centerBlobY,
      centerBlobScale,
      tiltX,
      tiltY,
    ];

    const cancelMotion = () => {
      motionValues.forEach(cancelAnimation);
    };

    if (reducedMotion || !active) {
      cancelMotion();
      pulse.value = 0.92;
      shimmer.value = 0;
      topBlobX.value = 0;
      topBlobY.value = 0;
      topBlobScale.value = 1;
      bottomBlobX.value = 0;
      bottomBlobY.value = 0;
      bottomBlobScale.value = 1;
      centerBlobX.value = 0;
      centerBlobY.value = 0;
      centerBlobScale.value = 1;
      tiltX.value = 0;
      tiltY.value = 0;
      return cancelMotion;
    }

    const ease = Easing.inOut(Easing.quad);

    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4600, easing: ease }),
        withTiming(0.84, { duration: 4600, easing: ease }),
      ),
      -1,
      true,
    );

    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 8000, easing: ease }),
        withTiming(0, { duration: 8000, easing: ease }),
      ),
      -1,
      false,
    );

    topBlobX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 26000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    topBlobY.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 24000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 21000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    topBlobScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 18000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.96, { duration: 18000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    bottomBlobX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 26000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 23000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    bottomBlobY.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 21000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 25000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    bottomBlobScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 17000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.95, { duration: 17000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    centerBlobX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 20000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 24000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    centerBlobY.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 23000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 20000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    centerBlobScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 19000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.97, { duration: 19000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    DeviceMotion.setUpdateInterval(48);

    const subscription = DeviceMotion.addListener((event) => {
      const rotation = event.rotation ?? {};
      const rawTiltX = clamp(rotation.beta ?? 0, -0.6, 0.6);
      const rawTiltY = clamp(rotation.gamma ?? 0, -0.6, 0.6);

      tiltX.value = withSpring(rawTiltY, {
        damping: 18,
        stiffness: 90,
        mass: 0.8,
      });

      tiltY.value = withSpring(rawTiltX, {
        damping: 18,
        stiffness: 90,
        mass: 0.8,
      });
    });

    return () => {
      cancelMotion();
      subscription.remove();
    };
  }, [
    active,
    bottomBlobScale,
    bottomBlobX,
    bottomBlobY,
    centerBlobScale,
    centerBlobX,
    centerBlobY,
    pulse,
    reducedMotion,
    shimmer,
    tiltX,
    tiltY,
    topBlobScale,
    topBlobX,
    topBlobY,
  ]);

  // dots: parallax only, no looping float
  const primaryDotsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tiltX.value, [-0.6, 0.6], [-2, 2]) },
      { translateY: interpolate(tiltY.value, [-0.6, 0.6], [-1.5, 1.5]) },
    ],
    opacity: interpolate(shimmer.value, [0, 1], [0.42, 0.62]),
  }));

  const secondaryDotsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tiltX.value, [-0.6, 0.6], [-5, 5]) },
      { translateY: interpolate(tiltY.value, [-0.6, 0.6], [-3.5, 3.5]) },
    ],
    opacity: interpolate(shimmer.value, [0, 1], [0.16, 0.28]),
  }));

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.84, 1], [0.1, 0.18]),
    transform: [
      { scale: topBlobScale.value },
      {
        translateX:
          interpolate(topBlobX.value, [-1, 1], [-14, 14]) +
          interpolate(tiltX.value, [-0.6, 0.6], [-8, 8]),
      },
      {
        translateY:
          interpolate(topBlobY.value, [-1, 1], [-10, 12]) +
          interpolate(tiltY.value, [-0.6, 0.6], [-6, 6]),
      },
    ],
  }));

  const bottomGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.84, 1], [0.08, 0.16]),
    transform: [
      { scale: bottomBlobScale.value },
      {
        translateX:
          interpolate(bottomBlobX.value, [-1, 1], [-12, 12]) +
          interpolate(tiltX.value, [-0.6, 0.6], [-10, 10]),
      },
      {
        translateY:
          interpolate(bottomBlobY.value, [-1, 1], [-12, 10]) +
          interpolate(tiltY.value, [-0.6, 0.6], [-8, 8]),
      },
    ],
  }));

  const centerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.84, 1], [0.06, 0.12]),
    transform: [
      { scale: centerBlobScale.value },
      {
        translateX:
          interpolate(centerBlobX.value, [-1, 1], [-12, 12]) +
          interpolate(tiltX.value, [-0.6, 0.6], [-7, 7]),
      },
      {
        translateY:
          interpolate(centerBlobY.value, [-1, 1], [-10, 10]) +
          interpolate(tiltY.value, [-0.6, 0.6], [-5, 5]),
      },
    ],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        colors={["#040208", "#12071454"]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {!dimmed && (
        <AnimatedView style={[StyleSheet.absoluteFillObject]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
            <Defs>
              <Pattern
                id={primaryPatternId}
                patternUnits="userSpaceOnUse"
                width="18"
                height="18"
                x="0"
                y="0"
              >
                <Circle
                  cx="9"
                  cy="9"
                  r="0.9"
                  fill="rgba(165, 150, 169, 0.75)"
                />
              </Pattern>
            </Defs>

            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill={`url(#${primaryPatternId})`}
            />
          </Svg>
        </AnimatedView>
      )}

      {/* <AnimatedView style={[StyleSheet.absoluteFillObject, secondaryDotsStyle]}>
        <Svg
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}
          style={StyleSheet.absoluteFillObject}
        >
          <Defs>
            <Pattern
              id={secondaryPatternId}
              patternUnits="userSpaceOnUse"
              width="36"
              height="36"
              x="0"
              y="0"
            >
              <Circle
                cx="18"
                cy="18"
                r="1.15"
                fill="rgb(235, 16, 173)"
              />
            </Pattern>
          </Defs>

          <Rect
            x="0"
            y="0"
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT}
            fill={`url(#${secondaryPatternId})`}
          />
        </Svg>
      </AnimatedView> */}

      <AnimatedView style={[styles.topGlow, topGlowStyle]}>
        <Svg
          width={styles.topGlowOrb.width}
          height={styles.topGlowOrb.height}
          viewBox={`0 0 ${styles.topGlowOrb.width} ${styles.topGlowOrb.height}`}
        >
          <Defs>
            <RadialGradient
              id="topGlowGradient"
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop
                offset="0%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="1"
              />
              <Stop
                offset="30%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="0.82"
              />
              <Stop
                offset="62%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="0.1"
              />
              <Stop
                offset="100%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="0"
              />
            </RadialGradient>
          </Defs>
          <Circle
            cx={styles.topGlowOrb.width / 2}
            cy={styles.topGlowOrb.height / 2}
            r={styles.topGlowOrb.width / 2}
            fill="url(#topGlowGradient)"
          />
        </Svg>
      </AnimatedView>

      <AnimatedView style={[styles.bottomGlow, bottomGlowStyle]}>
        <Svg
          width={styles.bottomGlowOrb.width}
          height={styles.bottomGlowOrb.height}
          viewBox={`0 0 ${styles.bottomGlowOrb.width} ${styles.bottomGlowOrb.height}`}
        >
          <Defs>
            <RadialGradient
              id="bottomGlowGradient"
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop
                offset="0%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="1"
              />
              <Stop
                offset="34%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="0.7"
              />
              <Stop
                offset="68%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="0.08"
              />
              <Stop
                offset="100%"
                stopColor={theme.colors.vault.vaultGlow}
                stopOpacity="0"
              />
            </RadialGradient>
          </Defs>
          <Circle
            cx={styles.bottomGlowOrb.width / 2}
            cy={styles.bottomGlowOrb.height / 2}
            r={styles.bottomGlowOrb.width / 2}
            fill="url(#bottomGlowGradient)"
          />
        </Svg>
      </AnimatedView>

      <AnimatedView style={[styles.centerGlow, centerGlowStyle]}>
        <Svg
          width={styles.centerGlowOrb.width}
          height={styles.centerGlowOrb.height}
          viewBox={`0 0 ${styles.centerGlowOrb.width} ${styles.centerGlowOrb.height}`}
        >
          <Defs>
            <RadialGradient
              id="centerGlowGradient"
              cx="50%"
              cy="50%"
              rx="50%"
              ry="50%"
              fx="50%"
              fy="50%"
            >
              <Stop
                offset="0%"
                stopColor={theme.colors.vault.vaultGlow2}
                stopOpacity="1"
              />
              <Stop
                offset="24%"
                stopColor={theme.colors.vault.vaultGlow2}
                stopOpacity="0.8"
              />
              <Stop
                offset="52%"
                stopColor={theme.colors.vault.vaultGlow2}
                stopOpacity="0.1"
              />
              <Stop
                offset="100%"
                stopColor={theme.colors.vault.vaultGlow2}
                stopOpacity="0"
              />
            </RadialGradient>
          </Defs>
          <Circle
            cx={styles.centerGlowOrb.width / 2}
            cy={styles.centerGlowOrb.height / 2}
            r={styles.centerGlowOrb.width / 2}
            fill="url(#centerGlowGradient)"
          />
        </Svg>
      </AnimatedView>

      <View style={styles.vignetteOverlay} />
    </View>
  );
};

export const VaultHubBackground = memo(VaultHubBackgroundComponent);

const styles = StyleSheet.create({
  topGlow: {
    position: "absolute",
    top: -120,
    right: -140,
  },
  bottomGlow: {
    position: "absolute",
    bottom: 12,
    left: -132,
  },
  centerGlow: {
    position: "absolute",
    bottom: "20%",
    alignSelf: "center",
    marginLeft: 200,
  },
  glowOrb: {
    borderRadius: 999,
  },
  topGlowOrb: {
    width: 420,
    height: 420,
  },
  bottomGlowOrb: {
    width: 360,
    height: 360,
  },
  centerGlowOrb: {
    width: 360,
    height: 360,
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 2, 12, 0.14)",
  },
});
