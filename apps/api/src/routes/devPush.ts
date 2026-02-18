import { FastifyInstance } from "fastify"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { getApiEnv } from "@locker/config"

export async function registerDevPushRoutes(app: FastifyInstance) {
  app.get("/v1/dev/push-events", { preHandler: authMiddleware }, async (request, reply) => {
    const env = getApiEnv()
    if (env.NODE_ENV === "production") {
      reply.code(403).send({ error: "Forbidden" })
      return
    }

    const db = getDb()
    const rows = db.prepare(
      "SELECT id, provider, status, payload, response, createdAt FROM push_events ORDER BY id DESC LIMIT 50"
    ).all() as Array<{ id: number; provider: string; status: string; payload: string | null; response: string | null; createdAt: string }>

    const events = rows.map((row) => ({
      ...row,
      payload: row.payload ? safeParseJson(row.payload) : null,
      response: row.response ? safeParseJson(row.response) : null,
    }))

    reply.send({ events })
  })
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
