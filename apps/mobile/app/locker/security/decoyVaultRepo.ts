export type DecoyVaultItem = {
  id: string
  title: string
  subtitle: string
  updatedAt: string
}

const DECOY_ITEMS: DecoyVaultItem[] = [
  {
    id: "decoy-1",
    title: "Tuition Receipts",
    subtitle: "3 PDFs imported",
    updatedAt: "2026-02-14T10:15:00.000Z",
  },
  {
    id: "decoy-2",
    title: "Travel Budget",
    subtitle: "One note, low sensitivity",
    updatedAt: "2026-02-10T08:42:00.000Z",
  },
  {
    id: "decoy-3",
    title: "Warranty Scans",
    subtitle: "2 image attachments",
    updatedAt: "2026-01-28T17:05:00.000Z",
  },
]

export function listDecoyVaultItems(): DecoyVaultItem[] {
  return DECOY_ITEMS
}
