import { FC, useCallback, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, fetchRaw, isNotFound } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import { setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { decryptBlobBytesToJson } from "@/locker/sync/remoteCodec"
import { SYNC_KEY_CHECK_BLOB_ID } from "@/locker/sync/syncKeyCheck"
import { fetchAndInstallVaultKeyEnvelope } from "@/locker/keys/userKeyApi"
import type { VaultInviteDTO } from "@locker/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultInvitesScreen: FC<AppStackScreenProps<"VaultInvites">> = function VaultInvitesScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [invites, setInvites] = useState<VaultInviteDTO[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [needsRecovery, setNeedsRecovery] = useState(false)

  const loadInvites = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchJson<{ invites: VaultInviteDTO[] }>("/v1/me/invites")
      setInvites(data.invites || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load invites"
      setError(message)
    }
  }, [])

  const acceptInvite = useCallback(async (invite: VaultInviteDTO) => {
    setError(null)
    setStatus(null)
    try {
      const data = await fetchJson<{ ok: boolean; vaultId: string }>(
        `/v1/invites/${invite.id}/accept`,
        { method: "POST" },
      )
      const vaultId = data.vaultId || invite.vaultId
      setRemoteVaultId(vaultId, invite.vaultName)

      let rvk: Uint8Array | null = null
      try {
        rvk = await fetchAndInstallVaultKeyEnvelope(vaultId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to install key"
        if (message.includes("Missing private key")) {
          setNeedsRecovery(true)
          setStatus("Invite accepted. This device needs your account keys. Recover with passphrase.")
          await loadInvites()
          return
        }
        throw err
      }
      if (!rvk) {
        setStatus("Invite accepted. Waiting for owner to send key envelope.")
        await loadInvites()
        return
      }

      const token = await getToken()
      if (!token) throw new Error("Link device first")
      try {
        const bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${SYNC_KEY_CHECK_BLOB_ID}`, {}, { token })
        const payload = decryptBlobBytesToJson<any>(rvk, bytes)
        if (payload?.type !== "sync-key-check" || payload?.vaultId !== vaultId) {
          setStatus("Key installed, but sync key check failed. Ask owner to re-send.")
        } else {
          setStatus("Key installed and verified. You can sync now.")
        }
      } catch (err) {
        if (isNotFound(err)) {
          setStatus("Key installed, but sync key check missing. Ask owner to initialize sync key.")
        } else {
          setStatus("Key installed, but verification failed.")
        }
      }

      await loadInvites()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to accept invite"
      setError(message)
    }
  }, [loadInvites])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void loadInvites()
    }, [navigation, loadInvites]),
  )

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Vault Invites
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Accept shared vault invitations
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}
      {needsRecovery ? (
        <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultRecovery")}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Recover Keys
          </Text>
        </Pressable>
      ) : null}

      {invites.length === 0 ? (
        <Text style={themed($emptyText)}>No pending invites.</Text>
      ) : (
        invites.map((invite) => (
          <View key={invite.id} style={themed($card)}>
            <Text preset="bold" style={themed($cardTitle)}>
              {invite.vaultName ?? invite.vaultId}
            </Text>
            <Text style={themed($cardMeta)}>Role: {invite.role}</Text>
            <Text style={themed($cardMeta)}>From: {invite.inviterEmail ?? invite.inviterUserId}</Text>
            <Pressable style={themed($primaryButton)} onPress={() => acceptInvite(invite)}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Accept Invite
              </Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable style={themed($secondaryButton)} onPress={() => navigation.goBack()}>
        <Text preset="bold" style={themed($secondaryButtonText)}>
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

const $subtitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral400,
  marginTop: spacing.xs,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral800,
  padding: spacing.md,
  borderRadius: 12,
  marginBottom: spacing.md,
})

const $cardTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $cardMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  marginBottom: 6,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary500,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
  marginTop: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral700,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
  marginTop: spacing.lg,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.success500,
  marginBottom: spacing.md,
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral400,
  marginTop: spacing.sm,
})
