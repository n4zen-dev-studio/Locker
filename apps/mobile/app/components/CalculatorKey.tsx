import { FC, useRef, useState } from "react"
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type CalculatorKeyVariant = "number" | "operator" | "utility" | "equals"

export interface CalculatorKeyProps
  extends Pick<
    PressableProps,
    "onPress" | "onLongPress" | "delayLongPress" | "disabled"
  > {
  label: string
  variant: CalculatorKeyVariant
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  accessibilityLabel?: string
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
  const { themed, theme } = useAppTheme()

  const progress = useRef(new Animated.Value(0)).current
  const [isPressed, setIsPressed] = useState(false)

  const handlePressIn = () => {
    setIsPressed(true)
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 0,
    }).start()
  }

  const handlePressOut = () => {
    setIsPressed(false)
    Animated.spring(progress, {
      toValue: 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 5,
    }).start()
  }

  const animatedStyle = {
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.972],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 2],
        }),
      },
    ],
  }

  const gradient = theme.colors.calculator.keyGradients[variant]

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
        {/* Base Gradient */}
        <LinearGradient
          colors={gradient}
          start={{ x: 0.12, y: 0.08 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Top Highlight */}
        <LinearGradient
          colors={theme.colors.calculator.keyHighlightGradient}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 0.75 }}
          style={[
            StyleSheet.absoluteFillObject,
            themed($topHighlight),
          ]}
        />

        {/* Bottom Glow */}
        <View pointerEvents="none" style={themed($bottomGlow)}>
          <LinearGradient
            colors={theme.colors.calculator.keyGlowGradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        {/* Label */}
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
  )
}

/* ================= STYLES ================= */

const $shadowBase: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  borderRadius: 24,
  shadowColor: colors.calculator.keyShadow,
  shadowOpacity: 0.28,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 10,
})

const $shadowByVariant: Record<
  CalculatorKeyVariant,
  ThemedStyle<ViewStyle>
> = {
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
}

const $shadowPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  shadowColor: colors.calculator.keyShadowPressed,
  shadowOpacity: 0.16,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
})

const $buttonBase: ThemedStyle<ViewStyle> = ({
  colors,
  spacing,
}) => ({
  minHeight: 70,
  borderRadius: 24,
  overflow: "hidden",
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: colors.calculator.keyBorder,
  backgroundColor: colors.calculator.keyFallback,
})

const $buttonPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.98,
})

const $buttonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
})

const $topHighlight: ThemedStyle<ViewStyle> = ({
  colors,
}) => ({
  borderRadius: 24,
  opacity: 0.92,
  borderTopWidth: 1,
  borderTopColor: colors.calculator.keyEdgeHighlight,
})

const $bottomGlow: ThemedStyle<ViewStyle> = ({
  colors,
}) => ({
  ...StyleSheet.absoluteFillObject,
  // top: "48%",
  borderRadius: 30,
  borderBottomLeftRadius: 24,
  borderBottomRightRadius: 24,
  opacity: 0.65,
  borderTopWidth: 1,
  borderTopColor: colors.calculator.surfaceBorder,
  borderLeftWidth: 1,
  borderLeftColor: colors.calculator.surfaceBorder,
  borderRightWidth: 2,
  borderRightColor: colors.calculator.surfaceEdge,
  borderBottomWidth: 2,
  borderBottomColor: colors.calculator.surfaceEdge,
})

const $labelBase: ThemedStyle<TextStyle> = ({
  typography,
}) => ({
  fontFamily: typography.fonts.spaceGrotesk.medium,
  letterSpacing: -0.4,
  includeFontPadding: false,
  textAlign: "center",
})

const $labelByVariant: Record<
  CalculatorKeyVariant,
  ThemedStyle<TextStyle>
> = {
  number: ({ colors }) => ({
    color: colors.calculator.keyText,
    fontSize: 28,
    lineHeight: 32,
  }),
  operator: ({ colors }) => ({
    color: colors.calculator.operatorText,
    fontSize: 30,
    lineHeight: 32,
  }),
  utility: ({ colors }) => ({
    color: colors.calculator.utilityText,
    fontSize: 22,
    lineHeight: 26,
  }),
  equals: ({ colors }) => ({
    color: colors.calculator.equalsText,
    fontSize: 32,
    lineHeight: 36,
  }),
}

const $labelDisabled: ThemedStyle<TextStyle> = ({
  colors,
}) => ({
  color: colors.textDim,
})