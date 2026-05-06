import { FC, useCallback, useEffect, useState } from "react"
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
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { bytesToBase64 } from "@/locker/crypto/encoding"
import { getApiBaseUrl } from "@/locker/net/apiClient"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"

export const PairDeviceModal: FC<AppStackScreenProps<"PairDeviceModal">> = function PairDeviceModal(
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
      await putAndVerifySyncKeyCheck(vaultId, rvk)
    }

    const data = {
      t: "locker-pair-v1",
      apiBase: getApiBaseUrl(),
      vaultId,
      rvkB64: bytesToBase64(rvk),
      createdAt: new Date().toISOString(),
    }
    setPayload(JSON.stringify(data))
  }, [])

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
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Pair New Device
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Share this pairing payload
            </Text>
          </GlassHeader>
        </View>

        <View style={themed($content)}>
          {error ? <Text style={themed($errorText)}>{error}</Text> : null}

          <GlassCard>
            <TextInput value={payload} editable={false} multiline style={themed($payload)} />
            <Pressable style={themed($secondaryButton)} onPress={buildPayload}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Regenerate
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
