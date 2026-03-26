const express = require('express');
const { getDb } = require('../db/database');
const {
  createConsentState,
  getAccessToken,
  getConsentUrl,
  getUserInfoFromCode,
  readConsentState
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

function getSessionPayload(db, appSlug) {
  if (!appSlug) {
    return { connected: false };
  }

  const app = getAppBySlug(db, appSlug);
  if (!app) {
    return { connected: false };
  }

  const ds = getConnectionForApp(db, app.id);
  if (!ds) {
    return { connected: false };
  }

  return {
    connected: true,
    userId: ds.docusign_user_id,
    accountId: ds.docusign_account_id,
    accountName: ds.account_name,
    name: ds.user_name,
    email: ds.email,
    accounts: ds.available_accounts || [],
    accountSelectionRequired: !ds.docusign_account_id && (ds.available_accounts || []).length > 0,
    app: { slug: app.slug, name: app.name }
  };
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

  const frontendRedirect = req.query.redirect || req.headers.referer || '/';
  const consentState = createConsentState({
    frontendRedirect,
    appSlug,
    appName: req.query.appName || null,
    display: req.query.display === 'popup' ? 'popup' : 'redirect'
  });

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
  let frontendRedirect = '/';
  let display = 'redirect';

  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    const consent = state ? readConsentState(state) : null;
    frontendRedirect = consent?.frontendRedirect || '/';
    display = consent?.display === 'popup' ? 'popup' : 'redirect';

    if (error) {
      throw createError(400, errorDescription || error);
    }

    if (!code) {
      throw createError(400, 'Missing Docusign consent code');
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;
    const { userInfo } = await getUserInfoFromCode(code, callbackUrl);
    const appSlug = consent?.appSlug;
    const appName = consent?.appName || appSlug;
    const accounts = normalizeAccounts(userInfo.accounts);

    if (!appSlug) {
      throw createError(400, 'Docusign callback is missing app context');
    }
    if (accounts.length === 0) {
      throw createError(400, 'No Docusign accounts were returned for this user.');
    }

    const db = getDb();
    const app = upsertApp(db, { slug: appSlug, name: appName });

    upsertConnection(db, app, {
      userId: userInfo.sub,
      accountId: null,
      accountName: null,
      userName: userInfo.name,
      email: userInfo.email,
      availableAccounts: accounts
    });

    if (display === 'popup') {
      return sendPopupResult(req, res, frontendRedirect, { status: 'connected' });
    }

    res.redirect(buildFrontendRedirect(req, frontendRedirect, 'connected'));
  } catch (err) {
    console.error('Docusign consent callback error:', err);

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
  let app = appSlug ? getAppBySlug(db, appSlug) : null;
  let connection = app ? getConnectionForApp(db, app.id) : null;
  if (!app || !connection) {
    return res.status(404).json({ error: 'App is not connected to Docusign yet.' });
  }

  const availableAccounts = connection.available_accounts || [];
  const account = availableAccounts.find((item) => item.accountId === accountId);
  if (!account) {
    return res.status(400).json({ error: 'Invalid account ID' });
  }

  upsertConnection(db, app, {
    userId: connection.docusign_user_id,
    accountId: account.accountId,
    accountName: account.accountName,
    userName: connection.user_name,
    email: connection.email,
    availableAccounts
  });

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
  res.json(getSessionPayload(db, getAppSlug(req)));
});

/**
 * @swagger
 * /api/auth/prewarm:
 *   get:
 *     summary: Warm the Docusign JWT token cache for the current app connection
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Returns session info and whether token warmup completed
 */
router.get('/prewarm', async (req, res) => {
  const db = getDb();
  const session = getSessionPayload(db, getAppSlug(req));

  if (!session.connected) {
    return res.json({ session, warmed: false, reason: 'not-connected' });
  }

  if (!session.accountId) {
    return res.json({ session, warmed: false, reason: 'account-selection-required' });
  }

  try {
    await getAccessToken(session.userId, session.accountId);
    return res.json({ session, warmed: true });
  } catch (err) {
    console.warn('Docusign auth prewarm failed:', err.message);
    return res.json({ session, warmed: false, reason: 'token-warmup-failed' });
  }
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

    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
