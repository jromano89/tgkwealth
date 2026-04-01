const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.TGK_DB_PATH || path.join(__dirname, '..', 'data', 'demo.db');
const DB_DIR = path.dirname(DB_PATH);

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS apps (
    slug TEXT PRIMARY KEY,
    data TEXT,
    docusign_scopes TEXT,
    docusign_user_id TEXT,
    docusign_account_id TEXT,
    docusign_account_name TEXT,
    docusign_user_name TEXT,
    docusign_email TEXT,
    docusign_available_accounts TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    display_name TEXT,
    email TEXT,
    phone TEXT,
    title TEXT,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    display_name TEXT,
    email TEXT,
    phone TEXT,
    organization TEXT,
    status TEXT DEFAULT 'active',
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS envelopes (
    id TEXT PRIMARY KEY,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'created',
    name TEXT,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    due_at DATETIME,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_employees_app_slug ON employees(app_slug);
  CREATE INDEX IF NOT EXISTS idx_customers_app_slug ON customers(app_slug);
  CREATE INDEX IF NOT EXISTS idx_customers_app_slug_status ON customers(app_slug, status);
  CREATE INDEX IF NOT EXISTS idx_customers_app_slug_employee ON customers(app_slug, employee_id);
  CREATE INDEX IF NOT EXISTS idx_envelopes_app_slug ON envelopes(app_slug);
  CREATE INDEX IF NOT EXISTS idx_envelopes_app_slug_customer ON envelopes(app_slug, customer_id);
  CREATE INDEX IF NOT EXISTS idx_envelopes_app_slug_employee ON envelopes(app_slug, employee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_app_slug ON tasks(app_slug);
  CREATE INDEX IF NOT EXISTS idx_tasks_app_slug_customer ON tasks(app_slug, customer_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_app_slug_employee ON tasks(app_slug, employee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`;

let db;

function getDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = {
  DB_PATH,
  getDb
};
