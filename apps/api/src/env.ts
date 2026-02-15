import dotenv from "dotenv"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Resolve from THIS file’s directory, not process.cwd()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Walk up a few levels and look for a repo-root .env
function findEnv(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".env")
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const envPath = findEnv(__dirname)
if (envPath) {
  dotenv.config({ path: envPath, override: true })
  // eslint-disable-next-line no-console
  console.log(`[env] loaded ${envPath}`)
} else {
  // eslint-disable-next-line no-console
  console.warn("[env] .env not found (searched upward from apps/api/src)")
}

// Debug once (remove later)
console.log("[env] JWT_SECRET present:", !!process.env.JWT_SECRET)
