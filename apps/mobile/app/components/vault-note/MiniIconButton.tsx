import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  label: string
  icon: React.ReactNode
  onPress?: () => void
  disabled?: boolean
}

export function MiniIconButton(props: Props) {
  const { themed, label, icon, onPress, disabled } = props
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={themed([$miniActionButton, disabled && $disabledButton])}
    >
      <View style={themed($miniActionIconWrap)}>{icon}</View>
      <Text style={themed($miniActionText)}>{label}</Text>
    </Pressable>
  )
}

const $miniActionButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 108,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: 10,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $disabledButton: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
})

const $miniActionIconWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})

const $miniActionText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF0FF",
  fontSize: 12,
  fontWeight: "600",
})
