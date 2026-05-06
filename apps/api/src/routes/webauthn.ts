import { FastifyInstance } from "fastify"
import { z } from "zod"
import crypto from "crypto"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { isoBase64URL } from "@simplewebauthn/server/helpers"

import { getApiEnv } from "@locker/config"
import { getDb } from "../db/db"
import { signToken } from "../auth/jwt"
import { authMiddleware } from "../middleware/auth"

const registerOptionsSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).optional(),
})

const registerVerifySchema = z.object({
  userId: z.string().min(1),
  response: z.any(),
})

const authOptionsSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().min(1).optional(),
})

const authVerifySchema = z.object({
  userId: z.string().min(1),
  response: z.any(),
})

const toUserID = (id: string) => new TextEncoder().encode(id)


export async function registerWebAuthnRoutes(app: FastifyInstance) {
  const env = getApiEnv()

  app.post("/v1/auth/webauthn/register/options", async (request, reply) => {
    const parse = registerOptionsSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const now = new Date().toISOString()
    let user: { id: string; email: string | null; displayName?: string | null } | undefined

    if (parse.data.email) {
      user = db.prepare("SELECT id, email, displayName FROM users WHERE email = ?").get(parse.data.email)
    }

    if (!user) {
      const id = crypto.randomUUID()
      const email = parse.data.email ?? null
      const displayName = parse.data.displayName ?? null
      db.prepare("INSERT INTO users (id, email, displayName, createdAt) VALUES (?, ?, ?, ?)")
        .run(id, email, displayName, now)
      user = { id, email, displayName }
    }

    const existingCreds = db.prepare(
      "SELECT credentialId FROM webauthn_credentials WHERE userId = ?"
    ).all(user.id) as { credentialId: string }[]

    const options = await generateRegistrationOptions({
      rpName: env.RP_NAME,
      rpID: env.RP_ID,
      userID: toUserID(user.id),
      userName: user.email ?? `user-${user.id.slice(0, 6)}`,
      attestationType: "none",
      authenticatorSelection: {
  authenticatorAttachment: "platform",
  residentKey: "preferred",
  userVerification: "preferred",
},
      supportedAlgorithmIDs: [-7],
      excludeCredentials: existingCreds.map((cred) => ({
        id: cred.credentialId, 
        type: "public-key",
      })),

    })

    db.prepare(
      "INSERT INTO webauthn_challenges (userId, type, challenge, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT(userId, type) DO UPDATE SET challenge=excluded.challenge, createdAt=excluded.createdAt"
    ).run(user.id, "registration", options.challenge, now)

    reply.send({ userId: user.id, options })
  })

  app.post("/v1/auth/webauthn/register/verify", async (request, reply) => {
    const parse = registerVerifySchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const challengeRow = db.prepare(
      "SELECT challenge FROM webauthn_challenges WHERE userId = ? AND type = ?"
    ).get(parse.data.userId, "registration") as { challenge?: string } | undefined

    if (!challengeRow?.challenge) {
      reply.code(400).send({ error: "Challenge not found" })
      return
    }

    const verification = await verifyRegistrationResponse({
      response: parse.data.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: env.ADMIN_ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: false,
    })

    if (!verification.verified || !verification.registrationInfo) {
      reply.code(400).send({ error: "Registration failed" })
      return
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo
    const credentialId = isoBase64URL.fromBuffer(credentialID)
    const publicKey = isoBase64URL.fromBuffer(credentialPublicKey)
    const transports = (parse.data.response?.transports ?? null) as string[] | null
    const now = new Date().toISOString()
    const existingCred = db
  .prepare("SELECT id, userId FROM webauthn_credentials WHERE credentialId = ?")
  .get(credentialId) as { id: string; userId: string } | undefined

if (existingCred) {
  if (existingCred.userId === parse.data.userId) {
    // idempotent success
    db.prepare("DELETE FROM webauthn_challenges WHERE userId = ? AND type = ?")
      .run(parse.data.userId, "registration")

    const user = db
      .prepare("SELECT id, email, displayName FROM users WHERE id = ?")
      .get(parse.data.userId) as { id: string; email: string | null; displayName: string | null }

    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    reply.send({ token, user })
    return
  }

  reply.code(409).send({ error: "Passkey already registered to a different user" })
  return
}


    db.prepare(
      "INSERT INTO webauthn_credentials (id, userId, credentialId, publicKey, counter, transports, createdAt, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      parse.data.userId,
      credentialId,
      publicKey,
      counter,
      transports ? JSON.stringify(transports) : null,
      now,
      null,
    )

    db.prepare("DELETE FROM webauthn_challenges WHERE userId = ? AND type = ?")
      .run(parse.data.userId, "registration")

    const user = db.prepare("SELECT id, email, displayName FROM users WHERE id = ?").get(parse.data.userId)
    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    reply.send({ token, user })
  })

  app.post("/v1/auth/webauthn/authenticate/options", async (request, reply) => {
    const parse = authOptionsSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    let user: { id: string } | undefined
    if (parse.data.userId) {
      user = db.prepare("SELECT id FROM users WHERE id = ?").get(parse.data.userId)
    } else if (parse.data.email) {
      user = db.prepare("SELECT id FROM users WHERE email = ?").get(parse.data.email)
    }

    if (!user) {
      reply.code(404).send({ error: "User not found" })
      return
    }

    const creds = db.prepare(
      "SELECT credentialId FROM webauthn_credentials WHERE userId = ?"
    ).all(user.id) as { credentialId: string }[]

    if (creds.length === 0) {
      reply.code(400).send({ error: "No passkeys registered" })
      return
    }

    const options = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      allowCredentials: creds.map((cred) => ({
        id: cred.credentialId, 
        type: "public-key",
      })),

      userVerification: "preferred",
    })

    const now = new Date().toISOString()
    db.prepare(
      "INSERT INTO webauthn_challenges (userId, type, challenge, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT(userId, type) DO UPDATE SET challenge=excluded.challenge, createdAt=excluded.createdAt"
    ).run(user.id, "authentication", options.challenge, now)

    reply.send({ userId: user.id, options })
  })

  app.post("/v1/auth/webauthn/authenticate/verify", async (request, reply) => {
    const parse = authVerifySchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const challengeRow = db.prepare(
      "SELECT challenge FROM webauthn_challenges WHERE userId = ? AND type = ?"
    ).get(parse.data.userId, "authentication") as { challenge?: string } | undefined

    if (!challengeRow?.challenge) {
      reply.code(400).send({ error: "Challenge not found" })
      return
    }

    const credentialId = parse.data.response?.id as string
    if (!credentialId) {
      reply.code(400).send({ error: "Missing credential" })
      return
    }

    const credential = db.prepare(
      "SELECT id, userId, credentialId, publicKey, counter, transports FROM webauthn_credentials WHERE credentialId = ?"
    ).get(credentialId) as {
      id: string
      userId: string
      credentialId: string
      publicKey: string
      counter: number
      transports: string | null
    } | undefined

    if (!credential || credential.userId !== parse.data.userId) {
      reply.code(400).send({ error: "Credential not found" })
      return
    }

    const verification = await verifyAuthenticationResponse({
      response: parse.data.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: env.ADMIN_ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: false,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(credential.credentialId),
        credentialPublicKey: isoBase64URL.toBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? JSON.parse(credential.transports) : undefined,
      },
    })

    if (!verification.verified) {
      reply.code(400).send({ error: "Authentication failed" })
      return
    }

    const now = new Date().toISOString()
    db.prepare("UPDATE webauthn_credentials SET counter = ?, lastUsedAt = ? WHERE id = ?")
      .run(verification.authenticationInfo.newCounter, now, credential.id)

    db.prepare("DELETE FROM webauthn_challenges WHERE userId = ? AND type = ?")
      .run(parse.data.userId, "authentication")

    const user = db.prepare("SELECT id, email, displayName FROM users WHERE id = ?").get(parse.data.userId)
    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    reply.send({ token, user })
  })

  app.get("/v1/me/passkeys", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const db = getDb()
    const rows = db.prepare(
      "SELECT credentialId, createdAt, lastUsedAt, transports FROM webauthn_credentials WHERE userId = ?"
    ).all(user.id)
    reply.send({ passkeys: rows })
  })

  app.delete("/v1/me/passkeys/:credentialId", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!
    const { credentialId } = request.params as { credentialId: string }
    const db = getDb()
    db.prepare("DELETE FROM webauthn_credentials WHERE credentialId = ? AND userId = ?")
      .run(credentialId, user.id)
    reply.send({ ok: true })
  })
}
