const crypto = require('crypto');

// In-memory token cache: { [userId_accountId]: { token, expiresAt } }
const tokenCache = new Map();
const REQUIRED_SCOPES = ['signature', 'impersonation', 'aow_manage'];

function normalizeScopes(scopes) {
  const requested = Array.isArray(scopes)
    ? scopes
    : String(scopes || '')
      .split(/\s+/);

  const unique = new Set();
  for (const scope of [...REQUIRED_SCOPES, ...requested]) {
    const normalized = String(scope || '').trim();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function normalizeScopeString(scopes) {
  return normalizeScopes(scopes).join(' ');
}

/**
 * Get a Docusign access token via JWT grant for a specific user.
 * Uses the shared integration key + RSA private key, with the user's ID as the subject.
 */
async function getAccessToken(userId, accountId) {
  const scopeString = normalizeScopeString(REQUIRED_SCOPES);
  const cacheKey = `${userId}_${accountId}_${scopeString}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }

  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const rsaPrivateKey = process.env.DOCUSIGN_RSA_PRIVATE_KEY;
  const oauthBase = process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com';

  if (!integrationKey || !rsaPrivateKey) {
    throw new Error('Missing DOCUSIGN_INTEGRATION_KEY or DOCUSIGN_RSA_PRIVATE_KEY');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: integrationKey,
    sub: userId,
    aud: oauthBase,
    iat: now,
    exp: now + 3600,
    scope: scopeString
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = rsaPrivateKey.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = base64url(sign.sign(key));

  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(`https://${oauthBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Docusign JWT grant failed: ${response.status} ${err}`);
  }

  const data = await response.json();

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  });

  return data.access_token;
}

function createConsentState() {
  return base64url(crypto.randomBytes(24));
}

/**
 * Generate the Docusign consent URL for the JWT-backed integration.
 * The redirect returns a one-time code that is only used to resolve the
 * user's identity and available accounts after consent is granted.
 */
function getConsentUrl(redirectUri, state, scopes) {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const oauthBase = process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com';
  const normalizedScopes = normalizeScopeString(scopes);
  const secretKey = String(process.env.DOCUSIGN_SECRET_KEY || '').trim();

  if (!integrationKey || !secretKey) {
    throw new Error('Missing DOCUSIGN_INTEGRATION_KEY or DOCUSIGN_SECRET_KEY');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    scope: normalizedScopes,
    client_id: integrationKey,
    redirect_uri: redirectUri,
    state,
    prompt: 'login'
  });

  return `https://${oauthBase}/oauth/auth?${params.toString()}`;
}

/**
 * Complete the browser consent redirect and discover the Docusign user.
 * The access token from this exchange is not reused for API operations.
 */
async function getUserInfoFromCode(code, redirectUri) {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const secretKey = String(process.env.DOCUSIGN_SECRET_KEY || '').trim();
  const oauthBase = process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com';

  if (!integrationKey || !secretKey) {
    throw new Error('Missing DOCUSIGN_INTEGRATION_KEY or DOCUSIGN_SECRET_KEY');
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const tokenRes = await fetch(`https://${oauthBase}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${integrationKey}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenParams.toString()
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Docusign consent code exchange failed (${tokenRes.status}): ${err}`);
  }

  const tokenData = await tokenRes.json();

  // Discover user identity with the one-time token
  const userInfoRes = await fetch(`https://${oauthBase}/oauth/userinfo`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
  });

  if (!userInfoRes.ok) {
    throw new Error('Failed to get user info from Docusign');
  }

  const userInfo = await userInfoRes.json();
  return { userInfo };
}

function base64url(str) {
  const buf = typeof str === 'string' ? Buffer.from(str) : str;
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

module.exports = {
  createConsentState,
  getAccessToken,
  getConsentUrl,
  getUserInfoFromCode,
  normalizeScopes,
  normalizeScopeString
};
