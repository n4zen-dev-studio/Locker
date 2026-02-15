import { FC } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultLockedScreen: FC<AppStackScreenProps<"VaultLocked">> = function VaultLockedScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($card)}>
        <Text preset="heading" style={themed($title)}>
          Locker
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Vault Locked
        </Text>
        <Text style={themed($body)}>Passkey unlock will be added in Phase 3.</Text>
        <Pressable
          style={themed($primaryButton)}
          onPress={() => navigation.navigate("VaultPin")}
        >
          <Text preset="bold" style={themed($primaryButtonText)}>
            Unlock (Local PIN)
          </Text>
        </Pressable>
        <Pressable style={themed($button)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($buttonText)}>
            Back to Calculator
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral900,
  justifyContent: "center",
  paddingHorizontal: spacing.xl,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 24,
  padding: spacing.xl,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.2)",
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 8,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  marginBottom: 12,
})

const $body: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  marginBottom: 24,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: 12,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $button: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral100,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})
