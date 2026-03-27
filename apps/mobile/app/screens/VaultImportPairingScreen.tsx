import { FC, useCallback, useState } from "react"
import { Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { setRemoteVaultId, setVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { fetchJson } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { getToken } from "@/locker/auth/tokenStore"
import {
  formatPairingCode,
  isValidPairingCode,
  normalizePairingCode,
  unwrapVaultKeyPayload,
} from "@/locker/pairing/pairingCode"

export const VaultImportPairingScreen: FC<AppStackScreenProps<"VaultImportPairing">> =
  function VaultImportPairingScreen(props) {
    const { navigation, route } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
        const expectedVaultId = route.params?.vaultId
    const expectedVaultName = route.params?.vaultName


    const [pairingCode, setPairingCode] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [isLinked, setIsLinked] = useState(false)

    const refreshLinked = useCallback(async () => {
      try {
        const token = await getToken()
        setIsLinked(!!token)
      } catch {
        setIsLinked(false)
      }
    }, [])

    useFocusEffect(
      useCallback(() => {
        if (!vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
          return
        }
        // Update linked state whenever screen is focused (e.g. after linking)
        void refreshLinked()
      }, [navigation, refreshLinked]),
    )

    const handleGoLink = useCallback(() => {
      navigation.navigate("VaultLinkDevice")
    }, [navigation])

    const handleImport = async () => {
      setError(null)
      setStatus(null)

      const normalizedCode = normalizePairingCode(pairingCode)
      if (!normalizedCode) {
        setError("Enter a pairing code")
        return
      }
      if (!isValidPairingCode(normalizedCode)) {
        setError("Enter the 8-character pairing code")
        return
      }

      try {
        const token = await getToken()
        if (!token) {
          setIsLinked(false)
          setError("Device not linked. Tap “Link device” below, then retry import.")
          return
        }

        const data = await fetchJson<{ vaultId: string; wrappedVaultKeyB64: string }>(
          "/v1/pairing-codes/redeem",
          {
            method: "POST",
            body: JSON.stringify({ pairingCode: normalizedCode }),
          },
          { token },
        )

        const unwrapped = unwrapVaultKeyPayload({
          pairingCode: normalizedCode,
          wrappedVaultKeyB64: data.wrappedVaultKeyB64,
        })
        if (expectedVaultId && unwrapped.vaultId !== expectedVaultId) {
          throw new Error(`This access code is for a different vault${expectedVaultName ? ` than ${expectedVaultName}` : ""}.`)
        }

        await setRemoteVaultKey(unwrapped.vaultId, unwrapped.rvk)
        const account = getAccount()
        if (account?.device.id) {
          await fetchJson(`/v1/devices/${account.device.id}/vaults/${unwrapped.vaultId}`, { method: "PUT" })
        }
        setRemoteVaultId(unwrapped.vaultId, expectedVaultName)
        setVaultEnabledOnDevice(unwrapped.vaultId, true, { name: expectedVaultName })
        void requestSync("vault_enabled", unwrapped.vaultId)
        setStatus("Vault added to this device. Sync is ready.")
        navigation.replace("RemoteVault")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed"
        setError(message)
      }
    }

    return (
      <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
        <View style={themed($header)}>
          <Text preset="heading" style={themed($title)}>
            {expectedVaultName ? `Add ${expectedVaultName}` : "Enter Vault Access Code"}
          </Text>
          <Text preset="subheading" style={themed($subtitle)}>
            Use the one-time vault access code from another one of your devices
          </Text>
        </View>

        {!isLinked ? (
          <View style={themed($callout)}>
            <Text style={themed($calloutText)}>
              This device isn’t linked yet. Link it first to enable pairing import.
            </Text>
            <Pressable style={themed($secondaryButton)} onPress={handleGoLink}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Link device
              </Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          value={formatPairingCode(pairingCode)}
          onChangeText={setPairingCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABCD-EFGH"
          placeholderTextColor="#9aa0a6"
          style={themed($payload)}
        />

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}
        {status ? <Text style={themed($statusText)}>{status}</Text> : null}

        <Pressable style={themed($primaryButton)} onPress={handleImport}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            Add Vault to This Device
          </Text>
        </Pressable>

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

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $callout: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 14,
  padding: spacing.md,
  marginBottom: spacing.md,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.12)",
})

const $calloutText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral200,
  marginBottom: spacing.sm,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.10)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $payload: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  padding: spacing.md,
  color: colors.palette.neutral100,
  fontSize: 20,
  letterSpacing: 3,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.md,
})
