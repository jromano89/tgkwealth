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
    assert.equal(health.payload.appSlug, 'tgk-wealth');

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

test('maestro dataio uses direct in-process record operations', async () => {
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
          LastName: 'Gecko',
          Email: 'g.gecko@tgkwealth.com'
        }
      })
    });

    assert.equal(created.response.status, 200);
    assert.equal(created.payload.recordId, 'emp-maestro');

    const search = await server.request('/maestro/api/dataio/searchRecords', {
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
            rightOperand: { name: 'emp-maestro', isLiteral: true }
          }
        }
      })
    });

    assert.equal(search.response.status, 200);
    assert.equal(search.payload.records.length, 1);
    assert.equal(search.payload.records[0].Id, 'emp-maestro');
    assert.equal(search.payload.records[0].DisplayName, 'Gordon Gecko');
  } finally {
    await server.cleanup();
  }
});
