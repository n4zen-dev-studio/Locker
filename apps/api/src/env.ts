import dotenv from "dotenv"
import fs from "node:fs"
import path from "node:path"

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

const envPath = findEnv(process.cwd())
if (envPath) {
  dotenv.config({ path: envPath, override: true })
  // eslint-disable-next-line no-console
  console.log(`[env] loaded ${envPath}`)
} else {
  // eslint-disable-next-line no-console
  console.warn("[env] .env not found (searched upward from process.cwd())")
}

console.log("[env] JWT_SECRET present:", !!process.env.JWT_SECRET)
