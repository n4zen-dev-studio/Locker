import { Pressable, Text, type TextStyle, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  label: string
  selected?: boolean
  onPress?: () => void
}

export function GlassChip(props: Props) {
  const { themed, label, selected, onPress } = props
  if (selected) {
    return (
      <Pressable onPress={onPress} style={themed($chipPressable)}>
        <LinearGradient
          colors={["#FF8AE2", "#D85CFF", "#A857FF"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={themed($chipSelected)}
        >
          <Text style={themed($chipTextSelected)}>{label}</Text>
        </LinearGradient>
      </Pressable>
    )
  }
  return (
    <Pressable onPress={onPress} style={themed($chip)}>
      <Text style={themed($chipText)}>{label}</Text>
    </Pressable>
  )
}

const $chipPressable: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
})

const $chipSelected: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 9,
  borderRadius: 999,
})

const $chipTextSelected: ThemedStyle<TextStyle> = () => ({
  color: "#170714",
  fontSize: 11,
  fontWeight: "700",
})

const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 9,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  backgroundColor: "rgba(255,255,255,0.05)",
})

const $chipText: ThemedStyle<TextStyle> = () => ({
  color: "#F6E3FF",
  fontSize: 11,
  fontWeight: "600",
})
