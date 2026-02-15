import { FastifyInstance } from "fastify"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { deleteBlob, getBlob, putBlob } from "../blobStore/fsBlobStore"

const MAX_BLOB_BYTES = 50 * 1024 * 1024

export async function registerBlobRoutes(app: FastifyInstance) {
  app.put(
    "/v1/vaults/:vaultId/blobs/:blobId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId, blobId } = request.params as { vaultId: string; blobId: string }
      const sha256 = (request.query as { sha256?: string }).sha256
      if (!sha256) return reply.code(400).send({ error: "Missing sha256" })

      const db = getDb()
      const vault = db.prepare("SELECT deletedAt FROM vaults WHERE id = ?").get(vaultId) as
        | { deletedAt?: string | null }
        | undefined
      if (!vault) return reply.code(404).send({ error: "Not found" })
      if (vault.deletedAt) return reply.code(404).send({ error: "Vault deleted" })

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as { role?: string } | undefined

      if (!member) return reply.code(403).send({ error: "Forbidden" })
      if (member.role === "viewer") return reply.code(403).send({ error: "Insufficient role" })

      const body = await readBody(request)
      if (body.length > MAX_BLOB_BYTES) return reply.code(413).send({ error: "Payload too large" })

      const hash = crypto.createHash("sha256").update(body).digest("hex")
      if (hash !== sha256) return reply.code(400).send({ error: "sha256 mismatch" })

      const now = new Date().toISOString()
      const contentType = request.headers["content-type"] || "application/octet-stream"

      // 1) Write blob bytes first (file store)
      await putBlob(vaultId, blobId, body)

      // 2) Persist metadata + change atomically
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO blobs (id, vaultId, sizeBytes, contentType, sha256, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             sizeBytes=excluded.sizeBytes,
             contentType=excluded.contentType,
             sha256=excluded.sha256`
        ).run(blobId, vaultId, body.length, contentType, hash, now)

        db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
          .run(vaultId, "blob_put", blobId, now)
      })

      try {
        tx()
      } catch (e) {
        // If DB write fails, we must not leave a "blob_put" without DB state.
        // Best-effort cleanup: you can optionally delete the blob file here if you add a deleteBlob().
        // For now, surface a 500 so client retries; GET will still work because it reads file.
        request.log.error({ err: e }, "Failed to persist blob metadata/change")
        return reply.code(500).send({ error: "Failed to persist blob metadata" })
      }

      reply.send({ ok: true })
    }
  )

  app.get(
    "/v1/vaults/:vaultId/blobs/:blobId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId, blobId } = request.params as { vaultId: string; blobId: string }

      const db = getDb()
      const vault = db.prepare("SELECT deletedAt FROM vaults WHERE id = ?").get(vaultId) as
        | { deletedAt?: string | null }
        | undefined
      if (!vault) return reply.code(404).send({ error: "Not found" })
      if (vault.deletedAt) return reply.code(404).send({ error: "Vault deleted" })

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id)
      if (!member) return reply.code(403).send({ error: "Forbidden" })

      // Prefer file as source-of-truth to prevent 404 when DB row is missing.
      let data: Buffer
      try {
        data = await getBlob(vaultId, blobId)
      } catch (e) {
        // fsBlobStore should throw on missing file
        return reply.code(404).send({ error: "Not found" })
      }

      const record = db
        .prepare("SELECT contentType FROM blobs WHERE id = ? AND vaultId = ?")
        .get(blobId, vaultId) as { contentType?: string } | undefined

      reply.header("content-type", record?.contentType || "application/octet-stream")
      reply.send(data)
    }
  )

  app.delete(
    "/v1/vaults/:vaultId/blobs/:blobId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId, blobId } = request.params as { vaultId: string; blobId: string }

      const db = getDb()
      const vault = db.prepare("SELECT deletedAt FROM vaults WHERE id = ?").get(vaultId) as
        | { deletedAt?: string | null }
        | undefined
      if (!vault) return reply.code(404).send({ error: "Not found" })
      if (vault.deletedAt) return reply.code(404).send({ error: "Vault deleted" })

      const member = db
        .prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as { role?: string } | undefined

      if (!member || member.role !== "owner") return reply.code(403).send({ error: "Forbidden" })

      await deleteBlob(vaultId, blobId)

      const now = new Date().toISOString()
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM blobs WHERE id = ? AND vaultId = ?").run(blobId, vaultId)
        db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
          .run(vaultId, "blob_del", blobId, now)
      })

      tx()

      reply.send({ ok: true })
    }
  )
}

async function readBody(request: any): Promise<Buffer> {
  if (Buffer.isBuffer(request.body)) return request.body

  const chunks: Buffer[] = []
  for await (const chunk of request.raw) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
