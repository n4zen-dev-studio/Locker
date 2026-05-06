import { FC } from "react"
import { Pressable, StyleProp, TextStyle, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type GlowFabProps = {
  label?: string
  onPress?: () => void
  onLongPress?: () => void
  style?: StyleProp<ViewStyle>
}

export const GlowFab: FC<GlowFabProps> = ({ label = "+", onPress, onLongPress, style }) => {
  const { themed } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [themed($fab), pressed && themed($pressed), style]}
    >
      <View style={themed($glow)} />
      <Text preset="bold" style={themed($label)}>
        {label}
      </Text>
    </Pressable>
  )
}

const $fab: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 64,
  height: 64,
  borderRadius: 32,
  backgroundColor: colors.accentPink,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: colors.accentPink,
  shadowOpacity: 0.5,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.2)",
})

const $label: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 26,
  lineHeight: 28,
})

const $glow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  width: 88,
  height: 88,
  borderRadius: 44,
  backgroundColor: "rgba(255, 110, 199, 0.25)",
  opacity: 0.9,
})

const $pressed: ThemedStyle<ViewStyle> = () => ({
  transform: [{ scale: 0.97 }],
})
