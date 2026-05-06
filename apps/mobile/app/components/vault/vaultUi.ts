import { VaultClassification } from "@/locker/vault/types";

export type VaultFilter =
  | "all"
  | "notes"
  | "images"
  | "pdfs"
  | "files"
  | "voices"
  | "sensitive"
  | "recent"
  | "deleted";

export type VaultSort = "updated" | "created" | "title" | "classification";

export type VaultViewMode = "list" | "stack";

export type VaultListItem = {
  id: string;
  noteId: string;
  attachmentId?: string;
  type: "note" | "image" | "pdf" | "doc" | "voice";
  title: string;
  preview: string;
  updatedAt: string;
  createdAt: string;
  classification: VaultClassification;
  deleted: boolean;
  syncStatus: "cloud" | "local";
};

export const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;

export const FILTER_OPTIONS: Array<{
  label: string;
  shortLabel: string;
  value: VaultFilter;
}> = [
  { label: "All", shortLabel: "ALL", value: "all" },
  { label: "Notes", shortLabel: "NOTE", value: "notes" },
  { label: "Images", shortLabel: "IMG", value: "images" },
  { label: "PDFs", shortLabel: "PDF", value: "pdfs" },
  { label: "Files", shortLabel: "FILE", value: "files" },
  { label: "Voice", shortLabel: "VOICE", value: "voices" },
  // { label: "Sensitive", shortLabel: "SAFE", value: "sensitive" },
  // { label: "Recent", shortLabel: "÷NEW", value: "recent" },
  { label: "Trash", shortLabel: "BIN", value: "deleted" },
];

export function nextVaultSort(current: VaultSort): VaultSort {
  if (current === "updated") return "created";
  if (current === "created") return "title";
  if (current === "title") return "classification";
  return "updated";
}

export function compareVaultItems(
  a: VaultListItem,
  b: VaultListItem,
  sort: VaultSort,
): number {
  if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
  if (sort === "title") return a.title.localeCompare(b.title);
  if (sort === "classification") {
    return a.classification.localeCompare(b.classification);
  }
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function formatVaultDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
