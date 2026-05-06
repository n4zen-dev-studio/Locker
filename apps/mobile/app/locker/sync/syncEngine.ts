import { getToken } from "@/locker/auth/tokenStore"
import { getAccount } from "@/locker/storage/accountRepo"
import { getRemoteVaultId, markVaultSynced, setVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { vaultSession } from "@/locker/session"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"
import { sha256Hex } from "@/locker/crypto/sha"
import { fetchJson, fetchRaw, getApiBaseUrl, putBytes } from "@/locker/net/apiClient"
import { isApiError } from "@/locker/net/errors"
import { clearRemoteVaultKey, getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { fetchAndInstallVaultKeyEnvelope } from "@/locker/keys/userKeyApi"
import { parseAttachmentBlobBytes } from "@/locker/attachments/attachmentCodec"
import { writeEncryptedAttachment } from "@/locker/attachments/attachmentCache"
import {
  getOutbox,
  getState,
  nextLamport,
  setOutbox,
  setLastCursor,
  setLastSyncAt,
  getNoteRemoteMeta,
  setNoteRemoteMeta,
  OutboxOp,
  getTombstone,
  setTombstone,
  clearTombstone,
  setSyncDiagnostics,
  clearVaultSyncState,
} from "./syncStateRepo"
import { decryptBlobBytesToJson, encryptJsonToBlobBytes } from "./remoteCodec"
import { enqueueDeleteNoteData, enqueueUpdateIndexData, enqueueUpsertNoteData } from "./queue"
import type { Note } from "../storage/notesRepo"
import { getNote, listNoteIds, saveNote, saveNoteFromSync, deleteNote } from "../storage/notesRepo"
import { assertValidRemotePayload } from "./validation"

const NOTE_PREFIX = "note-v1-"
const DELETE_PREFIX = "note-delete-v1-"
const ATTACHMENT_PREFIX = "att-v1-"
const INDEX_BLOB_ID = "notes-index-v1"
const SYNC_KEY_CHECK_BLOB_ID = "sync-key-check-v1"

let networkOnline = true
type SyncErrorType =
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "CORRUPT_PAYLOAD"
  | "DECRYPT_ERROR"
  | "INTEGRITY_ERROR"
  | "VAULT_MISMATCH"
  | "LOGIC_ERROR"

export type SyncError = {
  type: SyncErrorType
  message: string
  step?: string
}

const statusByVault = new Map<
  string,
  { state: "idle" | "syncing" | "error"; lastError?: string; lastSyncAt?: string; lastErrors?: SyncError[] }
>()

export function setNetworkOnline(isOnline: boolean): void {
  networkOnline = isOnline
}

function isHttpStatus(err: unknown, status: number): boolean {
  if (isApiError(err)) return err.status === status
  if (!(err instanceof Error)) return false
  return err.message.includes(`[HTTP ${status}]`)
}

function isNotFound(err: unknown): boolean {
  if (isApiError(err)) return err.kind === "NOT_FOUND"
  return isHttpStatus(err, 404)
}

function isUnauthorized(err: unknown): boolean {
  if (isApiError(err)) return err.kind === "AUTH"
  return isHttpStatus(err, 401)
}

function isForbidden(err: unknown): boolean {
  if (isApiError(err)) return err.kind === "FORBIDDEN"
  return isHttpStatus(err, 403)
}


export function getSyncStatus(vaultId?: string): {
  state: "idle" | "syncing" | "error"
  lastError?: string
  lastSyncAt?: string
  lastErrors?: SyncError[]
  queueSize: number
} {
  const targetVaultId = vaultId ?? getRemoteVaultId()
  if (!targetVaultId) return { state: "idle", queueSize: 0 }
  const state = getState(targetVaultId)
  const status = statusByVault.get(targetVaultId) ?? { state: "idle" as const }
  return {
    state: status.state,
    lastError: status.lastError,
    lastErrors: status.lastErrors,
    lastSyncAt: status.lastSyncAt ?? state.lastSyncAt,
    queueSize: state.outbox.length,
  }
}

export async function enqueueUpsertNote(noteId: string): Promise<void> {
  const vmk = vaultSession.getKey()
  const account = getAccount()
  if (!vmk || !account) return

  const note = getNote(noteId, vmk) // local decrypt with VMK
  const vaultId = note.vaultId ?? null
  if (!vaultId) return
  const rvk = await getRemoteVaultKey(vaultId)
  if (!rvk) return
  enqueueUpsertNoteData(note, vaultId, rvk, account.device.id) // remote encrypt with RVK
  enqueueUpdateIndexData(listNoteIds(vaultId), vaultId, rvk, account.device.id) // index with RVK
}

export async function enqueueDeleteNote(noteId: string): Promise<void> {
  const vmk = vaultSession.getKey()
  const account = getAccount()
  if (!vmk || !account) return

  const createdAt = getCreatedAtForDelete(noteId, vmk)
  const note = tryGetNote(noteId, vmk)
  const vaultId = note?.vaultId ?? null
  if (!vaultId) return
  const rvk = await getRemoteVaultKey(vaultId)
  if (!rvk) return
  enqueueDeleteNoteData(noteId, createdAt, vaultId, rvk, account.device.id) // remote encrypt with RVK
  enqueueUpdateIndexData(listNoteIds(vaultId), vaultId, rvk, account.device.id)
}


export async function syncNow(options: { vaultId?: string; signal?: AbortSignal; reason?: string } = {}): Promise<{ pushed: number; pulled: number; conflicts: number; errors: SyncError[] }> {
  if (!networkOnline) {
    throw new Error("Offline mode is enabled")
  }
  const token = await getToken()
  const account = getAccount()
  const vaultId = options.vaultId ?? getRemoteVaultId()
  const vmk = vaultSession.getKey()
  const signal = options.signal

  if (!token || !account || !vaultId) {
    throw new Error("Link device and select a remote vault")
  }
  if (!vmk) {
    throw new Error("Vault is locked")
  }
  if (signal?.aborted) {
    throw new Error("Sync cancelled")
  }
  let rvk = await getRemoteVaultKey(vaultId)
  if (!rvk || rvk.length !== 32) {
    const refreshed = await fetchAndInstallVaultKeyEnvelope(vaultId)
    if (refreshed && refreshed.length === 32) {
      rvk = refreshed
    }
  }
  if (!rvk || rvk.length !== 32) {
    throw new Error("Sync key missing on this device. Pair this device to receive the sync key.")
  }

  const errors: SyncError[] = []



  rvk = await ensureSyncKeyCheckWithRefresh(vaultId, token, rvk, signal)


  statusByVault.set(vaultId, { state: "syncing" })

  const startTime = Date.now()
  if (__DEV__) {
    console.log("[sync] start", {
      vaultId,
      apiBase: getApiBaseUrl(),
      tokenPresent: !!token,
    })
  }

  let pushed = 0
  let pulled = 0
  let conflicts = 0
  let changesProcessed = 0

  try {
    const pushResult = await withStep("PUSH", () => flushOutbox(vaultId, token, errors, signal))
    pushed += pushResult.pushed
    if (pushResult.touchedNoteIds.size > 0) {
      await withStep("PUSH: PUT index", () => uploadIndex(vaultId, token, rvk, account.device.id, signal))
    }
    const pullResult = await withStep("PULL", () => pullChanges(vaultId, token, rvk, vmk, account.device.id, errors, signal))
    pulled += pullResult.pulled
    conflicts += pullResult.conflicts
    changesProcessed += pullResult.processedChanges

    const now = new Date().toISOString()
    statusByVault.set(vaultId, { state: "idle", lastSyncAt: now, lastErrors: errors })
    setLastSyncAt(vaultId, now)
    setSyncDiagnostics(vaultId, {
      lastSyncDurationMs: Date.now() - startTime,
      lastChangesProcessed: changesProcessed,
      lastIndexSize: listNoteIds(vaultId).length,
      lastTombstonesCount: Object.keys(getState(vaultId).tombstones ?? {}).length,
    })
    markVaultSynced(vaultId, now)

    return { pushed, pulled, conflicts, errors }
  } catch (err) {
    
    console.error("[sync] error", err)
    const message = err instanceof Error ? err.message : "Sync failed"
    const classified = classifyError(err)
    errors.push(classified)
    const previousStatus = statusByVault.get(vaultId)
    statusByVault.set(vaultId, {
      state: "error",
      lastError: message,
      lastSyncAt: previousStatus?.lastSyncAt,
      lastErrors: errors,
    })
    setSyncDiagnostics(vaultId, {
      lastSyncDurationMs: Date.now() - startTime,
      lastChangesProcessed: changesProcessed,
      lastIndexSize: listNoteIds(vaultId).length,
      lastTombstonesCount: Object.keys(getState(vaultId).tombstones ?? {}).length,
    })
    throw err
  }
}

async function ensureSyncKeyCheck(
  vaultId: string,
  token: string,
  rvk: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${SYNC_KEY_CHECK_BLOB_ID}`, {}, { token, signal })
    try {
      const payload = decryptBlobBytesToJson<any>(rvk, bytes)
      assertValidRemotePayload(payload)
      if (payload?.type !== "sync-key-check" || payload?.vaultId !== vaultId) {
        throw new Error("Invalid sync key check payload")
      }
    } catch (err) {
      if (__DEV__) {
        console.log("[sync] key check failed", {
          vaultId,
          blobId: SYNC_KEY_CHECK_BLOB_ID,
          sha256: sha256Hex(bytes),
        })
      }
      throw new Error("Wrong sync key for this vault. Re-pair.")
    }
  } catch (err) {
    if (isUnauthorized(err)) throw new Error("Session expired. Please link again.")
    if (isForbidden(err)) throw new Error("Access revoked for this vault.")
    if (isNotFound(err)) {
      throw new Error("Sync key not initialized for this vault. Generate a pairing code on another linked device.")
    }
    throw err
  }
}

async function ensureSyncKeyCheckWithRefresh(
  vaultId: string,
  token: string,
  rvk: Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    await ensureSyncKeyCheck(vaultId, token, rvk, signal)
    return rvk
  } catch (err) {
    if (err instanceof Error && err.message.includes("Wrong sync key")) {
      const refreshed = await fetchAndInstallVaultKeyEnvelope(vaultId)
      if (refreshed && refreshed.length === 32) {
        await ensureSyncKeyCheck(vaultId, token, refreshed, signal)
        return refreshed
      }
    }
    throw err
  }
}


async function flushOutbox(
  vaultId: string,
  token: string,
  errors: SyncError[],
  signal?: AbortSignal,
): Promise<{ pushed: number; touchedNoteIds: Set<string> }> {
  const outbox = [...getOutbox(vaultId)]
  let pushed = 0
  const touchedNoteIds = new Set<string>()
  const updated: OutboxOp[] = []
  const now = Date.now()

  for (const op of outbox) {
    const opVaultId = (op as OutboxOp & { vaultId?: string }).vaultId ?? vaultId
    if (opVaultId !== vaultId) {
      updated.push(op)
      continue
    }
    if (!networkOnline) {
      updated.push(op)
      continue
    }

    if (shouldBackoff(op, now)) {
      updated.push(op)
      continue
    }

    try {
      await withStep(`PUSH: PUT blob ${op.blobId}`, () =>
        putBlob(vaultId, token, op.blobId, op.bytesB64, op.sha256Hex, op.contentType, signal),
      )
      pushed += 1
      if (op.noteId) touchedNoteIds.add(op.noteId)

      if (op.noteId && op.noteUpdatedAt && op.lamport !== undefined) {
        const existing = getNoteRemoteMeta(vaultId, op.noteId)
        setNoteRemoteMeta(vaultId, op.noteId, {
          lastLamport: op.lamport,
          lastUpdatedAt: op.noteUpdatedAt,
          lastSeenChangeId: existing?.lastSeenChangeId ?? 0,
          lastConflictResolvedLamport: existing?.lastConflictResolvedLamport,
          lastDeviceId: op.deviceId ?? existing?.lastDeviceId,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      const classified = classifyError(err, `PUSH: PUT blob ${op.blobId}`)
      errors.push(classified)
      if (classified.type === "AUTH_ERROR") {
        throw new Error(classified.message)
      }
      if (classified.type === "VAULT_MISMATCH") {
        clearRemoteVaultKey(vaultId)
        setVaultEnabledOnDevice(vaultId, false)
        clearVaultSyncState(vaultId)
        throw new Error("Remote vault deleted")
      }
      if (classified.type === "INTEGRITY_ERROR") {
        throw new Error(classified.message)
      }
      updated.push({
        ...op,
        attempts: op.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        nextRetryAt: nextRetryAt(op.attempts + 1),
        lastError: message,
      })
      break
    }
  }

  setOutbox(vaultId, updated)
  return { pushed, touchedNoteIds }
}

async function pullChanges(
  vaultId: string,
  token: string,
  rvk: Uint8Array,
  vmk: Uint8Array,
  deviceId: string,
  errors: SyncError[],
  signal?: AbortSignal,
): Promise<{ pulled: number; conflicts: number; processedChanges: number }> {
  let pulled = 0
  let conflicts = 0
  let processedChanges = 0

  // IMPORTANT: lastCursor can be undefined on fresh installs / older state
  let cursor = getState(vaultId).lastCursor ?? 0

  let sawIndex: string[] | null = null
  let indexState: "none" | "valid" | "missing" | "corrupt" = "none"

  while (true) {
    let data: {
      nextCursor: number
      changes: Array<{ id: number; type: string; blobId?: string | null; createdAt: string }>
    }

    try {
      data = await withStep("PULL: GET changes", () =>
        fetchJson<{
          nextCursor: number
          changes: Array<{ id: number; type: string; blobId?: string | null; createdAt: string }>
        }>(`/v1/vaults/${vaultId}/changes?cursor=${cursor}&limit=100`, {}, { token, signal }),
      )
    } catch (err) {
      if (isNotFound(err)) {
        clearRemoteVaultKey(vaultId)
        setVaultEnabledOnDevice(vaultId, false)
        clearVaultSyncState(vaultId)
        throw new Error("Remote vault deleted")
      }
      throw err
    }

    const changes = [...(data.changes ?? [])].sort((a, b) => a.id - b.id)
    if (changes.length === 0) break

    let tempCursor = cursor
    for (const change of changes) {
      tempCursor = Math.max(tempCursor, change.id)

      if (change.type !== "blob_put" || !change.blobId) continue

      // Index handling
      // Index handling
      if (change.blobId === INDEX_BLOB_ID) {
        try {
          const bytes = await withStep("PULL: GET index blob", () =>
            fetchRaw(`/v1/vaults/${vaultId}/blobs/${INDEX_BLOB_ID}`, {}, { token, signal }),
          )

          try {
            const payload = decryptBlobBytesToJson<any>(rvk, bytes)
            assertValidRemotePayload(payload)

            // ✅ Only accept valid index shape
            if (payload?.type === "notes-index" && Array.isArray(payload.ids)) {
              sawIndex = payload.ids
              indexState = "valid"
            } else {
              // ❗ Unknown/invalid shape -> treat as "unknown", DON'T treat as empty
              sawIndex = null
              indexState = "corrupt"
              errors.push({
                type: "CORRUPT_PAYLOAD",
                message: "Index payload shape invalid; will rebuild index after pull",
                step: "PULL: GET index blob",
              })
            }
          } catch {
            if (__DEV__) {
              console.log("[sync] index decrypt failed", {
                vaultId,
                blobId: INDEX_BLOB_ID,
                sha256: sha256Hex(bytes),
              })
            }

            // ✅ Treat as "unknown index", DON'T overwrite index here
            sawIndex = null
            indexState = "corrupt"

            errors.push({
              type: "CORRUPT_PAYLOAD",
              message: "Index decrypt/validation failed; will rebuild index after pull",
              step: "PULL: GET index blob",
            })

            // 🚫 IMPORTANT: do NOT enqueueUpdateIndexData here
            // The new device may have 0 notes locally and would upload an empty index.
          }
        } catch (err) {
          if (isNotFound(err)) {
            // ✅ true empty vault case
            sawIndex = []
            indexState = "missing"
          } else {
            throw err
          }
        }

        continue
      }


      // Attachment blobs
      if (change.blobId.startsWith(ATTACHMENT_PREFIX)) {
        try {
          const bytes = await withStep(`PULL: GET blob ${change.blobId}`, () =>
            fetchRaw(`/v1/vaults/${vaultId}/blobs/${change.blobId}`, {}, { token, signal }),
          )
          try {
            const payload = parseAttachmentBlobBytes(bytes, rvk)
            if (payload.attId) {
              await writeEncryptedAttachment(vaultId, payload.attId, bytes)
            }
          } catch {
            errors.push({
              type: "CORRUPT_PAYLOAD",
              message: `Attachment decrypt failed for ${change.blobId}`,
              step: "PULL: GET blob",
            })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Attachment fetch failed"
          errors.push({ type: "NETWORK_ERROR", message, step: "PULL: GET blob" })
        }
        continue
      }

      // Only process note + delete blobs
      if (!change.blobId.startsWith(NOTE_PREFIX) && !change.blobId.startsWith(DELETE_PREFIX)) continue

      const bytes = await withStep(`PULL: GET blob ${change.blobId}`, () =>
        fetchRaw(`/v1/vaults/${vaultId}/blobs/${change.blobId}`, {}, { token, signal }),
      )

      let payload: any
      try {
        payload = decryptBlobBytesToJson<any>(rvk, bytes)
        assertValidRemotePayload(payload)
      } catch {
        if (__DEV__) {
          console.log("[sync] note decrypt failed", {
            vaultId,
            blobId: change.blobId,
            sha256: sha256Hex(bytes),
          })
        }
        errors.push({
          type: "CORRUPT_PAYLOAD",
          message: `Decrypt/validation failed for ${change.blobId}`,
          step: "PULL: GET blob",
        })
        continue
      }

      if (!payload || typeof payload !== "object") continue

      if (payload.type === "note-delete") {
        const result = await applyRemoteDelete(payload, change.id, vmk, rvk, deviceId, vaultId)
        pulled += result.applied
        conflicts += result.conflicts
        processedChanges += 1
        continue
      }

      if (payload.type !== "note" || !payload.note) continue

      const notePayload = payload as {
        note: Note
        lamport: number
        deviceId: string
      }

      const result = await applyRemoteNote(notePayload, change.id, vmk, rvk, deviceId, vaultId)
      pulled += result.applied
      conflicts += result.conflicts
      processedChanges += 1
    }

    cursor = tempCursor
    setLastCursor(vaultId, cursor)

    if (changes.length < 100) break
  }

  if (indexState === "valid" && Array.isArray(sawIndex)) {
    await reconcileIndex(sawIndex, vmk, rvk, deviceId, vaultId)
    await repairMissingNotes(sawIndex, vaultId, token, rvk, vmk, deviceId, errors, signal)
  } else if (indexState === "missing") {
    enqueueUpdateIndexData(listNoteIds(vaultId), vaultId, rvk, deviceId)
  } else if (indexState === "corrupt") {
    // Guardrail: never overwrite index when decrypt/validation failed.
  }

  return { pulled, conflicts, processedChanges }
}


async function applyRemoteNote(
  payload: { note: Note; lamport: number; deviceId: string },
  changeId: number,
  vmk: Uint8Array,
  rvk: Uint8Array,
  deviceId: string,
  vaultId: string,
): Promise<{ applied: number; conflicts: number }> {
  const note = payload.note
  const meta = getNoteRemoteMeta(vaultId, note.id)
  const local = tryGetNote(note.id, vmk)
  const localUnsynced = !!local && (!meta || local.updatedAt > meta.lastUpdatedAt)
  const tombstone = getTombstone(vaultId, note.id)

  if (note.vaultId && note.vaultId !== vaultId) {
    return { applied: 0, conflicts: 0 }
  }

  if (tombstone) {
    const cmpTombstone = compareLamport(tombstone.lamport, tombstone.deviceId, payload.lamport, payload.deviceId)
    if (cmpTombstone >= 0) {
      return { applied: 0, conflicts: 0 }
    }
    clearTombstone(vaultId, note.id)
  }

  if (localUnsynced && meta?.lastLamport !== undefined) {
    const cmp = compareLamport(payload.lamport, payload.deviceId, meta.lastLamport, meta.lastDeviceId ?? "")
    if (cmp < 0) {
      enqueueUpsertNoteData(local, vaultId, rvk, deviceId)
      return { applied: 0, conflicts: 0 }
    }
  }

  if (!local) {
    saveNoteFromSync(note, vmk, vaultId)
    setNoteRemoteMeta(vaultId, note.id, {
      lastLamport: payload.lamport,
      lastUpdatedAt: note.updatedAt,
      lastSeenChangeId: changeId,
      lastDeviceId: payload.deviceId,
    })
    return { applied: 1, conflicts: 0 }
  }

  if (local.updatedAt > note.updatedAt && localUnsynced) {
    enqueueUpsertNoteData(local, vaultId, rvk, deviceId)
    return { applied: 0, conflicts: 0 }
  }

  if (note.updatedAt > local.updatedAt && localUnsynced) {
    const remoteIsConflict = !!note.conflictParentNoteId
    const localIsConflict = !!local.conflictParentNoteId
    if (!remoteIsConflict && !localIsConflict && (!meta?.lastConflictResolvedLamport || payload.lamport > meta.lastConflictResolvedLamport)) {
      const conflictNote = saveNote(
        {
          title: `${local.title} (Conflict)`,
          body: local.body,
          vaultId,
          conflictParentNoteId: note.id,
          conflictOriginLamport: payload.lamport,
        },
        vmk,
      )
      enqueueUpsertNoteData(conflictNote, vaultId, rvk, deviceId)
      setNoteRemoteMeta(vaultId, note.id, {
        lastLamport: payload.lamport,
        lastUpdatedAt: note.updatedAt,
        lastSeenChangeId: changeId,
        lastConflictResolvedLamport: payload.lamport,
        lastDeviceId: payload.deviceId,
      })
      saveNoteFromSync(note, vmk, vaultId)
      return { applied: 1, conflicts: 1 }
    }
    saveNoteFromSync(note, vmk, vaultId)
    setNoteRemoteMeta(vaultId, note.id, {
      lastLamport: payload.lamport,
      lastUpdatedAt: note.updatedAt,
      lastSeenChangeId: changeId,
      lastConflictResolvedLamport: meta?.lastConflictResolvedLamport,
      lastDeviceId: payload.deviceId,
    })
    return { applied: 1, conflicts: 0 }
  }

  if (note.updatedAt > local.updatedAt) {
    saveNoteFromSync(note, vmk, vaultId)
    setNoteRemoteMeta(vaultId, note.id, {
      lastLamport: payload.lamport,
      lastUpdatedAt: note.updatedAt,
      lastSeenChangeId: changeId,
      lastDeviceId: payload.deviceId,
    })
    return { applied: 1, conflicts: 0 }
  }

  setNoteRemoteMeta(vaultId, note.id, {
    lastLamport: payload.lamport,
    lastUpdatedAt: note.updatedAt,
    lastSeenChangeId: changeId,
    lastDeviceId: payload.deviceId,
  })
  return { applied: 0, conflicts: 0 }
}

async function applyRemoteDelete(
  payload: { noteId: string; deletedAt: string; deviceId: string; lamport: number },
  changeId: number,
  vmk: Uint8Array,
  rvk: Uint8Array,
  deviceId: string,
  vaultId: string,
): Promise<{ applied: number; conflicts: number }> {
  const meta = getNoteRemoteMeta(vaultId, payload.noteId)
  const local = tryGetNote(payload.noteId, vmk)

  if (meta && compareLamport(meta.lastLamport, meta.lastDeviceId ?? "", payload.lamport, payload.deviceId) >= 0) {
    return { applied: 0, conflicts: 0 }
  }

  setTombstone(vaultId, payload.noteId, {
    noteId: payload.noteId,
    vaultId,
    deletedAt: payload.deletedAt,
    deviceId: payload.deviceId,
    lamport: payload.lamport,
  })

  if (local) {
    deleteNote(payload.noteId, undefined, { suppressSync: true })
  }

  setNoteRemoteMeta(vaultId, payload.noteId, {
    lastLamport: payload.lamport,
    lastUpdatedAt: payload.deletedAt,
    lastSeenChangeId: changeId,
    lastDeviceId: payload.deviceId,
  })

  enqueueUpdateIndexData(listNoteIds(vaultId), vaultId, rvk, deviceId)
  return { applied: 1, conflicts: 0 }
}

async function reconcileIndex(
  remoteIds: string[],
  vmk: Uint8Array,
  rvk: Uint8Array,
  deviceId: string,
  vaultId: string,
): Promise<void> {
  const localIds = listNoteIds(vaultId)
  const localSet = new Set(localIds)
  const remoteSet = new Set(remoteIds)

  let needsUpdate = false

  for (const id of localIds) {
    if (remoteSet.has(id)) continue
    const meta = getNoteRemoteMeta(vaultId, id)
    const local = tryGetNote(id, vmk)
    const unsynced = !!local && (!meta || local.updatedAt > meta.lastUpdatedAt)
    const tombstone = getTombstone(vaultId, id)
    if (tombstone && local) {
      deleteNote(id, undefined, { suppressSync: true })
      needsUpdate = true
      continue
    }
    if (unsynced && local) {
      enqueueUpsertNoteData(local, vaultId, rvk, deviceId)
      needsUpdate = true
    } else {
      deleteNote(id, undefined, { suppressSync: true })
      needsUpdate = true
    }
  }

  for (const id of remoteIds) {
    const tombstone = getTombstone(vaultId, id)
    if (tombstone) {
      needsUpdate = true
      continue
    }
    if (!localSet.has(id)) {
      // Remote has notes we don't have locally; avoid overwriting index.
    }
  }

  if (needsUpdate) {
    enqueueUpdateIndexData(listNoteIds(vaultId), vaultId, rvk, deviceId)
  }
}

async function repairMissingNotes(
  remoteIds: string[],
  vaultId: string,
  token: string,
  rvk: Uint8Array,
  vmk: Uint8Array,
  deviceId: string,
  errors: SyncError[],
  signal?: AbortSignal,
): Promise<void> {
  for (const id of remoteIds) {
    const tombstone = getTombstone(vaultId, id)
    if (tombstone) continue
    const local = tryGetNote(id, vmk)
    if (local) continue
    try {
      const bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${NOTE_PREFIX}${id}`, {}, { token, signal })
      const payload = decryptBlobBytesToJson<any>(rvk, bytes)
      assertValidRemotePayload(payload)
      if (payload.type !== "note") continue
      await applyRemoteNote(payload, 0, vmk, rvk, deviceId, vaultId)
    } catch (err) {
      errors.push({ type: "INTEGRITY_ERROR", message: `Repair failed for ${id}`, step: "PULL: repair" })
    }
  }
}

async function putBlob(
  vaultId: string,
  token: string,
  blobId: string,
  bytesB64: string,
  sha256Hex: string,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  const bytes = base64ToBytes(bytesB64)
  await putBytes(
    `/v1/vaults/${vaultId}/blobs/${blobId}?sha256=${sha256Hex}`,
    bytes,
    {},
    { token, signal, headers: { "content-type": contentType } },
  )
}

async function uploadIndex(
  vaultId: string,
  token: string,
  rvk: Uint8Array,
  deviceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const payload = {
    v: 1,
    type: "notes-index",
    ids: listNoteIds(vaultId),
    updatedAt: new Date().toISOString(),
    deviceId,
    lamport: nextLamport(vaultId),
  }
  const bytes = encryptJsonToBlobBytes(rvk, payload)
  await putBlob(
    vaultId,
    token,
    INDEX_BLOB_ID,
    bytesToBase64(bytes),
    sha256Hex(bytes),
    "application/octet-stream",
    signal,
  )
}

function shouldBackoff(op: OutboxOp, nowMs: number): boolean {
  if (op.nextRetryAt) {
    return nowMs < new Date(op.nextRetryAt).getTime()
  }
  if (!op.lastAttemptAt) return false
  const last = new Date(op.lastAttemptAt).getTime()
  const backoff = Math.min(30_000, 2000 * Math.max(1, op.attempts))
  return nowMs - last < backoff
}

function tryGetNote(id: string, vmk: Uint8Array): Note | null {
  try {
    return getNote(id, vmk)
  } catch {
    return null
  }
}

function getCreatedAtForDelete(noteId: string, vmk: Uint8Array): string {
  const existing = tryGetNote(noteId, vmk)
  if (existing) return existing.createdAt
  return new Date().toISOString()
}

function nextRetryAt(attempts: number): string {
  const delay = Math.min(Math.pow(2, Math.max(1, attempts)) * 1000, 30000)
  return new Date(Date.now() + delay).toISOString()
}

function compareLamport(aLamport: number, aDevice: string, bLamport: number, bDevice: string): number {
  if (aLamport === bLamport) {
    return aDevice.localeCompare(bDevice)
  }
  return aLamport > bLamport ? 1 : -1
}

function classifyError(err: unknown, step?: string): SyncError {
  if (isApiError(err)) {
    if (err.kind === "AUTH" || err.kind === "FORBIDDEN") {
      return { type: "AUTH_ERROR", message: err.message, step }
    }
    if (err.kind === "NOT_FOUND") {
      return { type: "VAULT_MISMATCH", message: "Remote vault deleted", step }
    }
    if (err.kind === "NETWORK" || err.kind === "TIMEOUT") {
      return { type: "NETWORK_ERROR", message: err.message, step }
    }
    if (err.kind === "BAD_RESPONSE") {
      return { type: "CORRUPT_PAYLOAD", message: err.message, step }
    }
  }
  if (err instanceof Error) {
    const msg = err.message || "Sync error"
    if (msg.includes("Session expired") || msg.includes("[HTTP 401]")) {
      return { type: "AUTH_ERROR", message: msg, step }
    }
    if (msg.includes("[HTTP 403]")) {
      return { type: "AUTH_ERROR", message: msg, step }
    }
    if (msg.includes("[HTTP 404]")) {
      return { type: "VAULT_MISMATCH", message: "Remote vault deleted", step }
    }
    if (msg.includes("Cannot reach server") || msg.includes("Request timed out")) {
      return { type: "NETWORK_ERROR", message: msg, step }
    }
    if (msg.includes("Invalid")) {
      return { type: "CORRUPT_PAYLOAD", message: msg, step }
    }
    if (msg.includes("cancelled")) {
      return { type: "NETWORK_ERROR", message: msg, step }
    }
    return { type: "LOGIC_ERROR", message: msg, step }
  }
  return { type: "LOGIC_ERROR", message: "Unknown sync error", step }
}

async function withStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`${label} failed :: ${message}`)
  }
}
