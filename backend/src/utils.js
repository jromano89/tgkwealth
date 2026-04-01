const JSON_FIELD_NAMES = ['data', 'docusign_available_accounts'];

function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value) {
  return isPlainObject(value) ? { ...value } : {};
}

function parseJsonFields(row) {
  if (!row) return row;
  const parsed = { ...row };
  for (const key of JSON_FIELD_NAMES) {
    if (parsed[key] && typeof parsed[key] === 'string') {
      try {
        parsed[key] = JSON.parse(parsed[key]);
      } catch (error) {
        // Ignore invalid JSON and keep the raw value.
      }
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

function normalizeOptionalString(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeOptionalData(value) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    return {};
  }

  return { ...value };
}

function getAppSlug(req) {
  const bodyApp = isPlainObject(req.body) ? req.body.app : null;
  return normalizeSlug(
    req.headers['x-demo-app']
    || req.query?.app
    || bodyApp?.slug
    || req.body?.appSlug
  );
}

function getAppBySlug(db, slug) {
  if (!slug) return null;
  return parseJsonFields(
    db.prepare('SELECT * FROM apps WHERE slug = ?').get(normalizeSlug(slug))
  );
}

function upsertApp(db, input = {}) {
  const slug = normalizeSlug(input.slug);
  if (!slug) {
    throw createError(400, 'Missing app slug');
  }

  const existing = getAppBySlug(db, slug);
  const next = {
    slug,
    data: input.data !== undefined
      ? serializeJson(normalizeOptionalData(input.data) || {})
      : serializeJson(existing?.data || {}),
    docusign_scopes: input.docusignScopes !== undefined
      ? normalizeOptionalString(input.docusignScopes)
      : (existing?.docusign_scopes || null),
    docusign_user_id: input.docusignUserId !== undefined
      ? normalizeOptionalString(input.docusignUserId)
      : (existing?.docusign_user_id || null),
    docusign_account_id: input.docusignAccountId !== undefined
      ? normalizeOptionalString(input.docusignAccountId)
      : (existing?.docusign_account_id || null),
    docusign_account_name: input.docusignAccountName !== undefined
      ? normalizeOptionalString(input.docusignAccountName)
      : (existing?.docusign_account_name || null),
    docusign_user_name: input.docusignUserName !== undefined
      ? normalizeOptionalString(input.docusignUserName)
      : (existing?.docusign_user_name || null),
    docusign_email: input.docusignEmail !== undefined
      ? normalizeOptionalString(input.docusignEmail)
      : (existing?.docusign_email || null),
    docusign_available_accounts: input.docusignAvailableAccounts !== undefined
      ? serializeJson(Array.isArray(input.docusignAvailableAccounts) ? input.docusignAvailableAccounts : [])
      : serializeJson(existing?.docusign_available_accounts || [])
  };

  db.prepare(`
    INSERT INTO apps (
      slug,
      data,
      docusign_scopes,
      docusign_user_id,
      docusign_account_id,
      docusign_account_name,
      docusign_user_name,
      docusign_email,
      docusign_available_accounts
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      data = excluded.data,
      docusign_scopes = excluded.docusign_scopes,
      docusign_user_id = excluded.docusign_user_id,
      docusign_account_id = excluded.docusign_account_id,
      docusign_account_name = excluded.docusign_account_name,
      docusign_user_name = excluded.docusign_user_name,
      docusign_email = excluded.docusign_email,
      docusign_available_accounts = excluded.docusign_available_accounts,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    next.slug,
    next.data,
    next.docusign_scopes,
    next.docusign_user_id,
    next.docusign_account_id,
    next.docusign_account_name,
    next.docusign_user_name,
    next.docusign_email,
    next.docusign_available_accounts
  );

  return getAppBySlug(db, slug);
}

function getRequiredApp(db, req) {
  const slug = getAppSlug(req);
  if (!slug) {
    throw createError(400, 'Missing app slug. Set TGK_CONFIG.appSlug on the frontend.');
  }

  return upsertApp(db, { slug });
}

function requireDocusignConnection(app) {
  if (!app?.docusign_user_id) {
    throw createError(401, 'No active Docusign connection for this app. Use /api/auth/login to connect.');
  }
  return app;
}

function requireSelectedDocusignAccount(app) {
  const connectedApp = requireDocusignConnection(app);
  if (!connectedApp.docusign_account_id) {
    throw createError(409, 'Docusign is connected, but no account is selected. Open Settings and save an account first.');
  }
  return connectedApp;
}

function clearAppConnection(db, slug) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    return;
  }

  db.prepare(`
    UPDATE apps SET
      docusign_user_id = NULL,
      docusign_account_id = NULL,
      docusign_account_name = NULL,
      docusign_user_name = NULL,
      docusign_email = NULL,
      docusign_available_accounts = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE slug = ?
  `).run(normalizedSlug);
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
  asObject,
  clearAppConnection,
  createError,
  getAppBySlug,
  getAppSlug,
  getRequiredApp,
  isPlainObject,
  normalizeOptionalString,
  normalizeSlug,
  parseJsonFields,
  requireDocusignConnection,
  requireSelectedDocusignAccount,
  route,
  sendError,
  serializeJson,
  upsertApp
};
