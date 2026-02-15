import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { vaultSession } from "@/locker/session"
import { randomBytes } from "@/locker/crypto/random"
import { enablePasskey, isPasskeyEnabled } from "@/locker/auth/passkey"
import { getMeta } from "@/locker/storage/vaultMetaRepo"

export const VaultPasskeySetupScreen: FC<AppStackScreenProps<"VaultPasskeySetup">> = function VaultPasskeySetupScreen(
  props,
) {
  const { navigation, route } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [error, setError] = useState<string | null>(null)
  const [passkeyReady, setPasskeyReady] = useState(false)

  const mode = route.params?.mode ?? "fresh"
  const meta = useMemo(() => getMeta(), [])
  const needsLegacyUnlock = meta?.v === 1 && !vaultSession.isUnlocked()

  useFocusEffect(
    useCallback(() => {
      if (vaultSession.isUnlocked() && meta?.v === 2) {
        navigation.replace("VaultHome")
      }
    }, [navigation, meta]),
  )

  useEffect(() => {
    isPasskeyEnabled().then(setPasskeyReady)
  }, [])

  const handleEnable = async () => {
    setError(null)
    try {
      let vmk = vaultSession.getKey()
      if (!vmk) {
        if (needsLegacyUnlock) {
          Alert.alert("Legacy Unlock Required", "Unlock with PIN first to migrate the vault.")
          return
        }
        vmk = randomBytes(32)
        vaultSession.setKey(vmk)
      }
      await enablePasskey(vmk)
      navigation.replace("VaultHome")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to enable passkey"
      setError(message)
    }
  }

  const helperText = useMemo(() => {
    if (mode === "migrate") {
      return "To enable passkey, unlock once with your legacy PIN."
    }
    if (mode === "recovery") {
      return "Passkey setup is required to unlock this vault."
    }
    return "Passkey keeps your vault tied to this device and protected by biometrics or screen lock."
  }, [mode])

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($card)}>
        <Text preset="heading" style={themed($title)}>
          Passkey (Device)
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Enable secure unlock
        </Text>
        <Text style={themed($body)}>{helperText}</Text>

        {needsLegacyUnlock ? (
          <Pressable style={themed($button)} onPress={() => navigation.navigate("VaultPin")}>
            <Text preset="bold" style={themed($buttonText)}>
              Unlock with PIN (Legacy)
            </Text>
          </Pressable>
        ) : (
          <Pressable style={themed($primaryButton)} onPress={handleEnable}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Enable Passkey
            </Text>
          </Pressable>
        )}

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}

        {!passkeyReady ? (
          <Text style={themed($hintText)}>
            If prompted, enable device lock or biometrics to continue.
          </Text>
        ) : null}

        <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($linkText)}>
            Back
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

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
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
  color: colors.palette.neutral300,
  marginBottom: 16,
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
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: 12,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
})

const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
  marginBottom: 8,
})

const $hintText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  marginBottom: 8,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  alignItems: "center",
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
