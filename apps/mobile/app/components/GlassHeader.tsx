import { FC, PropsWithChildren } from "react"
import { StyleProp, View, ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

type GlassHeaderProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
}>

export const GlassHeader: FC<GlassHeaderProps> = ({ children, style }) => {
  const { themed } = useAppTheme()
  return <View style={[themed($header), style]}>{children}</View>
}

const $header: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 22,
  paddingVertical: spacing.lg,
  paddingHorizontal: spacing.lg,
  borderWidth: 1,
  borderColor: colors.glassBorder,
})
