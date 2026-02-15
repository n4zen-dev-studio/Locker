import jwt from "jsonwebtoken"
import { getApiEnv } from "@locker/config"

export type JwtPayload = {
  sub: string
  email: string
}
export function signToken(payload: JwtPayload): string {
  const env = getApiEnv()
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing. Check .env loading.")
  }
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  })
}


export function verifyToken(token: string): JwtPayload {
  const env = getApiEnv()
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload
}
