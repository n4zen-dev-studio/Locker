import { createRecoveryEnvelope, createRecoveryProof, generateRecoveryKey, openRecoveryEnvelope, parseRecoveryKey } from "./recoveryKey"

describe("recoveryKey", () => {
  it("round-trips generated recovery keys", () => {
    const generated = generateRecoveryKey()
    const parsed = parseRecoveryKey(generated.displayKey)

    expect(parsed.recoveryId).toBe(generated.recoveryId)
    expect(parsed.canonicalKey).toBe(generated.canonicalKey)
  })

  it("wraps and unwraps a vault key", () => {
    const generated = generateRecoveryKey()
    const vaultKey = new Uint8Array(32).fill(7)
    const envelope = createRecoveryEnvelope(vaultKey, generated.canonicalKey)
    const unwrapped = openRecoveryEnvelope({ ...envelope, vaultId: "vault-1" }, generated.canonicalKey)

    expect(Array.from(unwrapped)).toEqual(Array.from(vaultKey))
    expect(createRecoveryProof(generated.canonicalKey, { ...envelope, vaultId: "vault-1" })).toBe(envelope.verifierB64)
  })
})
