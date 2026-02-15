import { decryptV1, encryptV1, EnvelopeV1 } from "../crypto/aead"
import { bytesToBase64, bytesToUtf8, utf8ToBytes } from "../crypto/encoding"
import { randomBytes } from "../crypto/random"
import { load, remove, save } from "@/utils/storage"
import { VaultDataError } from "./errors"

const NOTES_LIST_KEY = "locker:notes:v1:list"
const NOTE_KEY_PREFIX = "locker:notes:v1:note:"

export type Note = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

type NoteMeta = {
  id: string
  createdAt: string
  updatedAt: string
}

type EncryptedNoteRecord = {
  id: string
  createdAt: string
  updatedAt: string
  title: EnvelopeV1
  body: EnvelopeV1
}

export function listNotes(vmk: Uint8Array): Note[] {
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  return metas.map((meta) => {
    const record = load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + meta.id)
    if (!record) throw new VaultDataError()
    try {
      const title = bytesToUtf8(decryptV1(vmk, record.title))
      return {
        id: record.id,
        title,
        body: "",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    } catch {
      throw new VaultDataError()
    }
  })
}

export function getNote(id: string, vmk: Uint8Array): Note {
  const record = load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + id)
  if (!record) throw new VaultDataError()

  try {
    const title = bytesToUtf8(decryptV1(vmk, record.title))
    const body = bytesToUtf8(decryptV1(vmk, record.body))
    return {
      id: record.id,
      title,
      body,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  } catch {
    throw new VaultDataError()
  }
}

export function saveNote(
  input: { id?: string; title: string; body: string },
  vmk: Uint8Array,
): Note {
  const now = new Date().toISOString()
  const existing = input.id ? load<EncryptedNoteRecord>(NOTE_KEY_PREFIX + input.id) : null
  const id = input.id ?? generateId()

  const record: EncryptedNoteRecord = {
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    title: encryptV1(vmk, utf8ToBytes(input.title)),
    body: encryptV1(vmk, utf8ToBytes(input.body)),
  }

  save(NOTE_KEY_PREFIX + id, record)

  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  const updatedMetas = upsertMeta(metas, {
    id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
  save(NOTES_LIST_KEY, updatedMetas)

  return {
    id,
    title: input.title,
    body: input.body,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export function deleteNote(id: string): void {
  remove(NOTE_KEY_PREFIX + id)
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  save(
    NOTES_LIST_KEY,
    metas.filter((meta) => meta.id !== id),
  )
}

export function resetNotes(): void {
  const metas = load<NoteMeta[]>(NOTES_LIST_KEY) ?? []
  metas.forEach((meta) => remove(NOTE_KEY_PREFIX + meta.id))
  remove(NOTES_LIST_KEY)
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
