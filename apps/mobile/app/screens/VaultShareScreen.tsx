import { FC, useCallback, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, fetchRaw } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import { getRemoteVaultId, getRemoteVaultName } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { buildVaultKeyEnvelope, ensureUserKeypairUploaded } from "@/locker/keys/userKeyApi"
import { listNotesForVault } from "@/locker/storage/notesRepo"
import { getAccount } from "@/locker/storage/accountRepo"
import { enqueueUpsertNoteData, enqueueUpdateIndexData } from "@/locker/sync/queue"
import { encryptJsonToBlobBytes, decryptBlobBytesToJson } from "@/locker/sync/remoteCodec"
import { sha256Hex } from "@/locker/crypto/sha"
import type { VaultMemberDTO, VaultKeyEnvelopeDTO } from "@locker/types"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const KEY_VERSION_BLOB_ID = "vault-key-version-v1"

export const VaultShareScreen: FC<AppStackScreenProps<"VaultShare">> = function VaultShareScreen(props) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [members, setMembers] = useState<VaultMemberDTO[]>([])
  const [envelopes, setEnvelopes] = useState<VaultKeyEnvelopeDTO[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "editor" | "viewer">("viewer")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const refresh = useCallback(async () => {
    setError(null)
    try {
      await ensureUserKeypairUploaded()
      await loadMembers()
      await loadEnvelopes()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sharing data"
      setError(message)
    }
  }, [loadMembers, loadEnvelopes])

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
      await fetchJson(
        `/v1/vaults/${vaultId}/invites`,
        {
          method: "POST",
          body: JSON.stringify({ inviteeEmail: inviteEmail.trim(), role: inviteRole }),
        },
      )
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

      await fetchJson(
        `/v1/vaults/${vaultId}/key-envelopes`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: member.userId,
            alg: "X25519-SEALED-BOX",
            envelopeB64,
          }),
        },
      )

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

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Vault Sharing
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          {vaultName ?? vaultId ?? "No active vault"}
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <View style={themed($section)}>
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
      </View>

      <View style={themed($section)}>
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
      </View>

      <View style={themed($section)}>
        <Pressable style={themed($dangerButton)} onPress={rotateKey}>
          <Text preset="bold" style={themed($dangerButtonText)}>
            Rotate RVK
          </Text>
        </Pressable>
      </View>

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

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral100,
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
  backgroundColor: colors.palette.neutral800,
})

const $roleButtonActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary600,
})

const $roleText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

const $roleTextActive: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $memberCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral800,
  padding: spacing.md,
  borderRadius: 12,
  marginBottom: spacing.md,
})

const $memberTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $memberMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  marginBottom: 4,
})

const $memberActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary500,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral700,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.error,
  paddingVertical: spacing.sm,
  borderRadius: 10,
  alignItems: "center",
})

const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
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

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
})
