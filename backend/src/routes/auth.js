const express = require('express');
const { getDb } = require('../database');
const {
  createConsentState,
  getAccessToken,
  getConsentUrl,
  getUserInfoFromCode,
  readConsentState
} = require('../services/docusign-auth');
const {
  clearAppConnection,
  createError,
  getAppBySlug,
  getAppSlug,
  getConnectionForApp,
  route,
  upsertApp,
  upsertConnection
} = require('../utils');

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

function toAbsoluteUrl(req, value) {
  return new URL(value || '/', `${req.protocol}://${req.get('host')}`);
}

function buildFrontendRedirect(req, frontendRedirect, status, extras = {}) {
  const url = toAbsoluteUrl(req, frontendRedirect);
  url.searchParams.set('docusign', status);

  Object.entries(extras).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function sendPopupResult(req, res, frontendRedirect, payload) {
  const redirectUrl = buildFrontendRedirect(
    req,
    frontendRedirect,
    payload.status,
    payload.message ? { message: payload.message } : {}
  );
  const targetOrigin = toAbsoluteUrl(req, frontendRedirect).origin;
  const serializedPayload = JSON.stringify({ source: 'tgk-docusign-auth', ...payload });

  res.type('html').send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Docusign Connection</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a}
      .card{max-width:360px;padding:24px;border-radius:18px;background:#fff;box-shadow:0 12px 32px rgba(15,23,42,.12);text-align:center}
      p{margin:0;font-size:14px;line-height:1.5;color:#475569}
    </style>
  </head>
  <body>
    <div class="card">
      <p>Finishing your Docusign connection. This window should close automatically.</p>
    </div>
    <script>
      const payload = ${serializedPayload};
      const targetOrigin = ${JSON.stringify(targetOrigin)};
      const redirectUrl = ${JSON.stringify(redirectUrl)};

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

  const connection = getConnectionForApp(db, app.id);
  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    userId: connection.docusign_user_id,
    accountId: connection.docusign_account_id,
    accountName: connection.account_name,
    name: connection.user_name,
    email: connection.email,
    accounts: connection.available_accounts || [],
    accountSelectionRequired: !connection.docusign_account_id && (connection.available_accounts || []).length > 0,
    app: { slug: app.slug, name: app.name }
  };
}

function requireConnectedApp(db, req) {
  const appSlug = getAppSlug(req);
  const app = appSlug ? getAppBySlug(db, appSlug) : null;
  const connection = app ? getConnectionForApp(db, app.id) : null;

  if (!app || !connection) {
    throw createError(404, 'App is not connected to Docusign yet.');
  }

  return { app, connection };
}

router.get('/login', route((req, res) => {
  const appSlug = getAppSlug(req);
  if (!appSlug) {
    throw createError(400, 'Missing app slug. Pass ?app=<slug> when starting Docusign consent.');
  }

  const frontendRedirect = req.query.redirect || req.headers.referer || '/';
  const state = createConsentState({
    frontendRedirect,
    appSlug,
    appName: req.query.appName || null,
    display: req.query.display === 'popup' ? 'popup' : 'redirect'
  });
  const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;

  res.redirect(getConsentUrl(callbackUrl, state, req.query.scopes));
}));

router.get('/callback', route(async (req, res) => {
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
    if (!consent?.appSlug) {
      throw createError(400, 'Docusign callback is missing app context');
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;
    const { userInfo } = await getUserInfoFromCode(code, callbackUrl);
    const accounts = normalizeAccounts(userInfo.accounts);
    if (accounts.length === 0) {
      throw createError(400, 'No Docusign accounts were returned for this user.');
    }

    const db = getDb();
    const app = upsertApp(db, {
      slug: consent.appSlug,
      name: consent.appName || consent.appSlug
    });

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

    return res.redirect(buildFrontendRedirect(req, frontendRedirect, 'connected'));
  } catch (error) {
    console.error('Docusign consent callback error:', error);

    if (display === 'popup') {
      return sendPopupResult(req, res, frontendRedirect, { status: 'error', message: error.message });
    }

    return res.redirect(buildFrontendRedirect(req, frontendRedirect, 'error', { message: error.message }));
  }
}));

router.post('/account', route((req, res) => {
  const accountId = String(req.body?.accountId || '').trim();
  if (!accountId) {
    throw createError(400, 'Missing account ID');
  }

  const db = getDb();
  const { app, connection } = requireConnectedApp(db, req);
  const accounts = connection.available_accounts || [];
  const account = accounts.find((item) => item.accountId === accountId);

  if (!account) {
    throw createError(400, 'Invalid account ID');
  }

  upsertConnection(db, app, {
    userId: connection.docusign_user_id,
    accountId: account.accountId,
    accountName: account.accountName,
    userName: connection.user_name,
    email: connection.email,
    availableAccounts: accounts
  });

  res.json({ success: true, account });
}));

router.get('/session', route((req, res) => {
  res.json(getSessionPayload(getDb(), getAppSlug(req)));
}));

router.get('/prewarm', route(async (req, res) => {
  const session = getSessionPayload(getDb(), getAppSlug(req));

  if (!session.connected) {
    return res.json({ session, warmed: false, reason: 'not-connected' });
  }
  if (!session.accountId) {
    return res.json({ session, warmed: false, reason: 'account-selection-required' });
  }

  try {
    await getAccessToken(session.userId, session.accountId);
    return res.json({ session, warmed: true });
  } catch (error) {
    console.warn('Docusign auth prewarm failed:', error.message);
    return res.json({ session, warmed: false, reason: 'token-warmup-failed' });
  }
}));

router.post('/logout', route((req, res) => {
  const appSlug = getAppSlug(req);
  if (!appSlug) {
    throw createError(400, 'Missing app slug');
  }

  const db = getDb();
  const app = getAppBySlug(db, appSlug);
  if (app) {
    clearAppConnection(db, app.id);
  }

  res.json({ success: true });
}));

module.exports = router;
