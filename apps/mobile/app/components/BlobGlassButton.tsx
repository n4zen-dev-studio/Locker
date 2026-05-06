import React, { useEffect } from "react"
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, {
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
} from "react-native-svg"
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const AnimatedView = Animated.createAnimatedComponent(View)

export type BlobGlassButtonProps = {
  title: string
  onPress?: () => void
  width?: number | string
  height?: number
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  rimColor?: string
  outerShadowColor?: string
} & Omit<PressableProps, "style" | "onPress">

type GlowBlobProps = {
  gradientId: string
  width: number
  height: number
  coreColor: string
  midColor: string
  edgeColor?: string
  opacity?: number
}

function GlowBlob({
  gradientId,
  width,
  height,
  coreColor,
  midColor,
  edgeColor = "rgba(255,255,255,0)",
  opacity = 1,
}: GlowBlobProps) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient
          id={gradientId}
          cx="50%"
          cy="50%"
          rx="50%"
          ry="50%"
          fx="50%"
          fy="50%"
        >
          <Stop offset="0%" stopColor={coreColor} stopOpacity="1" />
          <Stop offset="45%" stopColor={midColor} stopOpacity="0.8" />
          <Stop offset="100%" stopColor={edgeColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        fill={`url(#${gradientId})`}
        opacity={opacity}
      />
    </Svg>
  )
}

export function BlobGlassButton({
  title,
  onPress,
  width = 340,
  height = 122,
  disabled,
  style,
  textStyle,
  rimColor = "#070608",
  outerShadowColor = "#b27ab6",
  ...rest
}: BlobGlassButtonProps) {
  const press = useSharedValue(0)

  const motion = useSharedValue(0)
  const drift = useSharedValue(0)
  const shimmer = useSharedValue(0)

  useEffect(() => {
    motion.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    )

    drift.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 5600,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: 5600,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    )

    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    )
  }, [motion, drift, shimmer])

  const numericWidth = typeof width === "number" ? width : 340
  const outerRadius = height / 2
  const inset = Math.max(10, Math.round(height * 0.075))
  const innerHeight = height - inset * 2
  const innerWidth = numericWidth - inset * 2
  const innerRadius = innerHeight / 2

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: interpolate(press.value, [0, 1], [1, 0.978]) },
        { translateY: interpolate(press.value, [0, 1], [0, 2]) },
      ],
      opacity: disabled ? 0.6 : 1,
    }
  })

  const middleBlobStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: interpolate(motion.value, [0, 1], [-10, 18]) },
        { translateY: interpolate(motion.value, [0, 1], [8, -6]) },
        { scaleX: interpolate(drift.value, [0, 1], [1, 1.08]) },
        { scaleY: interpolate(drift.value, [0, 1], [1, 1.12]) },
      ],
      opacity: interpolate(shimmer.value, [0, 1], [0.88, 1]),
    }
  })

  const leftBlobStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: interpolate(motion.value, [0, 1], [-6, 8]) },
        { translateY: interpolate(motion.value, [0, 1], [4, -4]) },
        { scaleX: interpolate(drift.value, [0, 1], [1, 1.03]) },
        { scaleY: interpolate(drift.value, [0, 1], [1, 1.06]) },
      ],
      opacity: interpolate(shimmer.value, [0, 1], [0.8, 0.92]),
    }
  })

  const rightBlobStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: interpolate(motion.value, [0, 1], [-2, 10]) },
        { translateY: interpolate(motion.value, [0, 1], [3, -3]) },
        { scaleX: interpolate(drift.value, [0, 1], [1, 1.02]) },
        { scaleY: interpolate(drift.value, [0, 1], [1, 1.05]) },
      ],
      opacity: interpolate(shimmer.value, [0, 1], [0.72, 0.88]),
    }
  })

  const glossStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(shimmer.value, [0, 1], [0.16, 0.28]),
    }
  })

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 220 })
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 220 })
      }}
      style={[
        styles.shadowWrap,
        {
          width,
          height,
          borderRadius: outerRadius,
          shadowColor: outerShadowColor,
        },
        containerAnimatedStyle,
        style,
      ]}
    >
      <View
        style={[
          styles.outerShell,
          {
            borderRadius: outerRadius,
            // backgroundColor: rimColor,
          },
        ]}
      >
        <View
          style={[
            styles.innerShell,
            {
              top: inset,
              left: inset,
              right: inset,
              bottom: inset,
              borderRadius: innerRadius,
            },
          ]}
        >
          <LinearGradient
            colors={[
              "#0c0c0d",
              "#0a070c",
              "#0d090f",
            ]}
            start={{ x: 0, y: 0.15 }}
            end={{ x: 1, y: 0.85 }}
            style={[
              StyleSheet.absoluteFillObject,
              { borderRadius: innerRadius },
            ]}
          />

          <AnimatedView
            pointerEvents="none"
            style={[
              styles.blobWrap,
              {
                width: innerWidth * 0.9,
                height: innerHeight * 1.45,
                left: innerWidth * 0.15,
                top: -innerHeight * 0.12,
              },
              middleBlobStyle,
            ]}
          >
            <GlowBlob
              gradientId="middleGlow"
              width={innerWidth * 0.9}
              height={innerHeight * 1.45}
              coreColor="#6C1EEB"
              midColor="#A04EF2"
              opacity={1}
            />
          </AnimatedView>

          <AnimatedView
            pointerEvents="none"
            style={[
              styles.blobWrap,
              {
                width: innerWidth * 0.92,
                height: innerHeight * 1.52,
                left: innerWidth * -0.02,
                top: -innerHeight * 0.05,
              },
              leftBlobStyle,
            ]}
          >
            <GlowBlob
              gradientId="leftGlow"
              width={innerWidth * 0.92}
              height={innerHeight * 1.52}
              coreColor="#f033ed"
              midColor="#f476ee"
              opacity={0.95}
            />
          </AnimatedView>

          <AnimatedView
            pointerEvents="none"
            style={[
              styles.blobWrap,
              {
                width: innerWidth * 0.72,
                height: innerHeight * 1.22,
                right: -innerWidth * 0.06,
                top: -innerHeight * 0.02,
              },
              rightBlobStyle,
            ]}
          >
            <GlowBlob
              gradientId="rightGlow"
              width={innerWidth * 0.72}
              height={innerHeight * 1.22}
              coreColor="#f396e8"
              midColor="#efa6da"
              opacity={0.9}
            />
          </AnimatedView>

          <AnimatedView
            pointerEvents="none"
            style={[
              styles.topGloss,
              {
                borderRadius: innerRadius,
              },
              glossStyle,
            ]}
          />

          <View
            pointerEvents="none"
            style={[
              styles.innerStroke,
              {
                borderRadius: innerRadius,
              },
            ]}
          />

          <Text
            numberOfLines={1}
            style={[
              styles.label,
              {
                fontSize: height * 0.3,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  shadowWrap: {
    justifyContent: "center",
    alignItems: "center",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },

  outerShell: {
    flex: 1,
    width: "100%",
    overflow: "hidden",
  },

  innerShell: {
    position: "absolute",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0e0f",
  },

  blobWrap: {
    position: "absolute",
  },

  topGloss: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    height: "48%",
    backgroundColor: "white",
  },

  innerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.2,
    borderColor: "rgba(255, 223, 223, 0.42)",
  },

  label: {
    color: "#000000",
    fontWeight: "400",
    letterSpacing: -1.4,
    textAlign: "center",
  },
})