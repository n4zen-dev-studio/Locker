import { fetchJson } from "./apiClient"
import * as tokenStore from "../auth/tokenStore"
import * as accountRepo from "../storage/accountRepo"
import { vaultSession } from "../session"

jest.mock("../auth/tokenStore", () => ({
  getToken: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
}))

jest.mock("../storage/accountRepo", () => ({
  getAccount: jest.fn(),
  setAccount: jest.fn(),
  clearAccount: jest.fn(),
}))

jest.mock("../storage/serverConfigRepo", () => ({ getServerUrl: jest.fn(() => null) }))
jest.mock("../config", () => ({ DEFAULT_API_BASE_URL: "https://api.test" }))
jest.mock("../session", () => ({ vaultSession: { clear: jest.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body)),
    arrayBuffer: jest.fn(),
  } as any
}

describe("fetchJson auth recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(tokenStore.getToken).mockResolvedValue("old-token")
    jest.mocked(accountRepo.getAccount).mockReturnValue({
      user: { id: "user-1", email: "user@example.com", createdAt: "now" },
      device: { id: "device-1", userId: "user-1", name: "Phone", platform: "ios", createdAt: "now" },
      apiBase: "https://api.test",
      linkedAt: "now",
    })
    global.fetch = jest.fn() as any
  })

  it("refreshes an expired token and retries the original request once", async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          token: "new-token",
          user: { id: "user-1", email: "user@example.com", createdAt: "now" },
          device: { id: "device-1", userId: "user-1", name: "Phone", platform: "ios", createdAt: "now" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))

    await expect(fetchJson<{ ok: boolean }>("/v1/devices")).resolves.toEqual({ ok: true })

    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(tokenStore.setToken).toHaveBeenCalledWith("new-token")
    expect((global.fetch as jest.Mock).mock.calls[2][1].headers.get("authorization")).toBe("Bearer new-token")
  })

  it("clears remote auth state when refresh confirms the device is not recognized", async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(403, { error: "Device not recognized" }))
      .mockResolvedValueOnce(jsonResponse(403, { error: "Device not recognized" }))

    await expect(fetchJson("/v1/devices")).rejects.toMatchObject({
      kind: "AUTH",
      status: 403,
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(accountRepo.clearAccount).toHaveBeenCalled()
    expect(tokenStore.clearToken).toHaveBeenCalled()
    expect(vaultSession.clear).toHaveBeenCalled()
  })

  it("does not enter a retry loop when the retried request is still forbidden", async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(403, { error: "Forbidden" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          token: "new-token",
          user: { id: "user-1", email: "user@example.com", createdAt: "now" },
          device: { id: "device-1", userId: "user-1", name: "Phone", platform: "ios", createdAt: "now" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(403, { error: "Forbidden" }))

    await expect(fetchJson("/v1/vaults/vault-1/devices")).rejects.toMatchObject({
      kind: "FORBIDDEN",
      status: 403,
    })

    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})
