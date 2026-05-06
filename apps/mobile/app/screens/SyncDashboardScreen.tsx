import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Button, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { GlassPillButton } from "@/components/GlassPillButton"
import { AccentBadge } from "@/components/AccentBadge"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { SyncStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, fetchRaw, getApiBaseUrl } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"
import { clearRemoteVaultId, getRemoteVaultId, getRemoteVaultName, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { encryptV1, decryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { sha256Hex } from "@/locker/crypto/sha"
import { bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"
import { getSyncStatus, setNetworkOnline } from "@/locker/sync/syncEngine"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { clearNoteRemoteMeta, clearTombstonesForVault, getState, setLastCursor, setOutbox } from "@/locker/sync/syncStateRepo"
import { clearRemoteVaultKey, getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { decryptBlobBytesToJson, encryptJsonToBlobBytes } from "@/locker/sync/remoteCodec"
import { listNoteIds } from "@/locker/storage/notesRepo"
import type { DeviceDTO, VaultDTO } from "@locker/types"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { Button as CustomButton } from "@/components/Button"

const BLOB_ID = "vault-meta-v1"

export const SyncDashboardScreen: FC<SyncStackScreenProps<"SyncDashboard">> = function SyncDashboardScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadedMeta, setDownloadedMeta] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
  const [offline, setOffline] = useState(false)
  const [tokenPresent, setTokenPresent] = useState(false)
  const [rvkPresent, setRvkPresent] = useState(false)
  const [deviceCount, setDeviceCount] = useState<number | null>(null)
  const [devices, setDevices] = useState<DeviceDTO[]>([])
  const [vaultNameInput, setVaultNameInput] = useState("My Vault")

  const apiBaseUrl = getApiBaseUrl()
  const account = getAccount()
  const vaultId = getRemoteVaultId()
  const vaultName = getRemoteVaultName()
  const vmk = vaultSession.getKey()

  const refreshPrereqs = useCallback(async () => {
    const token = await getToken()
    setTokenPresent(!!token)
    if (vaultId) {
      const rvk = await getRemoteVaultKey(vaultId)
      setRvkPresent(!!rvk && rvk.length === 32)
    } else {
      setRvkPresent(false)
    }
  }, [vaultId])

  const loadDevices = useCallback(async () => {
    if (!vaultId) return
    try {
      const token = await getToken()
      if (!token) return
      const data = await fetchJson<{ devices: DeviceDTO[] }>(`/v1/vaults/${vaultId}/devices`, {}, { token })
      setDevices(data.devices || [])
      setDeviceCount(data.devices.length)
    } catch {
      setDeviceCount(null)
    }
  }, [vaultId])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void refreshPrereqs()
      void loadDevices()
    }, [navigation, refreshPrereqs, loadDevices]),
  )

  useEffect(() => {
    const timer = setInterval(() => setSyncStatus(getSyncStatus()), 2000)
    return () => clearInterval(timer)
  }, [])

  const syncDisabledReason = useMemo(() => {
    if (!tokenPresent) return "Link device"
    if (!vaultId) return "Select remote vault"
    if (!vmk) return "Unlock vault"
    if (!rvkPresent) return "Create sync key"
    return null
  }, [tokenPresent, vaultId, vmk, rvkPresent])

  const metaDisabledReason = useMemo(() => {
    if (!tokenPresent) return "Link device"
    if (!vaultId) return "Select remote vault"
    if (!vmk) return "Unlock vault"
    if (!rvkPresent) return "Create sync key"
    return null
  }, [tokenPresent, vaultId, vmk, rvkPresent])

  const pairDisabledReason = useMemo(() => {
    if (!vaultId) return "Select remote vault"
    if (!rvkPresent) return "Create sync key first"
    return null
  }, [vaultId, rvkPresent])

  const canCreateSyncKey = !!vaultId && tokenPresent && !!vmk && !offline

  const handleCreateSyncKey = async () => {
    if (!vaultId) return
    setError(null)
    setStatus(null)
    try {
      const token = await getToken()
      if (!token) throw new Error("Link device first")

      let rvk = await getRemoteVaultKey(vaultId)
      if (!rvk || rvk.length !== 32) {
        rvk = randomBytes(32)
        await setRemoteVaultKey(vaultId, rvk)
      }

      await putAndVerifySyncKeyCheck(vaultId, rvk, { deviceId: account?.device.id ?? "unknown" })
      setRvkPresent(true)
      setStatus("Sync key initialized for this vault")
      await refreshPrereqs()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create sync key"
      setError(message)
    }
  }

  const handleUploadMeta = async () => {
    setError(null)
    setStatus(null)
    setDownloadedMeta(null)
    if (!vaultId || !vmk) {
      setError("Select a vault and unlock")
      return
    }
    const rvk = await getRemoteVaultKey(vaultId)
    if (!rvk) {
      setError("Create sync key first")
      return
    }

    try {
      const payload = {
        v: 1,
        createdAt: new Date().toISOString(),
        deviceId: account?.device.id ?? "unknown",
        note: "hello remote vault",
      }
      const plaintextBytes = utf8ToBytes(JSON.stringify(payload))
      const envelope = encryptV1(rvk, plaintextBytes)
      const envelopeBytes = utf8ToBytes(JSON.stringify(envelope))
      const sha256 = sha256Hex(envelopeBytes)

      const token = await getToken()
      if (!token) throw new Error("Link device first")

      await fetchJson(
        `/v1/vaults/${vaultId}/blobs/${BLOB_ID}?sha256=${sha256}`,
        {
          method: "PUT",
          headers: { "content-type": "application/octet-stream", authorization: `Bearer ${token}` },
          body: envelopeBytes,
        },
      )

      setStatus("Remote meta uploaded")
      await handleDownloadMeta()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setError(message)
    }
  }

  const handleDownloadMeta = async () => {
    setError(null)
    setStatus(null)
    if (!vaultId || !vmk) {
      setError("Select a vault and unlock")
      return
    }
    const rvk = await getRemoteVaultKey(vaultId)
    if (!rvk) {
      setError("Create sync key first")
      return
    }

    try {
      const token = await getToken()
      const res = await fetch(`${apiBaseUrl}/v1/vaults/${vaultId}/blobs/${BLOB_ID}`, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      })
      if (res.status === 404) {
        setStatus("No remote meta found in this vault yet. Upload first.")
        return
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`[HTTP ${res.status}] GET ${apiBaseUrl}/v1/vaults/${vaultId}/blobs/${BLOB_ID} :: ${text || "<empty>"}`)
      }
      const buffer = await res.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const envelope = JSON.parse(bytesToUtf8(bytes)) as EnvelopeV1
      const plaintext = decryptV1(rvk, envelope)
      const metaJson = bytesToUtf8(plaintext)
      setDownloadedMeta(metaJson)
      setStatus("Remote meta downloaded")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed"
      setError(message)
    }
  }

  const handleSyncNow = async () => {
    if (syncDisabledReason) return
    setError(null)
    setStatus(null)
    try {
      const result = await requestSync("manual", vaultId ?? undefined)
      if (result?.errors?.length > 0) {
        setStatus(`Sync complete with ${result.errors.length} error(s): ${result.errors[0].type}`)
      } else {
        setStatus(`Sync complete: pushed ${result?.pushed ?? 0}, pulled ${result?.pulled ?? 0}, conflicts ${result?.conflicts ?? 0}`)
      }
      setSyncStatus(getSyncStatus())
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed"
      setError(message)
      setSyncStatus(getSyncStatus())
    }
  }

  const toggleOffline = () => {
    const next = !offline
    setOffline(next)
    setNetworkOnline(!next)
  }

  const handleDeleteRemote = () => {
    Alert.alert("Delete Remote Vault", "This deletes the cloud vault and all synced data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getToken()
            if (!vaultId || !token) return
            await fetch(`${apiBaseUrl}/v1/vaults/${vaultId}`, {
              method: "DELETE",
              headers: { authorization: `Bearer ${token}` },
            })
            clearRemoteVaultId()
            clearRemoteVaultKey(vaultId)
            setLastCursor(0)
            setOutbox([])
            setStatus("Remote vault deleted")
          } catch (err) {
            const message = err instanceof Error ? err.message : "Delete failed"
            setError(message)
          }
        },
      },
    ])
  }

  const handleReencryptRemote = async () => {
    setError(null)
    setStatus(null)
    if (!vaultId || !vmk) {
      setError("Select a vault and unlock")
      return
    }
    const rvk = await getRemoteVaultKey(vaultId)
    if (!rvk) {
      setError("Create sync key first")
      return
    }

    try {
      const token = await getToken()
      if (!token) {
        setError("Link device first")
        return
      }
      let cursor = 0
      let updated = 0
      while (true) {
        const data = await fetchJson<{
          nextCursor: number
          changes: Array<{ id: number; type: string; blobId?: string | null }>
        }>(`/v1/vaults/${vaultId}/changes?cursor=${cursor}&limit=100`)
        const changes = data.changes || []
        if (changes.length === 0) break
        for (const change of changes) {
          cursor = Math.max(cursor, change.id)
          if (change.type !== "blob_put" || !change.blobId) continue
          if (change.blobId !== "notes-index-v1" && !change.blobId.startsWith("note-v1-")) continue

          const bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${change.blobId}`)
          try {
            decryptBlobBytesToJson<any>(rvk, bytes as any)
            continue
          } catch {
            // try legacy VMK
          }
          let payload: any
          try {
            payload = decryptBlobBytesToJson<any>(vmk, bytes as any)
          } catch {
            continue
          }
          const newBytes = encryptJsonToBlobBytes(rvk, payload)
          const sha256 = sha256Hex(newBytes)
          await fetchJson<{ ok: boolean }>(
            `/v1/vaults/${vaultId}/blobs/${change.blobId}?sha256=${sha256}`,
            {
              method: "PUT",
              headers: { "content-type": "application/octet-stream" },
              body: newBytes,
            },
          )
          updated += 1
        }

        if (changes.length < 100) break
      }

      const indexPayload = {
        v: 1,
        type: "notes-index",
        ids: listNoteIds(vaultId),
        updatedAt: new Date().toISOString(),
        deviceId: account?.device.id ?? "unknown",
        lamport: Date.now(),
      }
      const indexBytes = encryptJsonToBlobBytes(rvk, indexPayload)
      await fetchJson<{ ok: boolean }>(
        `/v1/vaults/${vaultId}/blobs/notes-index-v1?sha256=${sha256Hex(indexBytes)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          body: indexBytes,
        },
      )

      setStatus(`Re-encrypted ${updated} blobs`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Re-encrypt failed"
      setError(message)
    }
  }

  const handleClearSyncState = () => {
    if (!vaultId) return
    setLastCursor(0)
    setOutbox([])
    clearTombstonesForVault(vaultId)
    listNoteIds(vaultId).forEach((id) => clearNoteRemoteMeta(id))
    setStatus("Local sync state cleared")
  }

  const handleForceRebuild = async () => {
    if (!vaultId) return
    listNoteIds(vaultId).forEach((id) => clearNoteRemoteMeta(id))
    clearTombstonesForVault(vaultId)
    setLastCursor(0)
    setOutbox([])
    await handleSyncNow()
  }

  const handleCreateVault = async () => {
    setError(null)
    setStatus(null)
    if (!account) {
      setError("Link device first")
      return
    }
    try {
      const data = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
        method: "POST",
        body: JSON.stringify({ name: vaultNameInput.trim() || "My Vault" }),
      })
      setRemoteVaultId(data.vault.id, data.vault.name)
      setStatus("Remote vault created and set as active")
      await refreshPrereqs()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create vault"
      setError(message)
    }
  }

  const handleOpenVaultSwitcher = () => navigation.navigate("VaultSwitcherModal")

  const hasRemote = !!vaultId

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Sync
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              {vaultName ?? vaultId ?? "No remote vault selected"}
            </Text>
          </GlassHeader>
        </View>

        <View style={themed($content)}>
          <GlassCard>
            <View style={themed($cardHeader)}>
              <Text preset="bold" style={themed($sectionTitle)}>
                Active Vault
              </Text>
              {hasRemote ? <AccentBadge label="Remote" tone="blue" /> : <AccentBadge label="Local" />}
            </View>
            <Text style={themed($metaText)}>Active Vault ID: {vaultId ?? "n/a"}</Text>
            <Text style={themed($metaText)}>Device ID: {account?.device.id ?? "n/a"}</Text>
            <View style={themed($buttonRow)}>
              <GlassPillButton label="Select / Switch" onPress={handleOpenVaultSwitcher} />
              <GlassPillButton label="Create Vault" onPress={handleCreateVault} />
              <GlassPillButton label="Delete Vault" onPress={handleDeleteRemote} />
              <GlassPillButton label="Connect to Remote Vault" onPress={() => navigation.navigate("RemoteVault")} />
              <GlassPillButton label="VaultAccount" onPress={() => navigation.navigate("VaultAccount")} />

            </View>
            {!hasRemote ? (
              <Text style={themed($metaText)}>
                Connect a remote vault to enable sync.
              </Text>
            ) : null}
            <TextInput
              value={vaultNameInput}
              onChangeText={setVaultNameInput}
              placeholder="Vault name"
              placeholderTextColor="#9aa0a6"
              style={themed($input)}
            />
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Sync Status
            </Text>
            <Text style={themed($metaText)}>State: {syncStatus.state}</Text>
            <Text style={themed($metaText)}>Queue: {syncStatus.queueSize}</Text>
            {syncStatus.lastSyncAt ? (
              <Text style={themed($metaText)}>
                Last sync: {new Date(syncStatus.lastSyncAt).toLocaleString()}
              </Text>
            ) : null}
            {syncStatus.lastError ? <Text style={themed($errorText)}>{syncStatus.lastError}</Text> : null}
            <CustomButton preset="filledPink" text="Sync Now" onPress={handleSyncNow} disabled={Boolean(syncDisabledReason)} />

            {syncDisabledReason ? <Text style={themed($metaText)}>{syncDisabledReason}</Text> : null}
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Sync Key
            </Text>
            <CustomButton preset="glass" text="Create Sync Key" disabled={Boolean(!canCreateSyncKey)} onPress={handleCreateSyncKey} />

            <Text style={themed($metaText)}>
              {rvkPresent ? "Sync key ready for this vault." : "Sync key not initialized yet."}
            </Text>
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Devices
            </Text>
            <Text style={themed($metaText)}>Devices: {deviceCount ?? devices.length ?? 0}</Text>
            {devices.map((device) => (
              <Text key={device.id} style={themed($metaText)}>
                {device.name ?? device.id}
              </Text>
            ))}
            <View style={themed($buttonRow)}>
              <GlassPillButton label="Ping Devices" onPress={loadDevices} />
              <GlassPillButton
                label="Pair Device"
                onPress={() => navigation.navigate("PairDeviceModal")}
                disabled={!!pairDisabledReason}
              />
              <GlassPillButton
                label="Import Pairing"
                onPress={() => navigation.navigate("ImportPairingModal")}
                disabled={!!pairDisabledReason}
              />
            </View>
            {pairDisabledReason ? <Text style={themed($metaText)}>{pairDisabledReason}</Text> : null}
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Remote Meta
            </Text>

            <CustomButton preset="glass" text="Upload Meta" disabled={Boolean(metaDisabledReason)} onPress={handleUploadMeta} />
            <CustomButton preset="glass" text="Download Meta" disabled={Boolean(metaDisabledReason)} onPress={handleDownloadMeta} />

            {metaDisabledReason ? <Text style={themed($metaText)}>{metaDisabledReason}</Text> : null}
            {downloadedMeta ? (
              <View style={themed($metaCard)}>
                <Text style={themed($metaText)}>{downloadedMeta}</Text>
              </View>
            ) : null}
          </GlassCard>

          {__DEV__ ? (
            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Dev Tools
              </Text>

              <CustomButton preset="glass" text={offline ? "Go Online" : "Toggle Offline"}  onPress={toggleOffline} />
              <CustomButton preset="glass" text={"Re-encrypt Remote"}  onPress={handleReencryptRemote} />
              <CustomButton preset="glass" text={"Clear Sync State"}  onPress={handleClearSyncState} />
              <CustomButton preset="glass" text={"Force Rebuild"}  onPress={handleForceRebuild} />

              <Text style={themed($metaText)}>Last cursor: {getState().lastCursor}</Text>
              <Text style={themed($metaText)}>Queue size: {getState().outbox.length}</Text>
            </GlassCard>
          ) : null}

          {error ? <Text style={themed($errorText)}>{error}</Text> : null}
          {status ? <Text style={themed($statusText)}>{status}</Text> : null}
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

const $cardHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: spacing.sm,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
  marginBottom: 4,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.textStrong,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginTop: spacing.md,
})

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
  marginTop: spacing.sm,
})


const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginTop: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $buttonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.5,
})

const $metaCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  padding: spacing.md,
  marginTop: spacing.sm,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.sm,
})
