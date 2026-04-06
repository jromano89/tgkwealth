/**
 * Shared UI helpers and mount points for the TGK frontend.
 */

// Format numeric values to a compact dollar display.
function fmtMoney(amount) {
  const dollars = Number(amount);
  if (!Number.isFinite(dollars)) return '$0';
  if (Math.abs(dollars) >= 1e9) return '$' + (dollars / 1e9).toFixed(2) + 'B';
  if (Math.abs(dollars) >= 1e6) return '$' + (dollars / 1e6).toFixed(2) + 'M';
  if (Math.abs(dollars) >= 1e3) return '$' + (dollars / 1e3).toFixed(0) + 'K';
  return '$' + dollars.toFixed(2);
}

function normalizePercentValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.abs(numeric) < 1 ? numeric * 100 : numeric;
}

// Format percentage
function fmtPct(n) {
  const normalized = normalizePercentValue(n);
  const sign = normalized >= 0 ? '+' : '';
  return sign + normalized.toFixed(1) + '%';
}

function getPortalConfig() {
  return window.TGK_CONFIG || {};
}

function getPortalName(fallback = '') {
  const portalName = String(getPortalConfig().portalName || '').trim();
  return portalName || fallback;
}

function getPortalLabel(key, fallback = '') {
  const value = String(getPortalConfig().labels?.[key] || '').trim();
  return value || fallback;
}

function getAccountTypeLabel(account) {
  const accountTypes = getPortalConfig().labels?.accountTypes || {};
  const typeCode = String(account?.accountType || account?.account_type || '').trim();
  const explicitLabel = String(account?.metadata?.accountType || '').trim();

  return accountTypes[typeCode] || explicitLabel || typeCode;
}

const TGK_IAM_PRODUCTS = Object.freeze([
  { key: 'doc-gen', label: 'Doc Gen', icon: 'doc-gen', isBuilt: false },
  { key: 'id-verification', label: 'ID Verification', icon: 'id-verification', isBuilt: false },
  { key: 'monitor', label: 'Monitor', icon: 'monitor', isBuilt: true },
  { key: 'notary', label: 'Notary', icon: 'notary', isBuilt: false },
  { key: 'web-forms', label: 'Web Forms', icon: 'web-forms', isBuilt: false },
  { key: 'workspaces', label: 'Workspaces', icon: 'workspaces', isBuilt: false }
]);

function getIamProducts() {
  return TGK_IAM_PRODUCTS.map((product) => ({ ...product }));
}

function getIamProduct(productKey) {
  const key = String(productKey || '').trim().toLowerCase();
  return TGK_IAM_PRODUCTS.find((product) => product.key === key) || null;
}

function getIamProductPlaceholder(productKey, portalName = '') {
  const product = getIamProduct(productKey);
  if (!product || product.isBuilt) {
    return null;
  }

  const scope = String(portalName || 'this portal').trim();
  const copy = {
    'doc-gen': {
      description: `Document generation templates are not wired into ${scope} yet.`,
      checkpoints: [
        'Template selection and data binding placeholder',
        'Output preview and package assembly placeholder',
        'Delivery into downstream agreement flows placeholder'
      ]
    },
    'id-verification': {
      description: `Identity verification is reserved in ${scope}, but the live flow is not connected yet.`,
      checkpoints: [
        'Identity session launch placeholder',
        'Verification result summary placeholder',
        'Risk signals and remediation placeholder'
      ]
    },
    notary: {
      description: `Remote online notarization is planned for ${scope}, but there is no live experience here yet.`,
      checkpoints: [
        'Notary session intake placeholder',
        'Signer and witness preparation placeholder',
        'Completion and audit handoff placeholder'
      ]
    },
    'web-forms': {
      description: `Web Forms is included in the navigation model, but the interactive form builder is not implemented yet.`,
      checkpoints: [
        'Form entry experience placeholder',
        'Submission routing placeholder',
        'Agreement creation handoff placeholder'
      ]
    },
    workspaces: {
      description: `Workspaces is staged in ${scope}, but the collaborative workspace view has not been built yet.`,
      checkpoints: [
        'Workspace landing view placeholder',
        'Shared document list placeholder',
        'Participant activity stream placeholder'
      ]
    }
  };

  return {
    label: product.label,
    eyebrow: 'Docusign IAM Product',
    title: `${product.label} is not yet built out`,
    description: copy[product.key]?.description || `A placeholder view exists for ${product.label}, but the live experience is not connected yet.`,
    checkpoints: copy[product.key]?.checkpoints || [
      'Navigation placeholder',
      'Workflow placeholder',
      'Detail experience placeholder'
    ]
  };
}

function envelopeTimestampLabel(envelope) {
  const rawTimestamp = envelope?.created_at || '';
  if (!rawTimestamp) return '';

  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function buildMonitorAlerts(customers = []) {
  const now = Date.now();
  const hour = 36e5;
  const day = 864e5;
  const investorName = (index, fallback) => {
    const customer = customers[index];
    return customer ? (customer.name || `${customer.first_name} ${customer.last_name}`) : fallback;
  };

  return [
    {
      id: 'alert-1',
      severity: 'critical',
      title: 'Signing activity from sanctioned region',
      description: `Envelope signed from IP 185.143.234.17 geolocated to Tehran, Iran. Investor: ${investorName(0, 'Margaret Chen')}. Document: Account Transfer Authorization.`,
      timestamp: new Date(now - 2 * hour).toISOString()
    },
    {
      id: 'alert-2',
      severity: 'high',
      title: 'Repeat failed login attempts',
      description: `14 failed authentication attempts in 6 minutes from IP 91.207.174.22 (Moscow, Russia) targeting account: ${investorName(1, 'David Torres')}.`,
      timestamp: new Date(now - 5 * hour).toISOString()
    },
    {
      id: 'alert-3',
      severity: 'high',
      title: 'Anomalous bulk document export',
      description: '47 documents downloaded in 8 minutes by operations user James Whitaker. Normal baseline: 2-5 per hour.',
      timestamp: new Date(now - 9 * hour).toISOString()
    },
    {
      id: 'alert-4',
      severity: 'medium',
      title: 'Admin permission change',
      description: `User Rachel Dunn's (Junior Associate) role was changed from "Viewer" to "Account Admin"`,
      timestamp: new Date(now - 1 * day).toISOString()
    }
  ];
}

function monitorTimeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// Status badge classes
function statusClasses(status) {
  const map = {
    active: 'bg-green-100 text-green-700',
    review: 'bg-amber-100 text-amber-700',
    pending: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    sent: 'bg-blue-100 text-blue-700',
    delivered: 'bg-indigo-100 text-indigo-700',
    created: 'bg-gray-100 text-gray-600',
    declined: 'bg-red-100 text-red-700',
    voided: 'bg-gray-100 text-gray-500'
  };
  return map[(status || '').toLowerCase()] || 'bg-gray-100 text-gray-600';
}

// Generate initials from a name
function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// SVG sparkline points for a positive/negative trend (for <polyline>)
function sparklinePath(positive) {
  if (positive) {
    return '0,20 10,18 20,15 30,16 40,12 50,10 60,8 70,6 80,4';
  }
  return '0,4 10,6 20,8 30,7 40,12 50,14 60,16 70,18 80,20';
}

function stockTickerTemplate() {
  return `
    <div class="bg-navy text-white text-[11px] h-7 overflow-hidden relative z-50" x-data="stockTicker()">
      <div class="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-navy to-transparent z-10"></div>
      <div class="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-navy to-transparent z-10"></div>
      <div class="ticker-scroll flex items-center h-full whitespace-nowrap">
        <template x-for="(item, i) in [...prices, ...prices]" :key="'t'+i">
          <span class="inline-flex items-center px-4 gap-1.5 transition-colors" :class="item.flash">
            <span class="font-semibold" x-text="item.sym"></span>
            <span x-text="fmt(item.price)"></span>
            <span :class="item.change >= 0 ? 'text-green-400' : 'text-red-400'" x-text="fmtChange(item.change)"></span>
          </span>
        </template>
      </div>
    </div>
  `;
}

function newsPanelTemplate() {
  return `
    <div x-data="newsPanel()">
      <button @click="toggleOpen()" class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50">
        <span>📺</span> Headlines <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
      </button>
      <template x-if="open">
        <div>
          <div class="fixed inset-0 bg-black/30 z-40" @click="open = false"></div>
          <div class="fixed right-0 top-0 bottom-0 w-[420px] bg-white shadow-2xl z-50 overflow-auto p-6 transition-transform">
            <div class="flex justify-between items-center mb-4">
              <h2 class="font-semibold text-lg text-navy">Market Headlines</h2>
              <button @click="open = false" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <input x-model="search" placeholder="Filter headlines" class="w-full px-3 py-2 border rounded-lg text-sm mb-3">
            <div class="flex gap-1.5 flex-wrap mb-4">
              <template x-for="cat in categories" :key="cat">
                <button @click="activeCategory = cat" class="px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wide transition-colors"
                  :class="activeCategory === cat ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                  x-text="cat === 'all' ? 'All' : cat"></button>
              </template>
            </div>
            <template x-if="loading && !loaded">
              <div class="rounded-xl border border-gray-200 bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">
                Loading live headlines...
              </div>
            </template>
            <template x-if="!loading && error && !loaded">
              <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600">
                Unable to load live headlines.
              </div>
            </template>
            <template x-if="!loading && !error && loaded && filteredItems.length === 0">
              <div class="rounded-xl border border-gray-200 bg-slate-50 px-4 py-6 text-center text-sm text-gray-500">
                No live headlines matched your filters.
              </div>
            </template>
            <div class="space-y-3" x-show="loaded && filteredItems.length > 0">
              <template x-for="item in filteredItems" :key="item.title">
                <a
                  :href="item.link || '#'"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                  :class="{ 'pointer-events-none': !item.link }">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-gray-500" x-text="item.category"></span>
                    <template x-if="item.badge">
                      <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" :class="item.badgeColor" x-text="item.badge"></span>
                    </template>
                    <span class="ml-auto text-[10px] text-gray-400" x-text="item.time"></span>
                  </div>
                  <div class="font-medium text-sm text-navy mb-1" x-text="item.title"></div>
                  <div class="text-xs text-gray-500" x-text="item.summary"></div>
                  <div class="mt-2 flex items-center gap-1.5">
                    <div class="w-1.5 h-1.5 rounded-full" :class="impactColor(item.impact)"></div>
                    <span class="text-[10px] text-gray-400" x-text="item.impact + ' impact'"></span>
                  </div>
                </a>
              </template>
            </div>
            <div class="mt-4 text-center text-[10px] text-gray-400 flex items-center justify-center gap-1.5" x-show="loaded && filteredItems.length > 0">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Live feed
            </div>
          </div>
        </div>
      </template>
    </div>
  `;
}

function mountSharedTemplate(element, template) {
  if (!element) return;
  element.innerHTML = template;
  if (window.Alpine && typeof window.Alpine.initTree === 'function') {
    window.Alpine.initTree(element);
  }
}

function revokeEnvelopePreview(modalState) {
  const previewUrl = modalState?.previewUrl || '';
  if (previewUrl.startsWith('blob:')) {
    window.URL.revokeObjectURL(previewUrl);
  }
}

function createEnvelopeModalHelpers() {
  return {
    envelopeDocModal: null,
    envelopeHistoryModal: null,

    closeEnvelopeDocModal() {
      revokeEnvelopePreview(this.envelopeDocModal);
      this.envelopeDocModal = null;
    },

    closeEnvelopeHistoryModal() {
      this.envelopeHistoryModal = null;
    },

    async viewEnvelopeDoc(envelope) {
      const envelopeId = envelope?.id;
      if (!envelopeId) return;

      const requestKey = `${envelopeId}:${Date.now()}`;
      const title = envelope?.name || 'Document';

      this.closeEnvelopeDocModal();
      this.envelopeDocModal = {
        envelopeId,
        title,
        previewUrl: '',
        loading: true,
        error: null,
        requestKey
      };

      try {
        const response = await TGK_API.requestResponse('/api/proxy', {
          method: 'POST',
          body: {
            method: 'GET',
            path: `/v2.1/accounts/{accountId}/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`,
            query: { certificate: 'true' },
            authMode: 'docusign'
          }
        });
        const blob = await response.blob();
        const previewUrl = window.URL.createObjectURL(blob);

        if (!this.envelopeDocModal || this.envelopeDocModal.requestKey !== requestKey) {
          window.URL.revokeObjectURL(previewUrl);
          return;
        }

        this.envelopeDocModal = {
          ...this.envelopeDocModal,
          previewUrl,
          loading: false,
          error: null
        };
      } catch (error) {
        if (!this.envelopeDocModal || this.envelopeDocModal.requestKey !== requestKey) {
          return;
        }

        this.envelopeDocModal = {
          ...this.envelopeDocModal,
          loading: false,
          error: error.message || 'Unable to load the document preview.'
        };
      }
    },

    async viewEnvelopeHistory(envelope) {
      const envelopeId = envelope?.id;
      if (!envelopeId) return;

      const title = envelope?.name || 'Document';
      const requestKey = `${envelopeId}:${Date.now()}`;

      this.envelopeHistoryModal = {
        envelopeId,
        title,
        events: [],
        loading: true,
        error: null,
        requestKey
      };

      try {
        const result = await TGK_API.proxy({
          method: 'GET',
          path: `/v2.1/accounts/{accountId}/envelopes/${encodeURIComponent(envelopeId)}/audit_events`,
          authMode: 'docusign'
        });
        const events = (result.auditEvents || [])
          .map((event) => {
            const fields = {};
            (event.eventFields || []).forEach((field) => {
              fields[field.name] = field.value;
            });
            return {
              ...fields,
              LogTime: fields.LogTime || fields.logTime || ''
            };
          })
          .filter((fields) => fields.Action);

        if (!this.envelopeHistoryModal || this.envelopeHistoryModal.requestKey !== requestKey) {
          return;
        }

        this.envelopeHistoryModal = {
          ...this.envelopeHistoryModal,
          events,
          loading: false,
          error: null
        };
      } catch (error) {
        if (!this.envelopeHistoryModal || this.envelopeHistoryModal.requestKey !== requestKey) {
          return;
        }

        this.envelopeHistoryModal = {
          ...this.envelopeHistoryModal,
          loading: false,
          error: error.message || 'Unable to load envelope history.'
        };
      }
    }
  };
}

function sharedSettingsTemplate() {
  return `
    <section class="tgk-settings-shell">
      <div class="tgk-settings-grid">
        <div class="tgk-settings-stack">
          <template x-if="canSeeDocusignSettings()">
            <section class="tgk-settings-card" x-data="docusignSettings()">
              <div class="tgk-settings-card__header tgk-settings-card__header--split">
                <div>
                  <div class="tgk-settings-card__eyebrow">Docusign Account</div>
                  <p class="tgk-settings-card__text">Connect once and save the Docusign account used across both portals.</p>
                </div>
                <button @click="openScopesModal()" class="tgk-button tgk-button--secondary">Scopes</button>
              </div>

              <div class="tgk-settings-card__body">
                <template x-if="loading">
                  <div class="tgk-banner tgk-banner--neutral">
                    <div class="tgk-banner__label">Checking Connection</div>
                    <div class="tgk-banner__meta">Loading the current Docusign session.</div>
                  </div>
                </template>

                <template x-if="error">
                  <div class="tgk-banner tgk-banner--danger">
                    <div class="tgk-banner__label">Connection Error</div>
                    <div class="tgk-banner__meta" x-text="error"></div>
                  </div>
                </template>

                <template x-if="!loading && hasSavedAccount()">
                  <div class="tgk-settings-stack">
                    <div class="tgk-banner tgk-banner--positive">
                      <div>
                        <div class="tgk-banner__label">Connected</div>
                        <div class="tgk-banner__title" x-text="session.accountName"></div>
                        <div class="tgk-banner__meta" x-text="session.name || session.email"></div>
                        <div class="tgk-banner__footnote" x-text="session.accountId"></div>
                      </div>
                      <div class="tgk-inline-actions">
                        <button x-show="canChangeAccount()" @click="beginAccountSelection()" class="tgk-button tgk-button--secondary">Change Account</button>
                        <button @click="logout()" class="tgk-button tgk-button--danger">Disconnect</button>
                      </div>
                    </div>

                    <template x-if="shouldShowAccountPicker()">
                      <div class="tgk-field-card">
                        <label class="tgk-field-label">Change Saved Account</label>
                        <p class="tgk-help-text">Choose the account used for live demo actions.</p>
                        <select x-model="selectedAccountId" class="tgk-form-input tgk-form-select">
                          <template x-for="account in availableAccounts()" :key="account.accountId">
                            <option :value="account.accountId" :selected="account.accountId === selectedAccountId" x-text="account.accountName + (account.isDefault ? ' (Default)' : '')"></option>
                          </template>
                        </select>
                        <div class="tgk-inline-actions tgk-inline-actions--end">
                          <button @click="cancelAccountSelection()" class="tgk-button tgk-button--secondary">Cancel</button>
                          <button @click="selectAccount(selectedAccountId)" :disabled="!selectedAccountId || savingAccount" class="tgk-button tgk-button--primary" x-text="savingAccount ? 'Saving...' : 'Save Account'"></button>
                        </div>
                      </div>
                    </template>
                  </div>
                </template>

                <template x-if="!loading && needsAccountSelection()">
                  <div class="tgk-settings-stack">
                    <div class="tgk-banner tgk-banner--warning">
                      <div>
                        <div class="tgk-banner__label">Connection Ready</div>
                        <div class="tgk-banner__title" x-text="session.name || session.email"></div>
                        <div class="tgk-banner__meta">Choose the Docusign account the demo should use.</div>
                      </div>
                      <div class="tgk-inline-actions">
                        <button @click="logout()" class="tgk-button tgk-button--danger">Disconnect</button>
                      </div>
                    </div>

                    <div class="tgk-field-card">
                      <label class="tgk-field-label">Choose Account</label>
                      <p class="tgk-help-text">Save the account used for live workflows and previews.</p>
                      <select x-model="selectedAccountId" class="tgk-form-input tgk-form-select">
                        <template x-for="account in availableAccounts()" :key="account.accountId">
                          <option :value="account.accountId" :selected="account.accountId === selectedAccountId" x-text="account.accountName + (account.isDefault ? ' (Default)' : '')"></option>
                        </template>
                      </select>
                      <button @click="selectAccount(selectedAccountId)" :disabled="!selectedAccountId || savingAccount" class="tgk-button tgk-button--primary tgk-button--full" x-text="savingAccount ? 'Saving...' : 'Save Account'"></button>
                    </div>
                  </div>
                </template>

                <template x-if="!loading && !hasConnection()">
                  <div class="tgk-settings-stack">
                    <div class="tgk-banner tgk-banner--neutral">
                      <div class="tgk-banner__label">No Account Connected</div>
                      <div class="tgk-banner__meta">Connect Docusign for live workflows, history, and previews.</div>
                    </div>
                    <div class="tgk-inline-actions">
                      <button @click="login()" class="tgk-button tgk-button--primary" x-text="authInProgress ? 'Connecting...' : 'Connect Docusign'"></button>
                    </div>
                  </div>
                </template>

                <div x-show="showScopesModal" x-cloak class="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div class="absolute inset-0 bg-black/40" @click="closeScopesModal()"></div>
                  <div class="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl p-6">
                    <div class="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 class="text-base font-semibold text-navy">Requested Docusign Scopes</h3>
                        <p class="text-xs text-gray-400 mt-1">Save the app-wide scope string used for consent and backend DocuSign API tokens.</p>
                      </div>
                      <button @click="closeScopesModal()" class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                    </div>

                    <textarea x-model="requestedScopesText" rows="8" class="tgk-form-input tgk-form-textarea tgk-form-input--mono"></textarea>
                    <p class="tgk-help-text mt-2">This is saved per app on the backend. If you add scopes that were not previously consented, reconnect Docusign once to grant them.</p>

                    <div class="flex items-center justify-end gap-3 mt-5">
                      <button @click="closeScopesModal()" class="tgk-button tgk-button--secondary">Cancel</button>
                      <button @click="saveRequestedScopes()" :disabled="savingScopes" class="tgk-button tgk-button--primary" x-text="savingScopes ? 'Saving...' : 'Save Scopes'"></button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <section class="tgk-settings-card">
            <div class="tgk-settings-card__header">
              <div class="tgk-settings-card__eyebrow">Demo Configuration</div>
              <p class="tgk-settings-card__text">Set the workflow IDs and signing rules used across the demo.</p>
            </div>

            <div class="tgk-settings-card__body">
              <div class="tgk-settings-field-grid">
                <div class="tgk-field-card">
                  <label class="tgk-field-label" for="tgk-accountOpeningWorkflowId">Account Opening Workflow</label>
                  <input id="tgk-accountOpeningWorkflowId" type="text" x-model="accountOpeningWorkflowId" @change="saveConfig()" class="tgk-form-input tgk-form-input--mono tgk-form-input--compact" placeholder="workflow-id">

                  <label class="tgk-settings-toggle-row mt-3">
                    <div class="tgk-settings-toggle-copy">
                      <div class="tgk-settings-toggle-title">ID Verification</div>
                    </div>
                    <div class="relative">
                      <input type="checkbox" x-model="accountOpeningIdVerification" @change="saveConfig()" class="sr-only peer">
                      <div class="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                      <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                    </div>
                  </label>
                </div>

                <div class="tgk-field-card">
                  <label class="tgk-field-label" for="tgk-assetTransferWorkflowId">Asset Transfer Workflow</label>
                  <input id="tgk-assetTransferWorkflowId" type="text" x-model="assetTransferWorkflowId" @change="saveConfig()" class="tgk-form-input tgk-form-input--mono tgk-form-input--compact" placeholder="workflow-id">

                  <label class="tgk-settings-toggle-row mt-3">
                    <div class="tgk-settings-toggle-copy">
                      <div class="tgk-settings-toggle-title">ID Verification</div>
                    </div>
                    <div class="relative">
                      <input type="checkbox" x-model="assetTransferIdVerification" @change="saveConfig()" class="sr-only peer">
                      <div class="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                      <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside class="tgk-settings-stack">
          <section class="tgk-settings-card tgk-settings-card--sticky">
            <div class="tgk-settings-card__header">
              <div class="tgk-settings-card__eyebrow">Demo Branding</div>
              <p class="tgk-settings-card__text">Set the shared name and accent color.</p>
            </div>

            <div class="tgk-settings-card__body">
              <div class="tgk-field-card">
                <label class="tgk-field-label" for="tgk-appName">App Name</label>
                <input id="tgk-appName" x-model="appName" @input="previewAppName($event.target.value)" class="tgk-form-input" placeholder="TGK Wealth">
                <p class="tgk-help-text">Used in both portal sidebars.</p>
              </div>

              <div class="tgk-field-card">
                <label class="tgk-field-label">Theme Color</label>
                <div class="tgk-color-row">
                  <label class="tgk-color-swatch" :style="'background:' + brandColor">
                    <input type="color" :value="brandColor" @input="applyColor($event.target.value)">
                  </label>
                  <div>
                    <div class="tgk-color-value" x-text="brandColor"></div>
                    <div class="tgk-help-text">Used for primary actions and highlights.</div>
                  </div>
                </div>
              </div>

              <div class="tgk-inline-actions">
                <button @click="save()" :disabled="!dirty || resettingBranding" class="tgk-button tgk-button--primary">Save Branding</button>
                <button @click="resetBranding()" :disabled="resettingBranding" class="tgk-button tgk-button--secondary" x-text="resettingBranding ? 'Resetting...' : 'Reset'"></button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function sharedEnvelopeModalTemplate() {
  return `
    <template x-if="envelopeDocModal">
      <div class="tgk-modal-shell" @keydown.escape.window="closeEnvelopeDocModal()">
        <div class="tgk-modal-backdrop" @click="closeEnvelopeDocModal()"></div>
        <div class="tgk-modal-card tgk-modal-card--document" @click.stop>
          <div class="tgk-modal-header">
            <div>
              <div class="tgk-modal-eyebrow">Preview</div>
              <h3 class="tgk-modal-title" x-text="envelopeDocModal.title"></h3>
              <div class="tgk-modal-meta" x-text="envelopeDocModal.envelopeId"></div>
            </div>
            <div class="tgk-inline-actions tgk-inline-actions--end">
              <button @click="closeEnvelopeDocModal()" class="tgk-modal-close" aria-label="Close document preview">&times;</button>
            </div>
          </div>

          <div class="tgk-modal-body tgk-modal-body--document">
            <template x-if="envelopeDocModal.loading">
              <div class="tgk-modal-empty">
                <div class="tgk-modal-empty__title">Loading document preview</div>
                <div class="tgk-modal-empty__text">Preparing the combined PDF.</div>
              </div>
            </template>

            <template x-if="!envelopeDocModal.loading && envelopeDocModal.error">
              <div class="tgk-modal-empty tgk-modal-empty--error">
                <div class="tgk-modal-empty__title">Unable to load preview</div>
                <div class="tgk-modal-empty__text" x-text="envelopeDocModal.error"></div>
              </div>
            </template>

            <iframe
              x-show="!envelopeDocModal.loading && !envelopeDocModal.error && envelopeDocModal.previewUrl"
              :src="envelopeDocModal.previewUrl"
              class="tgk-document-frame"
              title="Envelope document preview">
            </iframe>
          </div>
        </div>
      </div>
    </template>

    <template x-if="envelopeHistoryModal">
      <div class="tgk-modal-shell" @keydown.escape.window="closeEnvelopeHistoryModal()">
        <div class="tgk-modal-backdrop" @click="closeEnvelopeHistoryModal()"></div>
        <div class="tgk-modal-card tgk-modal-card--history" @click.stop>
          <div class="tgk-modal-header">
            <div>
              <div class="tgk-modal-eyebrow">Envelope History</div>
              <h3 class="tgk-modal-title" x-text="envelopeHistoryModal.title"></h3>
              <div class="tgk-modal-meta" x-text="envelopeHistoryModal.envelopeId"></div>
            </div>
            <button @click="closeEnvelopeHistoryModal()" class="tgk-modal-close" aria-label="Close envelope history">&times;</button>
          </div>

          <div class="tgk-modal-body tgk-modal-body--history">
            <template x-if="envelopeHistoryModal.loading">
              <div class="tgk-modal-empty">
                <div class="tgk-modal-empty__title">Loading activity</div>
                <div class="tgk-modal-empty__text">Fetching the latest audit trail.</div>
              </div>
            </template>

            <template x-if="!envelopeHistoryModal.loading && envelopeHistoryModal.error">
              <div class="tgk-modal-empty tgk-modal-empty--error">
                <div class="tgk-modal-empty__title">Unable to load history</div>
                <div class="tgk-modal-empty__text" x-text="envelopeHistoryModal.error"></div>
              </div>
            </template>

            <template x-if="!envelopeHistoryModal.loading && !envelopeHistoryModal.error && envelopeHistoryModal.events.length === 0">
              <div class="tgk-modal-empty">
                <div class="tgk-modal-empty__title">No activity yet</div>
                <div class="tgk-modal-empty__text">No audit events are available yet.</div>
              </div>
            </template>

            <div class="tgk-history-list" x-show="!envelopeHistoryModal.loading && !envelopeHistoryModal.error && envelopeHistoryModal.events.length > 0">
              <template x-for="(evt, index) in envelopeHistoryModal.events" :key="index">
                <div class="tgk-history-item">
                  <div class="tgk-history-item__dot"></div>
                  <div class="tgk-history-item__copy">
                    <div class="tgk-history-item__title" x-text="evt.Action"></div>
                    <div class="tgk-history-item__meta" x-text="evt.UserName || evt.UserEmail || evt.RecipientEmail || 'Docusign'"></div>
                  </div>
                  <div class="tgk-history-item__time" x-text="evt.LogTime ? new Date(evt.LogTime).toLocaleString() : ''"></div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  `;
}

function mountSettingsPanel(element) {
  mountSharedTemplate(element, sharedSettingsTemplate());
}

function mountEnvelopeModals(element) {
  mountSharedTemplate(element, sharedEnvelopeModalTemplate());
}
