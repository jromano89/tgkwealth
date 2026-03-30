const { randomUUID } = require('crypto');
const JSON_FIELD_NAMES = ['data', 'available_accounts'];
const DEFAULT_USER = {
  displayName: 'Gordon Gecko',
  email: 'g.gecko@tgkwealth.com',
  phone: '(212) 555-0100',
  title: 'Senior Advisor',
  data: { avatar: 'GG' }
};

function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonFields(row) {
  if (!row) return row;
  const parsed = { ...row };
  for (const key of JSON_FIELD_NAMES) {
    if (parsed[key] && typeof parsed[key] === 'string') {
      try { parsed[key] = JSON.parse(parsed[key]); } catch {}
    }
  }
  return parsed;
}

function serializeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function normalizeSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getAppSlug(req) {
  const bodyApp = isPlainObject(req.body) ? req.body.app : null;
  return normalizeSlug(
    req.headers['x-demo-app'] ||
    req.query?.app ||
    bodyApp?.slug ||
    req.body?.appSlug
  );
}

function getAppBySlug(db, slug) {
  if (!slug) return null;
  return db.prepare('SELECT * FROM apps WHERE slug = ?').get(normalizeSlug(slug));
}

function upsertApp(db, { slug, name }) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw createError(400, 'Missing app slug');
  }

  const existing = getAppBySlug(db, normalizedSlug);
  const id = existing?.id || randomUUID();
  db.prepare(`
    INSERT INTO apps (id, slug, name)
    VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = COALESCE(excluded.name, apps.name),
      updated_at = CURRENT_TIMESTAMP
  `).run(id, normalizedSlug, name || existing?.name || normalizedSlug);

  return getAppBySlug(db, normalizedSlug);
}

function ensureDefaultUser(db, app) {
  if (!app) {
    return null;
  }

  const existing = db.prepare('SELECT * FROM users WHERE app_id = ? ORDER BY created_at ASC LIMIT 1').get(app.id);
  if (existing) {
    return parseJsonFields(existing);
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, app_id, display_name, email, phone, title, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    app.id,
    DEFAULT_USER.displayName,
    DEFAULT_USER.email,
    DEFAULT_USER.phone,
    DEFAULT_USER.title,
    serializeJson(DEFAULT_USER.data)
  );

  return parseJsonFields(
    db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  );
}

function getRequiredApp(db, req) {
  const slug = getAppSlug(req);
  if (!slug) {
    throw createError(400, 'Missing app slug. Set TGK_CONFIG.appSlug on the frontend.');
  }

  const bodyApp = isPlainObject(req.body) ? req.body.app : null;
  const app = upsertApp(db, {
    slug,
    name: bodyApp?.name || req.body?.appName || req.query?.appName || null
  });

  ensureDefaultUser(db, app);
  return app;
}

function getConnectionForApp(db, appId) {
  return parseJsonFields(
    db.prepare('SELECT * FROM docusign_connections WHERE app_id = ?').get(appId)
  );
}

function requireSelectedDocusignAccount(connection) {
  if (!connection) throw createError(401, 'No active Docusign connection for this app. Use /api/auth/login to connect.');
  if (!connection.docusign_account_id) throw createError(409, 'Docusign is connected, but no account is selected. Open Settings and save an account first.');
  return connection;
}

function upsertConnection(db, app, { userId, accountId, accountName, userName, email, availableAccounts }) {
  const existing = parseJsonFields(db.prepare('SELECT * FROM docusign_connections WHERE app_id = ?').get(app.id));
  const id = existing?.id || randomUUID();
  const resolvedAccountId = accountId !== undefined ? accountId : existing?.docusign_account_id || null;
  const resolvedAccountName = accountName !== undefined ? accountName : existing?.account_name || null;
  const resolvedUserName = userName !== undefined ? userName : existing?.user_name || null;
  const resolvedEmail = email !== undefined ? email : existing?.email || null;
  const resolvedAvailableAccounts = availableAccounts !== undefined ? availableAccounts : (existing?.available_accounts || []);

  db.prepare(`
    INSERT INTO docusign_connections (id, app_id, docusign_user_id, docusign_account_id, account_name, user_name, email, available_accounts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_id) DO UPDATE SET
      docusign_user_id = excluded.docusign_user_id,
      docusign_account_id = excluded.docusign_account_id,
      account_name = excluded.account_name,
      user_name = excluded.user_name,
      email = excluded.email,
      available_accounts = excluded.available_accounts,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    id,
    app.id,
    userId,
    resolvedAccountId,
    resolvedAccountName,
    resolvedUserName,
    resolvedEmail,
    serializeJson(resolvedAvailableAccounts)
  );

  return getConnectionForApp(db, app.id);
}

function clearAppConnection(db, appId) {
  db.prepare('DELETE FROM docusign_connections WHERE app_id = ?').run(appId);
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
}

function route(handler) {
  return function handleRoute(req, res, next) {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch((error) => sendError(res, error));
  };
}

module.exports = {
  clearAppConnection,
  createError,
  getAppBySlug,
  getAppSlug,
  getConnectionForApp,
  getRequiredApp,
  isPlainObject,
  requireSelectedDocusignAccount,
  normalizeSlug,
  parseJsonFields,
  route,
  sendError,
  serializeJson,
  ensureDefaultUser,
  upsertApp,
  upsertConnection
};
