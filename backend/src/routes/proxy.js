const express = require('express');
const { getDb } = require('../database');
const { getAccessToken } = require('../services/docusign-auth');
const {
  createError,
  getConnectionForApp,
  getRequiredApp,
  isPlainObject,
  requireSelectedDocusignAccount,
  route
} = require('../utils');

const router = express.Router();
const AUTH_MODES = new Set(['none', 'bearer', 'docusign']);
const BLOCKED_HEADERS = new Set(['connection', 'content-length', 'cookie', 'host', 'origin', 'referer', 'transfer-encoding']);

router.post('/', route(async (req, res) => {
  const proxyRequest = normalizeProxyRequest(req.body);
  const docusign = proxyRequest.authMode === 'docusign' ? getDocusignSession(req) : null;
  const headers = await buildHeaders(req.headers.accept, proxyRequest, docusign);
  const response = await fetch(buildTargetUrl(proxyRequest, docusign), {
    method: proxyRequest.method,
    headers,
    body: ['GET', 'HEAD'].includes(proxyRequest.method) ? undefined : serializeBody(proxyRequest.body, headers)
  });

  await sendProxyResponse(response, res);
}));

function normalizeProxyRequest(body) {
  if (!isPlainObject(body)) {
    throw createError(400, 'Proxy requests must send a JSON object.');
  }

  const authMode = String(body.authMode || 'none').toLowerCase();
  if (!AUTH_MODES.has(authMode)) {
    throw createError(400, `Unsupported authMode: ${authMode}`);
  }

  const method = String(body.method || 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw createError(400, `Unsupported method: ${method}`);
  }

  if (!body.url && !body.path) {
    throw createError(400, 'Missing proxy target. Provide "url" or "path".');
  }

  return {
    method,
    authMode,
    url: body.url,
    path: body.path,
    baseUrl: body.baseUrl || process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi',
    bearerToken: body.bearerToken,
    headers: isPlainObject(body.headers) ? body.headers : {},
    query: isPlainObject(body.query) ? body.query : null,
    body: body.body
  };
}

function getDocusignSession(req) {
  const db = getDb();
  const app = getRequiredApp(db, req);
  const connection = requireSelectedDocusignAccount(getConnectionForApp(db, app.id));
  const scopes = String(app.docusign_scopes || '').trim();

  if (!scopes) {
    throw createError(409, 'Docusign scopes are not configured for this app. Open Settings and save the requested scopes.');
  }

  return {
    userId: connection.docusign_user_id,
    accountId: connection.docusign_account_id,
    scopes
  };
}

function replaceDocusignPlaceholders(value, docusign) {
  return docusign && typeof value === 'string'
    ? value.replace(/\{accountId\}/g, docusign.accountId || '')
    : value;
}

function appendQuery(url, query) {
  if (!query) {
    return;
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
      return;
    }

    url.searchParams.append(key, value);
  });
}

function buildTargetUrl(proxyRequest, docusign) {
  const base = replaceDocusignPlaceholders(proxyRequest.baseUrl, docusign);
  const target = proxyRequest.url
    ? new URL(replaceDocusignPlaceholders(proxyRequest.url, docusign))
    : new URL(
      replaceDocusignPlaceholders(proxyRequest.path, docusign),
      base.endsWith('/') ? base : `${base}/`
    );

  appendQuery(target, proxyRequest.query);
  return target.toString();
}

function setRequestedHeaders(headers, requestedHeaders) {
  Object.entries(requestedHeaders).forEach(([key, value]) => {
    if (!key || value === undefined || BLOCKED_HEADERS.has(key.toLowerCase())) {
      return;
    }

    headers[key] = value;
  });
}

function hasHeader(headers, name) {
  const expected = String(name || '').toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === expected);
}

async function buildHeaders(acceptHeader, proxyRequest, docusign) {
  const headers = {};

  if (acceptHeader) {
    headers.Accept = acceptHeader;
  }

  setRequestedHeaders(headers, proxyRequest.headers);

  if (
    proxyRequest.body !== undefined
    && !hasHeader(headers, 'content-type')
    && (isPlainObject(proxyRequest.body) || Array.isArray(proxyRequest.body))
  ) {
    headers['Content-Type'] = 'application/json';
  }

  if (proxyRequest.authMode === 'bearer') {
    if (!proxyRequest.bearerToken) {
      throw createError(400, 'Missing bearerToken for authMode=bearer');
    }
    headers.Authorization = `Bearer ${proxyRequest.bearerToken}`;
  }

  if (proxyRequest.authMode === 'docusign') {
    headers.Authorization = `Bearer ${await getAccessToken(docusign.userId, docusign.accountId, docusign.scopes)}`;
  }

  return headers;
}

function serializeBody(body, headers) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === 'string' || body instanceof Buffer) {
    return body;
  }

  const contentTypeHeader = Object.keys(headers).find((key) => key.toLowerCase() === 'content-type');
  const contentType = contentTypeHeader ? String(headers[contentTypeHeader] || '') : '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(body).toString();
  }
  if (contentType.startsWith('text/')) {
    return String(body);
  }

  return JSON.stringify(body);
}

async function sendProxyResponse(response, res) {
  const contentType = response.headers.get('content-type');
  const cacheControl = response.headers.get('cache-control');
  const contentDisposition = response.headers.get('content-disposition');

  if (contentType) {
    res.set('Content-Type', contentType);
  }
  if (cacheControl) {
    res.set('Cache-Control', cacheControl);
  }
  if (contentDisposition) {
    res.set('Content-Disposition', contentDisposition);
  }

  res.status(response.status);

  if (contentType && contentType.includes('application/json')) {
    return res.json(await response.json());
  }
  if (contentType && (contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('javascript'))) {
    return res.send(await response.text());
  }

  return res.send(Buffer.from(await response.arrayBuffer()));
}

module.exports = router;
