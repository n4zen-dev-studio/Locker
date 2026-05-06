import { FC, useCallback, useState } from "react"
import { Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { fetchRaw } from "@/locker/net/apiClient"
import { setServerUrl } from "@/locker/storage/serverConfigRepo"
import { sha256Hex } from "@/locker/crypto/sha"
import { encryptV1 } from "@/locker/crypto/aead"
import { base64ToBytes, utf8ToBytes } from "@/locker/crypto/encoding"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { getToken } from "@/locker/auth/tokenStore"

type PairPayload = {
  t?: string
  apiBase?: string
  vaultId?: string
  rvkB64?: string
  createdAt?: string
}

export const VaultImportPairingScreen: FC<AppStackScreenProps<"VaultImportPairing">> =
  function VaultImportPairingScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const [payload, setPayload] = useState("")
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
      // Change this route if your link screen is named differently.
      navigation.navigate("VaultAccount")
    }, [navigation])

    const handleImport = async () => {
      setError(null)
      setStatus(null)

      if (!payload.trim()) {
        setError("Paste pairing payload")
        return
      }

      let parsed: PairPayload
      try {
        parsed = JSON.parse(payload) as PairPayload
      } catch {
        setError("Invalid JSON")
        return
      }

      if (parsed.t !== "locker-pair-v1" || !parsed.vaultId || !parsed.rvkB64) {
        setError("Invalid pairing payload")
        return
      }

      try {
        // Ensure device is linked first (import needs auth for PUT)
        const token = await getToken()
        if (!token) {
          setIsLinked(false)
          setError("Device not linked. Tap “Link device” below, then retry import.")
          return
        }

        if (parsed.apiBase) {
          setServerUrl(parsed.apiBase)
        }

        const rvk = base64ToBytes(parsed.rvkB64)
        await setRemoteVaultKey(parsed.vaultId, rvk)

        const checkObj = {
          v: 1,
          type: "sync-key-check",
          vaultId: parsed.vaultId,
          createdAt: new Date().toISOString(),
        }

        const envelope = encryptV1(rvk, utf8ToBytes(JSON.stringify(checkObj)))
        const bytes = utf8ToBytes(JSON.stringify(envelope))
        const sha256 = sha256Hex(bytes)

        await fetchRaw(
          `/v1/vaults/${parsed.vaultId}/blobs/sync-key-check-v1?sha256=${sha256}`,
          {
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            body: bytes as any,
          },
          { token },
        )

        setRemoteVaultId(parsed.vaultId)
        setStatus("Pairing imported. You can sync now.")
        navigation.replace("VaultSettings")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed"
        setError(message)
      }
    }

    return (
      <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
        <View style={themed($header)}>
          <Text preset="heading" style={themed($title)}>
            Import Pairing
          </Text>
          <Text preset="subheading" style={themed($subtitle)}>
            Paste pairing JSON
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
          value={payload}
          onChangeText={setPayload}
          placeholder='{"t":"locker-pair-v1", ...}'
          placeholderTextColor="#9aa0a6"
          style={themed($payload)}
          multiline
        />

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}
        {status ? <Text style={themed($statusText)}>{status}</Text> : null}

        <Pressable style={themed($primaryButton)} onPress={handleImport}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            Import Pairing
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
  minHeight: 200,
  textAlignVertical: "top",
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
