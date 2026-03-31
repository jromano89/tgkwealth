const Database = require('better-sqlite3');
const path = require('path');
const { ensureDefaultUser } = require('./utils');

const DB_PATH = process.env.TGK_DB_PATH || path.join(__dirname, '..', 'data', 'demo.db');
const CORE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS docusign_connections (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL UNIQUE REFERENCES apps(id),
    docusign_user_id TEXT NOT NULL,
    docusign_account_id TEXT,
    account_name TEXT,
    user_name TEXT,
    email TEXT,
    available_accounts TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;
const APP_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id),
    display_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    title TEXT,
    data TEXT,
    tasks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id),
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    ref TEXT,
    display_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    organization TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    data TEXT,
    tasks TEXT,
    source TEXT NOT NULL DEFAULT 'api',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_id, ref)
  );

  CREATE TABLE IF NOT EXISTS envelopes (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL REFERENCES apps(id),
    user_id TEXT REFERENCES users(id),
    docusign_envelope_id TEXT,
    contact_id TEXT REFERENCES contacts(id),
    status TEXT NOT NULL DEFAULT 'created',
    document_name TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK(user_id IS NOT NULL OR contact_id IS NOT NULL)
  );

  CREATE INDEX IF NOT EXISTS idx_users_app ON users(app_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_app_status ON contacts(app_id, status);
  CREATE INDEX IF NOT EXISTS idx_contacts_app_owner ON contacts(app_id, owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_envelopes_app_contact ON envelopes(app_id, contact_id);
  CREATE INDEX IF NOT EXISTS idx_envelopes_app_user ON envelopes(app_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_envelopes_docusign ON envelopes(docusign_envelope_id);
`;

let db;

function getDb() {
  if (db) {
    return db;
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  return db;
}

function initializeSchema(database) {
  database.exec(CORE_SCHEMA);
  database.exec(APP_SCHEMA);
  ensureDefaultUsers(database);
}

function ensureDefaultUsers(database) {
  database.prepare('SELECT * FROM apps').all().forEach((app) => ensureDefaultUser(database, app));
}

module.exports = {
  getDb
};
