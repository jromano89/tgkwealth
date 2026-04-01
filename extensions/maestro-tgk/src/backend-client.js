const { config } = require('./config');

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json'
};

function buildUrl(pathname, query) {
  const url = new URL(pathname, `${config.tgkBackendUrl}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildHeaders(overrides) {
  return {
    ...DEFAULT_HEADERS,
    'x-demo-app': config.tgkAppSlug,
    ...(overrides || {})
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return response.text().catch(() => '');
}

function createBackendError(response, payload, url, method) {
  const message = typeof payload === 'string'
    ? payload
    : payload.error || payload.message || JSON.stringify(payload);
  const error = new Error(message || `TGK backend request failed: ${response.status}`);
  error.statusCode = response.status;
  error.context = {
    service: 'tgk-backend',
    method,
    url,
    responseStatus: response.status,
    responseBody: payload
  };
  return error;
}

async function request(pathname, options = {}) {
  const method = options.method || 'GET';
  const url = buildUrl(pathname, options.query);
  const response = await fetch(url, {
    method,
    headers: buildHeaders(options.headers),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw createBackendError(response, payload, url, method);
  }

  return payload;
}

function createJsonRequest(method, pathname) {
  return function sendRequest(payload) {
    return request(pathname, { method, body: payload });
  };
}

function createMutationRequest(method, pathnameBuilder) {
  return function sendMutationRequest(idOrPayload, maybePayload) {
    const pathname = pathnameBuilder(idOrPayload);
    const body = maybePayload === undefined ? idOrPayload : maybePayload;
    return request(pathname, { method, body });
  };
}

function createResourceClient(pathname) {
  return {
    create: createJsonRequest('POST', pathname),
    get(id) {
      return request(`${pathname}/${encodeURIComponent(id)}`);
    },
    list(query) {
      return request(pathname, { query });
    },
    update: createMutationRequest('PUT', (id) => `${pathname}/${encodeURIComponent(id)}`)
  };
}

const employeeClient = createResourceClient('/api/data/employees');
const customerClient = createResourceClient('/api/data/customers');
const envelopeClient = createResourceClient('/api/data/envelopes');
const taskClient = createResourceClient('/api/data/tasks');

module.exports = {
  createCustomer: customerClient.create,
  createEmployee: employeeClient.create,
  createEnvelope: envelopeClient.create,
  createTask: taskClient.create,
  getCustomer: customerClient.get,
  getEmployee: employeeClient.get,
  getEnvelope: envelopeClient.get,
  getTask: taskClient.get,
  listCustomers: customerClient.list,
  listEmployees: employeeClient.list,
  listEnvelopes: envelopeClient.list,
  listTasks: taskClient.list,
  updateCustomer: customerClient.update,
  updateEmployee: employeeClient.update,
  updateEnvelope: envelopeClient.update,
  updateTask: taskClient.update
};
