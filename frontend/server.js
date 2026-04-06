const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);
const ROOT_DIR = __dirname;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function safeJoin(rootDir, requestPath) {
  const normalized = path.posix.normalize(`/${requestPath}`);
  const absolutePath = path.join(rootDir, normalized);
  return absolutePath.startsWith(rootDir) ? absolutePath : null;
}

function findCandidatePaths(requestPath) {
  const trimmed = String(requestPath || '/').split('?')[0].split('#')[0] || '/';
  const candidates = [];

  if (trimmed === '/' || trimmed === '') {
    candidates.push('/index.html');
    return candidates;
  }

  candidates.push(trimmed);

  if (!path.extname(trimmed)) {
    candidates.push(`${trimmed}.html`);
    candidates.push(path.posix.join(trimmed, 'index.html'));
  }

  return candidates;
}

function getHeaders(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream'
  };

  if (extension === '.html' || path.basename(filePath) === 'config.js') {
    headers['Cache-Control'] = 'no-store';
  } else {
    headers['Cache-Control'] = 'public, max-age=300';
  }

  return headers;
}

function sendFile(res, filePath) {
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, getHeaders(filePath));
  stream.pipe(res);
  stream.on('error', (error) => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.message || 'Internal server error');
  });
}

function sendNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const candidates = findCandidatePaths(requestUrl.pathname);

  for (const candidate of candidates) {
    const resolvedPath = safeJoin(ROOT_DIR, candidate);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      continue;
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      continue;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, getHeaders(resolvedPath));
      res.end();
      return;
    }

    sendFile(res, resolvedPath);
    return;
  }

  sendNotFound(res);
});

server.listen(PORT, HOST, () => {
  console.log(`TGK frontend server listening on http://${HOST}:${PORT}`);
});
