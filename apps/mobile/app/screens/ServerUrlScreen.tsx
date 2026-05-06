import { FC, useCallback, useState } from "react"
import { Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { fetchJson, getApiBaseUrl, normalizeApiBaseUrl } from "@/locker/net/apiClient"
import { getServerUrl, setServerUrl } from "@/locker/storage/serverConfigRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const ServerUrlScreen: FC<AppStackScreenProps<"ServerUrl">> = function ServerUrlScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      const current = getServerUrl() || getApiBaseUrl()
      setUrl(current)
    }, []),
  )

  const handleSave = () => {
    const normalized = normalizeApiBaseUrl(url)
    setServerUrl(normalized)
    setStatus(`Saved: ${normalized}`)
    setError(null)
  }

  const handlePing = async () => {
    setError(null)
    setStatus(null)
    const normalized = normalizeApiBaseUrl(url)
    try {
      const data = await fetchJson<{ ok?: boolean }>("/health", {}, { baseUrl: normalized, token: null })
      setStatus(`Ping ok: ${JSON.stringify(data)}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ping failed"
      setError(message)
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Server URL
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Configure API base URL
        </Text>
      </View>

      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.0.10:4000"
        placeholderTextColor="#9aa0a6"
        style={themed($input)}
      />

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <Pressable style={themed($primaryButton)} onPress={handleSave}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          Save
        </Text>
      </Pressable>
      <Pressable style={themed($secondaryButton)} onPress={handlePing}>
        <Text preset="bold" style={themed($secondaryButtonText)}>
          Ping
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
  marginBottom: spacing.md,
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
  marginBottom: spacing.md,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.md,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
