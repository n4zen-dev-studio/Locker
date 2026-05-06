import { FC, useCallback, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { createOrUpdateKeyBackup, deleteKeyBackup, hasKeyBackup, recoverUserKeypair } from "@/locker/keys/keyBackup"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultRecoveryScreen: FC<AppStackScreenProps<"VaultRecovery">> = function VaultRecoveryScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [passphrase, setPassphrase] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backupConfigured, setBackupConfigured] = useState<boolean | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const exists = await hasKeyBackup()
      setBackupConfigured(exists)
    } catch {
      setBackupConfigured(null)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void refreshStatus()
    }, [navigation, refreshStatus]),
  )

  const handleSetBackup = useCallback(async () => {
    setError(null)
    setStatus(null)
    try {
      await createOrUpdateKeyBackup(passphrase)
      setStatus("Recovery backup saved.")
      setPassphrase("")
      await refreshStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save backup"
      setError(message)
    }
  }, [passphrase, refreshStatus])

  const handleRecover = useCallback(async () => {
    setError(null)
    setStatus(null)
    try {
      await recoverUserKeypair(passphrase)
      setStatus("Keys recovered. Vault keys will sync now.")
      setPassphrase("")
      await refreshStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recovery failed"
      setError(message)
    }
  }, [passphrase, refreshStatus])

  const handleDeleteBackup = useCallback(async () => {
    setError(null)
    setStatus(null)
    try {
      await deleteKeyBackup()
      setStatus("Recovery backup removed.")
      await refreshStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove backup"
      setError(message)
    }
  }, [refreshStatus])

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Recovery & Keys
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Secure your account keys with a recovery passphrase
        </Text>
      </View>

      {backupConfigured !== null ? (
        <Text style={themed($metaText)}>
          Backup status: {backupConfigured ? "Configured" : "Not configured"}
        </Text>
      ) : null}

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Recovery Passphrase
        </Text>
        <TextField
          label="Passphrase"
          placeholder="Enter recovery passphrase"
          secureTextEntry
          value={passphrase}
          onChangeText={setPassphrase}
        />
        <Pressable style={themed($primaryButton)} onPress={handleSetBackup}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            Set / Update Backup
          </Text>
        </Pressable>
        <Pressable style={themed($secondaryButton)} onPress={handleRecover}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Recover Keys
          </Text>
        </Pressable>
        <Pressable style={themed($dangerButton)} onPress={handleDeleteBackup}>
          <Text preset="bold" style={themed($dangerButtonText)}>
            Remove Backup
          </Text>
        </Pressable>
        <Text style={themed($metaText)}>
          Do not lose your passphrase. It cannot be recovered.
        </Text>
      </View>

      <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
        <Text preset="bold" style={themed($linkText)}>
          Back
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  marginBottom: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginTop: spacing.xs,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 18,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.lg,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral100,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
  marginBottom: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginTop: spacing.md,
  marginBottom: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 90, 90, 0.15)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 90, 90, 0.4)",
  marginBottom: spacing.sm,
})

const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.success500,
  marginBottom: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
