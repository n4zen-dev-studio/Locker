import { FC, useCallback, useEffect, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson } from "@/locker/net/apiClient"
import { getRemoteVaultId, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { encryptV1 } from "@/locker/crypto/aead"
import { sha256Hex } from "@/locker/crypto/sha"
import { utf8ToBytes } from "@/locker/crypto/encoding"
import { VaultDTO, DeviceDTO } from "@locker/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"

export const VaultSwitcherScreen: FC<AppStackScreenProps<"VaultSwitcher">> = function VaultSwitcherScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeVaultId = getRemoteVaultId()

  const loadVaults = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")
      setVaults(data.vaults || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load vaults"
      setError(message)
    }
  }, [])

  const handleCreateVault = async () => {
    setError(null)
    setStatus(null)
    try {
      const data = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
        method: "POST",
        body: JSON.stringify({ name: "My Vault" }),
      })
      setRemoteVaultId(data.vault.id, data.vault.name)
      setVaults((prev) => [data.vault, ...prev])
      let rvk = await getRemoteVaultKey(data.vault.id)
      if (!rvk) {
        rvk = randomBytes(32)
        await setRemoteVaultKey(data.vault.id, rvk)
        await uploadSyncKeyCheck(data.vault.id, rvk)
      }
      setStatus("Vault created and set active")
      navigation.replace("VaultTabs", { screen: "Vault" })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create vault failed"
      setError(message)
    }
  }

  const uploadSyncKeyCheck = async (vaultId: string, rvk: Uint8Array) => {
    await putAndVerifySyncKeyCheck(vaultId, rvk)
  }

  const loadDevices = useCallback(async (vaultId: string) => {
    try {
      const data = await fetchJson<{ devices: DeviceDTO[] }>(`/v1/vaults/${vaultId}/devices`)
    setDeviceCounts((prev) => {
      const next = { ...prev, [vaultId]: data.devices.length }
      if (__DEV__) console.log("[deviceCounts] set", { vaultId, count: data.devices.length, next })
      return next
    })
          setStatus(`Vault ${vaultId} devices: ${data.devices.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load devices"
      setError(message)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void loadVaults()
    }, [navigation, loadVaults]),
  )

  useEffect(() => {
    void loadVaults()
  }, [loadVaults])

  const handleSelect = (vault: VaultDTO) => {
    setRemoteVaultId(vault.id, vault.name)
    setStatus(`Active vault set: ${vault.name}`)
    navigation.replace("VaultTabs", { screen: "Vault" })
  }

  const handleManage = (vault: VaultDTO) => {
    setRemoteVaultId(vault.id, vault.name)
    navigation.navigate("VaultSettings")
  }

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Switch Vault
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Select an active remote vault
        </Text>
        <Pressable style={themed($linkButton)} onPress={() => navigation.navigate("ServerUrl")}>
          <Text preset="bold" style={themed($linkText)}>
            Server URL
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <Pressable style={themed($primaryButton)} onPress={handleCreateVault}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          Create Vault
        </Text>
      </Pressable>

      {vaults.length === 0 ? (
        <View style={themed($card)}>
          <Text style={themed($metaText)}>No remote vaults yet.</Text>
        </View>
      ) : (
        vaults.map((vault) => (
          <View key={vault.id} style={themed($vaultCard)}>
            <View style={themed($vaultInfo)}>
              <Text preset="bold" style={themed($vaultName)}>
                {vault.name}
              </Text>
              <Text style={themed($vaultId)}>{vault.id}</Text>
              <Text style={themed($metaText)}>Role: {vault.role ?? "member"}</Text>
              <Text style={themed($metaText)}>
                Devices: {deviceCounts[vault.id] ?? "1"}
              </Text>
            </View>
            <View style={themed($vaultActions)}>
              {activeVaultId === vault.id ? (
                <Text style={themed($activeBadge)}>Active</Text>
              ) : (
                <Pressable style={themed($primaryButton)} onPress={() => handleSelect(vault)}>
                  <Text preset="bold" style={themed($primaryButtonText)}>
                    Use Vault
                  </Text>
                </Pressable>
              )}
              <Pressable style={themed($secondaryButton)} onPress={() => loadDevices(vault.id)}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Ping Devices
                </Text>
              </Pressable>
              <Pressable style={themed($secondaryButton)} onPress={() => handleManage(vault)}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Manage Vault
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
        <Text preset="bold" style={themed($linkText)}>
          Back
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
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

const $vaultCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 18,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.lg,
})

const $vaultInfo: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $vaultName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $vaultId: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
  marginBottom: 4,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
})

const $vaultActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
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

const $activeBadge: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.primary300,
  fontSize: 12,
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
