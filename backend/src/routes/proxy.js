const express = require('express');
const { getAccessToken } = require('../services/docusign-auth');
const {
  createError,
  getConnectionForApp,
  getRequiredApp,
  isPlainObject,
  requireSelectedDocusignAccount
} = require('../utils');

const router = express.Router();
const SUPPORTED_AUTH_MODES = new Set(['none', 'bearer', 'docusign']);
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
const CONTROL_BODY_KEYS = ['url', 'path', 'baseUrl', 'authMode', 'bearerToken', 'headers', 'query'];

/**
 * @swagger
 * /api/proxy:
 *   post:
 *     summary: Generic CORS pass-through proxy
 *     tags: [Proxy]
 *     description: |
 *       Proxies a request to a target URL to avoid browser CORS restrictions.
 *       The proxy resolves the target from the JSON body and forwards the request,
 *       returning the upstream response as-is.
 *
 *       **Auth modes**
 *       | Mode | Behavior |
 *       |------|----------|
 *       | `none` | No Authorization header (default) |
 *       | `bearer` | Adds `Authorization: Bearer <bearerToken>` |
 *       | `docusign` | Resolves a Docusign access token from the current app connection and adds it as a Bearer token. `{accountId}` placeholders in `url`, `path`, and `baseUrl` are replaced with the connected account ID. |
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method:
 *                 type: string
 *                 description: HTTP method for the upstream request.
 *                 default: GET
 *                 example: POST
 *               url:
 *                 type: string
 *                 description: Absolute target URL. Mutually exclusive with `path`/`baseUrl`.
 *                 example: https://api.example.com/v1/resource
 *               path:
 *                 type: string
 *                 description: Relative path appended to `baseUrl`. Use instead of `url` when a base is shared.
 *                 example: /v1/accounts/{accountId}/workflows/abc123/actions/trigger
 *               baseUrl:
 *                 type: string
 *                 description: Base URL for relative `path`. Defaults to the Docusign eSign REST API base.
 *                 example: https://api-d.docusign.com
 *               authMode:
 *                 type: string
 *                 enum: [none, bearer, docusign]
 *                 default: none
 *               bearerToken:
 *                 type: string
 *                 description: Required when `authMode` is `bearer`.
 *               headers:
 *                 type: object
 *                 description: Additional headers to send upstream. Hop-by-hop headers (host, cookie, etc.) are stripped.
 *                 additionalProperties:
 *                   type: string
 *               query:
 *                 type: object
 *                 description: Query-string parameters appended to the target URL.
 *                 additionalProperties:
 *                   type: string
 *               body:
 *                 description: Body to send upstream. Objects are JSON-serialised automatically.
 *           examples:
 *             docusign-maestro:
 *               summary: Trigger a Docusign Maestro workflow
 *               value:
 *                 method: POST
 *                 path: /v1/accounts/{accountId}/workflows/7cc7fa67-843e-4e45-8ea8-80f451819028/actions/trigger
 *                 baseUrl: https://api-d.docusign.com
 *                 authMode: docusign
 *                 body:
 *                   instance_name: Account Opening 2025-01-15
 *                   trigger_inputs: {}
 *             external-api:
 *               summary: Fetch from an external API with a bearer token
 *               value:
 *                 method: GET
 *                 url: https://api.example.com/v1/data
 *                 authMode: bearer
 *                 bearerToken: eyJhbGciOi...
 *             simple-get:
 *               summary: Simple GET with no auth
 *               value:
 *                 method: GET
 *                 url: https://example.com/feed.xml
 *                 authMode: none
 *     responses:
 *       200:
 *         description: Upstream response forwarded as-is. Content-Type matches the upstream response.
 *       400:
 *         description: Bad request — missing target URL, unsupported authMode, or missing bearerToken.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: No active Docusign connection (when authMode is `docusign`).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *   get:
 *     summary: Proxy via query parameters
 *     tags: [Proxy]
 *     description: |
 *       Lightweight alternative for simple GET requests. Pass the target URL and auth mode as query parameters.
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: Absolute target URL.
 *       - in: query
 *         name: authMode
 *         schema:
 *           type: string
 *           enum: [none, bearer, docusign]
 *           default: none
 *       - in: query
 *         name: bearerToken
 *         schema:
 *           type: string
 *         description: Required when `authMode` is `bearer`.
 *     responses:
 *       200:
 *         description: Upstream response forwarded as-is.
 *
 * /api/proxy/{path}:
 *   all:
 *     summary: Legacy path-based proxy (backward-compatible)
 *     tags: [Proxy]
 *     description: |
 *       Proxies to a relative Docusign API path. Defaults to `authMode: docusign` and uses
 *       the configured `DOCUSIGN_API_BASE` as the base URL. Query parameters are forwarded
 *       to the upstream request.
 *
 *       Prefer `POST /api/proxy` with an explicit body for new integrations.
 *     parameters:
 *       - in: path
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Relative path appended to DOCUSIGN_API_BASE.
 *         example: v2.1/accounts/{accountId}/envelopes
 *     responses:
 *       200:
 *         description: Upstream response forwarded as-is.
 */
router.all('/', handleProxy);
router.all('/*', handleProxy);

async function handleProxy(req, res) {
  try {
    const context = await buildProxyContext(req);
    const targetUrl = buildTargetUrl(req, context);
    const fetchOptions = await buildFetchOptions(req, context);
    const response = await fetch(targetUrl, fetchOptions);

    await forwardResponse(response, res);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
}

function hasLegacyPath(req) {
  return !!(req.params && req.params[0]);
}

function getBodyEnvelope(req) {
  return isPlainObject(req.body) ? req.body : null;
}

function getControlEnvelope(req) {
  const body = getBodyEnvelope(req);
  if (!body) {
    return null;
  }

  return CONTROL_BODY_KEYS.some((key) => body[key] !== undefined) ? body : null;
}

function getControlValue(req, key) {
  const body = getBodyEnvelope(req);
  if (body && body[key] !== undefined) {
    return body[key];
  }

  if (req.query && req.query[key] !== undefined) {
    return req.query[key];
  }

  return undefined;
}

function getAuthMode(req, isLegacyRequest) {
  const authMode = String(getControlValue(req, 'authMode') || (isLegacyRequest ? 'docusign' : 'none')).toLowerCase();
  if (!SUPPORTED_AUTH_MODES.has(authMode)) {
    throw createError(400, `Unsupported authMode: ${authMode}`);
  }
  return authMode;
}

function getUpstreamMethod(req) {
  const method = String(getControlValue(req, 'method') || req.method).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw createError(400, `Unsupported method: ${method}`);
  }
  return method;
}

function getDocusignSession(req) {
  const db = require('../db/database').getDb();
  const app = getRequiredApp(db, req);
  const connection = requireSelectedDocusignAccount(getConnectionForApp(db, app.id));
  return {
    userId: connection.docusign_user_id,
    accountId: connection.docusign_account_id
  };
}

async function buildProxyContext(req) {
  const legacyRequest = hasLegacyPath(req);
  const authMode = getAuthMode(req, legacyRequest);
  return {
    authMode,
    controlEnvelope: getControlEnvelope(req),
    docusign: authMode === 'docusign' ? getDocusignSession(req) : null,
    isLegacyRequest: legacyRequest,
    upstreamMethod: getUpstreamMethod(req)
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
    for (const item of value) {
      searchParams.append(key, item);
    }
    return;
  }

  searchParams.append(key, value);
}

function appendQueryParams(url, query) {
  if (!isPlainObject(query)) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    appendQueryValue(url.searchParams, key, value);
  }
}

function buildTargetUrl(req, context) {
  const explicitUrl = getControlValue(req, 'url');
  if (explicitUrl) {
    return applyDocusignPlaceholders(explicitUrl, context.docusign);
  }

  const path = context.isLegacyRequest ? req.params[0] : getControlValue(req, 'path');
  if (!path) {
    throw createError(400, 'Missing proxy target. Provide "url" or a relative path.');
  }

  const baseUrl = getControlValue(req, 'baseUrl') || process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi';
  const resolvedUrl = new URL(
    applyDocusignPlaceholders(path, context.docusign),
    ensureTrailingSlash(applyDocusignPlaceholders(baseUrl, context.docusign))
  );

  if (context.isLegacyRequest) {
    for (const [key, value] of Object.entries(req.query || {})) {
      if (CONTROL_QUERY_KEYS.has(key) || value === undefined) {
        continue;
      }
      appendQueryValue(resolvedUrl.searchParams, key, value);
    }
  } else {
    appendQueryParams(resolvedUrl, context.controlEnvelope?.query);
  }

  return resolvedUrl.toString();
}

function buildOutboundHeaders(req, context) {
  const headers = {};
  const requestedHeaders = isPlainObject(context.controlEnvelope?.headers) ? context.controlEnvelope.headers : null;

  if (req.headers.accept) {
    headers.Accept = req.headers.accept;
  }

  if (requestedHeaders) {
    for (const [key, value] of Object.entries(requestedHeaders)) {
      if (!key || value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        continue;
      }
      headers[key] = value;
    }
    return headers;
  }

  if (req.headers['content-type'] && !context.controlEnvelope) {
    headers['Content-Type'] = req.headers['content-type'];
    return headers;
  }

  const controlBody = context.controlEnvelope?.body;
  if (
    controlBody !== undefined
    && (isPlainObject(controlBody) || Array.isArray(controlBody))
    && !(controlBody instanceof Buffer)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

function serializeBody(body, headers = {}) {
  if (body === undefined || body === null) {
    return undefined;
  }

  const contentTypeHeader = Object.keys(headers).find((key) => key.toLowerCase() === 'content-type');
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

function getOutboundBody(req, context) {
  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  if (context.controlEnvelope) {
    if (context.controlEnvelope.body === undefined) {
      return undefined;
    }
    return serializeBody(context.controlEnvelope.body, context.controlEnvelope.headers);
  }

  return serializeBody(req.body, { 'Content-Type': req.headers['content-type'] });
}

async function applyAuthorization(req, headers, context) {
  if (context.authMode === 'bearer') {
    const bearerToken = getControlValue(req, 'bearerToken');
    if (!bearerToken) {
      throw createError(400, 'Missing bearerToken for authMode=bearer');
    }
    headers.Authorization = `Bearer ${bearerToken}`;
    return;
  }

  if (context.authMode === 'docusign') {
    const token = await getAccessToken(context.docusign.userId, context.docusign.accountId);
    headers.Authorization = `Bearer ${token}`;
  }
}

async function buildFetchOptions(req, context) {
  const headers = buildOutboundHeaders(req, context);
  await applyAuthorization(req, headers, context);

  const fetchOptions = {
    method: context.upstreamMethod,
    headers
  };

  if (!['GET', 'HEAD'].includes(context.upstreamMethod)) {
    const outboundBody = getOutboundBody(req, context);
    if (outboundBody !== undefined) {
      fetchOptions.body = outboundBody;
    }
  }

  return fetchOptions;
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
    return res.json(await response.json());
  }

  if (contentType && (contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('javascript'))) {
    return res.send(await response.text());
  }

  const buffer = await response.arrayBuffer();
  return res.send(Buffer.from(buffer));
}

module.exports = router;
