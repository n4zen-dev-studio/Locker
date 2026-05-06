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
import { fetchJson } from "@/locker/net/apiClient"
import { getRemoteVaultId, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { VaultDTO, DeviceDTO } from "@locker/types"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultSwitcherModal: FC<AppStackScreenProps<"VaultSwitcherModal">> = function VaultSwitcherModal(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vaultName, setVaultName] = useState("My Vault")

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
        body: JSON.stringify({ name: vaultName.trim() || "My Vault" }),
      })
      setRemoteVaultId(data.vault.id, data.vault.name)
      setVaults((prev) => [data.vault, ...prev])
      let rvk = await getRemoteVaultKey(data.vault.id)
      if (!rvk) {
        rvk = randomBytes(32)
        await setRemoteVaultKey(data.vault.id, rvk)
        await putAndVerifySyncKeyCheck(data.vault.id, rvk)
      }
      setStatus("Vault created and set active")
      navigation.goBack()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create vault failed"
      setError(message)
    }
  }

  const loadDevices = useCallback(async (vaultId: string) => {
    try {
      const data = await fetchJson<{ devices: DeviceDTO[] }>(`/v1/vaults/${vaultId}/devices`)
      setDeviceCounts((prev) => ({ ...prev, [vaultId]: data.devices.length }))
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
    navigation.goBack()
  }

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Vault Switcher
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Select an active remote vault
            </Text>
          </GlassHeader>
        </View>

        <View style={themed($content)}>
          {error ? <Text style={themed($errorText)}>{error}</Text> : null}
          {status ? <Text style={themed($statusText)}>{status}</Text> : null}

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Create Vault
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
                Create Vault
              </Text>
            </Pressable>
          </GlassCard>

          {vaults.length === 0 ? (
            <GlassCard>
              <Text style={themed($metaText)}>No remote vaults yet.</Text>
            </GlassCard>
          ) : (
            vaults.map((vault) => (
              <GlassCard key={vault.id} style={themed($vaultCard)}>
                <View style={themed($vaultInfo)}>
                  <Text preset="bold" style={themed($vaultName)}>
                    {vault.name}
                  </Text>
                  <Text style={themed($vaultId)}>{vault.id}</Text>
                  <Text style={themed($metaText)}>Role: {vault.role ?? "member"}</Text>
                  <Text style={themed($metaText)}>Devices: {deviceCounts[vault.id] ?? "?"}</Text>
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
                </View>
              </GlassCard>
            ))
          )}

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

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.textStrong,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.md,
})

const $vaultCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $vaultInfo: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $vaultName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  marginBottom: 4,
})

const $vaultId: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
  marginBottom: 4,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
})

const $vaultActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
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

const $activeBadge: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.accentPink,
  fontSize: 12,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.md,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})
