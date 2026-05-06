// import { FC, useEffect, useMemo } from "react";
// import { StyleSheet, View } from "react-native";
// import { LinearGradient } from "expo-linear-gradient";
// import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
// import Animated, {
//   Easing,
//   interpolate,
//   useAnimatedStyle,
//   useSharedValue,
//   withRepeat,
//   withSequence,
//   withTiming,
// } from "react-native-reanimated";

// import { useAppTheme } from "@/theme/context";

// type VaultHubBackgroundProps = {
//   reducedMotion?: boolean;
// };

// export const VaultHubBackground: FC<VaultHubBackgroundProps> = ({
//   reducedMotion = false,
// }) => {
//   const { theme } = useAppTheme();
//   const patternId = useMemo(
//     () => `vault-hub-pattern-${Math.random().toString(36).slice(2, 10)}`,
//     [],
//   );

//   const drift = useSharedValue(0);
//   const pulse = useSharedValue(reducedMotion ? 0.9 : 0.82);

//   useEffect(() => {
//     if (reducedMotion) {
//       return;
//     }

//     const ease = Easing.inOut(Easing.quad);

//     drift.value = withRepeat(
//       withSequence(
//         withTiming(1, { duration: 12000, easing: ease }),
//         withTiming(-1, { duration: 12000, easing: ease }),
//       ),
//       -1,
//       true,
//     );
//     pulse.value = withRepeat(
//       withSequence(
//         withTiming(1, { duration: 4200, easing: ease }),
//         withTiming(0.82, { duration: 4200, easing: ease }),
//       ),
//       -1,
//       true,
//     );
//   }, [drift, pulse, reducedMotion]);

//   const dotStyle = useAnimatedStyle(() => ({
//     opacity: interpolate(drift.value, [-1, 1], [0.18, 0.3]),
//     transform: [
//       { translateX: interpolate(drift.value, [-1, 1], [-4, 4]) },
//       { translateY: interpolate(drift.value, [-1, 1], [3, -3]) },
//     ],
//   }));

//   const glowAStyle = useAnimatedStyle(() => ({
//     opacity: interpolate(pulse.value, [0.82, 1], [0.16, 0.3]),
//     transform: [{ scale: interpolate(pulse.value, [0.82, 1], [0.96, 1.04]) }],
//   }));

//   const glowBStyle = useAnimatedStyle(() => ({
//     opacity: interpolate(drift.value, [-1, 1], [0.08, 0.18]),
//     transform: [{ scale: interpolate(drift.value, [-1, 1], [0.96, 1.06]) }],
//   }));

//   return (
//     <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
//       <LinearGradient
//         colors={[theme.colors.vaultHub.vaultHubBg, theme.colors.vaultHub.vaultHubBgTint]}
//         start={{ x: 0.08, y: 0 }}
//         end={{ x: 0.82, y: 1 }}
//         style={StyleSheet.absoluteFillObject}
//       />

//       <Animated.View style={[StyleSheet.absoluteFillObject, dotStyle]}>
//         <Svg
//           width="100%"
//           height="100%"
//           viewBox="0 0 100 100"
//           preserveAspectRatio="none"
//           style={StyleSheet.absoluteFillObject}
//         >
//           <Defs>
//             <Pattern
//               id={patternId}
//               x="0"
//               y="0"
//               width="4"
//               height="4"
//               patternUnits="userSpaceOnUse"
//             >
//               <Circle
//                 cx="1"
//                 cy="1"
//                 r="0.24"
//                 fill={theme.colors.vaultHub.vaultHubAccentPinkSoft}
//                 opacity={0.18}
//               />
//             </Pattern>
//           </Defs>
//           <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
//         </Svg>
//       </Animated.View>

//       <Animated.View style={[styles.heroGlow, glowAStyle]}>
//         <View
//           style={[
//             styles.orb,
//             {
//               width: 420,
//               height: 420,
//               backgroundColor: theme.colors.vaultHub.vaultHubGlow,
//             },
//           ]}
//         />
//       </Animated.View>

//       <Animated.View style={[styles.secondaryGlow, glowBStyle]}>
//         <View
//           style={[
//             styles.orb,
//             {
//               width: 300,
//               height: 300,
//               backgroundColor: theme.colors.vaultHub.vaultHubGlow,
//             },
//           ]}
//         />
//       </Animated.View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   heroGlow: {
//     position: "absolute",
//     top: 140,
//     left: "50%",
//     marginLeft: -210,
//   },
//   secondaryGlow: {
//     position: "absolute",
//     bottom: 120,
//     right: -90,
//   },
//   orb: {
//     borderRadius: 999,
//   },
// });



import { FC, useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "@/theme/context";

type VaultHubBackgroundProps = {
  reducedMotion?: boolean;
};

const AnimatedView = Animated.View;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const VaultHubBackground: FC<VaultHubBackgroundProps> = ({
  reducedMotion = false,
}) => {
  const { theme } = useAppTheme();

  const primaryPatternId = useMemo(
    () => `vault-dot-pattern-primary-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const secondaryPatternId = useMemo(
    () => `vault-dot-pattern-secondary-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  const drift = useSharedValue(0);
  const pulse = useSharedValue(reducedMotion ? 0.92 : 0.84);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;

    const ease = Easing.inOut(Easing.quad);

    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 14000, easing: ease }),
        withTiming(-1, { duration: 14000, easing: ease }),
      ),
      -1,
      true,
    );

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
  }, [drift, pulse, reducedMotion, shimmer]);

  const primaryDotsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [-1, 1], [-2.5, 2.5]) },
      { translateY: interpolate(drift.value, [-1, 1], [2, -2]) },
    ],
    opacity: interpolate(shimmer.value, [0, 1], [0.42, 0.62]),
  }));

  const secondaryDotsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [-1, 1], [1.5, -1.5]) },
      { translateY: interpolate(drift.value, [-1, 1], [-1, 1]) },
    ],
    opacity: interpolate(shimmer.value, [0, 1], [0.16, 0.28]),
  }));

  const topGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.84, 1], [0.1, 0.18]),
    transform: [
      { scale: interpolate(pulse.value, [0.84, 1], [0.96, 1.04]) },
      { translateX: interpolate(drift.value, [-1, 1], [-8, 8]) },
      { translateY: interpolate(drift.value, [-1, 1], [6, -6]) },
    ],
  }));

  const bottomGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [-1, 1], [0.08, 0.16]),
    transform: [
      { scale: interpolate(drift.value, [-1, 1], [0.94, 1.06]) },
      { translateX: interpolate(drift.value, [-1, 1], [8, -8]) },
      { translateY: interpolate(drift.value, [-1, 1], [-6, 6]) },
    ],
  }));

  const centerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.84, 1], [0.06, 0.12]),
    transform: [
      { scale: interpolate(pulse.value, [0.84, 1], [0.94, 1.05]) },
      { translateY: interpolate(drift.value, [-1, 1], [3, -3]) },
    ],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {/* <LinearGradient
        colors={[theme.colors.vault.vaultBg, theme.colors.vault.vaultBgTint]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      /> */}

      <AnimatedView style={[StyleSheet.absoluteFillObject, primaryDotsStyle]}>
        <Svg
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}
          style={StyleSheet.absoluteFillObject}
        >
          <Defs>
            <Pattern
              id={primaryPatternId}
              patternUnits="userSpaceOnUse"
              width="16"
              height="16"
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
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT}
            fill={`url(#${primaryPatternId})`}
          />
        </Svg>
      </AnimatedView>
{/* 
      <AnimatedView style={[StyleSheet.absoluteFillObject, secondaryDotsStyle]}>
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
        <Stop offset="0%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="1" />
        <Stop offset="30%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0.22" />
        <Stop offset="62%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0.1" />
        <Stop offset="100%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0" />
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
        <Stop offset="0%" stopColor={theme.colors.vault.vaultGlow2} stopOpacity="1" />
        <Stop offset="34%" stopColor={theme.colors.vault.vaultGlow2} stopOpacity="0.7" />
        <Stop offset="68%" stopColor={theme.colors.vault.vaultGlow2} stopOpacity="0.08" />
        <Stop offset="100%" stopColor={theme.colors.vault.vaultGlow2} stopOpacity="0" />
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
        <Stop offset="0%" stopColor={theme.colors.vault.vaultGlow3} stopOpacity="1" />
        <Stop offset="24%" stopColor={theme.colors.vault.vaultGlow3} stopOpacity="0.8" />
        <Stop offset="52%" stopColor={theme.colors.vault.vaultGlow3} stopOpacity="0.1" />
        <Stop offset="100%" stopColor={theme.colors.vault.vaultGlow3} stopOpacity="0" />
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