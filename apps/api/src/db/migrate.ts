import type Database from "better-sqlite3"

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      userId TEXT,
      name TEXT,
      platform TEXT,
      createdAt TEXT,
      lastSeenAt TEXT
    );

    CREATE TABLE IF NOT EXISTS device_link_codes (
      code TEXT PRIMARY KEY,
      userId TEXT,
      expiresAt TEXT,
      usedAt TEXT NULL,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      ownerUserId TEXT,
      name TEXT,
      createdAt TEXT,
      deletedAt TEXT,
      deletedByUserId TEXT
    );

    CREATE TABLE IF NOT EXISTS vault_members (
      vaultId TEXT,
      userId TEXT,
      role TEXT,
      createdAt TEXT,
      PRIMARY KEY (vaultId, userId)
    );

    CREATE TABLE IF NOT EXISTS blobs (
      id TEXT PRIMARY KEY,
      vaultId TEXT,
      sizeBytes INTEGER,
      contentType TEXT,
      sha256 TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vaultId TEXT,
      type TEXT,
      blobId TEXT NULL,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      credentialId TEXT NOT NULL UNIQUE,
      publicKey TEXT NOT NULL,
      counter INTEGER NOT NULL,
      transports TEXT NULL,
      createdAt TEXT NOT NULL,
      lastUsedAt TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      challenge TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (userId, type)
    );

    CREATE INDEX IF NOT EXISTS idx_blobs_vault_created ON blobs (vaultId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_changes_vault_id ON changes (vaultId, id);
  `)

  try {
    db.exec("ALTER TABLE users ADD COLUMN displayName TEXT")
  } catch {}

  try {
    db.exec("ALTER TABLE vaults ADD COLUMN deletedAt TEXT")
  } catch {}

  try {
    db.exec("ALTER TABLE vaults ADD COLUMN deletedByUserId TEXT")
  } catch {}
}
