/**
 * TGK Demo API Client
 * Thin fetch wrapper that handles sessions, errors, and the backend base URL.
 * Include this in any frontend via <script src="../shared/js/api-client.js"></script>
 */
(function () {
  const SESSION_CACHE_TTL_MS = 30000;
  const DOCUSIGN_PREWARM_SUCCESS_TTL_MS = 10 * 60 * 1000;
  const DOCUSIGN_PREWARM_RETRY_TTL_MS = 30000;
  const SELECTED_CUSTOMER_STORAGE_PREFIX = 'tgk_selected_customer:';

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

  function mapEmployee(employee) {
    const data = employee?.data || {};
    const displayName = pickDisplayName(employee?.display_name, [
      [data.firstName, data.lastName].filter(Boolean).join(' '),
      employee?.email,
      employee?.title,
      employee?.id
    ]);
    const name = splitDisplayName(displayName);
    return {
      id: employee.id,
      first_name: data.firstName || name.firstName,
      last_name: data.lastName || name.lastName,
      name: displayName,
      email: employee.email,
      phone: employee.phone,
      title: employee.title || data.title || '',
      metadata: {
        ...data,
        title: employee.title || data.title || ''
      },
      created_at: employee.created_at
    };
  }

  function mapEmbeddedAccount(account, customerId) {
    const data = account && typeof account === 'object' ? account : {};
    return {
      id: data.id,
      customer_id: customerId,
      account_type: data.typeCode || data.accountType || data.kind || 'account',
      status: data.status || 'active',
      metadata: {
        ...data,
        name: data.name || data.title || 'Untitled Account'
      },
      created_at: data.created_at || ''
    };
  }

  function mapEnvelope(envelope) {
    return {
      ...envelope,
      status: envelope?.status || 'created',
      name: envelope?.name || ''
    };
  }

  function mapTask(task) {
    const data = task?.data || {};
    return {
      ...task,
      title: task?.title || data.title || 'Untitled task',
      description: task?.description || data.description || '',
      status: task?.status || 'pending'
    };
  }

  function mapCustomerToView(customer) {
    const data = customer?.data || {};
    const displayName = pickDisplayName(customer?.display_name, [
      [data.firstName, data.lastName].filter(Boolean).join(' '),
      customer?.email,
      customer?.organization,
      customer?.id
    ]);
    const name = splitDisplayName(displayName);
    return {
      id: customer.id,
      first_name: data.firstName || name.firstName,
      last_name: data.lastName || name.lastName,
      name: displayName,
      email: customer.email,
      phone: customer.phone,
      company: customer.organization,
      type: data.contactType || 'investor',
      tags: Array.isArray(data.tags) ? data.tags : [],
      metadata: {
        ...data,
        status: customer.status || data.status
      },
      employee_id: customer.employee_id || null,
      created_at: customer.created_at
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
      authMode = 'none',
      bearerToken,
      headers,
      query,
      body
    } = options || {};

    return { method, url, path, baseUrl, authMode, bearerToken, headers, query, body };
  }

  function getSelectedCustomerStorageKey(appSlug) {
    return `${SELECTED_CUSTOMER_STORAGE_PREFIX}${String(appSlug || 'default').trim().toLowerCase()}`;
  }

  const TGK_API = {
    baseUrl: window.TGK_CONFIG?.backendUrl || 'http://localhost:3000',
    docusignIamBaseUrl: window.TGK_CONFIG?.docusignIamBaseUrl || 'https://api-d.docusign.com',
    appSlug: window.TGK_CONFIG?.appSlug || '',
    appName: window.TGK_CONFIG?.appName || '',
    _sessionCache: null,
    _sessionCacheExpiresAt: 0,
    _sessionPromise: null,
    _docusignPrewarmResult: null,
    _docusignPrewarmExpiresAt: 0,
    _docusignPrewarmPromise: null,
    _docusignWarmScheduled: false,

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

    cacheSession(session) {
      this._sessionCache = session;
      this._sessionCacheExpiresAt = Date.now() + SESSION_CACHE_TTL_MS;
    },

    clearDocusignPrewarmCache() {
      this._docusignPrewarmResult = null;
      this._docusignPrewarmExpiresAt = 0;
      this._docusignPrewarmPromise = null;
    },

    clearSessionCache() {
      this._sessionCache = null;
      this._sessionCacheExpiresAt = 0;
      this._sessionPromise = null;
      this.clearDocusignPrewarmCache();
    },

    async getSession(options = {}) {
      const force = !!options.force;
      if (!force && this._sessionCache && this._sessionCacheExpiresAt > Date.now()) {
        return this._sessionCache;
      }

      if (!force && this._sessionPromise) {
        return this._sessionPromise;
      }

      this._sessionPromise = this.get('/api/auth/session')
        .then((session) => {
          this.cacheSession(session);
          return session;
        })
        .finally(() => {
          this._sessionPromise = null;
        });

      return this._sessionPromise;
    },

    async prewarmDocusignAuth(options = {}) {
      const force = !!options.force;
      if (!force && this._docusignPrewarmResult && this._docusignPrewarmExpiresAt > Date.now()) {
        return this._docusignPrewarmResult;
      }

      if (!force && this._docusignPrewarmPromise) {
        return this._docusignPrewarmPromise;
      }

      this._docusignPrewarmPromise = this.get('/api/auth/prewarm')
        .then((result) => {
          if (result?.session) {
            this.cacheSession(result.session);
          }
          this._docusignPrewarmResult = result;
          this._docusignPrewarmExpiresAt = Date.now() + (result?.warmed ? DOCUSIGN_PREWARM_SUCCESS_TTL_MS : DOCUSIGN_PREWARM_RETRY_TTL_MS);
          return result;
        })
        .finally(() => {
          this._docusignPrewarmPromise = null;
        });

      return this._docusignPrewarmPromise;
    },

    async logout() {
      this.clearSessionCache();
      return this.post('/api/auth/logout');
    },

    async selectAccount(accountId) {
      const result = await this.post('/api/auth/account', { accountId });
      this.clearSessionCache();
      return result;
    },

    async saveDocusignScopes(scopes) {
      const result = await this.post('/api/auth/scopes', { scopes });
      this.clearSessionCache();
      return result;
    },

    getBackendOrigin() {
      return new URL(this.baseUrl, window.location.href).origin;
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

    async warmDocusignExperience() {
      this.warmOrigin(this.getDocusignAppOrigin());
      return this.prewarmDocusignAuth().catch(function () {
        return null;
      });
    },

    scheduleDocusignWarmup() {
      if (this._docusignWarmScheduled) {
        return;
      }

      this._docusignWarmScheduled = true;
      const warm = () => {
        this.warmDocusignExperience();
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warm, { timeout: 2500 });
        return;
      }

      window.setTimeout(warm, 1200);
    },

    getLoginUrl(redirect, scopes, display) {
      const params = new URLSearchParams({
        redirect: redirect || window.location.href,
        app: this.appSlug || '',
        appName: this.appName || ''
      });
      if (scopes) {
        params.set('scopes', scopes);
      }
      if (display) {
        params.set('display', display);
      }
      return `${this.baseUrl}/api/auth/login?${params.toString()}`;
    },

    getEmployees(params) {
      return this.get(withSearchParams('/api/data/employees', params)).then((employees) => employees.map(mapEmployee));
    },
    getCustomersRaw(params) {
      return this.get(withSearchParams('/api/data/customers', params));
    },
    getCustomerRaw(id) {
      return this.get(getItemPath('/api/data/customers', id));
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
      const requests = [this.getCustomerRaw(id)];

      if (includeEnvelopes) {
        requests.push(this.getEnvelopesRaw({ customerId: id }));
      }
      if (includeTasks) {
        requests.push(this.getTasksRaw({ customerId: id }));
      }

      const responses = await Promise.all(requests);
      const customer = responses[0];
      const envelopes = includeEnvelopes ? responses[1] : [];
      const tasks = includeTasks ? responses[responses.length - 1] : [];

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

    proxyText(options) {
      return this.requestText('/api/proxy', {
        method: 'POST',
        body: buildProxyPayload(options)
      });
    },

    triggerMaestroWorkflow(workflowId, body) {
      return this.proxy({
        method: 'POST',
        path: `/v1/accounts/{accountId}/workflows/${workflowId}/actions/trigger`,
        baseUrl: this.docusignIamBaseUrl,
        authMode: 'docusign',
        body
      });
    },

    listNavigatorAgreements(params) {
      return this.proxy({
        method: 'GET',
        path: '/v1/accounts/{accountId}/agreements',
        baseUrl: this.docusignIamBaseUrl,
        authMode: 'docusign',
        query: params
      });
    }
  };

  window.TGK_API = TGK_API;
})();
