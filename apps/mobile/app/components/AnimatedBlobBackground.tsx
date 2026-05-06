import React, { FC, PropsWithChildren, useEffect } from "react"
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg"

import { useAppTheme } from "@/theme/context"

type AnimatedBlobBackgroundProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
}>

/**
 * A glow blob built from layered radial gradients (no blur needed, super fast).
 */
function GlowBlob({
  size,
  innerColor,
  glowColor,
  opacity = 0.85,
}: {
  size: number
  innerColor: string
  glowColor: string
  opacity?: number
}) {
  return (
    <View style={{ width: size, height: size, opacity }}>
      {/* Base glow */}
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="g1" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={innerColor} stopOpacity={0.9} />
            <Stop offset="35%" stopColor={glowColor} stopOpacity={0.38} />
            <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g1)" />
      </Svg>

      {/* Offset/stacked glows for “bloom” look */}
      <View style={{ position: "absolute", left: size * 0.12, top: size * 0.18, opacity: 0.65 }}>
        <Svg width={Math.round(size * 0.86)} height={Math.round(size * 0.86)}>
          <Defs>
            <RadialGradient id="g2" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={innerColor} stopOpacity={0.85} />
              <Stop offset="32%" stopColor={glowColor} stopOpacity={0.34} />
              <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#g2)" />
        </Svg>
      </View>

      <View style={{ position: "absolute", left: -size * 0.10, top: size * 0.30, opacity: 0.5 }}>
        <Svg width={Math.round(size * 0.72)} height={Math.round(size * 0.72)}>
          <Defs>
            <RadialGradient id="g3" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={innerColor} stopOpacity={0.82} />
              <Stop offset="30%" stopColor={glowColor} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#g3)" />
        </Svg>
      </View>
    </View>
  )
}

export const AnimatedBlobBackground: FC<AnimatedBlobBackgroundProps> = ({ children, style }) => {
  const { theme } = useAppTheme()

  const ease = Easing.inOut(Easing.quad)

  // Blob 1 motion
  const b1x = useSharedValue(0)
  const b1y = useSharedValue(0)
  const b1s = useSharedValue(1)
  const b1r = useSharedValue(0)

  // Blob 2 motion
  const b2x = useSharedValue(0)
  const b2y = useSharedValue(0)
  const b2s = useSharedValue(1)
  const b2r = useSharedValue(0)

  // Blob 3 motion
  const b3x = useSharedValue(0)
  const b3y = useSharedValue(0)
  const b3s = useSharedValue(1)
  const b3r = useSharedValue(0)

  useEffect(() => {
    // Blob 1
    b1x.value = withRepeat(
      withSequence(
        withTiming(32, { duration: 6200, easing: ease }),
        withTiming(-26, { duration: 7000, easing: ease }),
        withTiming(18, { duration: 5600, easing: ease }),
      ),
      -1,
      false,
    )
    b1y.value = withRepeat(
      withSequence(
        withTiming(-28, { duration: 6600, easing: ease }),
        withTiming(20, { duration: 7200, easing: ease }),
        withTiming(-14, { duration: 5400, easing: ease }),
      ),
      -1,
      false,
    )
    b1s.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 5200, easing: ease }),
        withTiming(0.96, { duration: 5600, easing: ease }),
        withTiming(1.06, { duration: 6000, easing: ease }),
      ),
      -1,
      false,
    )
    b1r.value = withRepeat(
      withSequence(
        withTiming(0.05, { duration: 7200, easing: ease }),
        withTiming(-0.04, { duration: 7800, easing: ease }),
        withTiming(0.03, { duration: 6800, easing: ease }),
      ),
      -1,
      false,
    )

    // Blob 2 (different phase)
    b2x.value = withRepeat(
      withSequence(
        withTiming(-36, { duration: 6800, easing: ease }),
        withTiming(22, { duration: 7400, easing: ease }),
        withTiming(-16, { duration: 6100, easing: ease }),
      ),
      -1,
      false,
    )
    b2y.value = withRepeat(
      withSequence(
        withTiming(24, { duration: 6400, easing: ease }),
        withTiming(-18, { duration: 7100, easing: ease }),
        withTiming(14, { duration: 5600, easing: ease }),
      ),
      -1,
      false,
    )
    b2s.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 5600, easing: ease }),
        withTiming(0.94, { duration: 6000, easing: ease }),
        withTiming(1.08, { duration: 6500, easing: ease }),
      ),
      -1,
      false,
    )
    b2r.value = withRepeat(
      withSequence(
        withTiming(-0.055, { duration: 7400, easing: ease }),
        withTiming(0.04, { duration: 7600, easing: ease }),
        withTiming(-0.03, { duration: 7000, easing: ease }),
      ),
      -1,
      false,
    )

    // Blob 3 (slower + subtle)
    b3x.value = withRepeat(
      withSequence(
        withTiming(18, { duration: 7600, easing: ease }),
        withTiming(-14, { duration: 8200, easing: ease }),
        withTiming(10, { duration: 7400, easing: ease }),
      ),
      -1,
      false,
    )
    b3y.value = withRepeat(
      withSequence(
        withTiming(-16, { duration: 7800, easing: ease }),
        withTiming(14, { duration: 8400, easing: ease }),
        withTiming(-10, { duration: 7600, easing: ease }),
      ),
      -1,
      false,
    )
    b3s.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 7000, easing: ease }),
        withTiming(0.97, { duration: 7400, easing: ease }),
        withTiming(1.05, { duration: 7800, easing: ease }),
      ),
      -1,
      false,
    )
    b3r.value = withRepeat(
      withSequence(
        withTiming(0.035, { duration: 8600, easing: ease }),
        withTiming(-0.03, { duration: 9000, easing: ease }),
        withTiming(0.02, { duration: 8200, easing: ease }),
      ),
      -1,
      false,
    )
  }, [])

  const blobOneStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: b1x.value },
      { translateY: b1y.value },
      { scale: b1s.value },
      { rotateZ: `${b1r.value}rad` },
    ],
  }))

  const blobTwoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: b2x.value },
      { translateY: b2y.value },
      { scale: b2s.value },
      { rotateZ: `${b2r.value}rad` },
    ],
  }))

  const blobThreeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: b3x.value },
      { translateY: b3y.value },
      { scale: b3s.value },
      { rotateZ: `${b3r.value}rad` },
    ],
  }))

  // If your theme doesn’t have “blobPink/Blue/Neutral” you can just map them here.
  // Inner color should be darker; glow is the tint.
  const pinkGlow = theme.colors.blobPink
  const blueGlow = theme.colors.blobBlue
  const neutralGlow = theme.colors.blobNeutral

  // Pick a darker “core” so the glow reads better. If you have tokens for these, use them.
  const innerCore = theme.colors.background ?? "#0B0F17"

  return (
    <View style={[styles.container, style]}>
      {/* Blob 1 */}
      <Animated.View style={[styles.blobWrap, { top: -300, left: -160 }, blobOneStyle]}>
        <GlowBlob
          size={600}
          innerColor={pinkGlow}
          glowColor={pinkGlow}
          opacity={0.3}
        />
      </Animated.View>

      {/* Blob 2 */}
      {/* <Animated.View style={[styles.blobWrap, { top: 90, right: -150 }, blobTwoStyle]}>
        <GlowBlob
          size={230}
          innerColor={pinkGlow}
          glowColor={pinkGlow}
          opacity={0.88}
        />
      </Animated.View> */}

      {/* Blob 3 */}
      <Animated.View style={[styles.blobWrap, { bottom: -300, left: 0 }, blobThreeStyle]}>
        <GlowBlob
          size={400}
          innerColor={neutralGlow}
          glowColor={neutralGlow}
          opacity={0.5}
        />
      </Animated.View>

      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  blobWrap: {
    position: "absolute",
    // keeps the gradient soft without hard edges when clipped by parent
    overflow: "visible",
  },
})
