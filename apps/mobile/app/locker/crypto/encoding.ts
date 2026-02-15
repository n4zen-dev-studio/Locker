const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function bytesToBase64(bytes: Uint8Array): string {
  let output = ""
  let i = 0
  while (i < bytes.length) {
    const byte1 = bytes[i++] ?? 0
    const byte2 = bytes[i++]
    const byte3 = bytes[i++]

    const triplet = (byte1 << 16) | ((byte2 ?? 0) << 8) | (byte3 ?? 0)

    output += alphabet[(triplet >> 18) & 0x3f]
    output += alphabet[(triplet >> 12) & 0x3f]
    output += byte2 === undefined ? "=" : alphabet[(triplet >> 6) & 0x3f]
    output += byte3 === undefined ? "=" : alphabet[triplet & 0x3f]
  }
  return output
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "")
  if (clean.length % 4 !== 0) throw new Error("Invalid base64")

  let padding = 0
  if (clean.endsWith("==")) padding = 2
  else if (clean.endsWith("=")) padding = 1

  const length = (clean.length / 4) * 3 - padding
  const bytes = new Uint8Array(length)

  let byteIndex = 0
  for (let i = 0; i < clean.length; i += 4) {
    const sextet1 = alphabet.indexOf(clean[i])
    const sextet2 = alphabet.indexOf(clean[i + 1])
    const sextet3 = clean[i + 2] === "=" ? 0 : alphabet.indexOf(clean[i + 2])
    const sextet4 = clean[i + 3] === "=" ? 0 : alphabet.indexOf(clean[i + 3])

    if (sextet1 < 0 || sextet2 < 0 || sextet3 < 0 || sextet4 < 0) {
      throw new Error("Invalid base64")
    }

    const triple = (sextet1 << 18) | (sextet2 << 12) | (sextet3 << 6) | sextet4

    if (byteIndex < length) bytes[byteIndex++] = (triple >> 16) & 0xff
    if (byteIndex < length) bytes[byteIndex++] = (triple >> 8) & 0xff
    if (byteIndex < length) bytes[byteIndex++] = triple & 0xff
  }

  return bytes
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
