const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');

const PORT = Number.parseInt(process.env.PORT, 10) || 8080;
const ROOT_DIR = path.join(__dirname, '..', 'frontends');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function createEtag(stats) {
  return `W/"${stats.size}-${Number(stats.mtimeMs).toString(16)}"`;
}

function getCacheControl(filePath, requestUrl) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const versioned = String(requestUrl || '').includes('?v=');

  if (basename === 'runtime-config.js' || ext === '.html') {
    return 'no-cache';
  }

  if (versioned) {
    return 'public, max-age=31536000, immutable';
  }

  if (CONTENT_TYPES[ext]) {
    return 'public, max-age=3600';
  }

  return 'public, max-age=300';
}

function compressBody(body, acceptEncoding) {
  const encoding = String(acceptEncoding || '').toLowerCase();
  if (!Buffer.isBuffer(body) || body.length < 1024) {
    return { body, contentEncoding: null };
  }

  if (encoding.includes('br')) {
    return {
      body: zlib.brotliCompressSync(body),
      contentEncoding: 'br'
    };
  }

  if (encoding.includes('gzip')) {
    return {
      body: zlib.gzipSync(body),
      contentEncoding: 'gzip'
    };
  }

  return { body, contentEncoding: null };
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const stats = fs.statSync(filePath);
  const etag = createEtag(stats);

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': getCacheControl(filePath, req.url),
      'Last-Modified': stats.mtime.toUTCString(),
      Vary: 'Accept-Encoding'
    });
    res.end();
    return;
  }

  const source = fs.readFileSync(filePath);
  const compressed = compressBody(source, req.headers['accept-encoding']);
  const headers = {
    'Content-Type': contentType,
    'Content-Length': compressed.body.length,
    'Cache-Control': getCacheControl(filePath, req.url),
    ETag: etag,
    'Last-Modified': stats.mtime.toUTCString(),
    Vary: 'Accept-Encoding'
  };

  if (compressed.contentEncoding) {
    headers['Content-Encoding'] = compressed.contentEncoding;
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  res.end(compressed.body);
}

function resolvePath(urlPathname) {
  const pathname = decodeURIComponent(urlPathname.split('?')[0]);
  const normalized = path.normalize(pathname).replace(/^[/\\]+/, '');
  const candidate = path.join(ROOT_DIR, normalized);

  const relative = path.relative(ROOT_DIR, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return candidate;
}

function getFilePath(urlPathname) {
  const candidate = resolvePath(urlPathname);
  if (!candidate) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return { type: 'file', path: candidate };
  }

  const directoryPath = candidate.endsWith(path.sep) ? candidate : `${candidate}${path.sep}`;
  const directoryIndex = path.join(directoryPath, 'index.html');
  if (fs.existsSync(directoryIndex) && fs.statSync(directoryIndex).isFile()) {
    const needsSlash = !urlPathname.endsWith('/');
    return { type: 'directory', path: directoryIndex, needsSlash };
  }

  const htmlFile = `${candidate}.html`;
  if (fs.existsSync(htmlFile) && fs.statSync(htmlFile).isFile()) {
    return { type: 'file', path: htmlFile };
  }

  return null;
}

const server = http.createServer(function (req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const result = getFilePath(pathname);

  if (!result) {
    return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
  }

  if (result.type === 'directory' && result.needsSlash) {
    res.writeHead(301, { Location: `${pathname}/` });
    res.end();
    return;
  }

  sendFile(req, res, result.path);
});

server.listen(PORT, function () {
  console.log(`Frontend server listening on http://localhost:${PORT}`);
});
