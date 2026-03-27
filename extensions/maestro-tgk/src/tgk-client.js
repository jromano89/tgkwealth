const { config } = require('./config');

function buildUrl(pathname, query) {
  const url = new URL(pathname, `${config.tgkBackendUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request(pathname, options = {}) {
  const url = buildUrl(pathname, options.query);
  const headers = {
    'Content-Type': 'application/json',
    'x-demo-app': config.tgkAppSlug,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const message = typeof payload === 'string'
      ? payload
      : payload.error || payload.message || JSON.stringify(payload);
    const error = new Error(message || `TGK backend request failed: ${response.status}`);
    error.statusCode = response.status;
    error.context = {
      service: 'tgk-backend',
      method: options.method || 'GET',
      url,
      responseStatus: response.status,
      responseBody: payload
    };
    throw error;
  }

  return payload;
}

function listProfiles() {
  return request('/api/data/profiles', {
    query: {
      kind: 'investor'
    }
  });
}

function getProfile(id) {
  return request(`/api/data/profiles/${encodeURIComponent(id)}`);
}

function createProfile(body) {
  return request('/api/data/profiles', {
    method: 'POST',
    body
  });
}

function updateProfile(id, body) {
  return request(`/api/data/profiles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body
  });
}

function createRecord(body) {
  return request('/api/data/records', {
    method: 'POST',
    body
  });
}

function createEnvelope(body) {
  return request('/api/data/envelopes', {
    method: 'POST',
    body
  });
}

function updateEnvelope(id, body) {
  return request(`/api/data/envelopes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body
  });
}

module.exports = {
  createEnvelope,
  createProfile,
  createRecord,
  getProfile,
  listProfiles,
  updateEnvelope,
  updateProfile
};
