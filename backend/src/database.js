const Database = require('better-sqlite3');
const path = require('path');
const { ensureDefaultUser, parseJsonFields, serializeJson } = require('./utils');

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
  migrateEnvelopeSchema(database);
  migrateLegacyTasks(database);
  ensureDefaultUsers(database);
}

function tableExists(database, tableName) {
  return !!database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);
}

function getColumnNames(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function isRequiredColumn(database, tableName, columnName) {
  return !!database.prepare(`PRAGMA table_info(${tableName})`).all()
    .find((column) => column.name === columnName && column.notnull);
}

function withForeignKeysDisabled(database, callback) {
  const foreignKeysEnabled = database.pragma('foreign_keys', { simple: true });
  database.pragma('foreign_keys = OFF');
  try {
    return callback();
  } finally {
    database.pragma(`foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }
}

function rebuildEnvelopesTable(database) {
  const columns = new Set(getColumnNames(database, 'envelopes'));
  const userIdExpression = columns.has('user_id') ? 'COALESCE(e.user_id, c.owner_user_id)' : 'c.owner_user_id';

  withForeignKeysDisabled(database, () => {
    database.exec(`
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

      DROP TABLE envelopes;
      ALTER TABLE envelopes_next RENAME TO envelopes;
    `);
  });
}

function migrateEnvelopeSchema(database) {
  if (!tableExists(database, 'envelopes')) {
    return;
  }

  const columns = new Set(getColumnNames(database, 'envelopes'));
  if (!columns.has('user_id') || isRequiredColumn(database, 'envelopes', 'contact_id')) {
    rebuildEnvelopesTable(database);
  }
}

function asDataObject(row) {
  const parsed = parseJsonFields(row);
  return parsed?.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
    ? { ...parsed.data }
    : {};
}

function normalizeTaskRecord(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  return {
    id: task.id,
    user_id: task.user_id || null,
    contact_id: task.contact_id || null,
    title: task.title,
    description: task.description || null,
    status: task.status || 'pending',
    created_at: task.created_at || new Date().toISOString()
  };
}

function appendTaskRecord(records, task) {
  const normalizedTask = normalizeTaskRecord(task);
  if (!normalizedTask || !normalizedTask.id || !normalizedTask.title) {
    return Array.isArray(records) ? records : [];
  }

  const nextRecords = Array.isArray(records) ? [...records] : [];
  if (nextRecords.some((record) => record && record.id === normalizedTask.id)) {
    return nextRecords;
  }

  nextRecords.push(normalizedTask);
  nextRecords.sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  return nextRecords;
}

function migrateLegacyTasks(database) {
  if (!tableExists(database, 'tasks')) {
    return;
  }

  const tasks = database.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all();
  if (tasks.length === 0) {
    database.exec('DROP TABLE tasks');
    return;
  }

  const contacts = new Map(
    database.prepare('SELECT id, app_id, data FROM contacts').all().map((row) => [row.id, {
      id: row.id,
      app_id: row.app_id,
      data: asDataObject(row)
    }])
  );
  const users = new Map(
    database.prepare('SELECT id, app_id, data FROM users').all().map((row) => [row.id, {
      id: row.id,
      app_id: row.app_id,
      data: asDataObject(row)
    }])
  );

  for (const task of tasks) {
    if (task.contact_id && contacts.has(task.contact_id)) {
      const contact = contacts.get(task.contact_id);
      contact.data.tasks = appendTaskRecord(contact.data.tasks, task);
      continue;
    }

    if (task.user_id && users.has(task.user_id)) {
      const user = users.get(task.user_id);
      user.data.tasks = appendTaskRecord(user.data.tasks, task);
    }
  }

  const updateContact = database.prepare('UPDATE contacts SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND app_id = ?');
  const updateUser = database.prepare('UPDATE users SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND app_id = ?');
  const migrate = database.transaction(() => {
    contacts.forEach((contact) => {
      updateContact.run(serializeJson(contact.data), contact.id, contact.app_id);
    });
    users.forEach((user) => {
      updateUser.run(serializeJson(user.data), user.id, user.app_id);
    });
    database.exec('DROP TABLE tasks');
  });

  migrate();
}

function ensureDefaultUsers(database) {
  database.prepare('SELECT * FROM apps').all().forEach((app) => ensureDefaultUser(database, app));
}

module.exports = {
  getDb
};
