export type DeviceLinkQrPayload = {
  t: "locker-device-link"
  apiBase?: string
  linkCode: string
}

export type VaultAccessQrPayload = {
  t: "locker-vault-access"
  vaultId: string
  vaultName?: string | null
  pairingCode: string
}

export type LockerQrPayload = DeviceLinkQrPayload | VaultAccessQrPayload

export function encodeDeviceLinkQrPayload(payload: Omit<DeviceLinkQrPayload, "t">): string {
  return JSON.stringify({ t: "locker-device-link", ...payload } satisfies DeviceLinkQrPayload)
}

export function encodeVaultAccessQrPayload(payload: Omit<VaultAccessQrPayload, "t">): string {
  return JSON.stringify({ t: "locker-vault-access", ...payload } satisfies VaultAccessQrPayload)
}

export function parseLockerQrPayload(raw: string): LockerQrPayload | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{")) return null
  try {
    const parsed = JSON.parse(trimmed) as Partial<LockerQrPayload> | null
    if (!parsed || typeof parsed !== "object" || typeof parsed.t !== "string") return null
    if (parsed.t === "locker-device-link" && typeof parsed.linkCode === "string") {
      return {
        t: parsed.t,
        linkCode: parsed.linkCode,
        apiBase: typeof parsed.apiBase === "string" ? parsed.apiBase : undefined,
      }
    }
    if (
      parsed.t === "locker-vault-access" &&
      typeof parsed.vaultId === "string" &&
      typeof parsed.pairingCode === "string"
    ) {
      return {
        t: parsed.t,
        vaultId: parsed.vaultId,
        pairingCode: parsed.pairingCode,
        vaultName: typeof parsed.vaultName === "string" ? parsed.vaultName : null,
      }
    }
    return null
  } catch {
    return null
  }
}
