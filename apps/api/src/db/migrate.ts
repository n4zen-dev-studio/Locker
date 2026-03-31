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
      provisioningPayload TEXT NULL,
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

    CREATE TABLE IF NOT EXISTS user_keys (
      userId TEXT PRIMARY KEY,
      alg TEXT NOT NULL,
      publicKey TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      rotatedAt TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_invites (
      id TEXT PRIMARY KEY,
      vaultId TEXT NOT NULL,
      inviterUserId TEXT NOT NULL,
      inviteeEmail TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      acceptedAt TEXT NULL,
      revokedAt TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_key_envelopes (
      id TEXT PRIMARY KEY,
      vaultId TEXT NOT NULL,
      userId TEXT NOT NULL,
      alg TEXT NOT NULL,
      envelopeB64 TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(vaultId, userId)
    );

    CREATE TABLE IF NOT EXISTS user_key_backups (
      userId TEXT PRIMARY KEY,
      alg TEXT NOT NULL,
      kdf TEXT NOT NULL,
      wrappedPrivateKeyB64 TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      vaultId TEXT NULL,
      type TEXT NOT NULL,
      meta TEXT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_rotation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vaultId TEXT NOT NULL,
      requestedAt TEXT NOT NULL,
      requestedByUserId TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      deviceId TEXT NOT NULL,
      platform TEXT NOT NULL,
      token TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(userId, deviceId, platform)
    );

    CREATE TABLE IF NOT EXISTS push_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NULL,
      response TEXT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_pairing_codes (
      code TEXT PRIMARY KEY,
      vaultId TEXT NOT NULL,
      userId TEXT NOT NULL,
      wrappedVaultKeyB64 TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_vaults (
      deviceId TEXT NOT NULL,
      vaultId TEXT NOT NULL,
      enabledAt TEXT NOT NULL,
      PRIMARY KEY (deviceId, vaultId)
    );

    CREATE TABLE IF NOT EXISTS vault_access_requests (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      vaultId TEXT NOT NULL,
      requestingDeviceId TEXT NOT NULL,
      requesterPublicKey TEXT NOT NULL,
      wrappedVaultKeyB64 TEXT NULL,
      status TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      approvedAt TEXT NULL,
      approvedByDeviceId TEXT NULL,
      rejectedAt TEXT NULL,
      redeemedAt TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS vault_recovery_envelopes (
      vaultId TEXT PRIMARY KEY,
      recoveryId TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL,
      keyVersion TEXT NOT NULL,
      alg TEXT NOT NULL,
      kdf TEXT NOT NULL,
      verifierB64 TEXT NOT NULL,
      nonceB64 TEXT NOT NULL,
      ciphertextB64 TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      rotatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blobs_vault_created ON blobs (vaultId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_changes_vault_id ON changes (vaultId, id);
    CREATE INDEX IF NOT EXISTS idx_audit_vault_id ON audit_events (vaultId, id);
    CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_events (userId, id);
    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (userId, deviceId);
    CREATE INDEX IF NOT EXISTS idx_push_events_created ON push_events (createdAt, id);
    CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_user ON device_pairing_codes (userId, expiresAt);
    CREATE INDEX IF NOT EXISTS idx_device_vaults_device ON device_vaults (deviceId, enabledAt);
    CREATE INDEX IF NOT EXISTS idx_device_vaults_vault ON device_vaults (vaultId, enabledAt);
    CREATE INDEX IF NOT EXISTS idx_vault_access_requests_user ON vault_access_requests (userId, status, expiresAt);
    CREATE INDEX IF NOT EXISTS idx_vault_access_requests_vault ON vault_access_requests (vaultId, status, expiresAt);
    CREATE INDEX IF NOT EXISTS idx_vault_recovery_envelopes_recovery_id ON vault_recovery_envelopes (recoveryId);
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

  try {
    db.exec("ALTER TABLE device_link_codes ADD COLUMN provisioningPayload TEXT")
  } catch {}
}
