import { FC, useCallback, useState } from "react"
import { Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
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

export const ImportPairingModal: FC<AppStackScreenProps<"ImportPairingModal">> =
  function ImportPairingModal(props) {
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
        void refreshLinked()
      }, [navigation, refreshLinked]),
    )

    const handleGoLink = useCallback(() => {
      navigation.navigate("VaultLinkDevice")
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
        const token = await getToken()
        if (!token) {
          setIsLinked(false)
          setError("Device not linked. Tap \\"Link device\\" below, then retry import.")
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
        navigation.goBack()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed"
        setError(message)
      }
    }

    return (
      <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
        <AnimatedBlobBackground>
          <View style={themed($headerWrap)}>
            <GlassHeader>
              <Text preset="heading" style={themed($title)}>
                Import Pairing
              </Text>
              <Text preset="subheading" style={themed($subtitle)}>
                Paste pairing JSON
              </Text>
            </GlassHeader>
          </View>

          <View style={themed($content)}>
            {!isLinked ? (
              <GlassCard>
                <Text style={themed($calloutText)}>
                  This device isn’t linked yet. Link it first to enable pairing import.
                </Text>
                <Pressable style={themed($secondaryButton)} onPress={handleGoLink}>
                  <Text preset="bold" style={themed($secondaryButtonText)}>
                    Link device
                  </Text>
                </Pressable>
              </GlassCard>
            ) : null}

            <GlassCard>
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
            </GlassCard>

            <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
              <Text preset="bold" style={themed($linkText)}>
                Close
              </Text>
            </Pressable>
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

const $calloutText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $payload: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  padding: spacing.md,
  color: colors.textStrong,
  minHeight: 200,
  textAlignVertical: "top",
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.md,
})
