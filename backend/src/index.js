require('dotenv/config');
const express = require('express');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const localUrl = `http://localhost:${PORT}`;

// Railway terminates TLS at the edge, so trust the first proxy hop for req.protocol/hostname.
app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));

// Webhooks need the raw request body, so mount them before JSON parsing.
app.use('/api/webhooks', require('./routes/webhooks'));

app.use(express.json());
getDb();

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TGK Demo Backend API',
      version: '1.0.0',
      description: 'Shared demo backend for app bootstrap, Docusign auth, envelopes, webhooks, and app-scoped demo data.'
    },
    servers: [{ url: '/' }]
  },
  apis: ['./src/index.js', './src/routes/*.js']
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'TGK Demo Backend API'
}));

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
<p>Shared demo backend for app bootstrap, Docusign auth, envelopes, webhooks, and app-scoped demo data.</p>
<a href="/api-docs">API Docs</a>
<a href="/api/health">Health Check</a>
<div class="tag">v1.0.0</div>
</div></body></html>`);
});

app.use('/api/apps', require('./routes/apps'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/app-data'));
app.use('/api/envelopes', require('./routes/envelopes'));
app.use('/api/proxy', require('./routes/proxy'));

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     tags: [Utility]
 *     responses:
 *       200:
 *         description: Service is running
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    docusignConfigured: !!(process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_RSA_PRIVATE_KEY)
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`TGK Demo Backend running on ${localUrl}`);
  console.log(`API docs: ${localUrl}/api-docs`);
  console.log(`Docusign configured: ${!!(process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_RSA_PRIVATE_KEY)}`);
});
