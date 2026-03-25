const express = require('express');
const { getDb } = require('../db/database');
const {
  createConsentState,
  getConsentUrl,
  getUserInfoFromCode
} = require('../services/docusign-auth');
const { clearAppConnection, createError, getAppBySlug, getAppSlug, getConnectionForApp, upsertApp, upsertConnection } = require('../utils');
const router = express.Router();

function normalizeAccounts(accounts) {
  return (accounts || [])
    .map((account) => ({
      accountId: account.account_id || account.accountId,
      accountName: account.account_name || account.accountName,
      isDefault: account.is_default === 'true' || account.isDefault === true
    }))
    .filter((account) => account.accountId)
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
}

function resolveAbsoluteUrl(req, value) {
  return new URL(value || '/', `${req.protocol}://${req.get('host')}`);
}

function buildFrontendRedirect(req, frontendRedirect, status, extras = {}) {
  const url = resolveAbsoluteUrl(req, frontendRedirect);
  url.searchParams.set('docusign', status);

  for (const [key, value] of Object.entries(extras)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function sendPopupResult(req, res, frontendRedirect, payload) {
  const redirectUrl = buildFrontendRedirect(req, frontendRedirect, payload.status, payload.message ? { message: payload.message } : {});
  const targetOrigin = resolveAbsoluteUrl(req, frontendRedirect).origin;
  const serializedPayload = JSON.stringify({
    source: 'tgk-docusign-auth',
    ...payload
  });
  const serializedOrigin = JSON.stringify(targetOrigin);
  const serializedRedirect = JSON.stringify(redirectUrl);

  res.type('html').send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Docusign Connection</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
      }
      .card {
        max-width: 360px;
        padding: 24px;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
        text-align: center;
      }
      p {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <p>Finishing the Docusign connection. This window should close automatically.</p>
    </div>
    <script>
      const payload = ${serializedPayload};
      const targetOrigin = ${serializedOrigin};
      const redirectUrl = ${serializedRedirect};

      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, targetOrigin);
          window.close();
        }
      } catch (error) {
        console.error(error);
      }

      window.location.replace(redirectUrl);
    </script>
  </body>
</html>`);
}

/**
 * @swagger
 * /api/auth/login:
 *   get:
 *     summary: Initiate Docusign consent for the JWT-backed integration
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: redirect
 *         schema:
 *           type: string
 *         description: URL to redirect back to after Docusign consent (the frontend URL)
 *     responses:
 *       302:
 *         description: Redirects to Docusign consent screen
 */
router.get('/login', (req, res) => {
  const appSlug = getAppSlug(req);
  if (!appSlug) {
    return res.status(400).json({ error: 'Missing app slug. Pass ?app=<slug> when starting Docusign consent.' });
  }

  const consentState = createConsentState();
  const frontendRedirect = req.query.redirect || req.headers.referer || '/';
  req.session.docusignConsent = {
    frontendRedirect,
    appSlug,
    appName: req.query.appName || null,
    state: consentState,
    display: req.query.display === 'popup' ? 'popup' : 'redirect'
  };

  const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;
  const consentUrl = getConsentUrl(callbackUrl, consentState, req.query.scopes);

  res.redirect(consentUrl);
});

/**
 * @swagger
 * /api/auth/callback:
 *   get:
 *     summary: Consent callback from Docusign
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirects back to frontend with session established
 */
router.get('/callback', async (req, res) => {
  const frontendRedirect = req.session?.docusignConsent?.frontendRedirect || '/';
  const display = req.session?.docusignConsent?.display || 'redirect';

  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      throw createError(400, errorDescription || error);
    }

    if (!code) {
      throw createError(400, 'Missing Docusign consent code');
    }

    if (!req.session?.docusignConsent?.state || state !== req.session.docusignConsent.state) {
      throw createError(400, 'Docusign consent state verification failed');
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;
    const { userInfo } = await getUserInfoFromCode(code, callbackUrl);
    const appSlug = req.session.docusignConsent?.appSlug;
    const appName = req.session.docusignConsent?.appName || appSlug;
    const accounts = normalizeAccounts(userInfo.accounts);

    if (!appSlug) {
      throw createError(400, 'Docusign callback is missing app context');
    }

    req.session.pendingDocusign = {
      appSlug,
      appName,
      userId: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      accounts
    };

    const db = getDb();
    const app = upsertApp(db, { slug: appSlug, name: appName });

    if (accounts.length === 1) {
      upsertConnection(db, app, {
        userId: userInfo.sub,
        accountId: accounts[0].accountId,
        accountName: accounts[0].accountName,
        userName: userInfo.name,
        email: userInfo.email,
        availableAccounts: accounts
      });
      delete req.session.pendingDocusign;
    }

    delete req.session.docusignConsent;

    if (accounts.length > 1) {
      if (display === 'popup') {
        return sendPopupResult(req, res, frontendRedirect, { status: 'select-account' });
      }
      return res.redirect(buildFrontendRedirect(req, frontendRedirect, 'select-account'));
    }

    if (display === 'popup') {
      return sendPopupResult(req, res, frontendRedirect, { status: 'connected' });
    }

    res.redirect(buildFrontendRedirect(req, frontendRedirect, 'connected'));
  } catch (err) {
    console.error('Docusign consent callback error:', err);
    if (req.session?.docusignConsent) {
      delete req.session.docusignConsent;
    }

    if (display === 'popup') {
      return sendPopupResult(req, res, frontendRedirect, { status: 'error', message: err.message });
    }

    res.redirect(buildFrontendRedirect(req, frontendRedirect, 'error', { message: err.message }));
  }
});

/**
 * @swagger
 * /api/auth/account:
 *   post:
 *     summary: Select a Docusign account (if user has multiple)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account selected
 */
router.post('/account', (req, res) => {
  const { accountId } = req.body;
  if (!accountId) {
    return res.status(400).json({ error: 'Missing account ID' });
  }

  const db = getDb();
  const appSlug = getAppSlug(req);
  let pending = req.session?.pendingDocusign;

  if (pending?.appSlug !== appSlug) {
    pending = null;
  }

  let app = appSlug ? getAppBySlug(db, appSlug) : null;
  let connection = app ? getConnectionForApp(db, app.id) : null;
  const availableAccounts = pending?.accounts || connection?.available_accounts || [];
  const account = availableAccounts.find(a => a.accountId === accountId);
  if (!account) {
    return res.status(400).json({ error: 'Invalid account ID' });
  }

  if (pending) {
    app = upsertApp(db, { slug: pending.appSlug, name: pending.appName || pending.appSlug });
  }

  if (!app || !connection && !pending) {
    return res.status(404).json({ error: 'App is not connected to Docusign yet.' });
  }

  upsertConnection(db, app, {
    userId: pending?.userId || connection.docusign_user_id,
    accountId: account.accountId,
    accountName: account.accountName,
    userName: pending?.name || connection.user_name,
    email: pending?.email || connection.email,
    availableAccounts
  });
  if (pending) {
    delete req.session.pendingDocusign;
  }

  res.json({ success: true, account });
});

/**
 * @swagger
 * /api/auth/session:
 *   get:
 *     summary: Get current session info
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Session info or null if not connected
 */
router.get('/session', (req, res) => {
  const db = getDb();
  const appSlug = getAppSlug(req);

  if (req.session?.pendingDocusign && req.session.pendingDocusign.appSlug === appSlug) {
    const pending = req.session.pendingDocusign;
    return res.json({
      connected: false,
      pendingAccountSelection: true,
      email: pending.email,
      name: pending.name,
      accounts: pending.accounts
    });
  }

  if (!appSlug) {
    return res.json({ connected: false });
  }

  const app = getAppBySlug(db, appSlug);
  if (!app) {
    return res.json({ connected: false });
  }

  const ds = getConnectionForApp(db, app.id);
  if (!ds) {
    return res.json({ connected: false });
  }

  res.json({
    connected: true,
    userId: ds.docusign_user_id,
    accountId: ds.docusign_account_id,
    accountName: ds.account_name,
    name: ds.user_name,
    email: ds.email,
    accounts: ds.available_accounts || [],
    app: { slug: app.slug, name: app.name }
  });
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Clear Docusign session
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Session cleared
 */
router.post('/logout', (req, res) => {
  try {
    const db = getDb();
    const appSlug = getAppSlug(req);
    if (!appSlug) {
      throw createError(400, 'Missing app slug');
    }

    const app = getAppBySlug(db, appSlug);
    if (app) {
      clearAppConnection(db, app.id);
    }

    if (req.session?.pendingDocusign?.appSlug === appSlug) {
      delete req.session.pendingDocusign;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
