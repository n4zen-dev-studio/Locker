import { FC, useEffect, useMemo } from "react";
import { Pressable, TextStyle, View, ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/Text";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { Ionicons } from "@expo/vector-icons"

type BiometricUnlockOrbProps = {
  onPress: () => void;
  label: string;
  disabled?: boolean;
  authenticating?: boolean;
  reducedMotion?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ORB_SIZE = 320;
const CENTER = ORB_SIZE / 2;
const HALO_SIZE = 260;
const CORE_SIZE = 152;
const INNER_CORE_SIZE = 120;

const RADII = {
  outerFrame: 132,
  outerSegment: 120,
  outerDash: 109,
  midSegment: 92,
  midDash: 80,
  innerSegment: 66,
  innerEnergy: 52,
} as const;

function useStableGradientId(prefix: string) {
  return useMemo(
    () => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
    [prefix],
  );
}

function renderFingerprintIcon(color: string) {
  return (
    // <Svg width={72} height={72} viewBox="0 0 24 24">
    //   <G fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    //     <Path d="M7 10.5a5 5 0 0 1 10 0v2.1" opacity="0.95" />
    //     <Path d="M4.5 10.5a7.5 7.5 0 0 1 15 0v1.8" opacity="0.5" />
    //     <Path d="M9 10.5a3 3 0 0 1 6 0v4.6" />
    //     <Path d="M12 9.5v8.8" />
    //     <Path d="M7.7 14.1v1.5c0 3 1.6 5.3 4.3 6.4" opacity="0.86" />
    //     <Path d="M16.3 14.1v.9c0 2.2-.8 4.1-2.4 5.5" opacity="0.86" />
    //     <Path d="M5.8 13.2v1.2c0 1.9.3 3.8 1.2 5.4" opacity="0.42" />
    //   </G>
    // </Svg>
    <Ionicons
              name={"finger-print-outline"}
              size={55}
              color={'#fff'}
              style={{ padding: 5 }}
            />
  );
}

export const BiometricUnlockOrb: FC<BiometricUnlockOrbProps> = ({
  onPress,
  label,
  disabled = false,
  authenticating = false,
  reducedMotion = false,
}) => {
  const { themed, theme } = useAppTheme();

  const press = useSharedValue(0);
  const spinOuter = useSharedValue(0);
  const spinMid = useSharedValue(0);
  const spinInner = useSharedValue(0);
  const pulse = useSharedValue(reducedMotion ? 0.94 : 0.86);
  const energy = useSharedValue(authenticating ? 1 : 0);

  const haloGradientId = useStableGradientId("vault-halo");
  const coreGradientId = useStableGradientId("vault-core");
  const bloomGradientId = useStableGradientId("vault-bloom");

  useEffect(() => {
    energy.value = withTiming(authenticating ? 1 : 0, { duration: 240 });
  }, [authenticating, energy]);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const linear = Easing.linear;
    const breathe = Easing.inOut(Easing.quad);

    spinOuter.value = withRepeat(
      withTiming(1, { duration: 18000, easing: linear }),
      -1,
      false,
    );
    spinMid.value = withRepeat(
      withTiming(1, { duration: 12000, easing: linear }),
      -1,
      false,
    );
    spinInner.value = withRepeat(
      withTiming(1, { duration: 7000, easing: linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3400, easing: breathe }),
        withTiming(0.86, { duration: 3400, easing: breathe }),
      ),
      -1,
      true,
    );
  }, [pulse, reducedMotion, spinInner, spinMid, spinOuter]);

  const handlePressIn = () => {
    press.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const handlePressOut = () => {
    press.value = withSpring(0, { damping: 18, stiffness: 240 });
  };

  const outerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(press.value, [0, 1], [1, 0.972]) },
      { translateY: interpolate(press.value, [0, 1], [0, 2]) },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(energy.value, [0, 1], [0.3, 0.55]),
    transform: [
      { scale: interpolate(pulse.value, [0.86, 1], [0.98, 1.06]) },
      { scale: interpolate(energy.value, [0, 1], [1, 1.06]) },
    ],
  }));

  const ambientBlobAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0.86, 1], [0.16, 0.24]),
    transform: [
      { translateX: interpolate(pulse.value, [0.86, 1], [-8, -14]) },
      { translateY: interpolate(pulse.value, [0.86, 1], [-12, -18]) },
      { scale: interpolate(pulse.value, [0.86, 1], [0.94, 1.04]) },
    ],
  }));

  const ambientBlobBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(energy.value, [0, 1], [0.12, 0.22]),
    transform: [
      { translateX: interpolate(energy.value, [0, 1], [8, 14]) },
      { translateY: interpolate(energy.value, [0, 1], [10, 16]) },
      { scale: interpolate(energy.value, [0, 1], [0.96, 1.05]) },
    ],
  }));

  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${interpolate(spinOuter.value, [0, 1], [0, 360])}deg` }],
  }));

  const midRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${interpolate(spinMid.value, [0, 1], [0, -360])}deg` }],
  }));

  const innerRingStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${interpolate(spinInner.value, [0, 1], [0, 360])}deg` }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(energy.value, [0, 1], [1, 1.03]) },
      { scale: interpolate(pulse.value, [0.86, 1], [0.99, 1.02]) },
    ],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: authenticating, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[themed($wrap), outerStyle]}
    >
      <View style={themed($orbStage)}>
        <Animated.View style={[themed($halo), haloStyle]}>
          <Svg width={HALO_SIZE} height={HALO_SIZE} viewBox={`0 0 ${HALO_SIZE} ${HALO_SIZE}`}>
            <Defs>
              <RadialGradient id={haloGradientId} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor={theme.colors.vault.vaultAccentPink} stopOpacity="0.5" />
                <Stop offset="45%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0.24" />
                <Stop offset="100%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={HALO_SIZE} height={HALO_SIZE} rx={HALO_SIZE / 2} fill={`url(#${haloGradientId})`} />
          </Svg>
        </Animated.View>

        <Animated.View style={[themed($ambientBlob), themed($ambientBlobA), ambientBlobAStyle]} />
        <Animated.View style={[themed($ambientBlob), themed($ambientBlobB), ambientBlobBStyle]} />

        <Animated.View style={[themed($svgLayer), outerRingStyle]}>
          <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.outerFrame}
              stroke={theme.colors.vault.vaultRing}
              strokeOpacity="0.12"
              strokeWidth="1.5"
              fill="none"
            />
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.outerSegment}
              stroke={theme.colors.vault.vaultAccentPinkSoft}
              strokeOpacity="0.92"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="82 172 34 96"
              fill="none"
            />
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.outerDash}
              stroke={theme.colors.vault.vaultAccentPinkSoft}
              strokeOpacity="0.34"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="2 9"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[themed($svgLayer), midRingStyle]}>
          <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.midSegment}
              stroke={theme.colors.vault.vaultAccentPink}
              strokeOpacity="0.22"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray="62 128 22 140"
              fill="none"
            />
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.midDash}
              stroke={theme.colors.vault.vaultAccentPinkSoft}
              strokeOpacity="0.74"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="18 12 4 18"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[themed($svgLayer), innerRingStyle]}>
          <Svg width={ORB_SIZE} height={ORB_SIZE} viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.innerSegment}
              stroke={theme.colors.vault.vaultAccentPinkSoft}
              strokeOpacity="0.72"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="38 72 14 40"
              fill="none"
            />
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADII.innerEnergy}
              stroke={theme.colors.vault.vaultAccentPink}
              strokeOpacity="0.32"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="42 88"
              fill="none"
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[themed($coreWrap), coreStyle]}>
          <Svg width={CORE_SIZE} height={CORE_SIZE} viewBox={`0 0 ${CORE_SIZE} ${CORE_SIZE}`} style={themed($coreGlowSvg)}>
            <Defs>
              <RadialGradient id={bloomGradientId} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor={theme.colors.vault.vaultAccentPinkSoft} stopOpacity="0.52" />
                <Stop offset="42%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0.28" />
                <Stop offset="100%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id={coreGradientId} cx="50%" cy="45%" rx="52%" ry="52%">
                <Stop offset="0%" stopColor={theme.colors.vault.vaultAccentPinkSoft} stopOpacity="0.92" />
                <Stop offset="34%" stopColor={theme.colors.vault.vaultAccentPink} stopOpacity="0.74" />
                <Stop offset="72%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0.34" />
                <Stop offset="100%" stopColor={theme.colors.vault.vaultSurface} stopOpacity="0.06" />
              </RadialGradient>
            </Defs>
            <Rect width={CORE_SIZE} height={CORE_SIZE} rx={CORE_SIZE / 2} fill={`url(#${bloomGradientId})`} />
          </Svg>

          <View style={themed($centerCore)}>
            <Svg width={INNER_CORE_SIZE} height={INNER_CORE_SIZE} viewBox={`0 0 ${INNER_CORE_SIZE} ${INNER_CORE_SIZE}`}>
              <Defs>
                <RadialGradient id={coreGradientId + "-inner"} cx="50%" cy="42%" rx="50%" ry="50%">
                  <Stop offset="0%" stopColor={theme.colors.vault.vaultAccentPinkSoft} stopOpacity="0.96" />
                  <Stop offset="28%" stopColor={theme.colors.vault.vaultAccentPink} stopOpacity="0.82" />
                  <Stop offset="72%" stopColor={theme.colors.vault.vaultGlow} stopOpacity="0.22" />
                  <Stop offset="100%" stopColor={theme.colors.vault.vaultSurface} stopOpacity="0.1" />
                </RadialGradient>
              </Defs>
              <Rect
                width={INNER_CORE_SIZE}
                height={INNER_CORE_SIZE}
                rx={INNER_CORE_SIZE / 2}
                fill={`url(#${coreGradientId + "-inner"})`}
              />
              <Circle
                cx={INNER_CORE_SIZE / 2}
                cy={INNER_CORE_SIZE / 2}
                r={INNER_CORE_SIZE / 2 - 1.5}
                stroke={theme.colors.vault.vaultAccentPinkSoft}
                strokeOpacity="0.7"
                strokeWidth="1.5"
                fill="none"
              />
            </Svg>

            <View style={themed($iconWrap)}>
              {renderFingerprintIcon(theme.colors.vault.vaultTextPrimary)}
            </View>
          </View>
        </Animated.View>
      </View>

      <Text size="xs" style={themed($label)}>
        {label}
      </Text>
    </AnimatedPressable>
  );
};

const $wrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.lg,
});

const $orbStage: ThemedStyle<ViewStyle> = () => ({
  width: ORB_SIZE,
  height: ORB_SIZE,
  alignItems: "center",
  justifyContent: "center",
});

const $svgLayer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: ORB_SIZE,
  height: ORB_SIZE,
  alignItems: "center",
  justifyContent: "center",
});

const $halo: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: HALO_SIZE,
  height: HALO_SIZE,
  alignItems: "center",
  justifyContent: "center",
});

const $ambientBlob: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  borderRadius: 999,
  backgroundColor: colors.vault.vaultGlow,
});

const $ambientBlobA: ThemedStyle<ViewStyle> = () => ({
  width: 150,
  height: 150,
});

const $ambientBlobB: ThemedStyle<ViewStyle> = () => ({
  width: 122,
  height: 122,
});

const $coreWrap: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: CORE_SIZE,
  height: CORE_SIZE,
  alignItems: "center",
  justifyContent: "center",
});

const $coreGlowSvg: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
});

const $centerCore: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: CORE_SIZE,
  height: CORE_SIZE,
  borderRadius: CORE_SIZE / 2,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
  shadowColor: colors.vault.vaultAccentPink,
  shadowOpacity: 0.42,
  shadowRadius: 34,
  shadowOffset: { width: 0, height: 0 },
});

const $iconWrap: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
});

const $label: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.medium,
  letterSpacing: 0.4,
  textAlign: "center",
});
