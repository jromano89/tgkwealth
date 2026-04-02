const API_TITLE = 'Docusign Demo Platform API';
const API_VERSION = '3.0.0';

function buildOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function demoAppHeader() {
  return {
    name: 'X-Demo-App',
    in: 'header',
    required: false,
    description: 'Logical app or tenant slug. Equivalent to ?app=<slug>.',
    schema: { type: 'string' }
  };
}

function recordIdPath(name = 'id') {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' }
  };
}

function parameter(name, location, schema, required, description) {
  return { name, in: location, required, description, schema };
}

function jsonRequestBody(ref) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: ref }
      }
    }
  };
}

function jsonResponse(description, ref) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: ref }
      }
    }
  };
}

function arrayResponse(description, ref) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: { $ref: ref }
        }
      }
    }
  };
}

function errorResponse() {
  return jsonResponse('Error response.', '#/components/schemas/ErrorResponse');
}

function buildOpenApiDocument(req) {
  const origin = buildOrigin(req);

  return {
    openapi: '3.1.0',
    info: {
      title: API_TITLE,
      version: API_VERSION,
      summary: 'Reusable CORS-enabled backend for DocuSign IAM demo portals, currently powering TGK Wealth.',
      description: [
        'Current reference frontend:',
        '- TGK Wealth is a FINS advisor-and-investor demo for DocuSign Solution Consultants.',
        '',
        'Architecture goals:',
        '- Keep frontend demos static and lightweight.',
        '- Keep auth, proxying, data storage, and Maestro integration reusable across future vertical demos.',
        '',
        'Canonical client behavior:',
        '- Send `X-Demo-App` on every app-scoped `/api/auth`, `/api/data`, and `/api/proxy` request.',
        '- Use camelCase in request bodies.',
        '- Expect persisted records to come back with camelCase field names.',
        '- Records are scoped by app slug, with flexible nullable relationships between employees, customers, envelopes, and tasks.',
        '- Envelopes use the DocuSign envelope ID directly as `id`.',
        '- Use `/api/proxy` for third-party API access that should inherit centralized auth or CORS behavior.'
      ].join('\n')
    },
    servers: [
      {
        url: origin,
        description: 'Current deployment'
      }
    ],
    tags: [
      { name: 'Health', description: 'Operational readiness and deployment health.' },
      { name: 'Auth', description: 'App-scoped Docusign consent, session introspection, account selection, and logout.' },
      { name: 'Data', description: 'Flexible app-scoped CRUD for employees, customers, envelopes, and tasks.' },
      { name: 'Proxy', description: 'Configurable outbound HTTP proxy with optional bearer or Docusign auth.' },
      { name: 'Webhooks', description: 'Inbound webhook sinks for demo and integration testing.' }
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Get service health',
          operationId: 'getHealth',
          responses: {
            200: jsonResponse('Service health payload.', '#/components/schemas/HealthResponse')
          }
        }
      },
      '/api/auth/login': {
        get: {
          tags: ['Auth'],
          summary: 'Start Docusign consent',
          operationId: 'startDocusignConsent',
          parameters: [
            parameter('app', 'query', { type: 'string' }, true, 'Logical app or tenant slug.'),
            parameter('redirect', 'query', { type: 'string', format: 'uri' }, false, 'Frontend URL to return to after consent completes.'),
            parameter('scopes', 'query', { type: 'string' }, false, 'Optional override for requested Docusign scopes.'),
            parameter('display', 'query', { type: 'string', enum: ['redirect', 'popup'] }, false, 'Choose whether consent resolves by full-page redirect or popup messaging.')
          ],
          responses: {
            302: { description: 'Redirects to the upstream Docusign consent URL.' },
            400: errorResponse()
          }
        }
      },
      '/api/auth/session': {
        get: {
          tags: ['Auth'],
          summary: 'Read app auth session',
          operationId: 'getAuthSession',
          parameters: [demoAppHeader()],
          responses: {
            200: jsonResponse('Current Docusign connection state for the app.', '#/components/schemas/AuthSession'),
            400: errorResponse()
          }
        }
      },
      '/api/auth/prewarm': {
        get: {
          tags: ['Auth'],
          summary: 'Prewarm Docusign access token',
          operationId: 'prewarmDocusignAuth',
          parameters: [demoAppHeader()],
          responses: {
            200: jsonResponse('Session plus token warmup result.', '#/components/schemas/PrewarmResponse'),
            400: errorResponse()
          }
        }
      },
      '/api/auth/account': {
        post: {
          tags: ['Auth'],
          summary: 'Select active Docusign account',
          operationId: 'selectDocusignAccount',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/SelectAccountRequest'),
          responses: {
            200: jsonResponse('Selected account persisted.', '#/components/schemas/SelectAccountResponse'),
            400: errorResponse(),
            404: errorResponse()
          }
        }
      },
      '/api/auth/scopes': {
        post: {
          tags: ['Auth'],
          summary: 'Persist requested Docusign scopes for the app',
          operationId: 'saveDocusignScopes',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/SaveScopesRequest'),
          responses: {
            200: jsonResponse('Saved scope string.', '#/components/schemas/SaveScopesResponse'),
            400: errorResponse()
          }
        }
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Clear Docusign connection state for the app',
          operationId: 'logoutDocusign',
          parameters: [demoAppHeader()],
          responses: {
            200: jsonResponse('Connection cleared.', '#/components/schemas/SuccessResponse'),
            400: errorResponse()
          }
        }
      },
      '/api/data/employees': {
        get: {
          tags: ['Data'],
          summary: 'List employees',
          operationId: 'listEmployees',
          parameters: [
            demoAppHeader(),
            parameter('search', 'query', { type: 'string' }, false, 'Searches displayName, email, title, and id.')
          ],
          responses: {
            200: arrayResponse('Employee list.', '#/components/schemas/EmployeeRecord'),
            400: errorResponse()
          }
        },
        post: {
          tags: ['Data'],
          summary: 'Create employee',
          operationId: 'createEmployee',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/EmployeeWriteRequest'),
          responses: {
            201: jsonResponse('Created employee.', '#/components/schemas/EmployeeRecord'),
            400: errorResponse()
          }
        }
      },
      '/api/data/employees/{id}': {
        get: {
          tags: ['Data'],
          summary: 'Get employee',
          operationId: 'getEmployee',
          parameters: [demoAppHeader(), recordIdPath()],
          responses: {
            200: jsonResponse('Employee record.', '#/components/schemas/EmployeeRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        },
        put: {
          tags: ['Data'],
          summary: 'Update employee',
          operationId: 'updateEmployee',
          parameters: [demoAppHeader(), recordIdPath()],
          requestBody: jsonRequestBody('#/components/schemas/EmployeeWriteRequest'),
          responses: {
            200: jsonResponse('Updated employee.', '#/components/schemas/EmployeeRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        }
      },
      '/api/data/customers': {
        get: {
          tags: ['Data'],
          summary: 'List customers',
          operationId: 'listCustomers',
          parameters: [
            demoAppHeader(),
            parameter('search', 'query', { type: 'string' }, false, 'Searches displayName, email, organization, and id.'),
            parameter('status', 'query', { type: 'string' }, false, 'Optional customer status filter.'),
            parameter('employeeId', 'query', { type: 'string' }, false, 'Optional employee relationship filter.')
          ],
          responses: {
            200: arrayResponse('Customer list.', '#/components/schemas/CustomerRecord'),
            400: errorResponse()
          }
        },
        post: {
          tags: ['Data'],
          summary: 'Create customer',
          operationId: 'createCustomer',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/CustomerWriteRequest'),
          responses: {
            201: jsonResponse('Created customer.', '#/components/schemas/CustomerRecord'),
            400: errorResponse()
          }
        }
      },
      '/api/data/customers/{id}': {
        get: {
          tags: ['Data'],
          summary: 'Get customer',
          operationId: 'getCustomer',
          parameters: [demoAppHeader(), recordIdPath()],
          responses: {
            200: jsonResponse('Customer record.', '#/components/schemas/CustomerRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        },
        put: {
          tags: ['Data'],
          summary: 'Update customer',
          operationId: 'updateCustomer',
          parameters: [demoAppHeader(), recordIdPath()],
          requestBody: jsonRequestBody('#/components/schemas/CustomerWriteRequest'),
          responses: {
            200: jsonResponse('Updated customer.', '#/components/schemas/CustomerRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        },
        delete: {
          tags: ['Data'],
          summary: 'Delete customer',
          operationId: 'deleteCustomer',
          parameters: [demoAppHeader(), recordIdPath()],
          responses: {
            200: jsonResponse('Delete result.', '#/components/schemas/DeletedResponse'),
            400: errorResponse(),
            404: errorResponse()
          }
        }
      },
      '/api/data/envelopes': {
        get: {
          tags: ['Data'],
          summary: 'List envelopes',
          operationId: 'listEnvelopes',
          parameters: [
            demoAppHeader(),
            parameter('id', 'query', { type: 'string' }, false, 'Optional exact id filter.'),
            parameter('status', 'query', { type: 'string' }, false, 'Optional envelope status filter.'),
            parameter('employeeId', 'query', { type: 'string' }, false, 'Optional employee relationship filter.'),
            parameter('customerId', 'query', { type: 'string' }, false, 'Optional customer relationship filter.'),
            parameter('search', 'query', { type: 'string' }, false, 'Searches envelope name and id.')
          ],
          responses: {
            200: arrayResponse('Envelope list.', '#/components/schemas/EnvelopeRecord'),
            400: errorResponse()
          }
        },
        post: {
          tags: ['Data'],
          summary: 'Create envelope',
          operationId: 'createEnvelope',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/EnvelopeWriteRequest'),
          responses: {
            201: jsonResponse('Created envelope.', '#/components/schemas/EnvelopeRecord'),
            400: errorResponse()
          }
        }
      },
      '/api/data/envelopes/{id}': {
        get: {
          tags: ['Data'],
          summary: 'Get envelope',
          operationId: 'getEnvelope',
          parameters: [demoAppHeader(), recordIdPath()],
          responses: {
            200: jsonResponse('Envelope record.', '#/components/schemas/EnvelopeRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        },
        put: {
          tags: ['Data'],
          summary: 'Update envelope',
          operationId: 'updateEnvelope',
          parameters: [demoAppHeader(), recordIdPath()],
          requestBody: jsonRequestBody('#/components/schemas/EnvelopeWriteRequest'),
          responses: {
            200: jsonResponse('Updated envelope.', '#/components/schemas/EnvelopeRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        }
      },
      '/api/data/tasks': {
        get: {
          tags: ['Data'],
          summary: 'List tasks',
          operationId: 'listTasks',
          parameters: [
            demoAppHeader(),
            parameter('id', 'query', { type: 'string' }, false, 'Optional exact id filter.'),
            parameter('status', 'query', { type: 'string' }, false, 'Optional task status filter.'),
            parameter('employeeId', 'query', { type: 'string' }, false, 'Optional employee relationship filter.'),
            parameter('customerId', 'query', { type: 'string' }, false, 'Optional customer relationship filter.'),
            parameter('search', 'query', { type: 'string' }, false, 'Searches task title, description, and id.')
          ],
          responses: {
            200: arrayResponse('Task list.', '#/components/schemas/TaskRecord'),
            400: errorResponse()
          }
        },
        post: {
          tags: ['Data'],
          summary: 'Create task',
          operationId: 'createTask',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/TaskWriteRequest'),
          responses: {
            201: jsonResponse('Created task.', '#/components/schemas/TaskRecord'),
            400: errorResponse()
          }
        }
      },
      '/api/data/tasks/{id}': {
        get: {
          tags: ['Data'],
          summary: 'Get task',
          operationId: 'getTask',
          parameters: [demoAppHeader(), recordIdPath()],
          responses: {
            200: jsonResponse('Task record.', '#/components/schemas/TaskRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        },
        put: {
          tags: ['Data'],
          summary: 'Update task',
          operationId: 'updateTask',
          parameters: [demoAppHeader(), recordIdPath()],
          requestBody: jsonRequestBody('#/components/schemas/TaskWriteRequest'),
          responses: {
            200: jsonResponse('Updated task.', '#/components/schemas/TaskRecord'),
            400: errorResponse(),
            404: errorResponse()
          }
        },
        delete: {
          tags: ['Data'],
          summary: 'Delete task',
          operationId: 'deleteTask',
          parameters: [demoAppHeader(), recordIdPath()],
          responses: {
            200: jsonResponse('Delete result.', '#/components/schemas/DeletedResponse'),
            400: errorResponse(),
            404: errorResponse()
          }
        }
      },
      '/api/proxy': {
        post: {
          tags: ['Proxy'],
          summary: 'Proxy an outbound HTTP request',
          operationId: 'proxyRequest',
          parameters: [demoAppHeader()],
          requestBody: jsonRequestBody('#/components/schemas/ProxyRequest'),
          responses: {
            200: {
              description: 'Successful proxied response. The content type matches the upstream response.'
            },
            400: errorResponse(),
            401: errorResponse(),
            409: errorResponse()
          }
        }
      }
    },
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          },
          required: ['error']
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          },
          required: ['success']
        },
        DeletedResponse: {
          allOf: [{ $ref: '#/components/schemas/SuccessResponse' }]
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            docusignConfigured: { type: 'boolean' }
          },
          required: ['status', 'timestamp', 'docusignConfigured']
        },
        AppRecord: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            data: { type: 'object', additionalProperties: true },
            docusignScopes: { type: ['string', 'null'] },
            docusignUserId: { type: ['string', 'null'] },
            docusignAccountId: { type: ['string', 'null'] },
            docusignAccountName: { type: ['string', 'null'] },
            docusignUserName: { type: ['string', 'null'] },
            docusignEmail: { type: ['string', 'null'] },
            docusignAvailableAccounts: { type: 'array', items: { type: 'object', additionalProperties: true } },
            createdAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' }
          },
          required: ['slug', 'data', 'docusignAvailableAccounts']
        },
        AuthSession: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            requestedScopes: { type: ['string', 'null'] },
            app: { $ref: '#/components/schemas/AppRecord' },
            userId: { type: ['string', 'null'] },
            accountId: { type: ['string', 'null'] },
            accountName: { type: ['string', 'null'] },
            name: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            accounts: { type: 'array', items: { type: 'object', additionalProperties: true } },
            accountSelectionRequired: { type: 'boolean' }
          },
          required: ['connected', 'requestedScopes']
        },
        PrewarmResponse: {
          type: 'object',
          properties: {
            session: { $ref: '#/components/schemas/AuthSession' },
            warmed: { type: 'boolean' },
            reason: { type: ['string', 'null'] }
          },
          required: ['session', 'warmed']
        },
        SelectAccountRequest: {
          type: 'object',
          properties: {
            accountId: { type: 'string' }
          },
          required: ['accountId']
        },
        SelectAccountResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            account: { type: 'object', additionalProperties: true }
          },
          required: ['success', 'account']
        },
        SaveScopesRequest: {
          type: 'object',
          properties: {
            scopes: { type: 'string' }
          },
          required: ['scopes']
        },
        SaveScopesResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            requestedScopes: { type: 'string' }
          },
          required: ['success', 'requestedScopes']
        },
        EmployeeRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            appSlug: { type: 'string' },
            displayName: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            title: { type: ['string', 'null'] },
            data: { type: 'object', additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' }
          },
          required: ['id', 'appSlug', 'data']
        },
        EmployeeWriteRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            displayName: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            title: { type: ['string', 'null'] },
            data: { type: ['object', 'null'], additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' }
          }
        },
        CustomerRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            appSlug: { type: 'string' },
            employeeId: { type: ['string', 'null'] },
            displayName: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            organization: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            data: { type: 'object', additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' }
          },
          required: ['id', 'appSlug', 'data']
        },
        CustomerWriteRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            employeeId: { type: ['string', 'null'] },
            displayName: { type: ['string', 'null'] },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            organization: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            data: { type: ['object', 'null'], additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' }
          }
        },
        EnvelopeRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            appSlug: { type: 'string' },
            employeeId: { type: ['string', 'null'] },
            customerId: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            name: { type: ['string', 'null'] },
            data: { type: 'object', additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' }
          },
          required: ['id', 'appSlug', 'data']
        },
        EnvelopeWriteRequest: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Required on create. Use the DocuSign envelope ID directly.' },
            employeeId: { type: ['string', 'null'] },
            customerId: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            name: { type: ['string', 'null'] },
            data: { type: ['object', 'null'], additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' }
          }
        },
        TaskRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            appSlug: { type: 'string' },
            employeeId: { type: ['string', 'null'] },
            customerId: { type: ['string', 'null'] },
            title: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            dueAt: { type: ['string', 'null'], format: 'date-time' },
            data: { type: 'object', additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' }
          },
          required: ['id', 'appSlug', 'data']
        },
        TaskWriteRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            employeeId: { type: ['string', 'null'] },
            customerId: { type: ['string', 'null'] },
            title: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            dueAt: { type: ['string', 'null'], format: 'date-time' },
            data: { type: ['object', 'null'], additionalProperties: true },
            createdAt: { type: ['string', 'null'], format: 'date-time' }
          }
        },
        ProxyRequest: {
          type: 'object',
          properties: {
            method: { type: 'string' },
            authMode: { type: 'string', enum: ['none', 'bearer', 'docusign'] },
            url: { type: ['string', 'null'] },
            path: { type: ['string', 'null'] },
            baseUrl: { type: ['string', 'null'] },
            bearerToken: { type: ['string', 'null'] },
            headers: { type: ['object', 'null'], additionalProperties: { type: 'string' } },
            query: { type: ['object', 'null'], additionalProperties: true },
            body: {}
          }
        }
      }
    }
  };
}

module.exports = {
  API_TITLE,
  API_VERSION,
  buildOpenApiDocument
};
