import { FC, useCallback, useEffect, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { isPasskeyEnabled, unlockWithPasskey } from "@/locker/auth/passkey"
import { getMeta } from "@/locker/storage/vaultMetaRepo"
import { vaultSession } from "@/locker/session"
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute"
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"

export const VaultLockedScreen: FC<AppStackScreenProps<"VaultLocked">> = function VaultLockedScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null)
  const [passkeyReady, setPasskeyReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshState = useCallback(async () => {
    const meta = getMeta()
    setMetaVersion(meta ? meta.v : null)
    const enabled = await isPasskeyEnabled()
    setPasskeyReady(enabled)
  }, [])

  useEffect(() => {
    refreshState()
  }, [refreshState])

  const handlePasskey = async () => {
    setError(null)
    const meta = getMeta()
    if (!meta) {
      navigation.navigate("VaultPasskeySetup", { mode: "fresh" })
      return
    }

    if (meta.v === 1) {
      if (!passkeyReady) {
        setError("Passkey not supported on this device")
        return
      }
      navigation.navigate("VaultPasskeySetup", { mode: "migrate" })
      return
    }

    if (!passkeyReady) {
      setError("Passkey not supported on this device")
      return
    }

    try {
      const vmk = await unlockWithPasskey()
      vaultSession.setKey(vmk)
      recordSecurityEvent({
        type: "unlock_success",
        message: "Vault unlocked successfully.",
        severity: "info",
      })
      const next = getPostUnlockRoute()
      if (next.name === "VaultOnboarding") {
        navigation.replace("VaultOnboarding")
      } else {
        navigation.replace(next.name, next.params)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to unlock"
      recordSecurityEvent({
        type: "unlock_failure",
        message: "Vault unlock failed.",
        severity: "warning",
        meta: { message },
      })
      setError(message)
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($card)}>
        <Text preset="heading" style={themed($title)}>
          Locker
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Vault Locked
        </Text>
        <Text style={themed($body)}>Passkey uses your device biometrics / screen lock.</Text>

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}

        <Pressable style={themed($primaryButton)} onPress={handlePasskey}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            Unlock with Passkey
          </Text>
        </Pressable>

        {metaVersion === 1 ? (
          <Pressable style={themed($button)} onPress={() => navigation.navigate("VaultPin")}>
            <Text preset="bold" style={themed($buttonText)}>
              Migrate Legacy Vault
            </Text>
          </Pressable>
        ) : null}

        <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($linkText)}>
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
  color: colors.palette.neutral300,
  marginBottom: 16,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
  marginBottom: 12,
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
  marginBottom: 8,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
})

const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  alignItems: "center",
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
