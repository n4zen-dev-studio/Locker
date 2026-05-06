import { FC, useCallback, useEffect, useState } from "react"
import { Alert, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, getApiBaseUrl } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"
import { clearRemoteVaultId, getRemoteVaultId, setRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { encryptV1, decryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { sha256Hex } from "@/locker/crypto/sha"
import { bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { VaultDTO } from "@locker/types"
import { getSyncStatus, setNetworkOnline, syncNow } from "@/locker/sync/syncEngine"
import { getState, setLastCursor, setOutbox } from "@/locker/sync/syncStateRepo"
import { clearRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"

const BLOB_ID = "vault-meta-v1"

export const RemoteVaultScreen: FC<AppStackScreenProps<"RemoteVault">> = function RemoteVaultScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaultId, setVaultIdState] = useState<string | null>(getRemoteVaultId())
  const [vaultName, setVaultName] = useState("My Vault")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadedMeta, setDownloadedMeta] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
  const [offline, setOffline] = useState(false)
  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [isLoadingVaults, setIsLoadingVaults] = useState(false)
  const [tokenPresent, setTokenPresent] = useState(false)
  const [account, setAccount] = useState(() => getAccount())

  const apiBaseUrl = getApiBaseUrl()

  const refreshToken = useCallback(async () => {
    const token = await getToken()
    setTokenPresent(!!token)
  }, [])

  const loadVaults = useCallback(async (acct: ReturnType<typeof getAccount>) => {
    if (!acct) return
    setIsLoadingVaults(true)
    try {
      const data = await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")
      setVaults(data.vaults || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load vaults"
      setError(message)
    } finally {
      setIsLoadingVaults(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }

      const nextAccount = getAccount()
      setAccount(nextAccount)
      setVaultIdState(getRemoteVaultId())
      setSyncStatus(getSyncStatus())

      void refreshToken()
      if (nextAccount) void loadVaults(nextAccount)
    }, [navigation, refreshToken, loadVaults]),
  )

  useEffect(() => {
    const timer = setInterval(() => setSyncStatus(getSyncStatus()), 2000)
    return () => clearInterval(timer)
  }, [])

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
        body: JSON.stringify({ name: vaultName.trim() || "My Vault" }),
      })
      setRemoteVaultId(data.vault.id, data.vault.name)
      setVaultIdState(data.vault.id)
      setVaults((prev) => [data.vault, ...prev])
      setStatus("Remote vault created and set as active")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create vault"
      setError(message)
    }
  }

  const handleSelectVault = (id: string) => {
    const vault = vaults.find((item) => item.id === id)
    setRemoteVaultId(id, vault?.name)
    setVaultIdState(id)
    setStatus("Active remote vault set")
  }

  const handleUploadMeta = async () => {
    setError(null)
    setStatus(null)
    setDownloadedMeta(null)
    const key = vaultSession.getKey()
    if (!key) {
      navigation.replace("VaultLocked")
      return
    }
    if (!account || !vaultId) {
      setError("Select an active remote vault first")
      return
    }

    try {
      const payload = {
        v: 1,
        createdAt: new Date().toISOString(),
        deviceId: account.device.id,
        note: "hello remote vault",
      }
      const plaintextBytes = utf8ToBytes(JSON.stringify(payload))
      const envelope = encryptV1(key, plaintextBytes)
      const envelopeBytes = utf8ToBytes(JSON.stringify(envelope))
      const sha256 = sha256Hex(envelopeBytes)

      await fetchJson<{ ok: boolean }>(
        `/v1/vaults/${vaultId}/blobs/${BLOB_ID}?sha256=${sha256}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
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
    const key = vaultSession.getKey()
    if (!key) {
      navigation.replace("VaultLocked")
      return
    }
    if (!account || !vaultId) {
      setError("Select an active remote vault first")
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
      const plaintext = decryptV1(key, envelope)
      const metaJson = bytesToUtf8(plaintext)
      setDownloadedMeta(metaJson)
      setStatus("Remote meta downloaded")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed"
      setError(message)
    }
  }

  const handleSyncNow = async () => {
    setError(null)
    setStatus(null)
    try {
      const result = await syncNow()
      setStatus(`Sync complete: pushed ${result.pushed}, pulled ${result.pulled}, conflicts ${result.conflicts}`)
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

  const handlePingVault = async () => {
    setError(null)
    setStatus(null)
    try {
      const me = await fetchJson<{ user: { id: string; email?: string | null } }>("/v1/me")
      const data = await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")
      const ids = new Set((data.vaults || []).map((v) => v.id))
      if (vaultId && !ids.has(vaultId)) {
        setStatus("Active vaultId not in your memberships; select correct vault.")
        return
      }
      setStatus(`Ping ok. User ${me.user.email ?? me.user.id}. Vaults: ${(data.vaults || []).length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ping failed"
      setError(message)
    }
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
              const activeVaultId = getRemoteVaultId()
              if (!activeVaultId || !token) return
              await fetch(`${apiBaseUrl}/v1/vaults/${activeVaultId}`, {
                method: "DELETE",
                headers: { authorization: `Bearer ${token}` },
              })
              clearRemoteVaultId()
              if (activeVaultId) {
                clearRemoteVaultKey(activeVaultId)
              }
              setLastCursor(0)
              setOutbox([])
              setVaultIdState(null)
              setStatus("Remote vault deleted")
            } catch (err) {
              const message = err instanceof Error ? err.message : "Delete failed"
              setError(message)
            }
          },
        },
      ],
    )
  }

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Remote Vault
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Zero-trust cloud metadata
        </Text>
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Connection
        </Text>
        <Text style={themed($metaText)}>API Base: {apiBaseUrl}</Text>
        <Text style={themed($metaText)}>Token: {tokenPresent ? "present" : "missing"}</Text>
        <Text style={themed($metaText)}>Device ID: {account?.device.id ?? "n/a"}</Text>
        <Text style={themed($metaText)}>Active Vault ID: {vaultId ?? "n/a"}</Text>

        <Pressable style={themed($secondaryButton)} onPress={handlePingVault}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Ping Active Vault
          </Text>
        </Pressable>

        <Pressable
          style={themed($secondaryButton)}
          onPress={() => navigation.navigate("VaultPairDevice")}
        >
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Pair New Device (Show QR)
          </Text>
        </Pressable>

        <Pressable
          style={themed($secondaryButton)}
          onPress={() => navigation.navigate("VaultImportPairing")}
        >
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Import Pairing (Paste)
          </Text>
        </Pressable>
      </View>

      {!account ? (
        <View style={themed($card)}>
          <Text style={themed($bodyText)}>Link your device to use remote vault features.</Text>
          <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultAccount")}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Go to Account
            </Text>
          </Pressable>
        </View>
      ) : null}

      {account ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Select Remote Vault
          </Text>
          {isLoadingVaults ? <Text style={themed($metaText)}>Loading vaults…</Text> : null}
          {vaults.length === 0 ? (
            <Text style={themed($metaText)}>No vaults yet. Create one below.</Text>
          ) : (
            vaults.map((vault) => (
              <View key={vault.id} style={themed($vaultRow)}>
                <View style={themed($vaultInfo)}>
                  <Text preset="bold" style={themed($vaultName)}>
                    {vault.name}
                  </Text>
                  <Text style={themed($vaultId)}>{vault.id}</Text>
                </View>
                {vaultId === vault.id ? (
                  <Text style={themed($activeBadge)}>Active</Text>
                ) : (
                  <Pressable style={themed($secondaryButton)} onPress={() => handleSelectVault(vault.id)}>
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      Use on this device
                    </Text>
                  </Pressable>
                )}
              </View>
            ))
          )}

          <Text preset="bold" style={themed($sectionTitle)}>
            Create Remote Vault
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
              Create Remote Vault
            </Text>
          </Pressable>
          {vaultId ? <Text style={themed($metaText)}>Active Vault ID: {vaultId}</Text> : null}
        </View>
      ) : null}

      {account && vaultId ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Sync Status
          </Text>
          <Text style={themed($metaText)}>State: {syncStatus.state}</Text>
          <Text style={themed($metaText)}>Queue: {syncStatus.queueSize}</Text>
          {syncStatus.lastSyncAt ? (
            <Text style={themed($metaText)}>Last sync: {new Date(syncStatus.lastSyncAt).toLocaleString()}</Text>
          ) : null}
          {syncStatus.lastError ? <Text style={themed($errorText)}>{syncStatus.lastError}</Text> : null}

          <Pressable style={themed($primaryButton)} onPress={handleSyncNow}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Sync Now
            </Text>
          </Pressable>

          <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultNote", {})}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              New Secure Note
            </Text>
          </Pressable>

          <Pressable style={themed($secondaryButton)} onPress={handleDeleteRemote}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Delete Remote Vault
            </Text>
          </Pressable>

          {__DEV__ ? (
            <Pressable style={themed($secondaryButton)} onPress={toggleOffline}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                {offline ? "Go Online" : "Toggle Offline"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {account && vaultId ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Vault Meta Blob
          </Text>
          <Pressable style={themed($secondaryButton)} onPress={handleUploadMeta}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Upload Remote Meta
            </Text>
          </Pressable>
          <Pressable style={themed($secondaryButton)} onPress={handleDownloadMeta}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Download Remote Meta
            </Text>
          </Pressable>
          {downloadedMeta ? (
            <View style={themed($metaCard)}>
              <Text style={themed($metaText)}>{downloadedMeta}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {account && !vaultId ? (
        <View style={themed($card)}>
          <Text style={themed($bodyText)}>
            Select an active remote vault to enable sync and remote meta actions.
          </Text>
        </View>
      ) : null}

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
  // flex: 1,
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

const $bodyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.md,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
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

const $vaultRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
  gap: spacing.sm,
})

const $vaultInfo: ThemedStyle<ViewStyle> = () => ({
  gap: 4,
})

const $vaultName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $vaultId: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
})

const $activeBadge: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.primary300,
  fontSize: 12,
})

const $metaCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: 14,
  padding: spacing.md,
  marginTop: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
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
