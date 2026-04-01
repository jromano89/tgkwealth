const path = require('path');
const dotenv = require('dotenv');

// Load both repo-root .env and backend/.env for local runs; existing env vars still win.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const { getDb } = require('./database');
const {
  API_TITLE,
  API_VERSION,
  buildDocsHtml,
  buildLlmsTxt,
  buildOpenApiDocument
} = require('./openapi');

const app = express();
const PORT = process.env.PORT || 3000;
const LOCAL_URL = `http://localhost:${PORT}`;

function isDocusignConfigured() {
  return Boolean(process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_RSA_PRIVATE_KEY);
}

function setOpenCorsHeaders(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Demo-App');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

// Railway terminates TLS at the edge, so trust the first proxy hop for req.protocol/hostname.
app.set('trust proxy', 1);
app.use(setOpenCorsHeaders);

// Connect payloads can arrive outside the normal JSON parser, so mount the sink first.
app.use('/api/webhooks', require('./routes/webhooks'));

app.use(express.json({ limit: '1mb' }));
getDb();

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>${API_TITLE}</title>
<style>*{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;max-width:480px;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.5rem}
p{color:#9ca3af;font-size:.875rem;margin-bottom:1.5rem}
a{display:inline-block;background:#3b5bdb;color:#fff;text-decoration:none;padding:.5rem 1.25rem;border-radius:.5rem;font-size:.875rem;margin:.25rem}
a:hover{background:#5c7cfa}
.tag{font-size:.75rem;color:#6b7280;margin-top:1.5rem}</style></head>
<body><div class="c">
<h1>${API_TITLE}</h1>
<p>CORS-enabled backend foundation for auth, proxying, webhook intake, and app-scoped demo data.</p>
<a href="/api/health">Health Check</a>
<a href="/api/docs">API Docs</a>
<a href="/api/openapi.json">OpenAPI JSON</a>
<a href="/.well-known/llms.txt">LLMs.txt</a>
<div class="tag">v${API_VERSION}</div>
</div></body></html>`);
});

app.get('/api/docs', (req, res) => {
  res.type('html').send(buildDocsHtml(req));
});

app.get('/api/openapi.json', (req, res) => {
  res.json(buildOpenApiDocument(req));
});

app.get('/.well-known/openapi.json', (req, res) => {
  res.json(buildOpenApiDocument(req));
});

app.get('/.well-known/llms.txt', (req, res) => {
  res.type('text/plain').send(buildLlmsTxt(req));
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/app-data'));
app.use('/api/proxy', require('./routes/proxy'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    docusignConfigured: isDocusignConfigured()
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`TGK Demo Backend running on ${LOCAL_URL}`);
  console.log(`Docusign configured: ${isDocusignConfigured()}`);
});
