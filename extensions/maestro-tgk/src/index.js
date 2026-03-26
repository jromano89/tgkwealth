const http = require('http');
const { config, getPublicBaseUrl } = require('./config');
const { handlePreflight, readParsedBody, sendJson, sendText } = require('./http');
const { buildManifest } = require('./manifest');
const profileService = require('./profiles');

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

  try {
    if (pathname === '/api/dataio/createRecord') {
      return sendJson(res, 200, await profileService.createRecord(body));
    }
    if (pathname === '/api/dataio/patchRecord') {
      return sendJson(res, 200, await profileService.patchRecord(body));
    }
    if (pathname === '/api/dataio/searchRecords') {
      return sendJson(res, 200, await profileService.searchRecords(body));
    }
    if (pathname === '/api/dataio/getTypeNames') {
      return sendJson(res, 200, profileService.getTypeNames());
    }
    if (pathname === '/api/dataio/getTypeDefinitions') {
      return sendJson(res, 200, profileService.getTypeDefinitions(body));
    }
  } catch (error) {
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
    console.error('Maestro extension error:', error);
    return sendJson(res, error.statusCode || 500, createErrorResponse(error));
  }
}

const server = http.createServer(requestListener);

server.listen(config.port, () => {
  console.log(`TGK Maestro extension listening on http://localhost:${config.port}`);
});
