import { FC, useCallback, useState } from "react"
import { Alert, Platform, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { clearToken, getToken } from "@/locker/auth/tokenStore"
import { AccountState, clearAccount, getAccount } from "@/locker/storage/accountRepo"
import { clearRemoteVaultId, getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getServerUrl, setServerUrl, clearServerUrl } from "@/locker/storage/serverConfigRepo"
import { cancelVault } from "@/locker/sync/syncCoordinator"
import { getApiBaseUrl, normalizeApiBaseUrl } from "@/locker/net/apiClient"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultAccountScreen: FC<AppStackScreenProps<"VaultAccount">> = function VaultAccountScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [account, setAccount] = useState<AccountState | null>(null)
  const [token, setTokenState] = useState<string | null>(null)
  const [apiUrlInput, setApiUrlInput] = useState("")
  const [apiUrlStatus, setApiUrlStatus] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const storedToken = await getToken()
    setTokenState(storedToken)
    setAccount(getAccount())
    const storedUrl = getServerUrl()
    if (storedUrl) {
      setApiUrlInput(storedUrl)
      return
    }
    const platformDefault = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000"
    setApiUrlInput(platformDefault)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      refresh()
    }, [navigation, refresh]),
  )

  const handleDisconnect = () => {
    Alert.alert("Disconnect", "Remove this device from your Locker account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          const activeVault = getRemoteVaultId()
          if (activeVault) cancelVault(activeVault)
          await clearToken()
          clearAccount()
          clearRemoteVaultId()
          setTokenState(null)
          setAccount(null)
        },
      },
    ])
  }

  const connected = !!token && !!account

  const handleSaveApiUrl = () => {
    const normalized = normalizeApiBaseUrl(apiUrlInput)
    setServerUrl(normalized)
    setApiUrlStatus(`Saved: ${normalized}`)
  }

  const handleResetApiUrl = () => {
    clearServerUrl()
    const platformDefault = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000"
    setApiUrlInput(platformDefault)
    setApiUrlStatus(`Reset to: ${platformDefault}`)
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Cloud Sync
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Device Account
        </Text>
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($statusText)}>
          Status: {connected ? "Connected" : "Not connected"}
        </Text>
        {connected ? (
          <View style={themed($detailGroup)}>
            <Text style={themed($detailText)}>User: {account?.user.email ?? account?.user.id}</Text>
            <Text style={themed($detailText)}>Device: {account?.device.name}</Text>
            <Text style={themed($detailText)}>API Base: {account?.apiBase}</Text>
          </View>
        ) : (
          <Text style={themed($detailText)}>
            Link this device to access remote vault sync.
          </Text>
        )}
      </View>

      <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultLinkDevice")}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          Link Device (Scan QR)
        </Text>
      </Pressable>

      <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("ServerUrl")}>
        <Text preset="bold" style={themed($secondaryButtonText)}>
          Server URL
        </Text>
      </Pressable>

      {connected ? (
        <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultSwitcherModal")}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Vault Switcher
          </Text>
        </Pressable>
      ) : null}

      {connected ? (
        <Pressable style={themed($linkButton)} onPress={handleDisconnect}>
          <Text preset="bold" style={themed($linkText)}>
            Disconnect
          </Text>
        </Pressable>
      ) : null}

      {__DEV__ ? (
        <View style={themed($devCard)}>
          <Text preset="bold" style={themed($statusText)}>
            API Base URL (Dev)
          </Text>
          <Text style={themed($detailText)}>
            Current: {getApiBaseUrl()}
          </Text>
          <TextInput
            value={apiUrlInput}
            onChangeText={setApiUrlInput}
            placeholder="http://192.168.0.10:4000"
            placeholderTextColor="#9aa0a6"
            style={themed($input)}
          />
          {apiUrlStatus ? <Text style={themed($detailText)}>{apiUrlStatus}</Text> : null}
          <Pressable style={themed($primaryButton)} onPress={handleSaveApiUrl}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Save API URL
            </Text>
          </Pressable>
          <Pressable style={themed($secondaryButton)} onPress={handleResetApiUrl}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Reset to Default
            </Text>
          </Pressable>
        </View>
      ) : null}
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

const $devCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 18,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.lg,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 6,
})

const $detailGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $detailText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 13,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginTop: spacing.sm,
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
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  alignItems: "center",
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
