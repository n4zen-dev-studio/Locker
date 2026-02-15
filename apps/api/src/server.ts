import "./env"

import Fastify from "fastify"
import cors from "@fastify/cors"
import { getApiEnv } from "@locker/config"
import { registerAuthRoutes } from "./routes/auth"
import { registerDeviceRoutes } from "./routes/devices"
import { registerVaultRoutes } from "./routes/vaults"
import { registerBlobRoutes } from "./routes/blobs"
import { registerChangeRoutes } from "./routes/changes"

async function main() {
   const env = getApiEnv() 
   console.log("[api] getApiEnv JWT_SECRET length:", env.JWT_SECRET?.length)

  const app = Fastify({
    logger: true
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  })

  app.get("/health", async () => {
    return { ok: true }
  })

  app.get("/v1/meta", async () => {
    return {
      service: "locker-api",
      version: "0.0.0",
      now: new Date().toISOString()
    }
  })

  await registerAuthRoutes(app)
  await registerDeviceRoutes(app)
  await registerVaultRoutes(app)
  await registerBlobRoutes(app)
  await registerChangeRoutes(app)

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" })
  app.log.info(`listening at ${address}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
