import { FastifyReply, FastifyRequest } from "fastify"
import { verifyToken } from "../auth/jwt"

export type AuthUser = {
  id: string
  email: string
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Unauthorized" })
    return
  }
  try {
    const token = header.slice("Bearer ".length)
    const payload = verifyToken(token)
    request.user = { id: payload.sub, email: payload.email }
  } catch {
    reply.code(401).send({ error: "Unauthorized" })
    return
  }
}
