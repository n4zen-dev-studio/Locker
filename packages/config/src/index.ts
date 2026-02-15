type ApiEnv = {
  PORT: number
  NODE_ENV: "development" | "test" | "production"
  CORS_ORIGIN: string
  JWT_SECRET: string
  API_DB_PATH: string
}

type AdminEnv = {
  NEXT_PUBLIC_API_BASE_URL: string
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

export function getApiEnv(): ApiEnv {
  return {
    PORT: parsePort(process.env.API_PORT, 4000),
    NODE_ENV: parseNodeEnv(process.env.NODE_ENV),
    CORS_ORIGIN: process.env.API_CORS_ORIGIN || "http://localhost:3000",
    JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
    API_DB_PATH: process.env.API_DB_PATH || "./.data/locker.db"
  }
}

export function getAdminEnv(): AdminEnv {
  return {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  }
}
