const fs = require('fs');
const path = require('path');

loadDotEnv(path.join(__dirname, '..', '.env'));

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const config = {
  port: parsePort(process.env.MAESTRO_EXTENSION_PORT || process.env.PORT, 3300),
  publicBaseUrl: trimTrailingSlash(process.env.MAESTRO_EXTENSION_PUBLIC_URL || ''),
  tgkBackendUrl: trimTrailingSlash(process.env.TGK_BACKEND_URL || 'http://localhost:3000'),
  tgkAppSlug: process.env.TGK_APP_SLUG || 'tgk-wealth',
  oauthClientId: process.env.MAESTRO_EXTENSION_CLIENT_ID || 'tgk-maestro-demo-client',
  oauthClientSecret: process.env.MAESTRO_EXTENSION_CLIENT_SECRET || 'tgk-maestro-demo-secret',
  oauthAccessToken: process.env.MAESTRO_EXTENSION_ACCESS_TOKEN || 'tgk-maestro-demo-token',
  publisherName: process.env.MAESTRO_EXTENSION_PUBLISHER_NAME || 'TGK Wealth',
  publisherEmail: process.env.MAESTRO_EXTENSION_PUBLISHER_EMAIL || 'demo@tgkwealth.com',
  publisherPhone: process.env.MAESTRO_EXTENSION_PUBLISHER_PHONE || '800-555-0100'
};

function getPublicBaseUrl(req) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  const host = req.headers.host || `localhost:${config.port}`;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || 'http';
  return `${protocol}://${host}`;
}

module.exports = {
  config,
  getPublicBaseUrl
};
