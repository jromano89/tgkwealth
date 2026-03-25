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

    // Apps
    getCurrentApp() { return this.get('/api/apps/current'); },

    // Auth
    getSession() { return this.get('/api/auth/session'); },
    logout() { return this.post('/api/auth/logout'); },
    selectAccount(accountId) { return this.post('/api/auth/account', { accountId }); },
    getBackendOrigin() {
      return new URL(this.baseUrl, window.location.href).origin;
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
