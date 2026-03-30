const Database = require('better-sqlite3');
const path = require('path');
const { ensureDefaultUser } = require('./utils');

const DB_PATH = process.env.TGK_DB_PATH || path.join(__dirname, '..', 'data', 'demo.db');
const EXPECTED_TABLE_COLUMNS = {
  apps: [
    'id',
    'slug',
    'name',
    'created_at',
    'updated_at'
  ],
  docusign_connections: [
    'id',
    'app_id',
    'docusign_user_id',
    'docusign_account_id',
    'account_name',
    'user_name',
    'email',
    'available_accounts',
    'created_at',
    'updated_at'
  ],
  users: [
    'id',
    'app_id',
    'display_name',
    'email',
    'phone',
    'title',
    'data',
    'created_at',
    'updated_at'
  ],
  contacts: [
    'id',
    'app_id',
    'owner_user_id',
    'ref',
    'display_name',
    'email',
    'phone',
    'organization',
    'status',
    'data',
    'source',
    'created_at',
    'updated_at'
  ],
  envelopes: [
    'id',
    'app_id',
    'user_id',
    'docusign_envelope_id',
    'contact_id',
    'status',
    'document_name',
    'completed_at',
    'created_at'
  ],
  tasks: [
    'id',
    'app_id',
    'user_id',
    'contact_id',
    'title',
    'description',
    'status',
    'created_at'
  ]
};
const APP_TABLES = ['users', 'contacts', 'envelopes', 'tasks'];

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }

  return db;
}

function initializeSchema(database) {
  createCoreTables(database);
  applySchemaAdjustments(database);

  if (shouldResetAppTables(database)) {
    resetAppTables(database);
  }

  createAppTables(database);
  dropUnexpectedTables(database);
  ensureUsersForExistingApps(database);
}

function createCoreTables(database) {
  database.exec(`
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
  `);
}

function createAppTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES apps(id),
      display_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      title TEXT,
      data TEXT,
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

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL REFERENCES apps(id),
      user_id TEXT REFERENCES users(id),
      contact_id TEXT REFERENCES contacts(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK(user_id IS NOT NULL OR contact_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_users_app ON users(app_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_app_status ON contacts(app_id, status);
    CREATE INDEX IF NOT EXISTS idx_contacts_app_owner ON contacts(app_id, owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_envelopes_app_contact ON envelopes(app_id, contact_id);
    CREATE INDEX IF NOT EXISTS idx_envelopes_app_user ON envelopes(app_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_envelopes_docusign ON envelopes(docusign_envelope_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_app_contact ON tasks(app_id, contact_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_app_user ON tasks(app_id, user_id);
  `);
}

function tableExists(database, tableName) {
  const row = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);

  return !!row;
}

function getColumnNames(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function matchesExpectedColumns(actualColumns, expectedColumns) {
  if (actualColumns.length !== expectedColumns.length) {
    return false;
  }

  const actual = new Set(actualColumns);
  return expectedColumns.every((columnName) => actual.has(columnName));
}

function shouldResetAppTables(database) {
  return APP_TABLES.some((tableName) => (
    tableExists(database, tableName)
      && !matchesExpectedColumns(getColumnNames(database, tableName), EXPECTED_TABLE_COLUMNS[tableName])
  ));
}

function contactColumnIsRequired(database, tableName) {
  if (!tableExists(database, tableName)) {
    return false;
  }

  const contactColumn = database.prepare(`PRAGMA table_info(${tableName})`).all()
    .find((column) => column.name === 'contact_id');

  return !!contactColumn?.notnull;
}

function rebuildTable(database, tableName, createSql, copySql) {
  const foreignKeysEnabled = database.pragma('foreign_keys', { simple: true });

  database.pragma('foreign_keys = OFF');
  try {
    database.exec(`
      ${createSql}
      ${copySql}
      DROP TABLE ${tableName};
      ALTER TABLE ${tableName}_next RENAME TO ${tableName};
    `);
  } finally {
    database.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

function rebuildEnvelopesTable(database) {
  const hasUserId = getColumnNames(database, 'envelopes').includes('user_id');
  const userIdExpression = hasUserId ? 'COALESCE(e.user_id, c.owner_user_id)' : 'c.owner_user_id';

  rebuildTable(
    database,
    'envelopes',
    `
      CREATE TABLE envelopes_next (
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
    `,
    `
      INSERT INTO envelopes_next (id, app_id, user_id, docusign_envelope_id, contact_id, status, document_name, completed_at, created_at)
      SELECT
        e.id,
        e.app_id,
        ${userIdExpression},
        e.docusign_envelope_id,
        e.contact_id,
        e.status,
        e.document_name,
        e.completed_at,
        e.created_at
      FROM envelopes e
      LEFT JOIN contacts c ON c.id = e.contact_id;
    `
  );
}

function rebuildTasksTable(database) {
  const hasUserId = getColumnNames(database, 'tasks').includes('user_id');
  const userIdExpression = hasUserId ? 'COALESCE(t.user_id, c.owner_user_id)' : 'c.owner_user_id';

  rebuildTable(
    database,
    'tasks',
    `
      CREATE TABLE tasks_next (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL REFERENCES apps(id),
        user_id TEXT REFERENCES users(id),
        contact_id TEXT REFERENCES contacts(id),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK(user_id IS NOT NULL OR contact_id IS NOT NULL)
      );
    `,
    `
      INSERT INTO tasks_next (id, app_id, user_id, contact_id, title, description, status, created_at)
      SELECT
        t.id,
        t.app_id,
        ${userIdExpression},
        t.contact_id,
        t.title,
        t.description,
        t.status,
        t.created_at
      FROM tasks t
      LEFT JOIN contacts c ON c.id = t.contact_id;
    `
  );
}

function applySchemaAdjustments(database) {
  if (tableExists(database, 'envelopes')) {
    const envelopeColumns = getColumnNames(database, 'envelopes');
    if (!envelopeColumns.includes('user_id') || contactColumnIsRequired(database, 'envelopes')) {
      rebuildEnvelopesTable(database);
    }
  }

  if (tableExists(database, 'tasks')) {
    const taskColumns = getColumnNames(database, 'tasks');
    if (!taskColumns.includes('user_id') || contactColumnIsRequired(database, 'tasks')) {
      rebuildTasksTable(database);
    }
  }
}

function dropTableIfExists(database, tableName) {
  if (tableExists(database, tableName)) {
    database.exec(`DROP TABLE ${tableName}`);
  }
}

function listTables(database) {
  return database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map((row) => row.name);
}

function resetAppTables(database) {
  const foreignKeysEnabled = database.pragma('foreign_keys', { simple: true });

  database.pragma('foreign_keys = OFF');
  try {
    APP_TABLES.forEach((tableName) => dropTableIfExists(database, tableName));
  } finally {
    database.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

function dropUnexpectedTables(database) {
  const expectedTables = new Set(Object.keys(EXPECTED_TABLE_COLUMNS));

  for (const tableName of listTables(database)) {
    if (!expectedTables.has(tableName)) {
      dropTableIfExists(database, tableName);
    }
  }
}

function ensureUsersForExistingApps(database) {
  const apps = database.prepare('SELECT * FROM apps').all();
  apps.forEach((app) => ensureDefaultUser(database, app));
}

module.exports = {
  getDb
};
