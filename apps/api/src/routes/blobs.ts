import { FastifyInstance } from "fastify"
import crypto from "crypto"
import { getDb } from "../db/db"
import { authMiddleware } from "../middleware/auth"
import { getBlob, putBlob } from "../blobStore/fsBlobStore"

const MAX_BLOB_BYTES = 50 * 1024 * 1024

export async function registerBlobRoutes(app: FastifyInstance) {
  app.put(
    "/v1/vaults/:vaultId/blobs/:blobId",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!
      const { vaultId, blobId } = request.params as { vaultId: string; blobId: string }
      const sha256 = (request.query as { sha256?: string }).sha256
      if (!sha256) {
        reply.code(400).send({ error: "Missing sha256" })
        return
      }

      const db = getDb()
      const member = db.prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id) as { role?: string } | undefined
      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }
      if (member.role === "viewer") {
        reply.code(403).send({ error: "Insufficient role" })
        return
      }

      const body = await readBody(request)
      if (body.length > MAX_BLOB_BYTES) {
        reply.code(413).send({ error: "Payload too large" })
        return
      }

      const hash = crypto.createHash("sha256").update(body).digest("hex")
      if (hash !== sha256) {
        reply.code(400).send({ error: "sha256 mismatch" })
        return
      }

      await putBlob(vaultId, blobId, body)
      const now = new Date().toISOString()
      const contentType = request.headers["content-type"] || "application/octet-stream"

      db.prepare(
        `INSERT INTO blobs (id, vaultId, sizeBytes, contentType, sha256, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET sizeBytes=excluded.sizeBytes, contentType=excluded.contentType, sha256=excluded.sha256`
      ).run(blobId, vaultId, body.length, contentType, hash, now)

      db.prepare("INSERT INTO changes (vaultId, type, blobId, createdAt) VALUES (?, ?, ?, ?)")
        .run(vaultId, "blob_put", blobId, now)

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
      const member = db.prepare("SELECT role FROM vault_members WHERE vaultId = ? AND userId = ?")
        .get(vaultId, user.id)
      if (!member) {
        reply.code(403).send({ error: "Forbidden" })
        return
      }

      const record = db.prepare("SELECT contentType FROM blobs WHERE id = ? AND vaultId = ?")
        .get(blobId, vaultId) as { contentType?: string } | undefined
      if (!record) {
        reply.code(404).send({ error: "Not found" })
        return
      }

      const data = await getBlob(vaultId, blobId)
      reply.header("content-type", record.contentType || "application/octet-stream")
      reply.send(data)
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
