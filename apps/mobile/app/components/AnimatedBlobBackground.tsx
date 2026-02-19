import { FC, PropsWithChildren, useEffect } from "react"
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"

type AnimatedBlobBackgroundProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
}>

export const AnimatedBlobBackground: FC<AnimatedBlobBackgroundProps> = ({ children, style }) => {
  const { theme } = useAppTheme()
  const t = useSharedValue(0)

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
  }, [t])

  const blobOneStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -40 + t.value * 60 },
      { translateY: -60 + t.value * 40 },
      { scale: 1 + t.value * 0.08 },
    ],
  }))

  const blobTwoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 50 - t.value * 70 },
      { translateY: 80 - t.value * 30 },
      { scale: 1.05 - t.value * 0.06 },
    ],
  }))

  const blobThreeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: 10 + t.value * 30 },
      { translateY: 140 - t.value * 60 },
      { scale: 1.1 - t.value * 0.05 },
    ],
  }))

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.blob,
          {
            backgroundColor: theme.colors.blobPink,
            width: 260,
            height: 260,
            top: -120,
            left: -80,
          },
          blobOneStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          {
            backgroundColor: theme.colors.blobBlue,
            width: 280,
            height: 280,
            top: 120,
            right: -120,
          },
          blobTwoStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          {
            backgroundColor: theme.colors.blobNeutral,
            width: 220,
            height: 220,
            bottom: -100,
            left: 40,
          },
          blobThreeStyle,
        ]}
      />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.7,
  },
})
