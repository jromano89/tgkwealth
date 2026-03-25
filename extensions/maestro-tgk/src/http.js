const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...CORS_HEADERS
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...CORS_HEADERS
  });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readParsedBody(req) {
  const raw = await readBody(req);
  if (!raw) {
    return {};
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  if (contentType.includes('application/json') || contentType.includes('+json') || !contentType) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      const err = new Error('Invalid JSON request body');
      err.statusCode = 400;
      throw err;
    }
  }

  return { raw };
}

function handlePreflight(req, res) {
  if (req.method !== 'OPTIONS') {
    return false;
  }

  res.writeHead(204, {
    ...CORS_HEADERS,
    'Access-Control-Max-Age': '86400'
  });
  res.end();
  return true;
}

module.exports = {
  handlePreflight,
  readParsedBody,
  sendJson,
  sendText
};
