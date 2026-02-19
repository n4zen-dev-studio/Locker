import { FC, useCallback, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { SecurityStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { createOrUpdateKeyBackup, deleteKeyBackup, hasKeyBackup, recoverUserKeypair } from "@/locker/keys/keyBackup"
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey"
import { getMeta } from "@/locker/storage/vaultMetaRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const SecurityDashboardScreen: FC<SecurityStackScreenProps<"SecurityDashboard">> = function SecurityDashboardScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [passphrase, setPassphrase] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backupConfigured, setBackupConfigured] = useState<boolean | null>(null)
  const [passkeyReady, setPasskeyReady] = useState<boolean | null>(null)
  const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const exists = await hasKeyBackup()
      setBackupConfigured(exists)
    } catch {
      setBackupConfigured(null)
    }
    const enabled = await isPasskeyEnabled()
    setPasskeyReady(enabled)
    const meta = getMeta()
    setMetaVersion(meta ? meta.v : null)
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
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Security
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Passkey, recovery, and key continuity
            </Text>
          </GlassHeader>
        </View>

        <View style={themed($content)}>
          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Passkey Status
            </Text>
            <Text style={themed($metaText)}>
              Passkey: {passkeyReady ? "Enabled" : "Not enabled"}
            </Text>
            <Text style={themed($metaText)}>
              Vault meta: {metaVersion ? `v${metaVersion}` : "n/a"}
            </Text>
            <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultPasskeySetup")}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Enable Passkey
              </Text>
            </Pressable>
            {__DEV__ ? (
              <Pressable style={themed($secondaryButton)} onPress={async () => {
                await disablePasskeyDevOnly()
                await refreshStatus()
              }}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Disable Passkey (Dev)
                </Text>
              </Pressable>
            ) : null}
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Recovery Backup
            </Text>
            {backupConfigured !== null ? (
              <Text style={themed($metaText)}>
                Backup status: {backupConfigured ? "Configured" : "Not configured"}
              </Text>
            ) : null}
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
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Key Continuity
            </Text>
            <Text style={themed($metaText)}>
              Keep a passkey enabled and a recovery backup configured to ensure continuity across devices.
            </Text>
          </GlassCard>

          {error ? <Text style={themed($errorText)}>{error}</Text> : null}
          {status ? <Text style={themed($statusText)}>{status}</Text> : null}
        </View>
      </AnimatedBlobBackground>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $headerWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  marginBottom: spacing.md,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
  gap: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  fontSize: 12,
  marginBottom: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginTop: spacing.md,
  marginBottom: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
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
  color: colors.error,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.sm,
})
