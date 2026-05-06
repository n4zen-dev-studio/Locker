const TOKEN_RE = /[^\p{L}\p{N}]+/gu

export function tokenize(input: string): string[] {
  const lower = input.toLowerCase()
  return lower
    .split(TOKEN_RE)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}
