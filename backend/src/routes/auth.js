const express = require('express');
const { getDb } = require('../database');
const {
  createConsentState,
  getAccessToken,
  getConsentUrl,
  getUserInfoFromCode,
  normalizeScopeString,
  readConsentState
} = require('../docusign-auth');
const {
  clearAppConnection,
  createError,
  getAppBySlug,
  getAppSlug,
  getRequiredApp,
  requireDocusignConnection,
  route,
  upsertApp
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
    return { connected: false, requestedScopes: null };
  }

  const app = getAppBySlug(db, appSlug);
  if (!app) {
    return { connected: false, requestedScopes: null };
  }

  const accounts = Array.isArray(app.docusign_available_accounts) ? app.docusign_available_accounts : [];
  const payload = {
    connected: !!app.docusign_user_id,
    requestedScopes: app.docusign_scopes || null,
    app: {
      slug: app.slug,
      data: app.data || {}
    }
  };

  if (!app.docusign_user_id) {
    return payload;
  }

  return {
    ...payload,
    userId: app.docusign_user_id,
    accountId: app.docusign_account_id,
    accountName: app.docusign_account_name,
    name: app.docusign_user_name,
    email: app.docusign_email,
    accounts,
    accountSelectionRequired: !app.docusign_account_id && accounts.length > 0
  };
}

function requireConnectedApp(db, req) {
  const appSlug = getAppSlug(req);
  const app = appSlug ? getAppBySlug(db, appSlug) : null;

  if (!app || !app.docusign_user_id) {
    throw createError(404, 'App is not connected to Docusign yet.');
  }

  return requireDocusignConnection(app);
}

function resolveRequestedScopes(db, appSlug, explicitScopes) {
  const normalizedExplicitScopes = normalizeScopeString(explicitScopes);
  if (normalizedExplicitScopes) {
    return normalizedExplicitScopes;
  }

  const app = appSlug ? getAppBySlug(db, appSlug) : null;
  const normalizedSavedScopes = normalizeScopeString(app?.docusign_scopes);
  if (normalizedSavedScopes) {
    return normalizedSavedScopes;
  }

  throw createError(400, 'Missing Docusign scopes. Save the requested scopes in Settings before connecting.');
}

router.get('/login', route((req, res) => {
  const appSlug = getAppSlug(req);
  if (!appSlug) {
    throw createError(400, 'Missing app slug. Pass ?app=<slug> when starting Docusign consent.');
  }

  const db = getDb();
  const requestedScopes = resolveRequestedScopes(db, appSlug, req.query.scopes);
  const frontendRedirect = req.query.redirect || req.headers.referer || '/';
  const state = createConsentState({
    frontendRedirect,
    appSlug,
    display: req.query.display === 'popup' ? 'popup' : 'redirect',
    requestedScopes
  });
  const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/callback`;

  res.redirect(getConsentUrl(callbackUrl, state, requestedScopes));
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
    upsertApp(db, {
      slug: consent.appSlug,
      docusignScopes: normalizeScopeString(consent.requestedScopes),
      docusignUserId: userInfo.sub,
      docusignAccountId: null,
      docusignAccountName: null,
      docusignUserName: userInfo.name,
      docusignEmail: userInfo.email,
      docusignAvailableAccounts: accounts
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
  const app = requireConnectedApp(db, req);
  const accounts = Array.isArray(app.docusign_available_accounts) ? app.docusign_available_accounts : [];
  const account = accounts.find((item) => item.accountId === accountId);

  if (!account) {
    throw createError(400, 'Invalid account ID');
  }

  upsertApp(db, {
    slug: app.slug,
    docusignUserId: app.docusign_user_id,
    docusignAccountId: account.accountId,
    docusignAccountName: account.accountName,
    docusignUserName: app.docusign_user_name,
    docusignEmail: app.docusign_email,
    docusignAvailableAccounts: accounts
  });

  res.json({ success: true, account });
}));

router.post('/scopes', route((req, res) => {
  const db = getDb();
  const app = getRequiredApp(db, req);
  const scopes = normalizeScopeString(req.body?.scopes);

  if (!scopes) {
    throw createError(400, 'Missing Docusign scopes');
  }

  const updatedApp = upsertApp(db, {
    slug: app.slug,
    docusignScopes: scopes
  });

  res.json({ success: true, requestedScopes: updatedApp.docusign_scopes });
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
  if (!session.requestedScopes) {
    return res.json({ session, warmed: false, reason: 'missing-scopes' });
  }

  try {
    await getAccessToken(session.userId, session.accountId, session.requestedScopes);
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
  if (getAppBySlug(db, appSlug)) {
    clearAppConnection(db, appSlug);
  }

  res.json({ success: true });
}));

module.exports = router;
