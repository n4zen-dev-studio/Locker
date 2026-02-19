import { FC } from "react"
import { StyleProp, TextStyle, View, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type AccentBadgeProps = {
  label: string
  tone?: "pink" | "blue" | "yellow" | "neutral"
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

export const AccentBadge: FC<AccentBadgeProps> = ({ label, tone = "neutral", style, textStyle }) => {
  const { themed } = useAppTheme()
  return (
    <View style={[themed($badge), themed($tone(tone)), style]}>
      <Text preset="bold" style={[themed($text), textStyle]}>
        {label}
      </Text>
    </View>
  )
}

const $badge: ThemedStyle<ViewStyle> = ({ spacing, colors }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 4,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  alignSelf: "flex-start",
})

const $text: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  fontSize: 11,
})

const $tone = (tone: AccentBadgeProps["tone"]): ThemedStyle<ViewStyle> => ({ colors }) => {
  switch (tone) {
    case "pink":
      return { backgroundColor: "rgba(255, 110, 199, 0.18)", borderColor: "rgba(255, 110, 199, 0.4)" }
    case "blue":
      return { backgroundColor: "rgba(123, 211, 255, 0.18)", borderColor: "rgba(123, 211, 255, 0.4)" }
    case "yellow":
      return { backgroundColor: "rgba(255, 210, 90, 0.18)", borderColor: "rgba(255, 210, 90, 0.45)" }
    default:
      return { backgroundColor: colors.glass, borderColor: colors.glassBorder }
  }
}
