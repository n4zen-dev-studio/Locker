import { FastifyReply, FastifyRequest } from "fastify"

type RateLimitOptions = {
  enabled: boolean
  windowMs: number
  max: number
  getKey: (req: FastifyRequest) => string
}

type RateRecord = { count: number; resetAt: number }

const store = new Map<string, RateRecord>()

export function rateLimit(options: RateLimitOptions) {
  return async function rateLimitHandler(request: FastifyRequest, reply: FastifyReply) {
    if (!options.enabled) return

    const now = Date.now()
    const key = options.getKey(request)
    const record = store.get(key)
    if (!record || record.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs })
      return
    }

    record.count += 1
    if (record.count > options.max) {
      reply.code(429).send({ error: "Rate limit exceeded" })
      return
    }
  }
}
