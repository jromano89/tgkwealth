/**
 * TGK Demo API Client
 * Thin fetch wrapper that handles sessions, errors, and the backend base URL.
 * Include this in any frontend via <script src="../shared/js/api-client.js"></script>
 */
(function () {
  function splitDisplayName(displayName) {
    const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  function mapProfileToContact(profile) {
    const data = profile?.data || {};
    const name = splitDisplayName(profile?.display_name);
    return {
      id: profile.id,
      ref: profile.ref,
      first_name: data.firstName || name.firstName,
      last_name: data.lastName || name.lastName,
      email: profile.email,
      phone: profile.phone,
      company: profile.organization,
      type: data.profileType || profile.kind,
      tags: profile.tags || [],
      metadata: {
        ...data,
        status: profile.status || data.status
      },
      source: profile.source,
      created_at: profile.created_at
    };
  }

  function mapRecordToAccount(record) {
    const data = record?.data || {};
    return {
      id: record.id,
      ref: record.ref,
      contact_id: record.profile_id,
      account_type: data.typeCode || record.kind,
      status: record.status,
      metadata: {
        ...data,
        name: record.title
      },
      source: record.source,
      created_at: record.created_at
    };
  }

  function mapContactPayload(data) {
    return {
      ref: data.ref,
      kind: data.kind || 'investor',
      displayName: [data.firstName, data.lastName].filter(Boolean).join(' ') || data.displayName,
      email: data.email,
      phone: data.phone,
      organization: data.company,
      status: data.metadata?.status || data.status || 'active',
      tags: data.tags || [],
      data: {
        ...data.metadata,
        firstName: data.firstName,
        lastName: data.lastName,
        profileType: data.type
      },
      source: data.source
    };
  }

  function mapAccountPayload(data) {
    return {
      ref: data.ref,
      profileId: data.contactId || data.profileId,
      kind: data.kind || 'account',
      title: data.metadata?.name || data.title || 'Untitled Record',
      status: data.status || 'active',
      data: {
        ...data.metadata,
        typeCode: data.accountType || data.account_type
      },
      source: data.source
    };
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
      if (!this.appSlug) return path;
      const url = new URL(path, this.baseUrl);
      if (!url.searchParams.has('app')) {
        url.searchParams.set('app', this.appSlug);
      }
      return `${url.pathname}${url.search}`;
    },

    async requestResponse(path, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const headers = { ...(options.headers || {}) };
      const opts = {
        ...options,
        method,
        credentials: 'include'
      };

      let requestPath = this.withAppQuery(path);

      if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
        if (this.appSlug && !Object.prototype.hasOwnProperty.call(opts.body, 'appSlug')) {
          opts.body = { ...opts.body, appSlug: this.appSlug };
        }
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        opts.body = JSON.stringify(opts.body);
      }

      if (Object.keys(headers).length > 0) {
        opts.headers = headers;
      }

      const url = `${this.baseUrl}${requestPath}`;
      const res = await fetch(url, opts);
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          const details = [
            err.error,
            err.message,
            err.error_description,
            err.details,
            err.title
          ].filter(Boolean);
          throw new Error(details[0] || JSON.stringify(err) || `API error: ${res.status}`);
        }
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(errText || `API error: ${res.status}`);
      }
      return res;
    },

    async request(path, options = {}) {
      const res = await this.requestResponse(path, options);
      return res.json();
    },

    async requestText(path, options = {}) {
      const res = await this.requestResponse(path, options);
      return res.text();
    },

    get(path) { return this.request(path); },
    post(path, body) { return this.request(path, { method: 'POST', body }); },
    put(path, body) { return this.request(path, { method: 'PUT', body }); },
    del(path) { return this.request(path, { method: 'DELETE' }); },

    // Apps
    getCurrentApp() { return this.get('/api/apps/current'); },

    // Auth
    cacheSession(session) {
      this._sessionCache = session;
      this._sessionCacheExpiresAt = Date.now() + 30000;
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

      const app = this;
      this._sessionPromise = this.get('/api/auth/session')
        .then(function (session) {
          app.cacheSession(session);
          return session;
        })
        .finally(function () {
          app._sessionPromise = null;
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

      const app = this;
      this._docusignPrewarmPromise = this.get('/api/auth/prewarm')
        .then(function (result) {
          if (result?.session) {
            app.cacheSession(result.session);
          }
          app._docusignPrewarmResult = result;
          app._docusignPrewarmExpiresAt = Date.now() + (result?.warmed ? 10 * 60 * 1000 : 30000);
          return result;
        })
        .finally(function () {
          app._docusignPrewarmPromise = null;
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
      } catch (e) {
        return defaultOrigin;
      }
    },
    warmOrigin(origin) {
      let normalizedOrigin;
      try {
        normalizedOrigin = new URL(origin, window.location.href).origin;
      } catch (e) {
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
      const app = this;
      const warm = function () {
        app.warmDocusignExperience();
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

    // Generic data
    getProfiles(params) {
      const q = params ? '?' + new URLSearchParams(params) : '';
      return this.get(`/api/data/profiles${q}`);
    },
    getProfile(id) { return this.get(`/api/data/profiles/${id}`); },
    createProfile(data) { return this.post('/api/data/profiles', data); },
    updateProfile(id, data) { return this.put(`/api/data/profiles/${id}`, data); },
    deleteProfile(id) { return this.del(`/api/data/profiles/${id}`); },
    getRecords(params) {
      const q = params ? '?' + new URLSearchParams(params) : '';
      return this.get(`/api/data/records${q}`);
    },
    getRecord(id) { return this.get(`/api/data/records/${id}`); },
    createRecord(data) { return this.post('/api/data/records', data); },
    updateRecord(id, data) { return this.put(`/api/data/records/${id}`, data); },

    // Wealth convenience wrappers
    async getContacts(params) {
      const profiles = await this.getProfiles({ kind: 'investor', ...params });
      return profiles.map(mapProfileToContact);
    },
    async getContact(id) {
      const profile = await this.getProfile(id);
      return {
        ...mapProfileToContact(profile),
        accounts: (profile.records || []).filter(record => record.kind === 'account').map(mapRecordToAccount),
        envelopes: profile.envelopes || []
      };
    },
    async createContact(data) {
      const profile = await this.createProfile(mapContactPayload(data));
      return mapProfileToContact(profile);
    },
    async updateContact(id, data) {
      const profile = await this.updateProfile(id, mapContactPayload(data));
      return mapProfileToContact(profile);
    },
    async getAccounts(params) {
      const records = await this.getRecords({ kind: 'account', ...params });
      return records.map(mapRecordToAccount);
    },
    async getAccount(id) {
      const record = await this.getRecord(id);
      return {
        ...mapRecordToAccount(record),
        envelopes: record.envelopes || []
      };
    },
    async createAccount(data) {
      const record = await this.createRecord(mapAccountPayload(data));
      return mapRecordToAccount(record);
    },

    // Envelopes
    createEnvelope(data) { return this.post('/api/envelopes', data); },
    getEnvelopes(params) {
      const q = params ? '?' + new URLSearchParams(params) : '';
      return this.get(`/api/envelopes${q}`);
    },
    getEnvelope(id) { return this.get(`/api/envelopes/${id}`); },
    getSigningUrl(id, data) { return this.post(`/api/envelopes/${id}/signing-url`, data); },

    // Proxy
    proxy(methodOrOptions, path, body) {
      if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
        const {
          method = 'GET',
          url,
          path: targetPath,
          baseUrl,
          authMode = 'none',
          bearerToken,
          headers,
          query,
          body: proxyBody
        } = methodOrOptions;

        return this.request('/api/proxy', {
          method: 'POST',
          body: { method, url, path: targetPath, baseUrl, authMode, bearerToken, headers, query, body: proxyBody }
        });
      }

      return this.request(`/api/proxy/${path}`, { method: methodOrOptions, body });
    },

    proxyText(options) {
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

      return this.requestText('/api/proxy', {
        method: 'POST',
        body: { method, url, path, baseUrl, authMode, bearerToken, headers, query, body }
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

    // Health
    health() { return this.get('/api/health'); }
  };

  window.TGK_API = TGK_API;
})();
