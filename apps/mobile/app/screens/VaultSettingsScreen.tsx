import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, fetchRaw, getApiBaseUrl } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"
import { clearRemoteVaultId, getRemoteVaultId, getRemoteVaultName } from "@/locker/storage/remoteVaultRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { encryptV1, decryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { sha256Hex } from "@/locker/crypto/sha"
import { bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { getSyncStatus, setNetworkOnline, syncNow } from "@/locker/sync/syncEngine"
import { clearNoteRemoteMeta, clearTombstonesForVault, getState, setLastCursor, setOutbox } from "@/locker/sync/syncStateRepo"
import { clearRemoteVaultKey, getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { randomBytes } from "@/locker/crypto/random"
import { decryptBlobBytesToJson, encryptJsonToBlobBytes } from "@/locker/sync/remoteCodec"
import { listNoteIds } from "@/locker/storage/notesRepo"
import type { DeviceDTO } from "@locker/types"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"

const BLOB_ID = "vault-meta-v1"
const SYNC_KEY_CHECK_BLOB_ID = "sync-key-check-v1"

export const VaultSettingsScreen: FC<AppStackScreenProps<"VaultSettings">> = function VaultSettingsScreen(
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

      // const data = await fetchJson<{ devices: DeviceDTO[] }>(`/v1/vaults/${vaultId}/devices`)
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



  // const uploadSyncKeyCheck = async (id: string, rvk: Uint8Array) => {
  //   const payload = {
  //     v: 1,
  //     type: "sync-key-check",
  //     vaultId: id,
  //     createdAt: new Date().toISOString(),
  //     deviceId: account?.device.id ?? "unknown",
  //   }
  //   const envelope = encryptV1(rvk, utf8ToBytes(JSON.stringify(payload)))
  //   const envelopeBytes = utf8ToBytes(JSON.stringify(envelope))
  //   const sha256 = sha256Hex(envelopeBytes)
  //   const token = await getToken()
  //   if (!token) throw new Error("Link device first")

  //   await fetchRaw(
  //     `/v1/vaults/${id}/blobs/${SYNC_KEY_CHECK_BLOB_ID}?sha256=${sha256}`,
  //     {
  //       method: "PUT",
  //       headers: {
  //         "content-type": "application/octet-stream",
  //         authorization: `Bearer ${token}`,
  //       },
  //       // IMPORTANT: send bytes, not JSON
  //       body: envelopeBytes,
  //     },
  //     { token }, // if your fetchRaw supports token options; remove if it doesn't
  //   )


  // }

  const handleInitSyncKeyCheck = async () => {
    if (!vaultId) return
    setError(null)
    setStatus(null)
    try {
      const token = await getToken()
      if (!token) throw new Error("Link device first")

      let rvk = await getRemoteVaultKey(vaultId)
      if (!rvk || rvk.length !== 32) {
        // owner path: create RVK if missing
        rvk = randomBytes(32)
        await setRemoteVaultKey(vaultId, rvk)
        setRvkPresent(true)
      }

      await putAndVerifySyncKeyCheck(vaultId, rvk, { deviceId: account?.device.id ?? "unknown" })
      setStatus("Sync key check initialized. You can sync now.")
      await refreshPrereqs()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Init failed"
      setError(msg)
    }
  }


  // const uploadSyncKeyCheck = async (id: string, rvk: Uint8Array) => {
  //   const token = await getToken()
  //   if (!token) throw new Error("Link device first")

  //   const payload = {
  //     v: 1,
  //     type: "sync-key-check",
  //     vaultId: id,
  //     createdAt: new Date().toISOString(),
  //     deviceId: account?.device.id ?? "unknown",
  //   }

  //   // NOTE: remote boundary => RVK encrypt
  //   const envelope = encryptV1(rvk, utf8ToBytes(JSON.stringify(payload)))

  //   // IMPORTANT: send bytes of JSON(envelope) as octet-stream
  //   const bodyBytes = utf8ToBytes(JSON.stringify(envelope))
  //   const sha256 = sha256Hex(bodyBytes)

  //   await fetchRaw(
  //     `/v1/vaults/${id}/blobs/${SYNC_KEY_CHECK_BLOB_ID}?sha256=${sha256}`,
  //     {
  //       method: "PUT",
  //       headers: { "content-type": "application/octet-stream" },
  //       body: bodyBytes as any,
  //     },
  //     { token },
  //   )
  //   // await fetchRaw(
  //   //   `/v1/vaults/${id}/blobs/${SYNC_KEY_CHECK_BLOB_ID}?sha256=${sha256}`,
  //   //   {
  //   //     method: "PUT",
  //   //     headers: { "content-type": "application/octet-stream" },
  //   //     body: bodyBytes as any,
  //   //   },
  //   //   { token },
  //   // )

  //   // Verify immediately (this catches wrong vault / wrong baseUrl / wrong auth)
  //   const verifyBytes = await fetchRaw(
  //     `/v1/vaults/${id}/blobs/${SYNC_KEY_CHECK_BLOB_ID}`,
  //     {},
  //     { token },
  //   )

  //   // Must decrypt with RVK
  //   const verifyPayload = decryptBlobBytesToJson<any>(rvk, verifyBytes)
  //   if (verifyPayload?.type !== "sync-key-check" || verifyPayload?.vaultId !== id) {
  //     throw new Error("Sync key check verification failed after upload.")
  //   }
  // }




  


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

      await fetchRaw(
        `/v1/vaults/${vaultId}/blobs/${BLOB_ID}?sha256=${sha256}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            authorization: `Bearer ${token}`,
          },
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
      const result = await syncNow()
      if (result.errors.length > 0) {
        setStatus(`Sync complete with ${result.errors.length} error(s): ${result.errors[0].type}`)
      } else {
        setStatus(`Sync complete: pushed ${result.pushed}, pulled ${result.pulled}, conflicts ${result.conflicts}`)
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
    Alert.alert(
      "Delete Remote Vault",
      "This deletes the cloud vault and all synced data.",
      [
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
              navigation.replace("VaultHome")
            } catch (err) {
              const message = err instanceof Error ? err.message : "Delete failed"
              setError(message)
            }
          },
        },
      ],
    )
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
            decryptBlobBytesToJson<any>(rvk, bytes)
            continue
          } catch {
            // try legacy VMK
          }
          let payload: any
          try {
            payload = decryptBlobBytesToJson<any>(vmk, bytes)
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

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Vault Settings
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          {vaultName ?? vaultId ?? "No vault selected"}
        </Text>
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Status
        </Text>
        <Text style={themed($metaText)}>Token: {tokenPresent ? "ok" : "missing"}</Text>
        <Text style={themed($metaText)}>Remote vault: {vaultId ?? "missing"}</Text>
        <Text style={themed($metaText)}>Vault unlocked: {vmk ? "ok" : "missing"}</Text>
        <Text style={themed($metaText)}>Sync key: {rvkPresent ? "ok" : "missing"}</Text>
        <Text style={themed($metaText)}>Device count: {deviceCount ?? "?"}</Text>
        <Text style={themed($metaText)}>Sync state: {syncStatus.state}</Text>
        <Text style={themed($metaText)}>Queue size: {syncStatus.queueSize}</Text>
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Sync
        </Text>
        <Pressable
          style={[themed($primaryButton), syncDisabledReason ? themed($buttonDisabled) : null]}
          onPress={handleSyncNow}
        >
          <Text preset="bold" style={themed($primaryButtonText)}>
            Sync Now
          </Text>
        </Pressable>
        {syncDisabledReason ? <Text style={themed($metaText)}>{syncDisabledReason}</Text> : null}

        {__DEV__ ? (
          <Pressable style={themed($secondaryButton)} onPress={toggleOffline}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              {offline ? "Go Online" : "Toggle Offline"}
            </Text>
          </Pressable>
        ) : null}
      </View>


      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Sync Key
        </Text>
        <Pressable
          disabled={!canCreateSyncKey}
          style={[themed($secondaryButton), !canCreateSyncKey ? themed($buttonDisabled) : null]}
          onPress={handleCreateSyncKey}
        >
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Create Sync Key
          </Text>
        </Pressable>
        {rvkPresent ? (
          <Text style={themed($metaText)}>Sync key already exists for this vault.</Text>
        ) : (
          <Text style={themed($metaText)}>
            Sync key not initialized for this vault. Create it on the owner device, then pair other devices.
          </Text>
        )}
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Pair Devices
        </Text>
        <Pressable
          style={[themed($secondaryButton), pairDisabledReason ? themed($buttonDisabled) : null]}
          onPress={() => {
            if (pairDisabledReason) return
            navigation.navigate("VaultPairDevice")
          }}
        >
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Show Pair QR
          </Text>
        </Pressable>
        {pairDisabledReason ? <Text style={themed($metaText)}>{pairDisabledReason}</Text> : null}

        <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultImportPairing")}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Import Pairing (Paste)
          </Text>
        </Pressable>
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Remote Meta
        </Text>
        <Pressable
          style={[themed($secondaryButton), metaDisabledReason ? themed($buttonDisabled) : null]}
          onPress={handleUploadMeta}
        >
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Upload Remote Meta
          </Text>
        </Pressable>
        <Pressable
          style={[themed($secondaryButton), metaDisabledReason ? themed($buttonDisabled) : null]}
          onPress={handleDownloadMeta}
        >
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Download Remote Meta
          </Text>
        </Pressable>
        {metaDisabledReason ? <Text style={themed($metaText)}>{metaDisabledReason}</Text> : null}
        {downloadedMeta ? (
          <View style={themed($metaCard)}>
            <Text style={themed($metaText)}>{downloadedMeta}</Text>
          </View>
        ) : null}
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Danger Zone
        </Text>
        <Pressable style={themed($secondaryButton)} onPress={handleDeleteRemote}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Delete Remote Vault
          </Text>
        </Pressable>
      </View>

      {__DEV__ ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Diagnostics (Dev)
          </Text>
          <Text style={themed($metaText)}>Token present: {tokenPresent ? "yes" : "no"}</Text>
          <Text style={themed($metaText)}>Device ID: {account?.device.id ?? "n/a"}</Text>
          <Text style={themed($metaText)}>Remote Vault ID: {vaultId ?? "n/a"}</Text>
          <Text style={themed($metaText)}>Last cursor: {getState().lastCursor}</Text>
          <Text style={themed($metaText)}>Queue size: {getState().outbox.length}</Text>
          <Text style={themed($metaText)}>Last sync: {getState().lastSyncAt ?? "n/a"}</Text>
          <Text style={themed($metaText)}>API base: {apiBaseUrl}</Text>
          <Pressable style={themed($secondaryButton)} onPress={handleReencryptRemote}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Re-encrypt Remote with Sync Key
            </Text>
          </Pressable>
          <Pressable style={themed($secondaryButton)} onPress={handleClearSyncState}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Clear Local Sync State
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

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

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral100,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.sm,
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
  marginBottom: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $buttonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.5,
})

const $metaCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: 14,
  padding: spacing.md,
  marginTop: spacing.sm,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})
