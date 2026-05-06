import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"
import { spacing } from "@/theme/spacing"

type Props = {
  themed: VaultThemed
  label: string
  icon?: React.ReactNode
  onPress?: () => void
}

export function GhostDangerButton(props: Props) {
  const { themed, label, icon, onPress } = props
  return (
    <Pressable onPress={onPress} style={themed($dangerButton)}>
      <View style={themed($ghostButtonContent)}>
        {icon}
        <Text style={themed($dangerButtonText)}>{label}</Text>
      </View>
    </Pressable>
  )
}

const $dangerButton: ThemedStyle<ViewStyle> = () => ({
  minHeight: 48,
  borderRadius: 16,
  backgroundColor: "rgba(255,73,123,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,115,155,0.18)",
  paddingHorizontal: spacing.sm,
})

const $ghostButtonContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
})

const $dangerButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFC8D5",
  fontSize: 12,
  fontWeight: "700",
})
