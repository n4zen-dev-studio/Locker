type ApiEnv = {
  PORT: number
  NODE_ENV: "development" | "test" | "production"
  CORS_ORIGIN: string
  JWT_SECRET: string
  API_DB_PATH: string
  API_ORIGIN: string
  RP_ID: string
  RP_NAME: string
  DEV_AUTH_ENABLED: boolean
  ADMIN_ORIGIN: string
  ADMIN_PURGE_ENABLED: boolean
  RATE_LIMIT_ENABLED: boolean
  RATE_LIMIT_PER_MINUTE: number
  MAX_BLOB_BYTES: number
}

type AdminEnv = {
  NEXT_PUBLIC_API_BASE_URL: string
  NEXT_PUBLIC_DEV_AUTH_ENABLED: string
  NEXT_PUBLIC_ADMIN_PURGE_ENABLED: string
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function parseNodeEnv(value: string | undefined): ApiEnv["NODE_ENV"] {
  if (value === "production" || value === "test" || value === "development") {
    return value
  }
  return "development"
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === "true" || value === "1"
}

export function getApiEnv(): ApiEnv {
  return {
    PORT: parsePort(process.env.API_PORT, 4000),
    NODE_ENV: parseNodeEnv(process.env.NODE_ENV),
    CORS_ORIGIN: process.env.API_CORS_ORIGIN || "http://localhost:3000",
    JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
    API_DB_PATH: process.env.API_DB_PATH || "./.data/locker.db",
    API_ORIGIN: process.env.API_ORIGIN || "http://localhost:4000",
    RP_ID: process.env.RP_ID || "localhost",
    RP_NAME: process.env.RP_NAME || "Locker",
    DEV_AUTH_ENABLED: parseBool(process.env.DEV_AUTH_ENABLED, true),
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || "http://localhost:3000",
    ADMIN_PURGE_ENABLED: parseBool(process.env.ADMIN_PURGE_ENABLED, false),
    RATE_LIMIT_ENABLED: parseBool(process.env.RATE_LIMIT_ENABLED, true),
    RATE_LIMIT_PER_MINUTE: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
    MAX_BLOB_BYTES: Number(process.env.MAX_BLOB_BYTES ?? 5_000_000),
  }
}

export function getAdminEnv(): AdminEnv {
  return {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000",
    NEXT_PUBLIC_DEV_AUTH_ENABLED:
      process.env.NEXT_PUBLIC_DEV_AUTH_ENABLED || "true",
    NEXT_PUBLIC_ADMIN_PURGE_ENABLED:
      process.env.NEXT_PUBLIC_ADMIN_PURGE_ENABLED || "false",
  }
}
