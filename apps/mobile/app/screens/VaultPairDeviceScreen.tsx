import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { SvgXml } from "react-native-svg"
import QRCode from "qrcode"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson } from "@/locker/net/apiClient"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { listRemoteVaults } from "@/locker/storage/remoteVaultRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import {
  buildProvisioningPayload,
  formatDeviceLinkCode,
  generateDeviceLinkCode,
} from "@/locker/linking/deviceLinkPayload"
import { encodeDeviceLinkQrPayload } from "@/locker/linking/qrPayload"
import { getServerUrl } from "@/locker/storage/serverConfigRepo"
import { DEFAULT_API_BASE_URL } from "@/locker/config"

const PERSONAL_VAULT_NAME = "Personal"

export const VaultPairDeviceScreen: FC<AppStackScreenProps<"VaultPairDevice">> = function VaultPairDeviceScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [linkCode, setLinkCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [qrXml, setQrXml] = useState<string | null>(null)

  const formattedCode = useMemo(() => formatDeviceLinkCode(linkCode), [linkCode])
  const qrPayload = useMemo(
    () =>
      linkCode
        ? encodeDeviceLinkQrPayload({
            apiBase: getServerUrl() || DEFAULT_API_BASE_URL,
            linkCode,
          })
        : null,
    [linkCode],
  )

  useEffect(() => {
    let cancelled = false
    if (!qrPayload) {
      setQrXml(null)
      return
    }
    QRCode.toString(qrPayload, { type: "svg", margin: 1, width: 220 })
      .then((xml) => {
        if (!cancelled) setQrXml(xml)
      })
      .catch(() => {
        if (!cancelled) setQrXml(null)
      })
    return () => {
      cancelled = true
    }
  }, [qrPayload])

  const buildCode = useCallback(async () => {
    setError(null)
    setStatus(null)
    const personalVault = listRemoteVaults().find((vault) => vault.name === PERSONAL_VAULT_NAME)
    if (!personalVault) {
      setError("Personal vault is not available on this device yet.")
      return
    }
    const rvk = await getRemoteVaultKey(personalVault.id)
    if (!rvk) {
      setError("Personal vault key is missing on this device.")
      return
    }

    try {
      const nextCode = generateDeviceLinkCode()
      const provisioningPayload = buildProvisioningPayload({
        linkCode: nextCode,
        vaults: [{ vaultId: personalVault.id, name: personalVault.name, rvk }],
      })
      const data = await fetchJson<{ linkCode: string; expiresAt: string }>("/v1/devices/link-code", {
        method: "POST",
        body: JSON.stringify({ linkCode: nextCode, provisioningPayload }),
      })
      setLinkCode(data.linkCode)
      setExpiresAt(data.expiresAt)
      setStatus("Device setup code ready. Personal will be provisioned automatically on the new device.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create device setup code")
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void buildCode()
    }, [buildCode, navigation]),
  )

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Add Another Device
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Generate a one-time setup code for another one of your devices
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <View style={themed($payload)}>
        <Text preset="heading" style={themed($codeText)}>
          {formattedCode || "---- ---- ----"}
        </Text>
        <Text style={themed($codeHelpText)}>
          On the new device, choose “I already use Locker”, enter this code, and Personal will be enabled automatically.
        </Text>
        {expiresAt ? <Text style={themed($codeHelpText)}>Expires: {new Date(expiresAt).toLocaleTimeString()}</Text> : null}
        {qrXml ? <SvgXml xml={qrXml} width={220} height={220} /> : null}
        <Text style={themed($codeHelpText)}>Or scan the QR code from the new device.</Text>
      </View>

      <Pressable style={themed($secondaryButton)} onPress={() => void buildCode()}>
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

const $payload: ThemedStyle<TextStyle> = ({ spacing }) => ({
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
