export type SearchSort = "relevance" | "updatedAt" | "createdAt" | "title"

export type SearchFilters = {
  localOnly?: boolean
  conflictsOnly?: boolean
  updatedFrom?: string
  updatedTo?: string
  createdFrom?: string
  createdTo?: string
}

export type SearchOptions = {
  vaultId: string | null
  limit?: number
  offset?: number
  filters?: SearchFilters
  sort?: SearchSort
}

export type HighlightPart = {
  text: string
  highlight: boolean
}

export type SearchResult = {
  id: string
  titleParts: HighlightPart[]
  snippetParts: HighlightPart[]
  updatedAt: string
  createdAt: string
  conflict: boolean
  localOnly: boolean
}
