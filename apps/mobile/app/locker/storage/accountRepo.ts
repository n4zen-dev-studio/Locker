import { DeviceDTO, UserDTO } from "@locker/types"
import { load, remove, save } from "@/utils/storage"

const ACCOUNT_KEY = "locker:remote:account:v1"

export type AccountState = {
  user: UserDTO
  device: DeviceDTO
  apiBase: string
  linkedAt: string
}

export function getAccount(): AccountState | null {
  return load<AccountState>(ACCOUNT_KEY)
}

export function setAccount(account: AccountState): void {
  save(ACCOUNT_KEY, account)
}

export function clearAccount(): void {
  remove(ACCOUNT_KEY)
}
