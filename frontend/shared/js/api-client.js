/**
 * TGK Demo API Client
 * Thin fetch wrapper that handles errors, the backend base URL, and DocuSign token fetches.
 * Include this in any frontend via <script src="../shared/js/api-client.js"></script>
 */
(function () {
  const DOCUSIGN_CONSENT_WINDOW_NAME = 'tgk-docusign-consent';
  const DOCUSIGN_CONSENT_POLL_MS = 400;
  const DOCUSIGN_TOKEN_REFRESH_BUFFER_MS = 60000;
  const SELECTED_CUSTOMER_STORAGE_PREFIX = 'tgk_selected_customer:';
  const DOCUSIGN_TOKEN_STORAGE_PREFIX = 'tgk_docusign_token:';

  function splitDisplayName(displayName) {
    const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return { firstName: '', lastName: '' };
    }
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  function pickDisplayName(value, fallbacks) {
    const explicit = String(value || '').trim();
    if (explicit) {
      return explicit;
    }

    for (const fallback of fallbacks || []) {
      const normalized = String(fallback || '').trim();
      if (normalized) {
        return normalized;
      }
    }

    return '';
  }

  function withSearchParams(path, params) {
    if (!params) {
      return path;
    }

    const query = new URLSearchParams(params).toString();
    return query ? `${path}?${query}` : path;
  }

  function getItemPath(collectionPath, id) {
    return `${collectionPath}/${encodeURIComponent(id)}`;
  }

  function buildCustomerDetailParams(options = {}) {
    const params = {};

    if (options.includeEnvelopes) {
      params.includeEnvelopes = 'true';
    }
    if (options.includeTasks) {
      params.includeTasks = 'true';
    }

    return Object.keys(params).length > 0 ? params : null;
  }

  function mapEmployee(employee) {
    const data = employee?.data || {};
    const displayName = pickDisplayName(employee?.displayName, [
      employee?.email,
      employee?.title,
      employee?.id
    ]);
    const name = splitDisplayName(displayName);
    return {
      id: employee.id,
      first_name: name.firstName,
      last_name: name.lastName,
      name: displayName,
      email: employee.email,
      phone: employee.phone,
      title: employee.title || data.title || '',
      metadata: {
        ...data,
        title: employee.title || data.title || ''
      },
      created_at: employee.createdAt,
      createdAt: employee.createdAt
    };
  }

  function mapEmbeddedAccount(account, customerId) {
    const data = account && typeof account === 'object' ? account : {};
    const accountType = data.accountType || 'Account';
    return {
      id: data.id,
      customer_id: customerId,
      customerId,
      account_type: accountType,
      accountType,
      status: data.status || 'active',
      metadata: {
        ...data,
        name: data.name || data.title || 'Untitled Account',
        accountType
      },
      created_at: data.createdAt || data.created_at || '',
      createdAt: data.createdAt || data.created_at || ''
    };
  }

  function mapEnvelope(envelope) {
    return {
      ...envelope,
      employee_id: envelope?.employeeId || null,
      customer_id: envelope?.customerId || null,
      created_at: envelope?.createdAt || '',
      updated_at: envelope?.updatedAt || '',
      status: envelope?.status || 'created',
      name: envelope?.name || ''
    };
  }

  function mapTask(task) {
    const data = task?.data || {};
    return {
      ...task,
      employee_id: task?.employeeId || null,
      customer_id: task?.customerId || null,
      due_at: task?.dueAt || '',
      created_at: task?.createdAt || '',
      updated_at: task?.updatedAt || '',
      title: task?.title || data.title || 'Untitled task',
      description: task?.description || data.description || '',
      status: task?.status || 'pending'
    };
  }

  function mapCustomerToView(customer) {
    const data = customer?.data || {};
    const displayName = pickDisplayName(customer?.displayName, [
      customer?.email,
      customer?.organization,
      customer?.id
    ]);
    const name = splitDisplayName(displayName);
    return {
      id: customer.id,
      first_name: name.firstName,
      last_name: name.lastName,
      name: displayName,
      email: customer.email,
      phone: customer.phone,
      company: customer.organization,
      type: 'investor',
      metadata: {
        ...data,
        status: customer.status || data.status
      },
      employee_id: customer.employeeId || null,
      employeeId: customer.employeeId || null,
      created_at: customer.createdAt,
      createdAt: customer.createdAt
    };
  }

  function getErrorMessage(payload, fallbackMessage) {
    if (typeof payload === 'string') {
      return payload || fallbackMessage;
    }

    if (payload && typeof payload === 'object') {
      const details = [
        payload.error,
        payload.message,
        payload.error_description,
        payload.details,
        payload.title
      ].filter(Boolean);
      if (details.length > 0) {
        return details[0];
      }

      try {
        return JSON.stringify(payload);
      } catch (error) {
        return fallbackMessage;
      }
    }

    return fallbackMessage;
  }

  function serializeBodyWithAppContext(client, body, headers) {
    if (!body || typeof body !== 'object' || body instanceof FormData) {
      return body;
    }

    if (Array.isArray(body)) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      return JSON.stringify(body);
    }

    const payload = client.appSlug && !Object.prototype.hasOwnProperty.call(body, 'appSlug')
      ? { ...body, appSlug: client.appSlug }
      : body;

    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    return JSON.stringify(payload);
  }

  function buildProxyPayload(options) {
    const {
      method = 'GET',
      url,
      path,
      baseUrl,
      accessToken,
      headers,
      query,
      body
    } = options || {};

    return { method, url, path, baseUrl, accessToken, headers, query, body };
  }

  function getSelectedCustomerStorageKey(appSlug) {
    return `${SELECTED_CUSTOMER_STORAGE_PREFIX}${String(appSlug || 'default').trim().toLowerCase()}`;
  }

  function getDocusignTokenStorageKey(config = {}) {
    const parts = [
      String(config.baseUrl || '').trim().toLowerCase(),
      String(config.userId || '').trim().toLowerCase(),
      String(config.accountId || '').trim().toLowerCase(),
      String(config.scopes || '').trim().toLowerCase()
    ];

    return `${DOCUSIGN_TOKEN_STORAGE_PREFIX}${parts.join(':')}`;
  }

  function normalizeDocusignTokenRecord(value) {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const accessToken = String(value.accessToken || value.access_token || '').trim();
    const expiresAtRaw = value.expiresAt || value.expires_at || '';
    const expiresAt = new Date(expiresAtRaw).getTime();

    if (!accessToken || Number.isNaN(expiresAt)) {
      return null;
    }

    return {
      accessToken,
      expiresAt
    };
  }

  const TGK_API = {
    baseUrl: window.TGK_CONFIG?.backendUrl || 'http://localhost:3000',
    docusignIamBaseUrl: window.TGK_CONFIG?.docusignIamBaseUrl || 'https://api-d.docusign.com',
    docusignUserId: window.TGK_CONFIG?.docusignAuth?.userId || '',
    docusignAccountId: window.TGK_CONFIG?.docusignAuth?.accountId || '',
    docusignScopes: window.TGK_CONFIG?.docusignAuth?.scopes || '',
    appSlug: window.TGK_CONFIG?.appSlug || '',
    appName: window.TGK_CONFIG?.appName || '',
    _docusignTokenCache: null,
    _docusignTokenPromise: null,

    withAppQuery(path) {
      if (!this.appSlug) {
        return path;
      }

      const url = new URL(path, this.baseUrl);
      if (!url.searchParams.has('app')) {
        url.searchParams.set('app', this.appSlug);
      }
      return `${url.pathname}${url.search}`;
    },

    async requestResponse(path, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      const headers = { ...(options.headers || {}) };
      const requestPath = this.withAppQuery(path);
      const requestOptions = {
        ...options,
        method
      };

      if (requestOptions.body !== undefined) {
        requestOptions.body = serializeBodyWithAppContext(this, requestOptions.body, headers);
      }

      if (Object.keys(headers).length > 0) {
        requestOptions.headers = headers;
      }

      const response = await fetch(`${this.baseUrl}${requestPath}`, requestOptions);
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json().catch(() => ({ error: response.statusText }))
          : await response.text().catch(() => response.statusText);
        throw new Error(getErrorMessage(payload, `API error: ${response.status}`));
      }

      return response;
    },

    async request(path, options = {}) {
      const response = await this.requestResponse(path, options);
      return response.json();
    },

    async requestText(path, options = {}) {
      const response = await this.requestResponse(path, options);
      return response.text();
    },

    get(path) {
      return this.request(path);
    },
    post(path, body) {
      return this.request(path, { method: 'POST', body });
    },
    put(path, body) {
      return this.request(path, { method: 'PUT', body });
    },
    del(path) {
      return this.request(path, { method: 'DELETE' });
    },

    getDocusignAppOrigin() {
      const defaultOrigin = 'https://apps-d.docusign.com';
      try {
        const configured = this.docusignIamBaseUrl || defaultOrigin;
        const url = new URL(configured, window.location.href);
        url.host = url.host.replace(/^api(?=[.-])/, 'apps');
        return url.origin;
      } catch (error) {
        return defaultOrigin;
      }
    },

    warmOrigin(origin) {
      let normalizedOrigin;
      try {
        normalizedOrigin = new URL(origin, window.location.href).origin;
      } catch (error) {
        return;
      }

      const key = normalizedOrigin.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      if (document.head.querySelector(`link[data-warm-origin="${key}"]`)) {
        return;
      }

      const dnsPrefetch = document.createElement('link');
      dnsPrefetch.rel = 'dns-prefetch';
      dnsPrefetch.href = normalizedOrigin;
      dnsPrefetch.dataset.warmOrigin = key;
      document.head.appendChild(dnsPrefetch);

      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = normalizedOrigin;
      preconnect.crossOrigin = '';
      preconnect.dataset.warmOrigin = key;
      document.head.appendChild(preconnect);
    },

    getPreferredCustomerId() {
      try {
        return window.localStorage.getItem(getSelectedCustomerStorageKey(this.appSlug)) || '';
      } catch (error) {
        return '';
      }
    },

    setPreferredCustomerId(customerId) {
      try {
        const key = getSelectedCustomerStorageKey(this.appSlug);
        const normalized = String(customerId || '').trim();
        if (!normalized) {
          window.localStorage.removeItem(key);
          return;
        }
        window.localStorage.setItem(key, normalized);
      } catch (error) {
        // Ignore localStorage write failures.
      }
    },

    warmDocusignExperience() {
      this.warmOrigin(this.getDocusignAppOrigin());
    },

    getDocusignAuthConfig() {
      return {
        userId: String(this.docusignUserId || '').trim(),
        accountId: String(this.docusignAccountId || '').trim(),
        scopes: String(this.docusignScopes || '').trim()
      };
    },

    hasDocusignAuthConfig() {
      const config = this.getDocusignAuthConfig();
      return !!(config.userId && config.accountId && config.scopes);
    },

    getDocusignConsentUrl() {
      const scopes = this.getDocusignAuthConfig().scopes;
      if (!scopes) {
        throw new Error('Missing Docusign scopes in frontend config.');
      }

      const params = new URLSearchParams({ scopes });
      return `${this.baseUrl}/api/auth/login?${params.toString()}`;
    },

    startDocusignConsent() {
      const backendOrigin = new URL(this.baseUrl, window.location.href).origin;
      const popup = window.open(
        this.getDocusignConsentUrl(),
        DOCUSIGN_CONSENT_WINDOW_NAME,
        'popup=yes,width=540,height=720,resizable=yes,scrollbars=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Allow popups and retry.');
      }

      if (typeof popup.focus === 'function') {
        popup.focus();
      }

      return new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
          window.removeEventListener('message', handleMessage);
          window.clearInterval(pollTimer);
        };

        const finish = (callback) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          callback();
        };

        const handleMessage = (event) => {
          const payload = event.data;
          if (event.origin !== backendOrigin || !payload || payload.source !== 'tgk-docusign-consent') {
            return;
          }

          if (payload.status === 'success') {
            finish(() => resolve(payload));
            return;
          }

          finish(() => reject(new Error(payload.message || 'Docusign consent failed.')));
        };

        const pollTimer = window.setInterval(() => {
          if (!popup.closed) {
            return;
          }

          finish(() => reject(new Error('Docusign consent window was closed before completion.')));
        }, DOCUSIGN_CONSENT_POLL_MS);

        window.addEventListener('message', handleMessage);
      });
    },

    getDocusignTokenStorageKey() {
      return getDocusignTokenStorageKey({
        baseUrl: this.baseUrl,
        ...this.getDocusignAuthConfig()
      });
    },

    isDocusignTokenUsable(tokenRecord, bufferMs = DOCUSIGN_TOKEN_REFRESH_BUFFER_MS) {
      return !!(tokenRecord?.accessToken && tokenRecord.expiresAt > Date.now() + bufferMs);
    },

    readStoredDocusignToken() {
      try {
        const rawValue = window.localStorage.getItem(this.getDocusignTokenStorageKey());
        if (!rawValue) {
          return null;
        }

        return normalizeDocusignTokenRecord(JSON.parse(rawValue));
      } catch (error) {
        return null;
      }
    },

    writeStoredDocusignToken(tokenRecord) {
      try {
        window.localStorage.setItem(this.getDocusignTokenStorageKey(), JSON.stringify({
          accessToken: tokenRecord.accessToken,
          expiresAt: new Date(tokenRecord.expiresAt).toISOString()
        }));
      } catch (error) {
        // Ignore localStorage write failures.
      }
    },

    clearDocusignTokenCache() {
      this._docusignTokenCache = null;
      this._docusignTokenPromise = null;

      try {
        window.localStorage.removeItem(this.getDocusignTokenStorageKey());
      } catch (error) {
        // Ignore localStorage write failures.
      }
    },

    readCachedDocusignToken() {
      if (this.isDocusignTokenUsable(this._docusignTokenCache)) {
        return this._docusignTokenCache;
      }

      const storedToken = this.readStoredDocusignToken();
      if (this.isDocusignTokenUsable(storedToken)) {
        this._docusignTokenCache = storedToken;
        return storedToken;
      }

      return null;
    },

    async getDocusignAccessToken(options = {}) {
      const force = !!options.force;
      const config = this.getDocusignAuthConfig();

      if (!config.userId) {
        throw new Error('Missing Docusign user ID in frontend config.');
      }
      if (!config.accountId) {
        throw new Error('Missing Docusign account ID in frontend config.');
      }
      if (!config.scopes) {
        throw new Error('Missing Docusign scopes in frontend config.');
      }

      if (!force) {
        const cachedToken = this.readCachedDocusignToken();
        if (cachedToken) {
          return cachedToken.accessToken;
        }
      }

      if (this._docusignTokenPromise) {
        const tokenRecord = await this._docusignTokenPromise;
        return tokenRecord.accessToken;
      }

      this._docusignTokenPromise = this.post('/api/auth/token', config)
        .then((payload) => {
          const tokenRecord = normalizeDocusignTokenRecord(payload);
          if (!tokenRecord) {
            throw new Error('Docusign token response was invalid.');
          }

          this._docusignTokenCache = tokenRecord;
          this.writeStoredDocusignToken(tokenRecord);
          return tokenRecord;
        })
        .catch((error) => {
          this.clearDocusignTokenCache();
          throw error;
        })
        .finally(() => {
          this._docusignTokenPromise = null;
        });

      const tokenRecord = await this._docusignTokenPromise;
      return tokenRecord.accessToken;
    },

    replaceDocusignAccountId(value) {
      if (typeof value !== 'string' || !value.includes('{accountId}')) {
        return value;
      }

      const accountId = this.getDocusignAuthConfig().accountId;
      if (!accountId) {
        throw new Error('Missing Docusign account ID in frontend config.');
      }

      return value.replace(/\{accountId\}/g, accountId);
    },

    buildDocusignProxyOptions(options = {}) {
      return {
        ...options,
        baseUrl: options.baseUrl || this.docusignIamBaseUrl,
        url: this.replaceDocusignAccountId(options.url),
        path: this.replaceDocusignAccountId(options.path)
      };
    },

    getEmployees(params) {
      return this.get(withSearchParams('/api/data/employees', params)).then((employees) => employees.map(mapEmployee));
    },
    getCustomersRaw(params) {
      return this.get(withSearchParams('/api/data/customers', params));
    },
    getCustomerRaw(id, options = {}) {
      return this.get(withSearchParams(getItemPath('/api/data/customers', id), buildCustomerDetailParams(options)));
    },
    updateCustomerRaw(id, body) {
      return this.put(getItemPath('/api/data/customers', id), body);
    },
    deleteCustomerRaw(id) {
      return this.del(getItemPath('/api/data/customers', id));
    },
    getTasksRaw(params) {
      return this.get(withSearchParams('/api/data/tasks', params));
    },
    getTaskRaw(id) {
      return this.get(getItemPath('/api/data/tasks', id));
    },
    createTaskRaw(body) {
      return this.post('/api/data/tasks', body);
    },
    updateTaskRaw(id, body) {
      return this.put(getItemPath('/api/data/tasks', id), body);
    },
    deleteTaskRaw(id) {
      return this.del(getItemPath('/api/data/tasks', id));
    },
    getEnvelopesRaw(params) {
      return this.get(withSearchParams('/api/data/envelopes', params));
    },

    async getCustomers(params) {
      const customers = await this.getCustomersRaw(params);
      return customers.map(mapCustomerToView);
    },
    async getCustomer(id, options = {}) {
      const includeEnvelopes = options.includeEnvelopes !== false;
      const includeTasks = options.includeTasks !== false;
      const customer = await this.getCustomerRaw(id, {
        includeEnvelopes,
        includeTasks
      });
      const envelopes = includeEnvelopes ? (customer.envelopes || []) : [];
      const tasks = includeTasks ? (customer.tasks || []) : [];

      return {
        ...mapCustomerToView(customer),
        accounts: (customer.data?.accounts || []).map((account) => mapEmbeddedAccount(account, customer.id)),
        envelopes: envelopes.map(mapEnvelope),
        tasks: tasks.map(mapTask)
      };
    },
    async updateCustomer(id, body) {
      await this.updateCustomerRaw(id, body);
      return this.getCustomer(id);
    },
    deleteCustomer(id) {
      return this.deleteCustomerRaw(id);
    },
    async getTasks(params) {
      const tasks = await this.getTasksRaw(params);
      return tasks.map(mapTask);
    },
    async getEnvelopes(params) {
      const envelopes = await this.getEnvelopesRaw(params);
      return envelopes.map(mapEnvelope);
    },
    async createTask(body) {
      return mapTask(await this.createTaskRaw(body));
    },
    async updateTask(id, body) {
      return mapTask(await this.updateTaskRaw(id, body));
    },
    deleteTask(id) {
      return this.deleteTaskRaw(id);
    },

    proxy(options) {
      return this.request('/api/proxy', {
        method: 'POST',
        body: buildProxyPayload(options)
      });
    },

    proxyResponse(options) {
      return this.requestResponse('/api/proxy', {
        method: 'POST',
        body: buildProxyPayload(options)
      });
    },

    proxyText(options) {
      return this.requestText('/api/proxy', {
        method: 'POST',
        body: buildProxyPayload(options)
      });
    },

    async proxyDocusign(options) {
      return this.proxy({
        ...this.buildDocusignProxyOptions(options),
        accessToken: await this.getDocusignAccessToken()
      });
    },

    async proxyDocusignResponse(options) {
      return this.proxyResponse({
        ...this.buildDocusignProxyOptions(options),
        accessToken: await this.getDocusignAccessToken()
      });
    },

    triggerMaestroWorkflow(workflowId, body) {
      return this.proxyDocusign({
        method: 'POST',
        path: `/v1/accounts/{accountId}/workflows/${workflowId}/actions/trigger`,
        body
      });
    }
  };

  window.TGK_API = TGK_API;
})();
