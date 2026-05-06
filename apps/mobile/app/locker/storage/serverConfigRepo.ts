import { load, remove, save } from "@/utils/storage"

const SERVER_URL_KEY = "locker:server:url:v1"

export function getServerUrl(): string | null {
  return load<string>(SERVER_URL_KEY)
}

export function setServerUrl(url: string): void {
  save(SERVER_URL_KEY, url)
}

export function clearServerUrl(): void {
  remove(SERVER_URL_KEY)
}
