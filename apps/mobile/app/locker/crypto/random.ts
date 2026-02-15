import "react-native-get-random-values"

export function randomBytes(length: number): Uint8Array {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("Secure random number generator unavailable")
  }
  const bytes = new Uint8Array(length)
  cryptoObj.getRandomValues(bytes)
  return bytes
}
