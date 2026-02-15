let vmk: Uint8Array | null = null

export const vaultSession = {
  setKey(next: Uint8Array) {
    vmk = new Uint8Array(next)
  },
  getKey(): Uint8Array | null {
    return vmk ? new Uint8Array(vmk) : null
  },
  isUnlocked(): boolean {
    return vmk !== null
  },
  clear() {
    vmk = null
  },
}
