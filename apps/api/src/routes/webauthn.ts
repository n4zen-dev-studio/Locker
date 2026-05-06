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

const DISCOVERABLE_USER_ID = "__discoverable__"


type UserRow = { id: string; email: string | null; displayName: string | null }
type UserIdRow = { id: string }
type CredIdRow = { credentialId: string }
type CredentialRow = {
  id: string
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  transports: string | null
}

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
  userId: z.string().min(1).optional(),
  response: z.any(),
})

const normalizeCredId = (id: string) => {
  // If it's already base64url, keep it. Otherwise convert base64 -> base64url.
  const hasUrlChars = id.includes("-") || id.includes("_")
  if (hasUrlChars) return id

  // convert base64 => base64url, strip padding
  return id.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

const toBuf = (v: unknown): Buffer => {
  if (Buffer.isBuffer(v)) return v
  if (v instanceof Uint8Array) return Buffer.from(v)
  if (v instanceof ArrayBuffer) return Buffer.from(new Uint8Array(v))
  // fallback for weird types
  return Buffer.from(v as any)
}



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
      user = db.prepare("SELECT id, email, displayName FROM users WHERE email = ?").get(parse.data.email) as UserRow | undefined
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
    ).all(user.id) as CredIdRow[]

    const options = await generateRegistrationOptions({
      rpName: env.RP_NAME,
      rpID: env.RP_ID,
      userID: toUserID(user.id),
      userName: user.email ?? `user-${user.id.slice(0, 6)}`,
      attestationType: "none",
      authenticatorSelection: {
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

// Store the credentialId exactly as the browser provides (base64url string)
const credentialId = String(parse.data.response?.id || "")
if (!credentialId) {
  reply.code(400).send({ error: "Missing credential id in response" })
  return
}

// Store public key as base64url string
const publicKey = isoBase64URL.fromBuffer(Buffer.from(credentialPublicKey))

// (optional) sanity check that server-derived credentialID matches browser id
const serverDerivedId = isoBase64URL.fromBuffer(toBuf(credentialID))
if (serverDerivedId && serverDerivedId !== credentialId) {
  // not fatal, but useful to see if anything is off
  // eslint-disable-next-line no-console
  console.warn("[webauthn] credentialId mismatch", { credentialId, serverDerivedId })
}

    const transports = (parse.data.response?.transports ?? null) as string[] | null
    const now = new Date().toISOString()

    const existingCred = db
      .prepare("SELECT id, userId FROM webauthn_credentials WHERE credentialId = ?")
      .get(credentialId) as { id: string; userId: string } | undefined

    if (existingCred) {
      if (existingCred.userId === parse.data.userId) {
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

    const user = db
      .prepare("SELECT id, email, displayName FROM users WHERE id = ?")
      .get(parse.data.userId) as UserRow | undefined

    if (!user) {
      reply.code(404).send({ error: "User not found" })
      return
    }

    const token = signToken({ sub: user.id, email: user.email ?? user.id })
    reply.send({ token, user })

  })

  // Targeted sign-in (email/userId) uses allowCredentials
  app.post("/v1/auth/webauthn/authenticate/options", async (request, reply) => {
    const parse = authOptionsSchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    let user: { id: string } | undefined
    if (parse.data.userId) {
      user = db.prepare("SELECT id FROM users WHERE id = ?").get(parse.data.userId) as UserIdRow | undefined
    } else if (parse.data.email) {
      user = db.prepare("SELECT id FROM users WHERE email = ?").get(parse.data.email) as UserRow | undefined
    }

    if (!user) {
      reply.code(404).send({ error: "User not found" })
      return
    }

    const creds = db.prepare(
      "SELECT credentialId FROM webauthn_credentials WHERE userId = ?"
    ).all(user.id) as CredIdRow[]

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

  // Discoverable sign-in (no allowCredentials, user derived from credentialId)
  app.post("/v1/auth/webauthn/authenticate/options/discoverable", async (_request, reply) => {
    const db = getDb()
    const options = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      userVerification: "preferred",
    })

    const now = new Date().toISOString()
    db.prepare(
      "INSERT INTO webauthn_challenges (userId, type, challenge, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT(userId, type) DO UPDATE SET challenge=excluded.challenge, createdAt=excluded.createdAt"
    ).run(DISCOVERABLE_USER_ID, "authentication", options.challenge, now)

    reply.send({ options })
  })

  app.post("/v1/auth/webauthn/authenticate/verify", async (request, reply) => {
    const parse = authVerifySchema.safeParse(request.body)
    if (!parse.success) {
      reply.code(400).send({ error: "Invalid body" })
      return
    }

    const db = getDb()
    const challengeOwner = parse.data.userId ?? DISCOVERABLE_USER_ID
    const challengeRow = db.prepare(
      "SELECT challenge FROM webauthn_challenges WHERE userId = ? AND type = ?"
    ).get(challengeOwner, "authentication") as { challenge?: string } | undefined

    if (!challengeRow?.challenge) {
      reply.code(400).send({ error: "Challenge not found" })
      return
    }

const rawId = parse.data.response?.id as string
if (!rawId) {
  reply.code(400).send({ error: "Missing credential" })
  return
}

const credentialId = normalizeCredId(rawId)
console.log("[webauthn] verify rawId:", rawId)
console.log("[webauthn] verify normalized:", credentialId)
console.log("[webauthn] db has:", db.prepare("SELECT credentialId FROM webauthn_credentials LIMIT 5").all())
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

    if (!credential) {
      reply.code(400).send({ error: "Credential not found" })
      return
    }

    if (parse.data.userId && credential.userId !== parse.data.userId) {
      reply.code(400).send({ error: "Credential mismatch" })
      return
    }

    const verification = await verifyAuthenticationResponse({
      response: parse.data.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: env.ADMIN_ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: false,
      authenticator: {
        credentialID: credential.credentialId,
        credentialPublicKey: Buffer.from(isoBase64URL.toBuffer(credential.publicKey)),
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
      .run(challengeOwner, "authentication")

    const user = db
      .prepare("SELECT id, email, displayName FROM users WHERE id = ?")
      .get(credential.userId) as UserRow | undefined

    if (!user) {
      reply.code(404).send({ error: "User not found" })
      return
    }

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
