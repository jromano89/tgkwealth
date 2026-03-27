const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.TGK_DB_PATH || path.join(__dirname, '..', '..', 'data', 'demo.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables();
    runMigrations();
  }
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      bootstrap_version TEXT,
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

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES apps(id),
      ref TEXT,
      kind TEXT NOT NULL DEFAULT 'profile',
      display_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      organization TEXT,
      status TEXT DEFAULT 'active',
      tags TEXT,
      data TEXT,
      source TEXT DEFAULT 'api',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(app_id, ref)
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES apps(id),
      profile_id TEXT REFERENCES profiles(id),
      ref TEXT,
      kind TEXT NOT NULL DEFAULT 'record',
      title TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      data TEXT,
      source TEXT DEFAULT 'api',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(app_id, ref)
    );

    CREATE TABLE IF NOT EXISTS envelopes (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES apps(id),
      docusign_envelope_id TEXT,
      profile_id TEXT REFERENCES profiles(id),
      record_id TEXT REFERENCES records(id),
      template_id TEXT,
      template_name TEXT,
      status TEXT DEFAULT 'created',
      sent_at DATETIME,
      completed_at DATETIME,
      metadata TEXT,
      source TEXT DEFAULT 'api',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES apps(id),
      profile_id TEXT REFERENCES profiles(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT REFERENCES apps(id),
      docusign_envelope_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_app_kind ON profiles(app_id, kind);
    CREATE INDEX IF NOT EXISTS idx_records_app_kind ON records(app_id, kind);
    CREATE INDEX IF NOT EXISTS idx_envelopes_app ON envelopes(app_id);
    CREATE INDEX IF NOT EXISTS idx_envelopes_docusign ON envelopes(docusign_envelope_id);
  `);
}

function runMigrations() {
  migrateDocusignConnectionsTable();
  dropTableIfExists('connect_configs');
}

function getTableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function tableExists(tableName) {
  const existing = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);
  return !!existing;
}

function dropTableIfExists(tableName) {
  if (!tableExists(tableName)) {
    return;
  }

  db.exec(`DROP TABLE ${tableName}`);
}

function migrateDocusignConnectionsTable() {
  if (!tableExists('docusign_connections')) {
    return;
  }

  const tableColumns = getTableColumns('docusign_connections');
  const columnNames = new Set(tableColumns.map((column) => column.name));
  const accountIdColumn = tableColumns.find((column) => column.name === 'docusign_account_id');
  const needsRebuild =
    !!accountIdColumn?.notnull ||
    columnNames.has('status') ||
    columnNames.has('disconnected_at') ||
    columnNames.has('consented_scopes') ||
    !columnNames.has('user_name') ||
    !columnNames.has('available_accounts');

  if (!needsRebuild) {
    return;
  }

  const rows = db.prepare('SELECT * FROM docusign_connections').all();
  const rebuild = db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS docusign_connections_new');
    db.exec(`
      CREATE TABLE docusign_connections_new (
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
    `);

    const insert = db.prepare(`
      INSERT INTO docusign_connections_new (
        id,
        app_id,
        docusign_user_id,
        docusign_account_id,
        account_name,
        user_name,
        email,
        available_accounts,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      if (row.status === 'disconnected') {
        continue;
      }

      const createdAt = row.created_at || new Date().toISOString();
      const updatedAt = row.updated_at || createdAt;

      insert.run(
        row.id,
        row.app_id,
        row.docusign_user_id,
        row.docusign_account_id || null,
        row.account_name || null,
        row.user_name || null,
        row.email || null,
        row.available_accounts || null,
        createdAt,
        updatedAt
      );
    }

    db.exec('DROP TABLE docusign_connections');
    db.exec('ALTER TABLE docusign_connections_new RENAME TO docusign_connections');
  });

  rebuild();
}

module.exports = { getDb };
