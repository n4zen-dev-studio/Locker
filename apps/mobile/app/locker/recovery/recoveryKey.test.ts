import { createRecoveryArtifact, createRecoveryProof, generateRecoveryKey, openRecoveryArtifact, parseRecoveryKey } from "./recoveryKey"

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
    const artifact = createRecoveryArtifact([{ vaultId: "vault-1", vaultKey, role: "target" }], generated.canonicalKey)
    const [unwrapped] = openRecoveryArtifact(
      {
        ...artifact,
        envelopes: artifact.envelopes.map((envelope) => ({ ...envelope, vaultName: "Vault 1" })),
      },
      generated.canonicalKey,
    )

    expect(Array.from(unwrapped.vaultKey)).toEqual(Array.from(vaultKey))
    expect(createRecoveryProof(generated.canonicalKey, {
      ...artifact,
      envelopes: artifact.envelopes.map((envelope) => ({ ...envelope, vaultName: "Vault 1" })),
    })).toBe(artifact.verifierB64)
  })
})
