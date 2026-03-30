const { v4: uuidv4 } = require('uuid');
const JSON_FIELD_NAMES = ['tags', 'data', 'metadata', 'available_accounts'];

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

function getRequestAppPayload(req) {
  return isPlainObject(req.body) ? req.body.app : null;
}

function getAppSlug(req) {
  const bodyApp = getRequestAppPayload(req);
  return normalizeSlug(
    req.headers['x-demo-app'] ||
    req.query?.app ||
    bodyApp?.slug ||
    req.body?.appSlug
  );
}

function getAppConfigFromRequest(req) {
  const bodyApp = getRequestAppPayload(req);
  return {
    slug: getAppSlug(req),
    name: bodyApp?.name || req.body?.appName || req.query?.appName || null,
    bootstrapVersion: bodyApp?.bootstrapVersion || req.body?.bootstrapVersion || req.query?.bootstrapVersion || null
  };
}

function getAppBySlug(db, slug) {
  if (!slug) return null;
  return db.prepare('SELECT * FROM apps WHERE slug = ?').get(normalizeSlug(slug));
}

function upsertApp(db, { slug, name, bootstrapVersion }) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    throw createError(400, 'Missing app slug');
  }

  const existing = getAppBySlug(db, normalizedSlug);
  const id = existing?.id || uuidv4();
  db.prepare(`
    INSERT INTO apps (id, slug, name, bootstrap_version)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = COALESCE(excluded.name, apps.name),
      bootstrap_version = excluded.bootstrap_version,
      updated_at = CURRENT_TIMESTAMP
  `).run(id, normalizedSlug, name || existing?.name || normalizedSlug, bootstrapVersion || null);

  return getAppBySlug(db, normalizedSlug);
}

function getRequiredApp(db, req) {
  const slug = getAppSlug(req);
  if (!slug) {
    throw createError(400, 'Missing app slug. Set TGK_CONFIG.appSlug on the frontend.');
  }

  const app = getAppBySlug(db, slug);
  if (!app) {
    throw createError(404, `App "${slug}" has not been initialized yet.`);
  }

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
  const id = existing?.id || uuidv4();
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

function getAppStats(db, appId) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM profiles WHERE app_id = ?) AS profiles,
      (SELECT COUNT(*) FROM records WHERE app_id = ?) AS records,
      (SELECT COUNT(*) FROM envelopes WHERE app_id = ?) AS envelopes
  `).get(appId, appId, appId);
}

module.exports = {
  clearAppConnection,
  createError,
  getAppBySlug,
  getAppConfigFromRequest,
  getAppSlug,
  getAppStats,
  getConnectionForApp,
  getRequiredApp,
  isPlainObject,
  requireSelectedDocusignAccount,
  normalizeSlug,
  parseJsonFields,
  serializeJson,
  upsertApp,
  upsertConnection
};
