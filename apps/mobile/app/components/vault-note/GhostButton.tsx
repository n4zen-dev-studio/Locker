import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  label: string
  icon?: React.ReactNode
  onPress?: () => void
}

export function GhostButton(props: Props) {
  const { themed, label, icon, onPress } = props
  return (
    <Pressable onPress={onPress} style={themed($ghostButton)}>
      <View style={themed($ghostButtonContent)}>
        {icon}
        <Text style={themed($ghostButtonText)}>{label}</Text>
      </View>
    </Pressable>
  )
}

const $ghostButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $ghostButtonContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
})

const $ghostButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF0FF",
  fontSize: 12,
  fontWeight: "600",
})
