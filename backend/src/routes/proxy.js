const express = require('express');
const { getAccessToken } = require('../services/docusign-auth');
const { createError, getConnectionForApp, getRequiredApp } = require('../utils');

const router = express.Router();
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
  'transfer-encoding'
]);
const CONTROL_QUERY_KEYS = new Set([
  'method',
  'authMode',
  'baseUrl',
  'bearerToken',
  'url'
]);

/**
 * @swagger
 * /api/proxy:
 *   all:
 *     summary: Generic CORS pass-through to an arbitrary URL
 *     tags: [Proxy]
 *     description: |
 *       Proxies requests to a target URL to avoid browser CORS restrictions.
 *       You can invoke it in one of two ways:
 *       1. POST /api/proxy with JSON body containing { method, url, headers, body, authMode, bearerToken }
 *       2. GET /api/proxy?url=https://example.com/feed.xml&authMode=none
 *
 *       authMode:
 *       - none: no Authorization header is added
 *       - bearer: adds Authorization: Bearer <bearerToken>
 *       - docusign: resolves a Docusign access token from the current session
 *
 *       Existing /api/proxy/{path} Docusign-style calls remain supported for backward compatibility.
 */
router.all('/', handleProxy);

/**
 * @swagger
 * /api/proxy/{path}:
 *   all:
 *     summary: Backward-compatible proxy for relative paths
 *     tags: [Proxy]
 *     description: |
 *       Legacy route preserved for compatibility. Relative paths default to Docusign auth and
 *       DOCUSIGN_API_BASE unless authMode/baseUrl are provided explicitly.
 */
router.all('/*', handleProxy);

async function handleProxy(req, res) {
  try {
    const authMode = getAuthMode(req);
    const docusign = authMode === 'docusign' ? getDocusignSession(req) : null;
    const upstreamMethod = getUpstreamMethod(req);
    const targetUrl = buildTargetUrl(req, docusign);
    const fetchOptions = await buildFetchOptions(req, authMode, docusign, upstreamMethod);
    const response = await fetch(targetUrl, fetchOptions);

    forwardResponse(response, res);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('Proxy error:', err);
    res.status(status).json({ error: err.message });
  }
}

function getControlValue(req, key) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && req.body[key] !== undefined) {
    return req.body[key];
  }
  if (req.query && req.query[key] !== undefined) {
    return req.query[key];
  }
  return undefined;
}

function hasLegacyPath(req) {
  return !!(req.params && req.params[0]);
}

function getAuthMode(req) {
  const authMode = String(getControlValue(req, 'authMode') || (hasLegacyPath(req) ? 'docusign' : 'none')).toLowerCase();
  if (!['none', 'bearer', 'docusign'].includes(authMode)) {
    const err = new Error(`Unsupported authMode: ${authMode}`);
    err.statusCode = 400;
    throw err;
  }
  return authMode;
}

function getUpstreamMethod(req) {
  const method = String(getControlValue(req, 'method') || req.method).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    const err = new Error(`Unsupported method: ${method}`);
    err.statusCode = 400;
    throw err;
  }
  return method;
}

function getDocusignSession(req) {
  const { getDb } = require('../db/database');
  const db = getDb();
  const app = getRequiredApp(db, req);
  const connection = getConnectionForApp(db, app.id);
  if (!connection) {
    throw createError(401, 'No active Docusign connection for this app. Use /api/auth/login to connect.');
  }
  return {
    userId: connection.docusign_user_id,
    accountId: connection.docusign_account_id
  };
}

function buildTargetUrl(req, docusign) {
  const explicitUrl = getControlValue(req, 'url');
  if (explicitUrl) {
    return applyDocusignPlaceholders(explicitUrl, docusign);
  }

  const path = hasLegacyPath(req)
    ? req.params[0]
    : getControlValue(req, 'path');

  if (!path) {
    const err = new Error('Missing proxy target. Provide "url" or a relative path.');
    err.statusCode = 400;
    throw err;
  }

  const baseUrl = getControlValue(req, 'baseUrl') || process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi';
  const resolvedBase = applyDocusignPlaceholders(baseUrl, docusign);
  const resolvedPath = applyDocusignPlaceholders(path, docusign);
  const url = new URL(resolvedPath, ensureTrailingSlash(resolvedBase));

  if (hasLegacyPath(req)) {
    for (const [key, value] of Object.entries(req.query || {})) {
      if (CONTROL_QUERY_KEYS.has(key) || value === undefined) continue;
      appendQueryValue(url.searchParams, key, value);
    }
  } else if (req.body && typeof req.body === 'object' && req.body.query && typeof req.body.query === 'object') {
    for (const [key, value] of Object.entries(req.body.query)) {
      appendQueryValue(url.searchParams, key, value);
    }
  }

  return url.toString();
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function applyDocusignPlaceholders(value, docusign) {
  if (!docusign || typeof value !== 'string') return value;
  return value.replace(/\{accountId\}/g, docusign.accountId || '');
}

function appendQueryValue(searchParams, key, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, item);
    }
    return;
  }
  searchParams.append(key, value);
}

async function buildFetchOptions(req, authMode, docusign, upstreamMethod) {
  const headers = buildOutboundHeaders(req);

  if (authMode === 'bearer') {
    const bearerToken = getControlValue(req, 'bearerToken');
    if (!bearerToken) {
      const err = new Error('Missing bearerToken for authMode=bearer');
      err.statusCode = 400;
      throw err;
    }
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  if (authMode === 'docusign') {
    const token = await getAccessToken(docusign.userId, docusign.accountId);
    headers.Authorization = `Bearer ${token}`;
  }

  const fetchOptions = {
    method: upstreamMethod,
    headers
  };

  if (upstreamMethod !== 'GET' && upstreamMethod !== 'HEAD') {
    const outboundBody = getOutboundBody(req);
    if (outboundBody !== undefined) {
      fetchOptions.body = outboundBody;
    }
  }

  return fetchOptions;
}

function buildOutboundHeaders(req) {
  const headers = {};
  const requestedHeaders = req.body && typeof req.body === 'object' && !Array.isArray(req.body) && req.body.headers
    ? req.body.headers
    : null;

  if (req.headers.accept) {
    headers.Accept = req.headers.accept;
  }

  if (requestedHeaders && typeof requestedHeaders === 'object') {
    for (const [key, value] of Object.entries(requestedHeaders)) {
      if (!key || value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      headers[key] = value;
    }
  } else if (req.headers['content-type'] && !hasControlEnvelope(req)) {
    headers['Content-Type'] = req.headers['content-type'];
  } else if (
    hasControlEnvelope(req)
    && req.body?.body !== undefined
    && (typeof req.body.body === 'object' || Array.isArray(req.body.body))
    && !(req.body.body instanceof Buffer)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function hasControlEnvelope(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return false;
  }

  return ['url', 'path', 'baseUrl', 'authMode', 'bearerToken', 'headers', 'query'].some(key => req.body[key] !== undefined);
}

function getOutboundBody(req) {
  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  if (hasControlEnvelope(req)) {
    if (req.body.body === undefined) {
      return undefined;
    }
    return serializeBody(req.body.body, req.body.headers);
  }

  return serializeBody(req.body, { 'Content-Type': req.headers['content-type'] });
}

function serializeBody(body, headers = {}) {
  if (body === undefined || body === null) {
    return undefined;
  }

  const contentTypeHeader = Object.keys(headers || {}).find(key => key.toLowerCase() === 'content-type');
  const contentType = contentTypeHeader ? String(headers[contentTypeHeader] || '') : '';

  if (typeof body === 'string' || body instanceof Buffer) {
    return body;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(body).toString();
  }

  if (contentType.includes('text/')) {
    return String(body);
  }

  return JSON.stringify(body);
}

async function forwardResponse(response, res) {
  const contentType = response.headers.get('content-type');
  if (contentType) {
    res.set('Content-Type', contentType);
  }

  const cacheControl = response.headers.get('cache-control');
  if (cacheControl) {
    res.set('Cache-Control', cacheControl);
  }

  res.status(response.status);

  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    return res.json(data);
  }

  if (contentType && (contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('javascript'))) {
    const text = await response.text();
    return res.send(text);
  }

  const buffer = await response.arrayBuffer();
  return res.send(Buffer.from(buffer));
}

module.exports = router;
