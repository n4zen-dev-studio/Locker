import { load, remove, save } from "@/utils/storage"
import { getNote, listNoteIds } from "@/locker/storage/notesRepo"
import { vaultSession } from "@/locker/session"
import type { Note } from "@/locker/storage/notesRepo"
import { tokenize } from "./tokenize"
import type { HighlightPart, SearchOptions, SearchResult, SearchSort } from "./types"

type IndexedNote = {
  id: string
  vaultId: string | null
  title: string
  titleTokens: string[]
  bodyTokens: string[]
  classification: string
  updatedAt: string
  createdAt: string
  deleted: boolean
  conflict: boolean
}

type SearchIndex = {
  v: 1
  updatedAt: string
  notes: Record<string, IndexedNote>
  inverted: Record<string, string[]>
}

const INDEX_KEY_PREFIX = "locker:search:index:v1:"
const CACHE = new Map<string, SearchIndex>()

function vaultKey(vaultId: string | null): string {
  return vaultId ?? "__local__"
}

function storageKey(vaultId: string | null): string {
  return `${INDEX_KEY_PREFIX}${vaultKey(vaultId)}`
}

function buildEmpty(): SearchIndex {
  return {
    v: 1,
    updatedAt: new Date().toISOString(),
    notes: {},
    inverted: {},
  }
}

function persistIndex(vaultId: string | null, index: SearchIndex): void {
  index.updatedAt = new Date().toISOString()
  save(storageKey(vaultId), index)
  CACHE.set(vaultKey(vaultId), index)
}

function loadIndex(vaultId: string | null): SearchIndex | null {
  const cached = CACHE.get(vaultKey(vaultId))
  if (cached) return cached
  const raw = load<SearchIndex>(storageKey(vaultId))
  if (!raw || raw.v !== 1 || typeof raw.notes !== "object" || typeof raw.inverted !== "object") return null
  CACHE.set(vaultKey(vaultId), raw)
  return raw
}

export function ensureSearchTables(vaultId: string | null): void {
  if (loadIndex(vaultId)) return
  const index = buildEmpty()
  persistIndex(vaultId, index)
}

export function getSearchIndexStats(vaultId: string | null): { exists: boolean; count: number } {
  const index = loadIndex(vaultId)
  if (!index) return { exists: false, count: 0 }
  return { exists: true, count: Object.keys(index.notes).length }
}

export function rebuildSearchIndex(vaultId: string | null, vmk?: Uint8Array): void {
  const key = vmk ?? vaultSession.getKey()
  if (!key) return
  const index: SearchIndex = buildEmpty()

  const ids = listNoteIds(vaultId)
  for (const id of ids) {
    try {
      const note = getNote(id, key)
      if ((note.vaultId ?? null) !== (vaultId ?? null)) continue
      const record = buildIndexedNote(note)
      index.notes[record.id] = record
      addToInverted(index.inverted, record)
    } catch {
      // Skip undecryptable notes
      continue
    }
  }

  persistIndex(vaultId, index)
}

function buildIndexedNote(note: Note): IndexedNote {
  return {
    id: note.id,
    vaultId: note.vaultId ?? null,
    title: note.title,
    titleTokens: tokenize(note.title),
    bodyTokens: tokenize(note.body),
    classification: note.classification,
    updatedAt: note.updatedAt,
    createdAt: note.createdAt,
    deleted: !!note.deletedAt,
    conflict: !!note.conflictParentNoteId,
  }
}

function addToInverted(inverted: Record<string, string[]>, record: IndexedNote): void {
  const tokens = new Set([...record.titleTokens, ...record.bodyTokens])
  for (const token of tokens) {
    const list = inverted[token]
    if (!list) inverted[token] = [record.id]
    else if (!list.includes(record.id)) list.push(record.id)
  }
}

function removeFromInverted(inverted: Record<string, string[]>, record: IndexedNote): void {
  const tokens = new Set([...record.titleTokens, ...record.bodyTokens])
  for (const token of tokens) {
    const list = inverted[token]
    if (!list) continue
    inverted[token] = list.filter((id) => id !== record.id)
    if (inverted[token].length === 0) delete inverted[token]
  }
}

export function indexNote(note: Note): void {
  const vaultId = note.vaultId ?? null
  const index = loadIndex(vaultId) ?? buildEmpty()
  const existing = index.notes[note.id]
  if (existing) removeFromInverted(index.inverted, existing)
  if (note.deletedAt) {
    delete index.notes[note.id]
    persistIndex(vaultId, index)
    return
  }
  const record = buildIndexedNote(note)
  index.notes[note.id] = record
  addToInverted(index.inverted, record)
  persistIndex(vaultId, index)
}

export function deleteNoteFromIndex(noteId: string, vaultId: string | null): void {
  const index = loadIndex(vaultId)
  if (!index) return
  const existing = index.notes[noteId]
  if (!existing) return
  removeFromInverted(index.inverted, existing)
  delete index.notes[noteId]
  persistIndex(vaultId, index)
}

export function clearSearchIndex(vaultId: string | null): void {
  CACHE.delete(vaultKey(vaultId))
  remove(storageKey(vaultId))
}

function matchesFilters(note: IndexedNote, filters?: SearchOptions["filters"]): boolean {
  if (!filters) return true
  if (filters.localOnly && note.vaultId !== null) return false
  if (filters.conflictsOnly && !note.conflict) return false

  if (filters.updatedFrom && note.updatedAt < filters.updatedFrom) return false
  if (filters.updatedTo && note.updatedAt > filters.updatedTo) return false
  if (filters.createdFrom && note.createdAt < filters.createdFrom) return false
  if (filters.createdTo && note.createdAt > filters.createdTo) return false

  return true
}

function buildHighlightParts(text: string, tokens: string[], maxLen: number): HighlightPart[] {
  if (!text) return [{ text: "", highlight: false }]
  const lower = text.toLowerCase()
  const hits: Array<{ start: number; end: number }> = []

  for (const token of tokens) {
    const idx = lower.indexOf(token)
    if (idx >= 0) {
      hits.push({ start: idx, end: idx + token.length })
    }
  }

  if (hits.length === 0) {
    const snippet = text.slice(0, maxLen)
    return [{ text: snippet, highlight: false }]
  }

  const first = hits[0]
  const start = Math.max(0, first.start - Math.floor(maxLen / 2))
  const end = Math.min(text.length, start + maxLen)
  const snippet = text.slice(start, end)

  const parts: HighlightPart[] = []
  let cursor = 0
  const snippetLower = snippet.toLowerCase()
  for (const token of tokens) {
    const idx = snippetLower.indexOf(token, cursor)
    if (idx >= 0) {
      if (idx > cursor) {
        parts.push({ text: snippet.slice(cursor, idx), highlight: false })
      }
      parts.push({ text: snippet.slice(idx, idx + token.length), highlight: true })
      cursor = idx + token.length
    }
  }
  if (cursor < snippet.length) parts.push({ text: snippet.slice(cursor), highlight: false })
  return parts.length > 0 ? parts : [{ text: snippet, highlight: false }]
}

export function search(query: string, options: SearchOptions): SearchResult[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const index = loadIndex(options.vaultId) ?? buildEmpty()
  if (Object.keys(index.notes).length === 0) {
    rebuildSearchIndex(options.vaultId)
  }

  const effectiveIndex = loadIndex(options.vaultId) ?? index
  const hits = tokens.map((t) => new Set(effectiveIndex.inverted[t] ?? []))

  let resultIds = hits[0]
  for (let i = 1; i < hits.length; i++) {
    resultIds = new Set([...resultIds].filter((id) => hits[i].has(id)))
  }

  const scored: Array<{ note: IndexedNote; score: number }> = []
  for (const id of resultIds) {
    const note = effectiveIndex.notes[id]
    if (!note) continue
    if ((note.vaultId ?? null) !== (options.vaultId ?? null)) continue
  if (!matchesFilters(note, options.filters)) continue
  if (note.deleted) continue
  const score = tokens.reduce((acc, t) => {
      const inTitle = note.titleTokens.includes(t) ? 2 : 0
      const inBody = note.bodyTokens.includes(t) ? 1 : 0
      return acc + inTitle + inBody
    }, 0)
    scored.push({ note, score })
  }

  const sort = options.sort ?? "relevance"
  scored.sort((a, b) => compareSort(a, b, sort))

  const offset = options.offset ?? 0
  const limit = options.limit ?? 50
  const page = scored.slice(offset, offset + limit)

  const vmk = vaultSession.getKey()
  if (!vmk) return []

  const results: SearchResult[] = []
  for (const entry of page) {
    const note = entry.note
    let title = note.title
    let body = ""
    try {
      const full = getNote(note.id, vmk)
      title = full.title
      body = full.body
    } catch {
      // Use indexed title if decrypt fails
    }

    results.push({
      id: note.id,
      titleParts: buildHighlightParts(title, tokens, 80),
      snippetParts: buildHighlightParts(body, tokens, 120),
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      conflict: note.conflict,
      localOnly: note.vaultId === null,
    })
  }

  return results
}

function compareSort(a: { note: IndexedNote; score: number }, b: { note: IndexedNote; score: number }, sort: SearchSort): number {
  if (sort === "updatedAt") return b.note.updatedAt.localeCompare(a.note.updatedAt)
  if (sort === "createdAt") return b.note.createdAt.localeCompare(a.note.createdAt)
  if (sort === "title") return a.note.title.localeCompare(b.note.title)
  return b.score - a.score
}
