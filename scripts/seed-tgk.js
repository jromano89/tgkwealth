const path = require('path');

const manifestPath = path.resolve(__dirname, '..', 'frontends', 'tgk-wealth', 'demo-data.js');
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
const force = process.argv.includes('--force');

function loadManifest(filePath) {
  delete require.cache[filePath];
  const manifest = require(filePath);
  if (!manifest?.app?.slug) {
    throw new Error(`Invalid manifest at ${filePath}`);
  }

  return JSON.parse(JSON.stringify(manifest));
}

async function postJson(urlString, payload) {
  const response = await fetch(urlString, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const contentType = response.headers.get('content-type') || '';
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody));
  }

  return responseBody;
}

async function main() {
  const manifest = loadManifest(manifestPath);

  if (force) {
    manifest.app.bootstrapVersion = `${manifest.app.bootstrapVersion || '1'}-${Date.now()}`;
  }

  const targetUrl = new URL('/api/apps/bootstrap', backendUrl).toString();
  const result = await postJson(targetUrl, manifest);

  console.log(`Seeded app "${manifest.app.slug}" against ${backendUrl}`);
  if (result?.reason === 'already-current') {
    console.log('No changes applied: bootstrap version already current.');
  } else if (result?.bootstrapped) {
    console.log('Bootstrap applied successfully.');
  }
}

main().catch((error) => {
  console.error(`TGK seed failed: ${error.message}`);
  process.exit(1);
});
