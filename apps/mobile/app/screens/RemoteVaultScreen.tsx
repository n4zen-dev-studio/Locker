import { FC, useCallback, useState } from "react"
import { Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, fetchRaw } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"
import { getRemoteVaultId, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { encryptV1, decryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { sha256Hex } from "@/locker/crypto/sha"
import { bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { VaultDTO } from "@locker/types"

const BLOB_ID = "vault-meta-v1"

export const RemoteVaultScreen: FC<AppStackScreenProps<"RemoteVault">> = function RemoteVaultScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaultId, setVaultIdState] = useState<string | null>(getRemoteVaultId())
  const [vaultName, setVaultName] = useState("My Vault")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadedMeta, setDownloadedMeta] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      setVaultIdState(getRemoteVaultId())
    }, [navigation]),
  )

  const account = getAccount()

  const handleCreateVault = async () => {
    setError(null)
    setStatus(null)
    if (!account) {
      setError("Link device first")
      return
    }
    try {
      const data = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
        method: "POST",
        body: JSON.stringify({ name: vaultName.trim() || "My Vault" }),
      })
      setRemoteVaultId(data.vault.id)
      setVaultIdState(data.vault.id)
      setStatus("Remote vault created")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create vault"
      setError(message)
    }
  }

  const handleUploadMeta = async () => {
    setError(null)
    setStatus(null)
    setDownloadedMeta(null)
    const key = vaultSession.getKey()
    if (!key) {
      navigation.replace("VaultLocked")
      return
    }
    if (!account || !vaultId) {
      setError("Link device and select a vault")
      return
    }

    try {
      const payload = {
        v: 1,
        createdAt: new Date().toISOString(),
        deviceId: account.device.id,
        note: "hello remote vault",
      }
      const plaintextBytes = utf8ToBytes(JSON.stringify(payload))
      const envelope = encryptV1(key, plaintextBytes)
      const envelopeBytes = utf8ToBytes(JSON.stringify(envelope))
      const sha256 = sha256Hex(envelopeBytes)

      await fetchJson<{ ok: boolean }>(
        `/v1/vaults/${vaultId}/blobs/${BLOB_ID}?sha256=${sha256}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
          },
          body: envelopeBytes,
        },
      )
      setStatus("Remote meta uploaded")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setError(message)
    }
  }

  const handleDownloadMeta = async () => {
    setError(null)
    setStatus(null)
    const key = vaultSession.getKey()
    if (!key) {
      navigation.replace("VaultLocked")
      return
    }
    if (!account || !vaultId) {
      setError("Link device and select a vault")
      return
    }

    try {
      const bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${BLOB_ID}`)
      const envelope = JSON.parse(bytesToUtf8(bytes)) as EnvelopeV1
      const plaintext = decryptV1(key, envelope)
      const metaJson = bytesToUtf8(plaintext)
      setDownloadedMeta(metaJson)
      setStatus("Remote meta downloaded")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed"
      setError(message)
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Remote Vault
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Zero-trust cloud metadata
        </Text>
      </View>

      {!account ? (
        <View style={themed($card)}>
          <Text style={themed($bodyText)}>Link your device to use remote vault features.</Text>
          <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultAccount")}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Go to Account
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Create Remote Vault
        </Text>
        <TextInput
          value={vaultName}
          onChangeText={setVaultName}
          placeholder="Vault name"
          placeholderTextColor="#9aa0a6"
          style={themed($input)}
        />
        <Pressable style={themed($primaryButton)} onPress={handleCreateVault}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            Create Remote Vault
          </Text>
        </Pressable>
        {vaultId ? <Text style={themed($metaText)}>Vault ID: {vaultId}</Text> : null}
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Vault Meta Blob
        </Text>
        <Pressable style={themed($secondaryButton)} onPress={handleUploadMeta}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Upload Remote Meta
          </Text>
        </Pressable>
        <Pressable style={themed($secondaryButton)} onPress={handleDownloadMeta}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Download Remote Meta
          </Text>
        </Pressable>
        {downloadedMeta ? (
          <View style={themed($metaCard)}>
            <Text style={themed($metaText)}>{downloadedMeta}</Text>
          </View>
        ) : null}
      </View>

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

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
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

const $bodyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.md,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
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

const $metaCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: 14,
  padding: spacing.md,
  marginTop: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
