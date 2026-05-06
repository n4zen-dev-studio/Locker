import { Platform } from "react-native"
import { getAccount } from "@/locker/storage/accountRepo"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { getState } from "@/locker/sync/syncStateRepo"
import { getSyncStatus } from "@/locker/sync/syncEngine"
import { listNoteIds, listNotes, listNoteMetas, getEncryptedNoteRecord } from "@/locker/storage/notesRepo"
import { vaultSession } from "@/locker/session"
import { getToken } from "@/locker/auth/tokenStore"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appPackage = require("../../../package.json") as { version?: string }

export type DiagnosticsSnapshot = {
  vaultId: string | null
  deviceId?: string
  userId?: string
  userEmail?: string | null
  tokenPresent: boolean
  rvkPresent: boolean
  cursor: number
  lamport: number
  outboxSize: number
  lastSyncAt?: string
  lastErrors?: unknown
  counts: {
    notes: number
    tombstones: number
    indexSize: number
  }
  app: {
    platform: string
    version: string
    timestamp: string
  }
}

export async function buildDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  const account = getAccount()
  const vaultId = getRemoteVaultId()
  const rvk = vaultId ? await getRemoteVaultKey(vaultId) : null
  const token = await getToken()
  const syncState = getState()
  const syncStatus = getSyncStatus()
  const vmk = vaultSession.getKey()
  let noteCount = 0

  if (vmk) {
    try {
      noteCount = listNotes(vmk).length
    } catch {
      noteCount = 0
    }
  }

  return {
    vaultId,
    deviceId: account?.device.id,
    userId: account?.user.id,
    userEmail: account?.user.email ?? null,
    tokenPresent: !!token,
    rvkPresent: !!rvk,
    cursor: syncState.lastCursor ?? 0,
    lamport: syncState.lamportClock ?? 0,
    outboxSize: syncState.outbox.length,
    lastSyncAt: syncState.lastSyncAt,
    lastErrors: syncStatus.lastErrors ?? null,
    counts: {
      notes: noteCount,
      tombstones: Object.keys(syncState.tombstones ?? {}).length,
      indexSize: listNoteIds(vaultId ?? null).length,
    },
    app: {
      platform: Platform.OS,
      version: appPackage?.version ?? "unknown",
      timestamp: new Date().toISOString(),
    },
  }
}

export async function exportDiagnosticsJson(): Promise<string> {
  const snapshot = await buildDiagnosticsSnapshot()
  return JSON.stringify(snapshot, null, 2)
}

export function exportEncryptedVaultBackup(): string {
  const metas = listNoteMetas()
  const records = metas.map((meta) => ({
    id: meta.id,
    record: getEncryptedNoteRecord(meta.id),
  }))

  const payload = {
    v: 1,
    exportedAt: new Date().toISOString(),
    notes: records,
    metas,
  }

  return JSON.stringify(payload, null, 2)
}
