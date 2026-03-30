require('dotenv/config');
const express = require('express');
const { getDb } = require('./database');

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
<html><head><title>TGK Demo Backend</title>
<style>*{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;max-width:480px;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.5rem}
p{color:#9ca3af;font-size:.875rem;margin-bottom:1.5rem}
a{display:inline-block;background:#3b5bdb;color:#fff;text-decoration:none;padding:.5rem 1.25rem;border-radius:.5rem;font-size:.875rem;margin:.25rem}
a:hover{background:#5c7cfa}
.tag{font-size:.75rem;color:#6b7280;margin-top:1.5rem}</style></head>
<body><div class="c">
<h1>TGK Demo Backend</h1>
<p>Shared demo backend for Docusign auth, envelopes, a discard-only webhook sink, and app-scoped demo data.</p>
<a href="/api/health">Health Check</a>
<div class="tag">v1.0.0</div>
</div></body></html>`);
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
