const http = require('http');
const { config, getPublicBaseUrl } = require('./config');
const { handlePreflight, readParsedBody, sendJson, sendText } = require('./http');
const { buildManifest } = require('./manifest');
const profileService = require('./profiles');
const envelopeService = require('./envelopes');
const profileTypeDefs = require('./profile-type-definitions');
const envelopeTypeDefs = require('./envelope-type-definitions');

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
  const authorization = String(req.headers.authorization || '');
  return authorization === `Bearer ${config.oauthAccessToken}`;
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

async function handleDataIo(req, res, pathname) {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, {
      error: 'Unauthorized'
    });
  }

  const body = await readParsedBody(req);

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  function resolveService(typeName) {
    const normalized = String(typeName || '').toLowerCase();
    if (envelopeTypeDefs.TYPE_ALIASES.has(normalized)) return envelopeService;
    return profileService;
  }

  try {
    if (pathname === '/api/dataio/createRecord') {
      const service = resolveService(body?.typeName);
      return sendJson(res, 200, await service.createRecord(body));
    }
    if (pathname === '/api/dataio/patchRecord') {
      const service = resolveService(body?.typeName);
      return sendJson(res, 200, await service.patchRecord(body));
    }
    if (pathname === '/api/dataio/searchRecords') {
      return sendJson(res, 200, await profileService.searchRecords(body));
    }
    if (pathname === '/api/dataio/getTypeNames') {
      return sendJson(res, 200, {
        typeNames: [...profileTypeDefs.TYPE_NAMES, ...envelopeTypeDefs.TYPE_NAMES]
      });
    }
    if (pathname === '/api/dataio/getTypeDefinitions') {
      const requested = new Set((body?.typeNames || []).map(item =>
        String(typeof item === 'string' ? item : item?.typeName || '').toLowerCase()
      ));
      const declarations = [];
      const errors = [];

      const wantsProfile = [...requested].some(t => profileTypeDefs.TYPE_ALIASES.has(t));
      const wantsEnvelope = [...requested].some(t => envelopeTypeDefs.TYPE_ALIASES.has(t));

      if (wantsProfile) declarations.push(...profileTypeDefs.TYPE_DEFINITIONS.declarations);
      if (wantsEnvelope) declarations.push(...envelopeTypeDefs.TYPE_DEFINITIONS.declarations);

      if (!wantsProfile && !wantsEnvelope) {
        for (const t of requested) {
          errors.push({ typeName: t, code: 'UNKNOWN', message: `Unsupported type "${t}".` });
        }
      }

      return sendJson(res, 200, { declarations, errors });
    }
  } catch (error) {
    logRequestError('dataio', error, {
      path: pathname,
      method: req.method
    });
    return sendJson(res, error.statusCode || 500, createErrorResponse(error));
  }

  return sendJson(res, 404, { error: 'Not found' });
}

async function requestListener(req, res) {
  if (handlePreflight(req, res)) {
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/') {
      return sendJson(res, 200, {
        service: 'tgk-maestro-extension',
        status: 'ok',
        manifest: `${getPublicBaseUrl(req)}/manifest/clientCredentials.ReadWriteManifest.json`
      });
    }

    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        tgkBackendUrl: config.tgkBackendUrl,
        appSlug: config.tgkAppSlug
      });
    }

    if (req.method === 'GET' && pathname === '/manifest/clientCredentials.ReadWriteManifest.json') {
      return sendJson(res, 200, buildManifest(getPublicBaseUrl(req)));
    }

    if (req.method === 'GET' && pathname === '/support') {
      return sendText(res, 200, 'TGK Maestro extension support: demo-only service for profile create/update writeback.');
    }

    if (req.method === 'GET' && pathname === '/privacy') {
      return sendText(res, 200, 'TGK Maestro extension privacy: demo-only service with fake authentication and no production data handling.');
    }

    if (req.method === 'GET' && pathname === '/terms') {
      return sendText(res, 200, 'TGK Maestro extension terms: demo-only service intended for local and private DocuSign extension app testing.');
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
