const session = require('express-session');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const { getDb } = require('../db/database');
const { createError, getConnectionForApp, getRequiredApp } = require('../utils');

function setupSession(app) {
  const db = getDb();
  const consentSessionMaxAgeMs = 60 * 60 * 1000;
  const secureCookies = process.env.COOKIE_SECURE === 'true'
    || process.env.NODE_ENV === 'production';
  const sameSite = process.env.COOKIE_SAME_SITE
    || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');

  app.use(session({
    store: new BetterSqlite3Store({
      client: db,
      expired: {
        clear: true,
        intervalMs: 15 * 60 * 1000
      }
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: secureCookies,
      sameSite,
      maxAge: consentSessionMaxAgeMs
    }
  }));
}

function requireDocusignConnection(req, res, next) {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const connection = getConnectionForApp(db, app.id);

    if (!connection) {
      throw createError(401, 'No active Docusign connection for this app. Use /api/auth/login to connect.');
    }

    req.demoApp = app;
    req.docusign = {
      appId: app.id,
      appSlug: app.slug,
      userId: connection.docusign_user_id,
      accountId: connection.docusign_account_id,
      accountName: connection.account_name,
      email: connection.email
    };

    next();
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { setupSession, requireDocusignConnection };
