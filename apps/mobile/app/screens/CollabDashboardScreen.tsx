import { FC, useCallback, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { CollabStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, fetchRaw, isNotFound } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import { getRemoteVaultId, getRemoteVaultName, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { buildVaultKeyEnvelope, ensureUserKeypairUploaded, fetchAndInstallVaultKeyEnvelope } from "@/locker/keys/userKeyApi"
import { listNotesForVault } from "@/locker/storage/notesRepo"
import { getAccount } from "@/locker/storage/accountRepo"
import { enqueueUpsertNoteData, enqueueUpdateIndexData } from "@/locker/sync/queue"
import { encryptJsonToBlobBytes, decryptBlobBytesToJson } from "@/locker/sync/remoteCodec"
import { sha256Hex } from "@/locker/crypto/sha"
import type { VaultInviteDTO, VaultKeyEnvelopeDTO, VaultMemberDTO } from "@locker/types"
import { putAndVerifySyncKeyCheck, SYNC_KEY_CHECK_BLOB_ID } from "@/locker/sync/syncKeyCheck"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const KEY_VERSION_BLOB_ID = "vault-key-version-v1"

export const CollabDashboardScreen: FC<CollabStackScreenProps<"CollabDashboard">> = function CollabDashboardScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [members, setMembers] = useState<VaultMemberDTO[]>([])
  const [envelopes, setEnvelopes] = useState<VaultKeyEnvelopeDTO[]>([])
  const [invites, setInvites] = useState<VaultInviteDTO[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "editor" | "viewer">("viewer")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsRecovery, setNeedsRecovery] = useState(false)

  const vaultId = getRemoteVaultId()
  const vaultName = getRemoteVaultName()

  const envelopeSet = useMemo(() => new Set(envelopes.map((e) => e.userId)), [envelopes])

  const loadMembers = useCallback(async () => {
    if (!vaultId) return
    const data = await fetchJson<{ members: VaultMemberDTO[] }>(`/v1/vaults/${vaultId}/members`)
    setMembers(data.members || [])
  }, [vaultId])

  const loadEnvelopes = useCallback(async () => {
    if (!vaultId) return
    const data = await fetchJson<{ envelopes: VaultKeyEnvelopeDTO[] }>(
      `/v1/vaults/${vaultId}/key-envelopes`,
    )
    setEnvelopes(data.envelopes || [])
  }, [vaultId])

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

  const refresh = useCallback(async () => {
    setError(null)
    try {
      await ensureUserKeypairUploaded()
      await loadMembers()
      await loadEnvelopes()
      await loadInvites()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sharing data"
      setError(message)
    }
  }, [loadMembers, loadEnvelopes, loadInvites])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void refresh()
    }, [navigation, refresh]),
  )

  const sendInvite = useCallback(async () => {
    if (!vaultId) {
      setError("Select an active vault")
      return
    }
    setError(null)
    setStatus(null)
    try {
      await fetchJson(`/v1/vaults/${vaultId}/invites`, {
        method: "POST",
        body: JSON.stringify({ inviteeEmail: inviteEmail.trim(), role: inviteRole }),
      })
      setStatus("Invite sent")
      setInviteEmail("")
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send invite"
      setError(message)
    }
  }, [vaultId, inviteEmail, inviteRole, refresh])

  const sendKey = useCallback(async (member: VaultMemberDTO) => {
    if (!vaultId) return
    setError(null)
    setStatus(null)
    try {
      const rvk = await getRemoteVaultKey(vaultId)
      if (!rvk || rvk.length !== 32) throw new Error("Missing RVK. Create sync key first.")

      const keyResp = await fetchJson<{ key: { publicKey: string } }>(
        `/v1/users/${member.userId}/public-key`,
      )
      const envelopeB64 = buildVaultKeyEnvelope(keyResp.key.publicKey, rvk)

      await fetchJson(`/v1/vaults/${vaultId}/key-envelopes`, {
        method: "POST",
        body: JSON.stringify({
          userId: member.userId,
          alg: "X25519-SEALED-BOX",
          envelopeB64,
        }),
      })

      setStatus(`Key sent to ${member.email ?? member.userId}`)
      await loadEnvelopes()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send key"
      setError(message)
    }
  }, [vaultId, loadEnvelopes])

  const revokeMember = useCallback(async (member: VaultMemberDTO) => {
    if (!vaultId) return
    Alert.alert("Revoke member", "Revoke access for this member?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          setError(null)
          setStatus(null)
          try {
            await fetchJson(`/v1/vaults/${vaultId}/members/${member.userId}`, { method: "DELETE" })
            setStatus("Member revoked. Rotate RVK next.")
            await refresh()
          } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to revoke member"
            setError(message)
          }
        },
      },
    ])
  }, [vaultId, refresh])

  const uploadKeyVersionMarker = useCallback(
    async (oldRvk: Uint8Array, newRvk: Uint8Array) => {
      if (!vaultId) return
      const token = await getToken()
      if (!token) throw new Error("Link device first")

      let version = 1
      try {
        const existingBytes = await fetchRaw(
          `/v1/vaults/${vaultId}/blobs/${KEY_VERSION_BLOB_ID}`,
          {},
          { token },
        )
        const payload = decryptBlobBytesToJson<any>(oldRvk, existingBytes)
        if (payload?.type === "vault-key-version" && typeof payload.version === "number") {
          version = payload.version + 1
        }
      } catch {
        version = 1
      }

      const nextPayload = {
        v: 1,
        type: "vault-key-version",
        version,
        rotatedAt: new Date().toISOString(),
      }
      const bytes = encryptJsonToBlobBytes(newRvk, nextPayload)
      const sha256 = sha256Hex(bytes)

      await fetchRaw(
        `/v1/vaults/${vaultId}/blobs/${KEY_VERSION_BLOB_ID}?sha256=${sha256}`,
        {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          body: bytes as any,
        },
        { token },
      )
    },
    [vaultId],
  )

  const rotateKey = useCallback(async () => {
    if (!vaultId) {
      setError("Select an active vault")
      return
    }
    const vmk = vaultSession.getKey()
    if (!vmk) {
      setError("Unlock vault first")
      return
    }
    const account = getAccount()
    if (!account) {
      setError("Link device first")
      return
    }

    Alert.alert("Rotate RVK", "Rotate vault key and re-encrypt remote blobs?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rotate",
        style: "destructive",
        onPress: async () => {
          setError(null)
          setStatus(null)
          try {
            const oldRvk = await getRemoteVaultKey(vaultId)
            if (!oldRvk || oldRvk.length !== 32) throw new Error("Missing current RVK")

            const newRvk = randomBytes(32)
            await putAndVerifySyncKeyCheck(vaultId, newRvk, { rotatedAt: new Date().toISOString() })
            await uploadKeyVersionMarker(oldRvk, newRvk)

            await setRemoteVaultKey(vaultId, newRvk)

            const notes = listNotesForVault(vmk, vaultId)
            for (const note of notes) {
              enqueueUpsertNoteData(note, vaultId, newRvk, account.device.id)
            }
            enqueueUpdateIndexData(notes.map((n) => n.id), vaultId, newRvk, account.device.id)

            for (const member of members) {
              if (member.userId === account.user.id) continue
              try {
                await sendKey(member)
              } catch {
                // best effort
              }
            }

            setStatus("RVK rotated. Sync to upload re-encrypted notes.")
          } catch (err) {
            const message = err instanceof Error ? err.message : "Rotation failed"
            setError(message)
          }
        },
      },
    ])
  }, [vaultId, members, sendKey, uploadKeyVersionMarker])

  const acceptInvite = useCallback(async (invite: VaultInviteDTO) => {
    setError(null)
    setStatus(null)
    try {
      const data = await fetchJson<{ ok: boolean; vaultId: string }>(
        `/v1/invites/${invite.id}/accept`,
        { method: "POST" },
      )
      const nextVaultId = data.vaultId || invite.vaultId
      setRemoteVaultId(nextVaultId, invite.vaultName)

      let rvk: Uint8Array | null = null
      try {
        rvk = await fetchAndInstallVaultKeyEnvelope(nextVaultId)
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
        const bytes = await fetchRaw(`/v1/vaults/${nextVaultId}/blobs/${SYNC_KEY_CHECK_BLOB_ID}`, {}, { token })
        const payload = decryptBlobBytesToJson<any>(rvk, bytes)
        if (payload?.type !== "sync-key-check" || payload?.vaultId !== nextVaultId) {
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

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Collaboration
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              {vaultName ?? vaultId ?? "No active vault"}
            </Text>
          </GlassHeader>
        </View>

        <View style={themed($content)}>
          {error ? <Text style={themed($errorText)}>{error}</Text> : null}
          {status ? <Text style={themed($statusText)}>{status}</Text> : null}

          {needsRecovery ? (
            <Pressable
              style={themed($secondaryButton)}
              onPress={() => navigation.navigate("VaultTabs", { screen: "Security" })}
            >
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Recover keys to accept invite
              </Text>
            </Pressable>
          ) : null}

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Invite User
            </Text>
            <TextField
              label="Invitee Email"
              placeholder="user@example.com"
              value={inviteEmail}
              autoCapitalize="none"
              onChangeText={setInviteEmail}
              containerStyle={themed($field)}
            />
            <View style={themed($roleRow)}>
              {(["viewer", "editor", "admin", "owner"] as const).map((role) => (
                <Pressable
                  key={role}
                  style={themed([$roleButton, inviteRole === role && $roleButtonActive])}
                  onPress={() => setInviteRole(role)}
                >
                  <Text style={themed([$roleText, inviteRole === role && $roleTextActive])}>{role}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={themed($primaryButton)} onPress={sendInvite}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Send Invite
              </Text>
            </Pressable>
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Members
            </Text>
            {members.length === 0 ? (
              <Text style={themed($emptyText)}>No members.</Text>
            ) : (
              members.map((member) => (
                <View key={member.userId} style={themed($memberCard)}>
                  <Text preset="bold" style={themed($memberTitle)}>
                    {member.email ?? member.userId}
                  </Text>
                  <Text style={themed($memberMeta)}>Role: {member.role}</Text>
                  <Text style={themed($memberMeta)}>
                    Envelope: {envelopeSet.has(member.userId) ? "sent" : "missing"}
                  </Text>
                  <View style={themed($memberActions)}>
                    <Pressable style={themed($secondaryButton)} onPress={() => sendKey(member)}>
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Send Key
                      </Text>
                    </Pressable>
                    <Pressable style={themed($dangerButton)} onPress={() => revokeMember(member)}>
                      <Text preset="bold" style={themed($dangerButtonText)}>
                        Revoke
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Pending Invites
            </Text>
            {invites.length === 0 ? (
              <Text style={themed($emptyText)}>No pending invites.</Text>
            ) : (
              invites.map((invite) => (
                <View key={invite.id} style={themed($memberCard)}>
                  <Text preset="bold" style={themed($memberTitle)}>
                    {invite.vaultName ?? invite.vaultId}
                  </Text>
                  <Text style={themed($memberMeta)}>Role: {invite.role}</Text>
                  <Text style={themed($memberMeta)}>
                    From: {invite.inviterEmail ?? invite.inviterUserId}
                  </Text>
                  <Pressable style={themed($primaryButton)} onPress={() => acceptInvite(invite)}>
                    <Text preset="bold" style={themed($primaryButtonText)}>
                      Accept Invite
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </GlassCard>

          <GlassCard>
            <Pressable style={themed($dangerButton)} onPress={rotateKey}>
              <Text preset="bold" style={themed($dangerButtonText)}>
                Rotate RVK
              </Text>
            </Pressable>
          </GlassCard>
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

const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $roleRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
  marginBottom: spacing.sm,
})

const $roleButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderRadius: 8,
  backgroundColor: colors.glass,
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $roleButtonActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 110, 199, 0.25)",
  borderColor: "rgba(255, 110, 199, 0.5)",
})

const $roleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $roleTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $memberCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  padding: spacing.md,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.md,
})

const $memberTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  marginBottom: 4,
})

const $memberMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginBottom: 4,
})

const $memberActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 90, 90, 0.15)",
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 90, 90, 0.4)",
})

const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.error,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.md,
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})
