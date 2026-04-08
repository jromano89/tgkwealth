const express = require('express');
const { createError, isPlainObject, route } = require('../utils');

const router = express.Router();
const BLOCKED_HEADERS = new Set(['connection', 'content-length', 'cookie', 'host', 'origin', 'referer', 'transfer-encoding']);

router.post('/', route(async (req, res) => {
  const proxyRequest = normalizeProxyRequest(req.body);
  const headers = buildHeaders(req.headers.accept, proxyRequest);
  const response = await fetch(buildTargetUrl(proxyRequest), {
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

  const method = String(body.method || 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw createError(400, `Unsupported method: ${method}`);
  }

  if (!body.url && !body.path) {
    throw createError(400, 'Missing proxy target. Provide "url" or "path".');
  }

  return {
    method,
    url: body.url,
    path: body.path,
    baseUrl: body.baseUrl || process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi',
    accessToken: String(body.accessToken || '').trim(),
    headers: isPlainObject(body.headers) ? body.headers : {},
    query: isPlainObject(body.query) ? body.query : null,
    body: body.body
  };
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

function normalizeProxyPath(baseUrl, path) {
  const rawPath = String(path || '');
  if (!rawPath.startsWith('/')) {
    return rawPath;
  }

  const basePath = String(baseUrl.pathname || '/').replace(/\/+$/, '') || '/';
  if (basePath === '/' || rawPath === basePath || rawPath.startsWith(`${basePath}/`)) {
    return rawPath;
  }

  return rawPath.replace(/^\/+/, '');
}

function buildTargetUrl(proxyRequest) {
  const baseUrl = new URL(proxyRequest.baseUrl.endsWith('/') ? proxyRequest.baseUrl : `${proxyRequest.baseUrl}/`);
  const target = proxyRequest.url
    ? new URL(proxyRequest.url)
    : new URL(normalizeProxyPath(baseUrl, proxyRequest.path), baseUrl);

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

function buildHeaders(acceptHeader, proxyRequest) {
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

  if (proxyRequest.accessToken) {
    headers.Authorization = `Bearer ${proxyRequest.accessToken}`;
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
