import { FC, PropsWithChildren } from "react"
import { StyleProp, View, ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
}>

export const GlassCard: FC<GlassCardProps> = ({ children, style }) => {
  const { themed } = useAppTheme()
  return <View style={[themed($card), style]}>{children}</View>
}

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 20,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  shadowColor: "#000",
  shadowOpacity: 0.2,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
})
