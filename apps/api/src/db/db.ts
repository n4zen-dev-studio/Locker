import path from "node:path"
import fs from "node:fs"
import Database from "better-sqlite3"
import { getApiEnv } from "@locker/config"
import { runMigrations } from "./migrate"

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const env = getApiEnv()

  // never allow undefined to reach path.resolve
  const rel = env.API_DB_PATH || "./.data/locker.db"

  // always resolve relative to apps/api (stable under pnpm)
  const apiRoot = path.resolve(process.cwd(), "apps/api")
  const dbPath = path.isAbsolute(rel) ? rel : path.resolve(apiRoot, rel)

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  db = new Database(dbPath)
  runMigrations(db)
  return db
}
