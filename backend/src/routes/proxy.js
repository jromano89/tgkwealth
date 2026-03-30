const express = require('express');
const { getDb } = require('../database');
const { getAccessToken } = require('../services/docusign-auth');
const {
  asyncRoute,
  createError,
  getConnectionForApp,
  getRequiredApp,
  isPlainObject,
  requireSelectedDocusignAccount
} = require('../utils');

const router = express.Router();
const SUPPORTED_AUTH_MODES = new Set(['none', 'bearer', 'docusign']);
const BLOCKED_PROXY_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
  'transfer-encoding'
]);

router.post('/', asyncRoute(async (req, res) => {
  const proxyRequest = readProxyRequest(req);
  const authMode = getAuthMode(proxyRequest);
  const docusign = authMode === 'docusign' ? getDocusignSession(req) : null;
  const method = getUpstreamMethod(proxyRequest);
  const headers = await buildOutboundHeaders(req.headers.accept, authMode, proxyRequest, docusign);
  const response = await fetch(buildTargetUrl(proxyRequest, docusign), {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : getOutboundBody(proxyRequest, headers)
  });

  await forwardResponse(response, res);
}));

function readProxyRequest(req) {
  if (!isPlainObject(req.body)) {
    throw createError(400, 'Proxy requests must send a JSON object.');
  }

  return req.body;
}

function getAuthMode(proxyRequest) {
  const authMode = String(proxyRequest.authMode || 'none').toLowerCase();
  if (!SUPPORTED_AUTH_MODES.has(authMode)) {
    throw createError(400, `Unsupported authMode: ${authMode}`);
  }
  return authMode;
}

function getUpstreamMethod(proxyRequest) {
  const method = String(proxyRequest.method || 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw createError(400, `Unsupported method: ${method}`);
  }
  return method;
}

function getDocusignSession(req) {
  const db = getDb();
  const app = getRequiredApp(db, req);
  const connection = requireSelectedDocusignAccount(getConnectionForApp(db, app.id));
  return {
    userId: connection.docusign_user_id,
    accountId: connection.docusign_account_id
  };
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function applyDocusignPlaceholders(value, docusign) {
  if (!docusign || typeof value !== 'string') {
    return value;
  }

  return value.replace(/\{accountId\}/g, docusign.accountId || '');
}

function appendQueryValue(searchParams, key, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => searchParams.append(key, item));
    return;
  }

  searchParams.append(key, value);
}

function appendQueryParams(url, query) {
  if (!isPlainObject(query)) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      appendQueryValue(url.searchParams, key, value);
    }
  }
}

function buildTargetUrl(proxyRequest, docusign) {
  const rawUrl = proxyRequest.url;
  const rawPath = proxyRequest.path;

  if (!rawUrl && !rawPath) {
    throw createError(400, 'Missing proxy target. Provide "url" or "path".');
  }

  const url = rawUrl
    ? new URL(applyDocusignPlaceholders(rawUrl, docusign))
    : new URL(
      applyDocusignPlaceholders(rawPath, docusign),
      ensureTrailingSlash(applyDocusignPlaceholders(
        proxyRequest.baseUrl || process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi',
        docusign
      ))
    );

  appendQueryParams(url, proxyRequest.query);
  return url.toString();
}

function setRequestedHeaders(headers, requestedHeaders) {
  if (!isPlainObject(requestedHeaders)) {
    return;
  }

  for (const [key, value] of Object.entries(requestedHeaders)) {
    if (!key || value === undefined || BLOCKED_PROXY_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    headers[key] = value;
  }
}

function hasContentType(headers) {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
}

async function buildOutboundHeaders(acceptHeader, authMode, proxyRequest, docusign) {
  const headers = {};

  if (acceptHeader) {
    headers.Accept = acceptHeader;
  }

  setRequestedHeaders(headers, proxyRequest.headers);

  if (
    proxyRequest.body !== undefined
    && !hasContentType(headers)
    && (isPlainObject(proxyRequest.body) || Array.isArray(proxyRequest.body))
  ) {
    headers['Content-Type'] = 'application/json';
  }

  if (authMode === 'bearer') {
    if (!proxyRequest.bearerToken) {
      throw createError(400, 'Missing bearerToken for authMode=bearer');
    }
    headers.Authorization = `Bearer ${proxyRequest.bearerToken}`;
  }

  if (authMode === 'docusign') {
    headers.Authorization = `Bearer ${await getAccessToken(docusign.userId, docusign.accountId)}`;
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
  if (contentType.includes('text/')) {
    return String(body);
  }

  return JSON.stringify(body);
}

function getOutboundBody(proxyRequest, headers) {
  return serializeBody(proxyRequest.body, headers);
}

async function forwardResponse(response, res) {
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

  res.send(Buffer.from(await response.arrayBuffer()));
}

module.exports = router;
