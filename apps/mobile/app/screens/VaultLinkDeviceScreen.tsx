import { FC, useCallback, useState } from "react"
import { Platform, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson } from "@/locker/net/apiClient"
import { DEFAULT_API_BASE_URL } from "@/locker/config"
import { getServerUrl, setServerUrl } from "@/locker/storage/serverConfigRepo"
import { normalizeApiBaseUrl } from "@/locker/net/apiClient"
import { setToken } from "@/locker/auth/tokenStore"
import { AccountState, setAccount } from "@/locker/storage/accountRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { DeviceDTO, UserDTO } from "@locker/types"

type LinkPayload = {
  t?: string
  apiBase?: string
  linkCode?: string
}

export const VaultLinkDeviceScreen: FC<AppStackScreenProps<"VaultLinkDevice">> = function VaultLinkDeviceScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [payload, setPayload] = useState("")
  const [deviceName, setDeviceName] = useState(
    Platform.OS === "ios" ? "Locker iPhone" : "Locker Android",
  )
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
      }
    }, [navigation]),
  )

  const handleRedeem = async () => {
    setError(null)
    setStatus(null)
    const trimmed = payload.trim()
    if (!trimmed) {
      setError("Paste a link payload or code")
      return
    }

    let linkCode = ""
    let apiBase = getServerUrl() || DEFAULT_API_BASE_URL

    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as LinkPayload
        if (parsed.linkCode) linkCode = parsed.linkCode
        if (parsed.apiBase) apiBase = parsed.apiBase
      } catch {
        setError("Invalid link payload")
        return
      }
    } else {
      linkCode = trimmed
    }

    if (!linkCode) {
      setError("Missing link code")
      return
    }

    try {
      setStatus("Redeeming link code...")
      apiBase = normalizeApiBaseUrl(apiBase)
      const data = await fetchJson<{ token: string; user: UserDTO; device: DeviceDTO }>(
        "/v1/devices/link-code/redeem",
        {
          method: "POST",
          body: JSON.stringify({
            linkCode,
            deviceName: deviceName.trim() || "Locker Mobile",
            platform: Platform.OS === "ios" ? "ios" : "android",
          }),
        },
        { baseUrl: apiBase, auth: "none" },
      )

      await setToken(data.token)
      setServerUrl(apiBase)

      const account: AccountState = {
        user: data.user,
        device: data.device,
        apiBase,
        linkedAt: new Date().toISOString(),
      }
      setAccount(account)

      const me = await fetchJson<{ user: UserDTO }>("/v1/me", {}, { baseUrl: apiBase, token: data.token })
      setAccount({ ...account, user: me.user })
      setStatus("Linked successfully")
      navigation.replace("VaultAccount")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Link failed"
      setError(message)
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Link Device
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Paste the trusted-device payload or code
        </Text>
      </View>

      <Text style={themed($label)}>Device name</Text>
      <TextInput
        value={deviceName}
        onChangeText={setDeviceName}
        placeholder="Device name"
        placeholderTextColor="#9aa0a6"
        style={themed($input)}
      />

      <Text style={themed($label)}>Link payload or code</Text>
      <TextInput
        value={payload}
        onChangeText={setPayload}
        placeholder='{"t":"locker-link-v1", ...}'
        placeholderTextColor="#9aa0a6"
        style={themed([$input, $payloadInput])}
        multiline
      />

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <Pressable style={themed($primaryButton)} onPress={handleRedeem}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          Redeem Link
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

const $label: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.xs,
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

const $payloadInput: ThemedStyle<TextStyle> = () => ({
  minHeight: 140,
  textAlignVertical: "top",
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
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
  marginTop: spacing.sm,
  alignItems: "center",
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
