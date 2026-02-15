import { FC, useCallback, useEffect, useState } from "react"
import { Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
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
import { bytesToBase64, utf8ToBytes } from "@/locker/crypto/encoding"
import { fetchJson, getApiBaseUrl } from "@/locker/net/apiClient"
import { encryptV1 } from "@/locker/crypto/aead"
import { sha256Hex } from "@/locker/crypto/sha"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultPairDeviceScreen: FC<AppStackScreenProps<"VaultPairDevice">> = function VaultPairDeviceScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [payload, setPayload] = useState("")
  const [error, setError] = useState<string | null>(null)

  const buildPayload = useCallback(async () => {
    setError(null)
    const vaultId = getRemoteVaultId()
    if (!vaultId) {
      setError("Select an active remote vault first")
      return
    }

    let rvk = await getRemoteVaultKey(vaultId)
    if (!rvk) {
      rvk = randomBytes(32)
      await setRemoteVaultKey(vaultId, rvk)
      await uploadSyncKeyCheck(vaultId, rvk)
    }

    const data = {
      t: "locker-pair-v1",
      apiBase: getApiBaseUrl(),
      vaultId,
      rvkB64: bytesToBase64(rvk),
      createdAt: new Date().toISOString(),
    }
    setPayload(JSON.stringify(data))
    console.log("Generated pairing payload", JSON.stringify(data))
  }, [])

  const uploadSyncKeyCheck = async (vaultId: string, rvk: Uint8Array) => {
    const payload = {
      v: 1,
      type: "sync-key-check",
      vaultId,
      createdAt: new Date().toISOString(),
    }
    const envelope = encryptV1(rvk, utf8ToBytes(JSON.stringify(payload)))
    const bytes = utf8ToBytes(JSON.stringify(envelope))
    const sha256 = sha256Hex(bytes)
    await fetchJson<{ ok: boolean }>(
      `/v1/vaults/${vaultId}/blobs/sync-key-check-v1?sha256=${sha256}`,
      {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: bytes,
      },
    )
  }

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void buildPayload()
    }, [navigation, buildPayload]),
  )

  useEffect(() => {
    void buildPayload()
  }, [buildPayload])

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Pair New Device
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Share this pairing payload
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}

      <TextInput
        value={payload}
        editable={false}
        multiline
        style={themed($payload)}
      />

      <Pressable style={themed($secondaryButton)} onPress={buildPayload}>
        <Text preset="bold" style={themed($secondaryButtonText)}>
          Regenerate
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
  color: colors.palette.neutral100,
  minHeight: 200,
  textAlignVertical: "top",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
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
