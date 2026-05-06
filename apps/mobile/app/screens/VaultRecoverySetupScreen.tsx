import { FC, useCallback, useEffect, useState } from "react"
import { Alert, Pressable, ScrollView, Share, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { vaultSession } from "@/locker/session"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { getRemoteVaultId, getRemoteVaultName } from "@/locker/storage/remoteVaultRepo"
import { createRecoveryEnvelope, generateRecoveryKey } from "@/locker/recovery/recoveryKey"
import { getRecoveryEnvelopeStatus, upsertRecoveryEnvelope } from "@/locker/recovery/recoveryApi"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

type RecoveryStatus = {
  configured: boolean
  rotatedAt?: string
}

export const VaultRecoverySetupScreen: FC<AppStackScreenProps<"VaultRecoverySetup">> =
  function VaultRecoverySetupScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
    const vaultId = getRemoteVaultId()
    const vaultName = getRemoteVaultName() ?? "Current vault"

    const [status, setStatus] = useState<RecoveryStatus>({ configured: false })
    const [generatedKey, setGeneratedKey] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const refresh = useCallback(async () => {
      if (!vaultId) {
        setError("No vault is selected on this device.")
        return
      }
      try {
        const data = await getRecoveryEnvelopeStatus(vaultId)
        setStatus({
          configured: data.configured,
          rotatedAt: data.envelope?.rotatedAt,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recovery status")
      }
    }, [vaultId])

    useFocusEffect(
      useCallback(() => {
        if (!vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
          return
        }
        void refresh()
      }, [navigation, refresh]),
    )

    useEffect(() => {
      if (generatedKey) {
        setSaved(false)
      }
    }, [generatedKey])

    const handleGenerate = useCallback(async () => {
      if (!vaultId) {
        setError("No vault is selected on this device.")
        return
      }

      const run = async () => {
        setBusy(true)
        setError(null)
        setMessage(null)
        try {
          const vaultKey = await getRemoteVaultKey(vaultId)
          if (!vaultKey) throw new Error("Vault key unavailable on this device.")
          const recovery = generateRecoveryKey()
          const envelope = createRecoveryEnvelope(vaultKey, recovery.canonicalKey)
          await upsertRecoveryEnvelope(vaultId, envelope)
          setGeneratedKey(recovery.displayKey)
          setStatus({ configured: true, rotatedAt: new Date().toISOString() })
          setMessage(status.configured ? "Recovery key rotated. Previous key no longer works." : "Recovery key created.")
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create recovery key")
        } finally {
          setBusy(false)
        }
      }

      if (status.configured) {
        Alert.alert(
          "Regenerate recovery key?",
          "Generating a new recovery key will invalidate the previous one immediately.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Regenerate", style: "destructive", onPress: () => void run() },
          ],
        )
        return
      }

      await run()
    }, [status.configured, vaultId])

    const handleShare = useCallback(async () => {
      if (!generatedKey) return
      await Share.share({
        message: `${vaultName} recovery key\n\n${generatedKey}\n\nSave this now. Locker will not show it again.`,
      })
    }, [generatedKey, vaultName])

    const handleDismiss = useCallback(() => {
      setGeneratedKey(null)
      setSaved(false)
      navigation.goBack()
    }, [navigation])

    return (
      <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
        <ScrollView contentContainerStyle={themed($content)} showsVerticalScrollIndicator={false}>
          <View style={themed($header)}>
            <Text preset="heading" style={themed($title)}>
              Recovery Key
            </Text>
            <Text style={themed($subtitle)}>
              Create a one-time recovery key for {vaultName}. It wraps this vault’s key without exposing the vault key itself.
            </Text>
          </View>

          <View style={themed($panel)}>
            <Text preset="bold" style={themed($sectionTitle)}>
              Status
            </Text>
            <Text style={themed($bodyText)}>
              {status.configured
                ? `Configured${status.rotatedAt ? ` on ${new Date(status.rotatedAt).toLocaleString()}` : ""}.`
                : "No recovery key is configured for this vault."}
            </Text>
            <Pressable style={themed($primaryButton)} onPress={() => void handleGenerate()} disabled={busy}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                {busy ? "Working..." : status.configured ? "Regenerate Recovery Key" : "Generate Recovery Key"}
              </Text>
            </Pressable>
          </View>

          {generatedKey ? (
            <View style={themed($panel)}>
              <Text preset="bold" style={themed($sectionTitle)}>
                Save This Now
              </Text>
              <Text style={themed($warningText)}>
                Locker will show this recovery key only once. If you dismiss this screen without saving it, you must generate a new one.
              </Text>
              <View style={themed($keyShell)}>
                <Text selectable style={themed($keyText)}>
                  {generatedKey}
                </Text>
              </View>

              <Pressable style={themed($secondaryButton)} onPress={() => void handleShare()}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Export Key
                </Text>
              </Pressable>

              <Pressable style={themed($checkboxRow)} onPress={() => setSaved((current) => !current)}>
                <View style={themed([ $checkbox, saved && $checkboxChecked ])} />
                <Text style={themed($bodyText)}>I saved this recovery key.</Text>
              </Pressable>

              <Pressable
                style={themed([ $primaryButton, !saved && $buttonDisabled ])}
                onPress={handleDismiss}
                disabled={!saved}
              >
                <Text preset="bold" style={themed($primaryButtonText)}>
                  I Saved This
                </Text>
              </Pressable>
            </View>
          ) : null}

          {error ? <Text style={themed($errorText)}>{error}</Text> : null}
          {message ? <Text style={themed($statusText)}>{message}</Text> : null}
        </ScrollView>
      </Screen>
    )
  }

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexGrow: 1,
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
  paddingTop: spacing.xl,
  paddingBottom: spacing.xl,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  lineHeight: 21,
})

const $panel: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  borderRadius: 16,
  padding: spacing.lg,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.12)",
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $bodyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  lineHeight: 20,
})

const $warningText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.accent300,
  lineHeight: 20,
})

const $keyShell: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 14,
  padding: spacing.md,
  backgroundColor: "rgba(255, 255, 255, 0.08)",
})

const $keyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  letterSpacing: 1.2,
  lineHeight: 24,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  backgroundColor: colors.palette.primary300,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  backgroundColor: "rgba(255, 255, 255, 0.10)",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $checkboxRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $checkbox: ThemedStyle<ViewStyle> = () => ({
  width: 20,
  height: 20,
  borderRadius: 6,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.35)",
})

const $checkboxChecked: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary300,
  borderColor: colors.palette.primary300,
})

const $buttonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
