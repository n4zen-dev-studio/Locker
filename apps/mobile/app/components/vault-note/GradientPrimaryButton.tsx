import { Pressable, StyleProp, View, type TextStyle, type ViewStyle } from "react-native"
import { LinearGradient } from "expo-linear-gradient"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  label: string
  icon?: React.ReactNode
  onPress?: () => void
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

export function GradientPrimaryButton(props: Props) {
  const { themed, label, onPress, disabled, containerStyle, textStyle } = props
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[themed($buttonBlock)]}>
      <LinearGradient
        colors={disabled ? ["#4B4350", "#3E3742", "#3A3440"] : ["#FFA2EA", "#F06DFF", "#BF69FF"]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.7 }}
        style={themed([$primaryButton, disabled && $disabledButton, containerStyle])}
      >
        <View style={themed($primaryButtonContent)}>
          <Text style={[themed($primaryButtonText), textStyle]}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  )
}

const $disabledButton: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
})

const $buttonBlock: ThemedStyle<ViewStyle> = () => ({
  marginTop: 4,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 18,
  overflow: "hidden",
})

const $primaryButtonContent: ThemedStyle<ViewStyle> = () => ({
  minHeight: 52,
  alignItems: "center",
  justifyContent: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#190514",
  fontSize: 14,
  fontWeight: "800",
})
