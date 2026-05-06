import { decryptV1, encryptV1, EnvelopeV1 } from "../crypto/aead"
import { bytesToBase64, bytesToUtf8, utf8ToBytes } from "../crypto/encoding"
import { randomBytes } from "../crypto/random"
import { load, remove, save } from "@/utils/storage"
import { VaultDataError } from "./errors"
import { getAccount } from "./accountRepo"
import { getRemoteVaultId } from "./remoteVaultRepo"
import { getRemoteVaultKey } from "./remoteKeyRepo"
import { enqueueDeleteNoteData, enqueueUpdateIndexData, enqueueUpsertNoteData } from "../sync/queue"
import { requestSync } from "../sync/syncCoordinator"
import { deleteNoteFromIndex, indexNote } from "@/locker/search/searchRepo"

const NOTES_LIST_KEY = "locker:notes:v1:list"
const NOTE_KEY_PREFIX = "locker:notes:v1:note:"

export type Note = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
  vaultId?: string | null
  attachments?: NoteAttachment[]
  conflictParentNoteId?: string | null
  conflictOriginLamport?: number | null
}

export type NoteAttachment = {
  id: string
  filename: string | null
  mime: string
  sizeBytes: number
  sha256: string
  blobId: string
  createdAt: string
}

type NoteMeta = {
  id: string
  createdAt: string
  updatedAt: string
  vaultId?: string | null
}

type EncryptedNoteRecord = {
  id: string
  createdAt: string
  updatedAt: string
  title: EnvelopeV1
  body: EnvelopeV1
  attachments?: EnvelopeV1
  vaultId?: string | null
  conflictParentNoteId?: string | null
  conflictOriginLamport?: number | null
}

export function listNoteMetas(): NoteMeta[] {
  return load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
}

export function getEncryptedNoteRecord(id: string): EncryptedNoteRecord | null {
  return load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + id) ?? null
}

export function listNotes(vmk: Uint8Array): Note[] {
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []

  const notes: Note[] = []
  let mutated = false
  const cleanedMetas: NoteMeta[] = []

  for (const meta of metas) {
    const record = load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + meta.id)

    // Missing record -> drop meta (self heal)
    if (!record) {
      mutated = true
      continue
    }

    try {
      const title = bytesToUtf8(decryptV1(vmk, record.title))

      // Keep meta + note
      cleanedMetas.push({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        vaultId: record.vaultId ?? null,
      })

      notes.push({
        id: record.id,
        title,
        body: "",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        vaultId: record.vaultId ?? null,
        attachments: undefined,
        conflictParentNoteId: record.conflictParentNoteId ?? null,
        conflictOriginLamport: record.conflictOriginLamport ?? null,
      })
    } catch {
      // Decrypt failed -> record is unreadable with current VMK
      // Keep storage record for forensics, but remove it from listing index so UI works.
      mutated = true
      continue
    }
  }

  if (mutated) {
    // Ensure stable ordering after cleanup
    const next = cleanedMetas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    save(NOTES_LIST_KEY, next)
  }

  return notes
}


export function listNotesForVault(vmk: Uint8Array, vaultId: string | null): Note[] {
  return listNotes(vmk).filter((note) => (note.vaultId ?? null) === (vaultId ?? null))
}

export function getNote(id: string, vmk: Uint8Array): Note {
  const record = load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + id)
  if (!record) throw new VaultDataError()

  try {
    const title = bytesToUtf8(decryptV1(vmk, record.title))
    const body = bytesToUtf8(decryptV1(vmk, record.body))
    let attachments: NoteAttachment[] = []
    if (record.attachments) {
      try {
        const raw = bytesToUtf8(decryptV1(vmk, record.attachments))
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          attachments = parsed as NoteAttachment[]
        }
      } catch {
        attachments = []
      }
    }
    return {
      id: record.id,
      title,
      body,
      attachments,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      vaultId: record.vaultId ?? null,
      conflictParentNoteId: record.conflictParentNoteId ?? null,
      conflictOriginLamport: record.conflictOriginLamport ?? null,
    }
  } catch {
    throw new VaultDataError()
  }
}

export function saveNote(
  input: {
    id?: string
    title: string
    body: string
    vaultId?: string | null
    attachments?: NoteAttachment[]
    conflictParentNoteId?: string | null
    conflictOriginLamport?: number | null
  },
  vmk: Uint8Array,
  options?: { suppressSync?: boolean },
): Note {
  const now = new Date().toISOString()
  const existing = input.id ? load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + input.id) : null
  const id = input.id ?? generateId()
  const vaultId = input.vaultId ?? existing?.vaultId ?? null
  const conflictParentNoteId = input.conflictParentNoteId ?? existing?.conflictParentNoteId ?? null
  const conflictOriginLamport = input.conflictOriginLamport ?? existing?.conflictOriginLamport ?? null
  const existingAttachments = existing?.attachments
    ? safeDecryptAttachments(existing.attachments, vmk)
    : []
  const attachments = input.attachments ?? existingAttachments

  const record: EncryptedNoteRecord = buildEncryptedRecord(
    {
      id,
      title: input.title,
      body: input.body,
      attachments,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      vaultId,
      conflictParentNoteId,
      conflictOriginLamport,
    },
    vmk,
  )

  save(NOTE_KEY_PREFIX + id, record)

  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  const updatedMetas = upsertMeta(metas, {
    id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    vaultId,
  })
  save(NOTES_LIST_KEY, updatedMetas)

  const note = {
    id,
    title: input.title,
    body: input.body,
    attachments,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    vaultId,
    conflictParentNoteId,
    conflictOriginLamport,
  }

  indexNote(note)

  if (!options?.suppressSync) {
    const deviceId = getAccount()?.device.id
    const remoteVaultId = note.vaultId ?? getRemoteVaultId()
    if (deviceId && remoteVaultId) {
      void getRemoteVaultKey(remoteVaultId).then((rvk) => {
        if (!rvk) return
        enqueueUpsertNoteData(note, remoteVaultId, rvk, deviceId)
        enqueueUpdateIndexData(listNoteIds(remoteVaultId), remoteVaultId, rvk, deviceId)
        void requestSync("note_change", remoteVaultId)
      })
    }
  }

  return note
}

export function saveNoteFromSync(note: Note, vmk: Uint8Array, vaultId?: string | null): void {
  const withVault = { ...note, vaultId: vaultId ?? note.vaultId ?? null }
  const record = buildEncryptedRecord(withVault, vmk)
  save(NOTE_KEY_PREFIX + note.id, record)

  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  const updatedMetas = upsertMeta(metas, {
    id: note.id,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    vaultId: record.vaultId ?? null,
  })
  save(NOTES_LIST_KEY, updatedMetas)
  indexNote(withVault)
}

export function deleteNote(
  id: string,
  vmk?: Uint8Array,
  options?: { suppressSync?: boolean },
): void {
  const record = load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + id)
  remove(NOTE_KEY_PREFIX + id)
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  save(
    NOTES_LIST_KEY,
    metas.filter((meta) => meta.id !== id),
  )
  deleteNoteFromIndex(id, record?.vaultId ?? null)

  if (!options?.suppressSync && vmk) {
    const deviceId = getAccount()?.device.id
    const remoteVaultId = record?.vaultId ?? getRemoteVaultId()
    if (deviceId && remoteVaultId) {
      const createdAt = record?.createdAt ?? new Date().toISOString()
      void getRemoteVaultKey(remoteVaultId).then((rvk) => {
        if (!rvk) return
        enqueueDeleteNoteData(id, createdAt, remoteVaultId, rvk, deviceId)
        enqueueUpdateIndexData(listNoteIds(remoteVaultId), remoteVaultId, rvk, deviceId)
        void requestSync("note_change", remoteVaultId)
      })
    }
  }
}

export function resetNotes(): void {
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  metas.forEach((meta) => remove(NOTE_KEY_PREFIX + meta.id))
  remove(NOTES_LIST_KEY)
}

export function listNoteIds(vaultId?: string | null): string[] {
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  return metas.filter((meta) => (meta.vaultId ?? null) === (vaultId ?? null)).map((meta) => meta.id)
}

function buildEncryptedRecord(note: Note, vmk: Uint8Array): EncryptedNoteRecord {
  return {
    id: note.id,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    title: encryptV1(vmk, utf8ToBytes(note.title)),
    body: encryptV1(vmk, utf8ToBytes(note.body)),
    attachments: encryptV1(
      vmk,
      utf8ToBytes(JSON.stringify(note.attachments ?? [])),
    ),
    vaultId: note.vaultId ?? null,
    conflictParentNoteId: note.conflictParentNoteId ?? null,
    conflictOriginLamport: note.conflictOriginLamport ?? null,
  }
}

function safeDecryptAttachments(env: EnvelopeV1, vmk: Uint8Array): NoteAttachment[] {
  try {
    const raw = bytesToUtf8(decryptV1(vmk, env))
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as NoteAttachment[]
  } catch {
    return []
  }
  return []
}

function upsertMeta(metas: NoteMeta[], next: NoteMeta): NoteMeta[] {
  const filtered = metas.filter((meta) => meta.id !== next.id)
  return [next, ...filtered].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

function generateId(): string {
  const bytes = randomBytes(12)
  const base64 = bytesToBase64(bytes)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}
