const crypto = require('crypto');

const CONSENT_STATE_MAX_AGE_MS = 60 * 60 * 1000;
const tokenCache = new Map();

function getOauthBase() {
  return process.env.DOCUSIGN_OAUTH_BASE || 'account-d.docusign.com';
}

function getIntegrationKey() {
  const value = String(process.env.DOCUSIGN_INTEGRATION_KEY || '').trim();
  if (!value) {
    throw new Error('Missing DOCUSIGN_INTEGRATION_KEY');
  }
  return value;
}

function getSecretKey() {
  const value = String(process.env.DOCUSIGN_SECRET_KEY || '').trim();
  if (!value) {
    throw new Error('Missing DOCUSIGN_SECRET_KEY');
  }
  return value;
}

function getPrivateKey() {
  const value = String(process.env.DOCUSIGN_RSA_PRIVATE_KEY || '').trim();
  if (!value) {
    throw new Error('Missing DOCUSIGN_RSA_PRIVATE_KEY');
  }
  return value.replace(/\\n/g, '\n');
}

function normalizeScopes(scopes) {
  const requested = Array.isArray(scopes)
    ? scopes
    : String(scopes || '').split(/\s+/);

  return [...new Set(requested.map((scope) => String(scope || '').trim()).filter(Boolean))];
}

function normalizeScopeString(scopes) {
  return normalizeScopes(scopes).join(' ');
}

async function requestJson(url, options, errorLabel) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const details = await response.text().catch(() => response.statusText);
    throw new Error(`${errorLabel}: ${response.status} ${details}`);
  }
  return response.json();
}

function signJwt(value, privateKey) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(value);
  return base64url(signer.sign(privateKey));
}

async function getAccessToken(userId, accountId, scopes) {
  const scopeString = normalizeScopeString(scopes);
  if (!scopeString) {
    throw new Error('Missing Docusign scopes. Save the requested scopes in Settings before retrying.');
  }

  const cacheKey = `${userId}_${accountId}_${scopeString}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const assertionPayload = {
    iss: getIntegrationKey(),
    sub: userId,
    aud: getOauthBase(),
    iat: now,
    exp: now + 3600,
    scope: scopeString
  };
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(assertionPayload));
  const signingInput = `${header}.${payload}`;
  const assertion = `${signingInput}.${signJwt(signingInput, getPrivateKey())}`;

  const tokenData = await requestJson(`https://${getOauthBase()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  }, 'Docusign JWT grant failed');

  tokenCache.set(cacheKey, {
    token: tokenData.access_token,
    expiresAt: Date.now() + (Number(tokenData.expires_in || 0) * 1000)
  });

  return tokenData.access_token;
}

function signValue(value) {
  return base64url(
    crypto.createHmac('sha256', getSecretKey()).update(String(value || '')).digest()
  );
}

function createConsentState(payload = {}) {
  const encodedPayload = base64url(JSON.stringify({
    ...payload,
    iat: Date.now()
  }));
  return `${encodedPayload}.${signValue(encodedPayload)}`;
}

function readConsentState(value) {
  const raw = String(value || '');
  const dotIndex = raw.indexOf('.');
  const encodedPayload = dotIndex >= 0 ? raw.slice(0, dotIndex) : raw;
  const signature = dotIndex >= 0 ? raw.slice(dotIndex + 1) : '';

  if (!encodedPayload || !signature) {
    throw new Error('Docusign consent state verification failed');
  }

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(signValue(encodedPayload));
  if (
    actualBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('Docusign consent state verification failed');
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64url(encodedPayload).toString('utf8'));
  } catch (error) {
    throw new Error('Docusign consent state verification failed');
  }

  if (!payload?.iat || Date.now() - Number(payload.iat) > CONSENT_STATE_MAX_AGE_MS) {
    throw new Error('Docusign consent state expired');
  }

  return payload;
}

function getConsentUrl(redirectUri, state, scopes) {
  const scopeString = normalizeScopeString(scopes);
  if (!scopeString) {
    throw new Error('Missing Docusign scopes');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    scope: scopeString,
    client_id: getIntegrationKey(),
    redirect_uri: redirectUri,
    state,
    prompt: 'login'
  });

  getSecretKey();
  return `https://${getOauthBase()}/oauth/auth?${params.toString()}`;
}

async function getUserInfoFromCode(code, redirectUri) {
  const tokenData = await requestJson(`https://${getOauthBase()}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${getIntegrationKey()}:${getSecretKey()}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    }).toString()
  }, 'Docusign consent code exchange failed');

  const userInfo = await requestJson(`https://${getOauthBase()}/oauth/userinfo`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  }, 'Failed to get user info from Docusign');

  return { userInfo };
}

function base64url(value) {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

module.exports = {
  createConsentState,
  getAccessToken,
  getConsentUrl,
  getUserInfoFromCode,
  normalizeScopeString,
  readConsentState
};
