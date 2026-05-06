import { FC, useCallback, useEffect, useState } from "react"
import { Pressable, StyleSheet, TextStyle, View, ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { useFocusEffect } from "@react-navigation/native"

import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { vaultSession } from "@/locker/session"
import { fetchJson } from "@/locker/net/apiClient"
import { clearRemoteVaultId, getRemoteVaultId, getRemoteVaultName, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getAccount } from "@/locker/storage/accountRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import type { VaultDTO } from "@locker/types"

export const VaultFabVaultPickerModal: FC<AppStackScreenProps<"VaultFabVaultPicker">> = function VaultFabVaultPickerModal(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [error, setError] = useState<string | null>(null)

  const activeVaultId = getRemoteVaultId()
  const activeVaultName = getRemoteVaultName() ?? (activeVaultId ? "Remote Vault" : "Local Vault")

  const scale = useSharedValue(0.96)
  const opacity = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  useEffect(() => {
    scale.value = withSpring(1, { damping: 16 })
    opacity.value = withSpring(1, { damping: 18 })
  }, [scale, opacity])

  const loadVaults = useCallback(async () => {
    const account = getAccount()
    if (!account) return
    try {
      const data = await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")
      setVaults(data.vaults || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load vaults"
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

  const handleSelectVault = (vaultId: string | null, vaultName?: string | null) => {
    if (vaultId) {
      setRemoteVaultId(vaultId, vaultName ?? undefined)
    } else {
      clearRemoteVaultId()
    }
    navigation.navigate("VaultTabs", { screen: "Vault", params: { screen: "VaultNote" } })
    navigation.goBack()
  }

  const handleCreateVault = () => {
    navigation.navigate("VaultTabs", { screen: "Settings" })
    navigation.goBack()
  }

  return (
    <View style={themed([$overlay, $insets])}>
      <Pressable style={themed($scrim)} onPress={() => navigation.goBack()} />
      <Animated.View style={[themed($sheet), animatedStyle]}>
        <GlassCard>
          <Text preset="bold" style={themed($title)}>
            Create Note In…
          </Text>
          {error ? <Text style={themed($errorText)}>{error}</Text> : null}

          <Pressable style={themed($vaultRow)} onPress={() => handleSelectVault(activeVaultId, activeVaultName)}>
            <Text preset="bold" style={themed($vaultName)}>
              {activeVaultName}
            </Text>
            <Text style={themed($vaultMeta)}>{activeVaultId ? "Active remote vault" : "Local vault"}</Text>
          </Pressable>

          <View style={themed($divider)} />

          {vaults.map((vault) => (
            <Pressable key={vault.id} style={themed($vaultRow)} onPress={() => handleSelectVault(vault.id, vault.name)}>
              <Text preset="bold" style={themed($vaultName)}>
                {vault.name}
              </Text>
              <Text style={themed($vaultMeta)}>{vault.id}</Text>
            </Pressable>
          ))}

          <Pressable style={themed($primaryButton)} onPress={handleCreateVault}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              + Create Vault
            </Text>
          </Pressable>
        </GlassCard>
      </Animated.View>
    </View>
  )
}

const $overlay: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $scrim: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(0, 0, 0, 0.55)",
})

const $sheet: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "88%",
  maxWidth: 420,
  marginHorizontal: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.md,
})

const $vaultRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.sm,
})

const $vaultName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $vaultMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
})

const $divider: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 1,
  backgroundColor: colors.glassBorder,
  marginVertical: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginTop: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.sm,
})
