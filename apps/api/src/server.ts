import Fastify from "fastify"
import cors from "@fastify/cors"
import { getApiEnv } from "@locker/config"

const env = getApiEnv()

async function main() {
  const app = Fastify({
    logger: true
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true
  })

  app.get("/health", async () => {
    return { ok: true, service: "locker-api" }
  })

  app.get("/v1/meta", async () => {
    return {
      service: "locker-api",
      version: "0.0.0",
      now: new Date().toISOString()
    }
  })

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" })
  app.log.info(`listening at ${address}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
