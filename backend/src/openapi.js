const API_TITLE = 'Vertical Demo Backend API';
const API_VERSION = '1.1.0';

function buildOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildOpenApiDocument(req) {
  const origin = buildOrigin(req);

  return {
    openapi: '3.1.0',
    info: {
      title: API_TITLE,
      version: API_VERSION,
      summary: 'CORS-enabled, app-scoped backend for auth, proxy, webhooks, and structured demo data.',
      description: [
        'This service is designed as a reusable backend foundation for demo environments across multiple verticals.',
        'Canonical client behavior:',
        '- Send `X-Demo-App` on every app-scoped `/api/auth`, `/api/data`, and `/api/proxy` request.',
        '- Use camelCase in request bodies.',
        '- Expect persisted record payloads to come back with snake_case field names.',
        '- Use `/api/proxy` to reach third-party APIs while centralizing auth, CORS, and environment-aware configuration.'
      ].join('\n\n'),
      contact: {
        name: 'Demo Platform Backend'
      },
      license: {
        name: 'UNLICENSED'
      },
      'x-stack-profile': 'vertical-agnostic-demo-backend',
      'x-llm-guidance': {
        preferredAppScopeHeader: 'X-Demo-App',
        preferredRequestBodyCase: 'camelCase',
        primaryMachineReadableDocs: `${origin}/api/openapi.json`,
        humanReadableDocs: `${origin}/api/docs`
      }
    },
    servers: [
      {
        url: origin,
        description: 'Current deployment'
      }
    ],
    externalDocs: {
      description: 'LLM-oriented service notes',
      url: `${origin}/.well-known/llms.txt`
    },
    tags: [
      {
        name: 'Health',
        description: 'Operational readiness and deployment health.'
      },
      {
        name: 'Auth',
        description: 'App-scoped Docusign consent, account selection, session introspection, and logout.'
      },
      {
        name: 'Data',
        description: 'App-scoped demo records for users, contacts, tasks, and envelopes.'
      },
      {
        name: 'Proxy',
        description: 'Configurable outbound HTTP proxy with optional bearer or Docusign auth.'
      },
      {
        name: 'Webhooks',
        description: 'Inbound webhook sinks for demo and integration testing.'
      },
      {
        name: 'Docs',
        description: 'Machine-readable and human-readable service metadata.'
      }
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Get service health',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Service health payload.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' }
                }
              }
            }
          }
        }
      },
      '/api/auth/login': {
        get: {
          tags: ['Auth'],
          summary: 'Start Docusign consent',
          description: 'Starts the Docusign consent flow for the provided app slug. Intended to be opened in a browser or popup.',
          operationId: 'startDocusignConsent',
          parameters: [
            {
              name: 'app',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Logical app or tenant slug.'
            },
            {
              name: 'appName',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Optional display name for the app.'
            },
            {
              name: 'redirect',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'uri' },
              description: 'Frontend URL to return to after consent completes.'
            },
            {
              name: 'scopes',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Optional override for requested Docusign scopes.'
            },
            {
              name: 'display',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['redirect', 'popup']
              },
              description: 'Choose whether the consent flow should resolve by full-page redirect or popup messaging.'
            }
          ],
          responses: {
            302: {
              description: 'Redirects to the upstream Docusign consent URL.'
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/auth/session': {
        get: {
          tags: ['Auth'],
          summary: 'Read app auth session',
          operationId: 'getAuthSession',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          responses: {
            200: {
              description: 'Current Docusign connection state for the app.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthSession' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/auth/prewarm': {
        get: {
          tags: ['Auth'],
          summary: 'Prewarm Docusign access token',
          operationId: 'prewarmDocusignAuth',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          responses: {
            200: {
              description: 'Session plus token warmup result.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PrewarmResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/auth/account': {
        post: {
          tags: ['Auth'],
          summary: 'Select active Docusign account',
          operationId: 'selectDocusignAccount',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SelectAccountRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Selected account persisted.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SelectAccountResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Clear app connection',
          operationId: 'logoutDocusignSession',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          responses: {
            200: {
              description: 'Connection removed for the app.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/data/users': {
        get: {
          tags: ['Data'],
          summary: 'List users',
          operationId: 'listUsers',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            {
              name: 'search',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Searches `display_name`, `email`, and `title`.'
            }
          ],
          responses: {
            200: {
              description: 'User records for the app.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/UserRecord' }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        },
        post: {
          tags: ['Data'],
          summary: 'Create user',
          operationId: 'createUser',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserCreateRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Created user record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserRecord' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/data/users/{id}': {
        put: {
          tags: ['Data'],
          summary: 'Update user',
          operationId: 'updateUser',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            { $ref: '#/components/parameters/RecordIdPath' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserUpdateRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated user record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserRecord' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/data/contacts': {
        get: {
          tags: ['Data'],
          summary: 'List contacts',
          operationId: 'listContacts',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by contact status.'
            },
            {
              name: 'source',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by source identifier.'
            },
            {
              name: 'ownerUserId',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter by owning user ID.'
            },
            {
              name: 'search',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Searches `display_name`, `email`, and `organization`.'
            }
          ],
          responses: {
            200: {
              description: 'Contact records for the app.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ContactRecord' }
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        },
        post: {
          tags: ['Data'],
          summary: 'Create contact',
          operationId: 'createContact',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContactCreateRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Created contact record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContactRecord' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/data/contacts/{id}': {
        get: {
          tags: ['Data'],
          summary: 'Get contact detail',
          operationId: 'getContact',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            { $ref: '#/components/parameters/RecordIdPath' }
          ],
          responses: {
            200: {
              description: 'Contact record including owner and envelope list.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContactDetail' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        },
        put: {
          tags: ['Data'],
          summary: 'Update contact',
          operationId: 'updateContact',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            { $ref: '#/components/parameters/RecordIdPath' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContactUpdateRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated contact record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContactRecord' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        },
        delete: {
          tags: ['Data'],
          summary: 'Delete contact',
          operationId: 'deleteContact',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            { $ref: '#/components/parameters/RecordIdPath' }
          ],
          responses: {
            200: {
              description: 'Delete confirmation.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DeletedResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/data/envelopes': {
        post: {
          tags: ['Data'],
          summary: 'Create envelope record',
          description: 'Creates an app-scoped envelope record. At least one of `contactId` or `userId` must be supplied.',
          operationId: 'createEnvelope',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EnvelopeCreateRequest' }
              }
            }
          },
          responses: {
            201: {
              description: 'Created envelope record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EnvelopeRecord' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/data/envelopes/{id}': {
        put: {
          tags: ['Data'],
          summary: 'Update envelope record',
          operationId: 'updateEnvelope',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' },
            { $ref: '#/components/parameters/RecordIdPath' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EnvelopeUpdateRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Updated envelope record.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EnvelopeRecord' }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/proxy': {
        post: {
          tags: ['Proxy'],
          summary: 'Proxy an outbound HTTP request',
          description: 'Routes an outbound request through the backend. Supports unauthenticated, caller-supplied bearer, or Docusign-backed auth modes.',
          operationId: 'proxyRequest',
          parameters: [
            { $ref: '#/components/parameters/DemoAppHeader' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProxyRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'Successful proxied response. Content type and payload shape are passed through from the target service.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true
                  }
                },
                'text/plain': {
                  schema: { type: 'string' }
                },
                'application/octet-stream': {
                  schema: {
                    type: 'string',
                    format: 'binary'
                  }
                }
              }
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            401: { $ref: '#/components/responses/ErrorResponse' },
            404: { $ref: '#/components/responses/ErrorResponse' }
          }
        }
      },
      '/api/webhooks/docusign': {
        post: {
          tags: ['Webhooks'],
          summary: 'Receive Docusign webhook payloads',
          description: 'Discard-only webhook sink for integration testing. The payload is accepted and acknowledged but not persisted.',
          operationId: 'receiveDocusignWebhook',
          requestBody: {
            required: true,
            content: {
              '*/*': {
                schema: {
                  oneOf: [
                    { type: 'object', additionalProperties: true },
                    { type: 'string' }
                  ]
                }
              }
            }
          },
          responses: {
            202: {
              description: 'Payload accepted and discarded.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookReceipt' }
                }
              }
            }
          }
        }
      },
      '/api/openapi.json': {
        get: {
          tags: ['Docs'],
          summary: 'Get the OpenAPI document',
          operationId: 'getOpenApiDocument',
          responses: {
            200: {
              description: 'OpenAPI 3.1 document for this deployment.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      parameters: {
        DemoAppHeader: {
          name: 'X-Demo-App',
          in: 'header',
          required: true,
          schema: { type: 'string' },
          description: 'Canonical app or tenant slug used to scope auth state, proxy calls, and demo records.'
        },
        RecordIdPath: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Record identifier.'
        }
      },
      responses: {
        ErrorResponse: {
          description: 'Error payload',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      },
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
          type: 'object',
          properties: {
            deleted: { type: 'boolean' }
          },
          required: ['deleted']
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            docusignConfigured: { type: 'boolean' }
          },
          required: ['status', 'timestamp', 'docusignConfigured']
        },
        AppSummary: {
          type: 'object',
          properties: {
            slug: { type: 'string', example: 'acme-demo' },
            name: { type: 'string', example: 'Acme Demo' }
          },
          required: ['slug', 'name']
        },
        DocusignAccount: {
          type: 'object',
          properties: {
            accountId: { type: 'string' },
            accountName: { type: 'string' },
            isDefault: { type: 'boolean' }
          },
          required: ['accountId']
        },
        AuthSession: {
          type: 'object',
          properties: {
            connected: { type: 'boolean' },
            userId: { type: 'string' },
            accountId: { type: 'string' },
            accountName: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            accounts: {
              type: 'array',
              items: { $ref: '#/components/schemas/DocusignAccount' }
            },
            accountSelectionRequired: { type: 'boolean' },
            app: { $ref: '#/components/schemas/AppSummary' }
          },
          required: ['connected']
        },
        PrewarmResponse: {
          type: 'object',
          properties: {
            session: { $ref: '#/components/schemas/AuthSession' },
            warmed: { type: 'boolean' },
            reason: { type: 'string' }
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
            account: { $ref: '#/components/schemas/DocusignAccount' }
          },
          required: ['success', 'account']
        },
        TaskInput: {
          type: 'object',
          description: 'Canonical write shape for tasks. The backend currently tolerates some snake_case aliases, but new clients should use camelCase.',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            contactId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', example: 'pending' },
            createdAt: { type: 'string', format: 'date-time' }
          },
          required: ['title']
        },
        TaskRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: ['string', 'null'] },
            contact_id: { type: ['string', 'null'] },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            status: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'title', 'status', 'created_at']
        },
        JsonMetadata: {
          type: 'object',
          additionalProperties: true,
          description: 'Free-form JSON metadata stored per record.'
        },
        UserCreateRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            title: { type: 'string' },
            data: { $ref: '#/components/schemas/JsonMetadata' },
            tasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaskInput' }
            }
          },
          required: ['displayName']
        },
        UserUpdateRequest: {
          type: 'object',
          properties: {
            displayName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            title: { type: 'string' },
            data: { $ref: '#/components/schemas/JsonMetadata' },
            tasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaskInput' }
            }
          }
        },
        UserRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            app_id: { type: 'string' },
            display_name: { type: 'string' },
            email: { type: ['string', 'null'], format: 'email' },
            phone: { type: ['string', 'null'] },
            title: { type: ['string', 'null'] },
            data: { $ref: '#/components/schemas/JsonMetadata' },
            tasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaskRecord' }
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'app_id', 'display_name', 'data', 'tasks']
        },
        ContactCreateRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ownerUserId: { type: 'string' },
            ref: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            organization: { type: 'string' },
            status: { type: 'string', example: 'active' },
            source: { type: 'string', example: 'api' },
            data: { $ref: '#/components/schemas/JsonMetadata' },
            tasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaskInput' }
            }
          },
          required: ['displayName']
        },
        ContactUpdateRequest: {
          type: 'object',
          properties: {
            ownerUserId: { type: 'string' },
            ref: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            organization: { type: 'string' },
            status: { type: 'string' },
            source: { type: 'string' },
            data: { $ref: '#/components/schemas/JsonMetadata' },
            tasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaskInput' }
            }
          }
        },
        ContactRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            app_id: { type: 'string' },
            owner_user_id: { type: 'string' },
            ref: { type: ['string', 'null'] },
            display_name: { type: 'string' },
            email: { type: ['string', 'null'], format: 'email' },
            phone: { type: ['string', 'null'] },
            organization: { type: ['string', 'null'] },
            status: { type: 'string' },
            data: { $ref: '#/components/schemas/JsonMetadata' },
            tasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaskRecord' }
            },
            source: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'app_id', 'owner_user_id', 'display_name', 'status', 'data', 'tasks', 'source']
        },
        ContactDetail: {
          allOf: [
            { $ref: '#/components/schemas/ContactRecord' },
            {
              type: 'object',
              properties: {
                owner: {
                  anyOf: [
                    { $ref: '#/components/schemas/UserRecord' },
                    { type: 'null' }
                  ]
                },
                envelopes: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/EnvelopeRecord' }
                }
              },
              required: ['owner', 'envelopes']
            }
          ]
        },
        EnvelopeCreateRequest: {
          type: 'object',
          description: 'At least one of `contactId` or `userId` must be provided.',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            contactId: { type: 'string' },
            docusignEnvelopeId: { type: 'string' },
            status: { type: 'string', example: 'sent' },
            documentName: { type: 'string' },
            completedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        EnvelopeUpdateRequest: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            contactId: { type: 'string' },
            docusignEnvelopeId: { type: 'string' },
            status: { type: 'string' },
            documentName: { type: 'string' },
            completedAt: { type: 'string', format: 'date-time' }
          }
        },
        EnvelopeRecord: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            app_id: { type: 'string' },
            user_id: { type: ['string', 'null'] },
            docusign_envelope_id: { type: ['string', 'null'] },
            contact_id: { type: ['string', 'null'] },
            status: { type: 'string' },
            document_name: { type: ['string', 'null'] },
            completed_at: { type: ['string', 'null'], format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'app_id', 'status', 'created_at']
        },
        ProxyRequest: {
          type: 'object',
          description: 'Provide either `url` or `path`. When `authMode` is `docusign`, `{accountId}` placeholders in `baseUrl`, `url`, or `path` are replaced automatically.',
          properties: {
            method: { type: 'string', example: 'GET', default: 'GET' },
            authMode: {
              type: 'string',
              enum: ['none', 'bearer', 'docusign'],
              default: 'none'
            },
            url: {
              type: 'string',
              format: 'uri',
              description: 'Absolute outbound URL.'
            },
            path: {
              type: 'string',
              description: 'Relative or absolute path resolved against `baseUrl`.'
            },
            baseUrl: {
              type: 'string',
              format: 'uri',
              description: 'Base URL used when `path` is supplied.'
            },
            bearerToken: {
              type: 'string',
              description: 'Required when `authMode` is `bearer`.'
            },
            headers: {
              type: 'object',
              additionalProperties: {
                type: 'string'
              }
            },
            query: {
              type: 'object',
              additionalProperties: true
            },
            body: {
              oneOf: [
                { type: 'object', additionalProperties: true },
                { type: 'array', items: {} },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' }
              ]
            }
          }
        },
        WebhookReceipt: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            discarded: { type: 'boolean' }
          },
          required: ['success', 'discarded']
        }
      }
    }
  };
}

function buildDocsHtml(req) {
  const origin = buildOrigin(req);
  const openApiUrl = `${origin}/api/openapi.json`;
  const llmsUrl = `${origin}/.well-known/llms.txt`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${API_TITLE}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --panel: #0f1b2d;
        --muted: #92a3b8;
        --text: #f5f7fb;
        --accent: #55a6ff;
        --accent-soft: rgba(85, 166, 255, 0.14);
        --line: rgba(255, 255, 255, 0.08);
        --code: #08111d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(85, 166, 255, 0.18), transparent 26rem),
          linear-gradient(180deg, #091525 0%, #050b14 100%);
        color: var(--text);
        min-height: 100vh;
      }
      .shell {
        max-width: 1100px;
        margin: 0 auto;
        padding: 48px 24px 64px;
      }
      .hero {
        display: grid;
        gap: 24px;
        padding: 28px;
        border: 1px solid var(--line);
        background: rgba(15, 27, 45, 0.78);
        backdrop-filter: blur(14px);
        border-radius: 24px;
      }
      h1 {
        margin: 0;
        font-size: clamp(2rem, 3vw, 3rem);
        line-height: 1.05;
      }
      .sub {
        margin: 0;
        max-width: 760px;
        color: var(--muted);
        line-height: 1.65;
        font-size: 1rem;
      }
      .links, .grid {
        display: grid;
        gap: 16px;
      }
      .links {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .grid {
        margin-top: 20px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .card {
        border: 1px solid var(--line);
        background: rgba(9, 17, 31, 0.72);
        border-radius: 20px;
        padding: 18px 18px 20px;
      }
      .eyebrow {
        margin: 0 0 10px;
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 1.1rem;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      a.button {
        display: inline-flex;
        margin-top: 16px;
        text-decoration: none;
        color: var(--text);
        background: var(--accent-soft);
        border: 1px solid rgba(85, 166, 255, 0.28);
        padding: 10px 14px;
        border-radius: 12px;
        font-weight: 600;
      }
      pre {
        margin: 0;
        overflow: auto;
        padding: 16px;
        border-radius: 16px;
        background: var(--code);
        border: 1px solid var(--line);
        color: #d9e6f5;
        font-size: 0.9rem;
        line-height: 1.5;
      }
      .section {
        margin-top: 28px;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div>
          <div class="eyebrow">API Docs</div>
          <h1>${API_TITLE}</h1>
        </div>
        <p class="sub">A reusable, app-scoped backend for demos that need auth, proxying, webhook intake, and a lightweight structured data store. The machine-readable OpenAPI document is the source of truth for future LLM skills and deployment consumers.</p>
        <div class="links">
          <div class="card">
            <div class="eyebrow">OpenAPI</div>
            <h2>Machine-readable contract</h2>
            <p>Use the JSON spec directly for generated clients, skills, and deployment-time integrations.</p>
            <a class="button" href="/api/openapi.json">Open /api/openapi.json</a>
          </div>
          <div class="card">
            <div class="eyebrow">LLM Notes</div>
            <h2>Service orientation</h2>
            <p>A short machine-readable descriptor with conventions, flows, and discovery links.</p>
            <a class="button" href="/.well-known/llms.txt">Open /.well-known/llms.txt</a>
          </div>
        </div>
      </section>

      <section class="section grid">
        <div class="card">
          <div class="eyebrow">Conventions</div>
          <h2>Canonical request shape</h2>
          <p>Send <code>X-Demo-App</code> on app-scoped requests. Use camelCase in request bodies. Expect persisted records to come back with snake_case keys.</p>
        </div>
        <div class="card">
          <div class="eyebrow">Capabilities</div>
          <h2>Reusable stack layers</h2>
          <p><strong>Auth</strong> for Docusign consent and account selection, <strong>Data</strong> for app-scoped demo records, <strong>Proxy</strong> for outbound API access, and <strong>Webhooks</strong> for inbound test sinks.</p>
        </div>
        <div class="card">
          <div class="eyebrow">Deployable</div>
          <h2>CORS-first consumption</h2>
          <p>The service exposes permissive CORS headers and is designed to sit behind a deployed frontend, extension, or agent skill without requiring a separate BFF per demo.</p>
        </div>
      </section>

      <section class="section">
        <div class="card">
          <div class="eyebrow">Quickstart</div>
          <h2>Example app-scoped data read</h2>
          <pre>curl -s ${origin}/api/data/contacts \\
  -H "X-Demo-App: acme-demo"</pre>
        </div>
      </section>

      <section class="section">
        <div class="card">
          <div class="eyebrow">Quickstart</div>
          <h2>Example proxied Docusign request</h2>
          <pre>curl -s ${origin}/api/proxy \\
  -H "Content-Type: application/json" \\
  -H "X-Demo-App: acme-demo" \\
  -d '{
    "method": "GET",
    "path": "/v2.1/accounts/{accountId}/users",
    "authMode": "docusign"
  }'</pre>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function buildLlmsTxt(req) {
  const origin = buildOrigin(req);

  return `# ${API_TITLE}

> CORS-enabled, app-scoped backend stack for reusable demos.

## Docs
- OpenAPI: ${origin}/api/openapi.json
- Human docs: ${origin}/api/docs

## Canonical conventions
- Send X-Demo-App on app-scoped /api/auth, /api/data, and /api/proxy requests.
- Use camelCase in request bodies.
- Persisted records come back with snake_case field names.
- Use /api/proxy for third-party API access instead of calling upstream services directly from the client.

## Major capabilities
- Auth: Docusign consent, session lookup, account selection, token prewarm, logout
- Data: users, contacts, tasks embedded as first-class arrays on users and contacts, envelopes
- Proxy: outbound HTTP with authMode=none, bearer, or docusign
- Webhooks: discard-only Docusign Connect sink for test and demo workflows

## Recommended flow for new clients
1. Read the OpenAPI document.
2. Choose an app slug and send it as X-Demo-App.
3. If Docusign is needed, start consent with GET /api/auth/login?app=<slug>&redirect=<url>.
4. Poll GET /api/auth/session and POST /api/auth/account once consent completes.
5. Create and update app-scoped records through /api/data.
6. Use /api/proxy for external API actions that should inherit centralized auth or CORS behavior.
`;
}

module.exports = {
  API_TITLE,
  API_VERSION,
  buildDocsHtml,
  buildLlmsTxt,
  buildOpenApiDocument
};
