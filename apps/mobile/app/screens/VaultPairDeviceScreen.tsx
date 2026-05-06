import { FC, useCallback, useMemo, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { fetchJson } from "@/locker/net/apiClient"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"
import {
  buildWrappedVaultKeyPayload,
  formatPairingCode,
  generatePairingCode,
} from "@/locker/pairing/pairingCode"

export const VaultPairDeviceScreen: FC<AppStackScreenProps<"VaultPairDevice">> = function VaultPairDeviceScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [pairingCode, setPairingCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const formattedCode = useMemo(() => formatPairingCode(pairingCode), [pairingCode])

  const buildPairingCode = useCallback(async () => {
    setError(null)
    setStatus(null)
    try {
      const vaultId = getRemoteVaultId()
      if (!vaultId) {
        setError("Set up vault sync on this device first")
        return
      }

      let rvk = await getRemoteVaultKey(vaultId)
      if (!rvk) {
        rvk = randomBytes(32)
        await setRemoteVaultKey(vaultId, rvk)
        await uploadSyncKeyCheck(vaultId, rvk)
      }

      const nextCode = generatePairingCode()
      const wrappedVaultKeyB64 = buildWrappedVaultKeyPayload({
        pairingCode: nextCode,
        vaultId,
        rvk,
      })

      const data = await fetchJson<{ pairingCode: string; expiresAt: string }>(
        `/v1/vaults/${vaultId}/pairing-codes`,
        {
          method: "POST",
          body: JSON.stringify({
            pairingCode: nextCode,
            wrappedVaultKeyB64,
          }),
        },
      )

      setPairingCode(data.pairingCode)
      setExpiresAt(data.expiresAt)
      setStatus("Pairing code ready. Enter it on your other linked device.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate pairing code")
    }
  }, [])

  const uploadSyncKeyCheck = async (vaultId: string, rvk: Uint8Array) => {
    await putAndVerifySyncKeyCheck(vaultId, rvk)
  }

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void buildPairingCode()
    }, [navigation, buildPairingCode]),
  )

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Link Another Device
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Generate a one-time code for another one of your devices
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <View style={themed($payload)}>
        <Text preset="heading" style={themed($codeText)}>
          {formattedCode || "---- ----"}
        </Text>
        <Text style={themed($codeHelpText)}>
          Link the other device to the same Locker account, then enter this code within 10 minutes.
        </Text>
        {expiresAt ? (
          <Text style={themed($codeHelpText)}>
            Expires: {new Date(expiresAt).toLocaleTimeString()}
          </Text>
        ) : null}
      </View>

      <Pressable style={themed($secondaryButton)} onPress={buildPairingCode}>
        <Text preset="bold" style={themed($secondaryButtonText)}>
          Generate New Code
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

const $payload: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  padding: spacing.md,
  minHeight: 180,
  justifyContent: "center",
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
})

const $codeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  letterSpacing: 4,
  marginBottom: 16,
  textAlign: "center",
})

const $codeHelpText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  textAlign: "center",
  marginBottom: 8,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
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
