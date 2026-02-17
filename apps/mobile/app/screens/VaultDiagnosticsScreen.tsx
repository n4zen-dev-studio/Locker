import { FC, useCallback, useState } from "react"
import { Pressable, ScrollView, Share, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { buildDiagnosticsSnapshot, exportDiagnosticsJson, exportEncryptedVaultBackup } from "@/locker/diagnostics/diagnostics"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultDiagnosticsScreen: FC<AppStackScreenProps<"VaultDiagnostics">> =
  function VaultDiagnosticsScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof buildDiagnosticsSnapshot>> | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(async () => {
      const next = await buildDiagnosticsSnapshot()
      setSnapshot(next)
    }, [])

    useFocusEffect(
      useCallback(() => {
        if (!vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
          return
        }
        void refresh()
      }, [navigation, refresh]),
    )

    const handleExport = async () => {
      setError(null)
      setStatus(null)
      try {
        const text = await exportDiagnosticsJson()
        await Share.share({ message: text })
        setStatus("Diagnostics exported.")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed"
        setError(message)
      }
    }

    const handleExportBackup = async () => {
      setError(null)
      setStatus(null)
      try {
        const text = exportEncryptedVaultBackup()
        await Share.share({ message: text })
        setStatus("Encrypted backup exported.")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed"
        setError(message)
      }
    }

    return (
      <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
        <View style={themed($header)}>
          <Text preset="heading" style={themed($title)}>
            Diagnostics
          </Text>
          <Text preset="subheading" style={themed($subtitle)}>
            Device & sync health (no secrets)
          </Text>
        </View>

        <View style={themed($card)}>
          <Text style={themed($metaText)}>Vault ID: {snapshot?.vaultId ?? "n/a"}</Text>
          <Text style={themed($metaText)}>Device ID: {snapshot?.deviceId ?? "n/a"}</Text>
          <Text style={themed($metaText)}>User ID: {snapshot?.userId ?? "n/a"}</Text>
          <Text style={themed($metaText)}>User Email: {snapshot?.userEmail ?? "n/a"}</Text>
          <Text style={themed($metaText)}>Token Present: {snapshot?.tokenPresent ? "yes" : "no"}</Text>
          <Text style={themed($metaText)}>RVK Present: {snapshot?.rvkPresent ? "yes" : "no"}</Text>
          <Text style={themed($metaText)}>Cursor: {snapshot?.cursor ?? 0}</Text>
          <Text style={themed($metaText)}>Lamport: {snapshot?.lamport ?? 0}</Text>
          <Text style={themed($metaText)}>Outbox: {snapshot?.outboxSize ?? 0}</Text>
          <Text style={themed($metaText)}>Last Sync: {snapshot?.lastSyncAt ?? "n/a"}</Text>
          <Text style={themed($metaText)}>Notes: {snapshot?.counts.notes ?? 0}</Text>
          <Text style={themed($metaText)}>Tombstones: {snapshot?.counts.tombstones ?? 0}</Text>
          <Text style={themed($metaText)}>Index Size: {snapshot?.counts.indexSize ?? 0}</Text>
        </View>

        <Pressable style={themed($secondaryButton)} onPress={refresh}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Refresh
          </Text>
        </Pressable>

        <Pressable style={themed($primaryButton)} onPress={handleExport}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            Export Diagnostics
          </Text>
        </Pressable>

        {__DEV__ ? (
          <Pressable style={themed($secondaryButton)} onPress={handleExportBackup}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Export Encrypted Vault Backup
            </Text>
          </Pressable>
        ) : null}

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}
        {status ? <Text style={themed($statusText)}>{status}</Text> : null}

        <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($linkText)}>
            Back
          </Text>
        </Pressable>
      </Screen>
    )
  }

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
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
  color: colors.palette.neutral400,
  marginTop: spacing.xs,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral800,
  padding: spacing.md,
  borderRadius: 12,
  marginBottom: spacing.md,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  marginBottom: 4,
  fontSize: 12,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary500,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
  marginBottom: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral700,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
  marginBottom: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.success500,
  marginBottom: spacing.md,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
