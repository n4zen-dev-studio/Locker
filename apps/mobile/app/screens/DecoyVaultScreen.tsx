import { FC } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { listDecoyVaultItems } from "@/locker/security/decoyVaultRepo"
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"
import type { SecurityStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const DecoyVaultScreen: FC<SecurityStackScreenProps<"DecoyVault">> = function DecoyVaultScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
  const items = listDecoyVaultItems()

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Decoy Vault
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Lightweight believable content isolated from the real vault state.
        </Text>
      </View>

      {items.map((item) => (
        <View key={item.id} style={themed($card)}>
          <Text preset="bold" style={themed($cardTitle)}>
            {item.title}
          </Text>
          <Text style={themed($cardMeta)}>{item.subtitle}</Text>
          <Text style={themed($cardMeta)}>{new Date(item.updatedAt).toLocaleString()}</Text>
        </View>
      ))}

      <Pressable
        style={themed($button)}
        onPress={() => {
          recordSecurityEvent({
            type: "decoy_vault_close",
            message: "Decoy vault closed.",
            severity: "info",
          })
          navigation.goBack()
        }}
      >
        <Text preset="bold" style={themed($buttonText)}>
          Close Decoy Vault
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.background,
  paddingHorizontal: spacing.lg,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  marginBottom: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  padding: spacing.md,
  marginBottom: spacing.md,
})

const $cardTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $cardMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginTop: 4,
})

const $button: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glassHeavy,
  borderRadius: 14,
  alignItems: "center",
  paddingVertical: spacing.md,
  marginBottom: spacing.xl,
})

const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})
