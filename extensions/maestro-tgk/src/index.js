const http = require('http');
const { config, getPublicBaseUrl } = require('./config');
const { handlePreflight, readParsedBody, sendJson, sendText } = require('./http');
const { buildManifest } = require('./manifest');
const contactService = require('./contact-service');
const envelopeService = require('./envelope-service');
const contactTypeDefs = require('./contact-type-definitions');
const envelopeTypeDefs = require('./envelope-type-definitions');

const INFO_TEXT_ROUTES = {
  '/support': 'TGK Maestro extension support.',
  '/privacy': 'Demo-only extension for local and private testing.',
  '/terms': 'Demo-only extension for DocuSign extension app testing.'
};

function createErrorResponse(error) {
  if (error.code) {
    return {
      message: error.message,
      code: error.code
    };
  }

  return {
    error: error.message
  };
}

function logRequestError(scope, error, details = {}) {
  const payload = {
    scope,
    message: error.message,
    statusCode: error.statusCode || 500,
    code: error.code || '',
    ...details
  };

  if (error.context) {
    payload.context = error.context;
  }

  if (error.stack) {
    payload.stack = error.stack;
  }

  console.error(JSON.stringify(payload));
}

function isAuthorized(req) {
  return String(req.headers.authorization || '') === `Bearer ${config.oauthAccessToken}`;
}

function readBasicAuthCredentials(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(authorization.slice('Basic '.length).trim(), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1)
    };
  } catch (error) {
    return null;
  }
}

async function handleOauthToken(req, res) {
  const body = await readParsedBody(req);
  if (body.grant_type !== 'client_credentials') {
    return sendJson(res, 400, {
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials is supported.'
    });
  }

  const basicAuth = readBasicAuthCredentials(req);
  const clientId = body.client_id || basicAuth?.clientId || '';
  const clientSecret = body.client_secret || basicAuth?.clientSecret || '';

  if (clientId !== config.oauthClientId || clientSecret !== config.oauthClientSecret) {
    return sendJson(res, 401, {
      error: 'invalid_client',
      error_description: 'Invalid client credentials.'
    });
  }

  return sendJson(res, 200, {
    access_token: config.oauthAccessToken,
    token_type: 'Bearer',
    expires_in: 3600
  });
}

function resolveDataIoService(typeName) {
  const normalized = String(typeName || '').toLowerCase();
  return envelopeTypeDefs.TYPE_ALIASES.has(normalized) ? envelopeService : contactService;
}

function resolveSearchService(body) {
  return resolveDataIoService(body?.query?.from || body?.from || body?.typeName);
}

function getRequestedTypeNames(body) {
  return new Set((body?.typeNames || []).map((item) =>
    String(typeof item === 'string' ? item : item?.typeName || '').toLowerCase()
  ));
}

function buildTypeDefinitionsResponse(body) {
  const requestedTypeNames = getRequestedTypeNames(body);
  const wantsContactTypes = [...requestedTypeNames].some((typeName) => contactTypeDefs.TYPE_ALIASES.has(typeName));
  const wantsEnvelopeTypes = [...requestedTypeNames].some((typeName) => envelopeTypeDefs.TYPE_ALIASES.has(typeName));
  const declarations = [];
  const errors = [];

  if (wantsContactTypes) {
    declarations.push(...contactTypeDefs.TYPE_DEFINITIONS.declarations);
  }

  if (wantsEnvelopeTypes) {
    declarations.push(...envelopeTypeDefs.TYPE_DEFINITIONS.declarations);
  }

  if (!wantsContactTypes && !wantsEnvelopeTypes) {
    for (const typeName of requestedTypeNames) {
      errors.push({
        typeName,
        code: 'UNKNOWN',
        message: `Unsupported type "${typeName}".`
      });
    }
  }

  return { declarations, errors };
}

const DATA_IO_HANDLERS = {
  '/api/dataio/createRecord': (body) => resolveDataIoService(body?.typeName).createRecord(body),
  '/api/dataio/patchRecord': (body) => resolveDataIoService(body?.typeName).patchRecord(body),
  '/api/dataio/searchRecords': (body) => resolveSearchService(body).searchRecords(body),
  '/api/dataio/getTypeNames': () => ({
    typeNames: [...contactTypeDefs.TYPE_NAMES, ...envelopeTypeDefs.TYPE_NAMES]
  }),
  '/api/dataio/getTypeDefinitions': (body) => buildTypeDefinitionsResponse(body)
};

async function handleDataIo(req, res, pathname) {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const body = await readParsedBody(req);
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const handler = DATA_IO_HANDLERS[pathname];
  if (!handler) {
    return sendJson(res, 404, { error: 'Not found' });
  }

  try {
    const payload = await handler(body);
    return sendJson(res, 200, payload);
  } catch (error) {
    logRequestError('dataio', error, {
      path: pathname,
      method: req.method
    });
    return sendJson(res, error.statusCode || 500, createErrorResponse(error));
  }
}

function handleStaticGetRoute(req, res, pathname) {
  if (req.method !== 'GET') {
    return false;
  }

  if (pathname === '/') {
    sendJson(res, 200, {
      service: 'tgk-maestro-extension',
      status: 'ok',
      manifest: `${getPublicBaseUrl(req)}/manifest/clientCredentials.ReadWriteManifest.json`
    });
    return true;
  }

  if (pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      tgkBackendUrl: config.tgkBackendUrl,
      appSlug: config.tgkAppSlug
    });
    return true;
  }

  if (pathname === '/manifest/clientCredentials.ReadWriteManifest.json') {
    sendJson(res, 200, buildManifest(getPublicBaseUrl(req)));
    return true;
  }

  if (INFO_TEXT_ROUTES[pathname]) {
    sendText(res, 200, INFO_TEXT_ROUTES[pathname]);
    return true;
  }

  return false;
}

async function requestListener(req, res) {
  if (handlePreflight(req, res)) {
    return;
  }

  const pathname = new URL(req.url, 'http://localhost').pathname;

  try {
    if (handleStaticGetRoute(req, res, pathname)) {
      return;
    }

    if (req.method === 'POST' && pathname === '/oauth/token') {
      return handleOauthToken(req, res);
    }

    if (pathname.startsWith('/api/dataio/')) {
      return handleDataIo(req, res, pathname);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    logRequestError('request', error, {
      path: pathname,
      method: req.method
    });
    return sendJson(res, error.statusCode || 500, createErrorResponse(error));
  }
}

const server = http.createServer(requestListener);

server.listen(config.port, () => {
  console.log(`TGK Maestro extension listening on http://localhost:${config.port}`);
});
