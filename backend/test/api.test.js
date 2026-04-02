const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createApp } = require('../src/app');
const { closeDb } = require('../src/database');

const MAESTRO_BEARER_TOKEN = 'tgk-maestro-demo-token';
const MAESTRO_CLIENT_ID = 'tgk-maestro-demo-client';
const MAESTRO_CLIENT_SECRET = 'tgk-maestro-demo-secret';

async function startServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tgk-backend-test-'));
  process.env.TGK_DB_PATH = path.join(tempDir, 'demo.db');
  closeDb();

  const app = createApp();
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const address = server.address();

  async function request(urlPath, options = {}) {
    const response = await fetch(`http://127.0.0.1:${address.port}${urlPath}`, options);
    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = text;
    }

    return { response, payload };
  }

  async function cleanup() {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    closeDb();
    delete process.env.TGK_DB_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return {
    cleanup,
    request
  };
}

test('app slugs isolate employee records', async () => {
  const server = await startServer();

  try {
    const employeeA = await server.request('/api/data/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-App': 'alpha'
      },
      body: JSON.stringify({
        id: 'emp-alpha',
        displayName: 'Alpha Advisor'
      })
    });
    assert.equal(employeeA.response.status, 201);

    const employeeB = await server.request('/api/data/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-App': 'beta'
      },
      body: JSON.stringify({
        id: 'emp-beta',
        displayName: 'Beta Advisor'
      })
    });
    assert.equal(employeeB.response.status, 201);

    const alphaEmployees = await server.request('/api/data/employees?search=Alpha', {
      headers: { 'X-Demo-App': 'alpha' }
    });
    const betaEmployees = await server.request('/api/data/employees', {
      headers: { 'X-Demo-App': 'beta' }
    });

    assert.equal(alphaEmployees.response.status, 200);
    assert.equal(betaEmployees.response.status, 200);
    assert.equal(alphaEmployees.payload.length, 1);
    assert.equal(betaEmployees.payload.length, 1);
    assert.equal(alphaEmployees.payload[0].displayName, 'Alpha Advisor');
    assert.equal(betaEmployees.payload[0].displayName, 'Beta Advisor');
  } finally {
    await server.cleanup();
  }
});

test('customer detail payload uses camelCase fields', async () => {
  const server = await startServer();

  try {
    await server.request('/api/data/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-App': 'tgk-wealth'
      },
      body: JSON.stringify({
        id: 'emp-1',
        displayName: 'Gordon Gecko'
      })
    });

    const created = await server.request('/api/data/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-App': 'tgk-wealth'
      },
      body: JSON.stringify({
        id: 'cust-1',
        employeeId: 'emp-1',
        displayName: 'Casey Investor',
        email: 'casey@example.com',
        organization: 'Northwind',
        status: 'active',
        data: {
          firstName: 'Casey',
          lastName: 'Investor'
        }
      })
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload.displayName, 'Casey Investor');
    assert.equal(created.payload.employeeId, 'emp-1');
    assert.ok(created.payload.createdAt);
    assert.equal(created.payload.display_name, undefined);
    assert.equal(created.payload.employee_id, undefined);
    assert.equal(created.payload.created_at, undefined);
  } finally {
    await server.cleanup();
  }
});

test('tasks cannot reference customers from another app', async () => {
  const server = await startServer();

  try {
    const createdCustomer = await server.request('/api/data/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-App': 'alpha'
      },
      body: JSON.stringify({
        id: 'cust-alpha',
        displayName: 'Alpha Customer'
      })
    });
    assert.equal(createdCustomer.response.status, 201);

    const invalidTask = await server.request('/api/data/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-App': 'beta'
      },
      body: JSON.stringify({
        id: 'task-beta',
        customerId: 'cust-alpha',
        title: 'Cross-app task'
      })
    });

    assert.equal(invalidTask.response.status, 400);
    assert.match(String(invalidTask.payload.error || ''), /customerId/i);
  } finally {
    await server.cleanup();
  }
});

test('proxy rejects payloads without a target', async () => {
  const server = await startServer();

  try {
    const result = await server.request('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'GET'
      })
    });

    assert.equal(result.response.status, 400);
    assert.match(String(result.payload.error || ''), /Missing proxy target/i);
  } finally {
    await server.cleanup();
  }
});

test('maestro endpoints are served from the backend', async () => {
  const server = await startServer();

  try {
    const health = await server.request('/maestro/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.status, 'ok');
    assert.equal(health.payload.mode, 'in-process');

    const token = await server.request('/maestro/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: MAESTRO_CLIENT_ID,
        client_secret: MAESTRO_CLIENT_SECRET
      }).toString()
    });

    assert.equal(token.response.status, 200);
    assert.equal(token.payload.access_token, MAESTRO_BEARER_TOKEN);
  } finally {
    await server.cleanup();
  }
});

test('maestro dataio requires AppSlug in the payload', async () => {
  const server = await startServer();

  try {
    const created = await server.request('/maestro/api/dataio/createRecord', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAESTRO_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        typeName: 'Employee',
        recordId: 'emp-maestro',
        data: {
          FirstName: 'Gordon',
          LastName: 'Gecko'
        }
      })
    });

    assert.equal(created.response.status, 400);
    assert.match(String(created.payload.message || created.payload.error || ''), /AppSlug/i);
  } finally {
    await server.cleanup();
  }
});

test('maestro dataio uses direct in-process record operations with request-scoped app slugs', async () => {
  const server = await startServer();

  try {
    const createdAlpha = await server.request('/maestro/api/dataio/createRecord', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAESTRO_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        typeName: 'Employee',
        recordId: 'emp-alpha',
        data: {
          AppSlug: 'alpha',
          FirstName: 'Gordon',
          LastName: 'Gecko',
          Email: 'g.gecko@tgkwealth.com'
        }
      })
    });

    const createdBeta = await server.request('/maestro/api/dataio/createRecord', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAESTRO_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        typeName: 'Employee',
        recordId: 'emp-beta',
        data: {
          AppSlug: 'beta',
          FirstName: 'Serena',
          LastName: 'Blake',
          Email: 's.blake@tgkwealth.com'
        }
      })
    });

    assert.equal(createdAlpha.response.status, 200);
    assert.equal(createdAlpha.payload.recordId, 'emp-alpha');
    assert.equal(createdBeta.response.status, 200);
    assert.equal(createdBeta.payload.recordId, 'emp-beta');

    const searchAlpha = await server.request('/maestro/api/dataio/searchRecords', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAESTRO_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appSlug: 'alpha',
        query: {
          from: 'Employee'
        }
      })
    });

    const searchBeta = await server.request('/maestro/api/dataio/searchRecords', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAESTRO_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appSlug: 'beta',
        query: {
          from: 'Employee'
        }
      })
    });

    assert.equal(searchAlpha.response.status, 200);
    assert.equal(searchAlpha.payload.records.length, 1);
    assert.equal(searchAlpha.payload.records[0].Id, 'emp-alpha');
    assert.equal(searchAlpha.payload.records[0].DisplayName, 'Gordon Gecko');
    assert.equal(searchAlpha.payload.records[0].AppSlug, 'alpha');

    assert.equal(searchBeta.response.status, 200);
    assert.equal(searchBeta.payload.records.length, 1);
    assert.equal(searchBeta.payload.records[0].Id, 'emp-beta');
    assert.equal(searchBeta.payload.records[0].DisplayName, 'Serena Blake');
    assert.equal(searchBeta.payload.records[0].AppSlug, 'beta');

    const exactSearch = await server.request('/maestro/api/dataio/searchRecords', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAESTRO_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: {
          from: 'Employee',
          queryFilter: {
            operator: 'EQUALS',
            leftOperand: { name: 'Id', isLiteral: false },
            rightOperand: { name: 'emp-beta', isLiteral: true }
          }
        }
      })
    });

    assert.equal(exactSearch.response.status, 200);
    assert.equal(exactSearch.payload.records.length, 1);
    assert.equal(exactSearch.payload.records[0].Id, 'emp-beta');
    assert.equal(exactSearch.payload.records[0].AppSlug, 'beta');
  } finally {
    await server.cleanup();
  }
});
