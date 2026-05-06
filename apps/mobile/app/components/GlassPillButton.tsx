import { FC } from "react"
import { Pressable, StyleProp, TextStyle, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type GlassPillButtonProps = {
  label: string
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

export const GlassPillButton: FC<GlassPillButtonProps> = ({
  label,
  onPress,
  disabled,
  style,
  textStyle,
}) => {
  const { themed } = useAppTheme()
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        themed($pill),
        disabled && themed($disabled),
        pressed && !disabled && themed($pressed),
        style,
      ]}
    >
      <Text preset="bold" style={[themed($pillText), textStyle]}>
        {label}
      </Text>
    </Pressable>
  )
}

const $pill: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 999,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  alignSelf: "flex-start",
})

const $pillText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  fontSize: 12,
})

const $disabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.5,
})

const $pressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.85,
})
