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

function accountLabel(account) {
  const label = String(
    account?.metadata?.accountType
    || account?.metadata?.label
    || account?.accountType
    || account?.account_type
    || 'Account'
  ).trim();

  return label || 'Account';
}

function getConfiguredIamProducts() {
  const configuredProducts = Array.isArray(window.TGK_CONFIG?.iamProducts)
    ? window.TGK_CONFIG.iamProducts
    : [];

  return configuredProducts
    .filter((product) => product && typeof product === 'object')
    .map((product) => ({ ...product }));
}

function getDefaultIamProductKeys() {
  const configuredProducts = getConfiguredIamProducts();
  const validKeys = new Set(configuredProducts.map((product) => product.key));
  const configuredKeys = Array.isArray(window.TGK_CONFIG?.defaultIamProducts)
    ? window.TGK_CONFIG.defaultIamProducts
    : configuredProducts.map((product) => product.key);
  const normalizedKeys = [];

  configuredKeys.forEach((key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!validKeys.has(normalizedKey) || normalizedKeys.includes(normalizedKey)) {
      return;
    }

    normalizedKeys.push(normalizedKey);
  });

  return normalizedKeys.length
    ? normalizedKeys
    : configuredProducts.map((product) => product.key);
}

function getVisibleIamProductKeys() {
  if (!window.TGK_ACCESS?.canSeeIamProducts?.()) {
    return [];
  }

  const configuredProducts = getConfiguredIamProducts();
  const validKeys = new Set(configuredProducts.map((product) => product.key));
  const candidateKeys = Array.isArray(window.TGK_DEMO?.sidebar?.iamProductKeys)
    ? window.TGK_DEMO.sidebar.iamProductKeys
    : getDefaultIamProductKeys();
  const visibleKeys = [];

  candidateKeys.forEach((key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!validKeys.has(normalizedKey) || visibleKeys.includes(normalizedKey)) {
      return;
    }

    visibleKeys.push(normalizedKey);
  });

  return visibleKeys;
}

function getIamProducts() {
  const visibleKeys = new Set(getVisibleIamProductKeys());
  return getConfiguredIamProducts()
    .filter((product) => visibleKeys.has(product.key))
    .map((product) => ({ ...product }));
}

function getIamProduct(productKey) {
  const key = String(productKey || '').trim().toLowerCase();
  return getConfiguredIamProducts().find((product) => product.key === key) || null;
}

function getIamProductPlaceholder(productKey) {
  const product = getIamProduct(productKey);
  if (!product || product.key === 'monitor') {
    return null;
  }

  return {
    label: product.label,
    eyebrow: 'Docusign IAM Product',
    title: product.label,
    description: 'Coming soon.'
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
    active: 'tgk-status-badge--success',
    review: 'tgk-status-badge--warning',
    pending: 'tgk-status-badge--info',
    completed: 'tgk-status-badge--success',
    sent: 'tgk-status-badge--info',
    delivered: 'tgk-status-badge--warning',
    created: 'tgk-status-badge--neutral',
    declined: 'tgk-status-badge--danger',
    voided: 'tgk-status-badge--neutral'
  };
  return map[(status || '').toLowerCase()] || 'tgk-status-badge--neutral';
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
    <div class="tgk-stock-ticker" x-data="stockTicker()">
      <div class="tgk-stock-ticker__fade tgk-stock-ticker__fade--left"></div>
      <div class="tgk-stock-ticker__fade tgk-stock-ticker__fade--right"></div>
      <div class="tgk-stock-ticker__track">
        <template x-for="(item, i) in [...prices, ...prices]" :key="'t'+i">
          <span class="tgk-stock-ticker__item" :class="item.flash">
            <span class="tgk-stock-ticker__symbol" x-text="item.sym"></span>
            <span x-text="fmt(item.price)"></span>
            <span :class="item.change >= 0 ? 'tgk-stock-ticker__change--up' : 'tgk-stock-ticker__change--down'" x-text="fmtChange(item.change)"></span>
          </span>
        </template>
      </div>
    </div>
  `;
}

function newsPanelTemplate() {
  return `
    <div x-data="newsPanel()">
      <button @click="toggleOpen()" class="tgk-button tgk-button--secondary">
        <span>📺</span> Headlines <span class="tgk-news-live-dot"></span>
      </button>
      <template x-if="open">
        <div>
          <div class="tgk-news-overlay" @click="open = false"></div>
          <div class="tgk-news-sheet">
            <div class="tgk-news-header">
              <h2 class="tgk-news-title">Market Headlines</h2>
              <button @click="open = false" class="tgk-modal-close">&times;</button>
            </div>
            <input x-model="search" placeholder="Filter headlines" class="tgk-form-input tgk-news-search">
            <div class="tgk-news-filter-bar">
              <template x-for="cat in categories" :key="cat">
                <button @click="activeCategory = cat" class="tgk-filter-chip"
                  :class="{ 'tgk-filter-chip--active': activeCategory === cat }"
                  x-text="cat === 'all' ? 'All' : cat"></button>
              </template>
            </div>
            <template x-if="loading && !loaded">
              <div class="tgk-news-state">
                Loading live headlines...
              </div>
            </template>
            <template x-if="!loading && error && !loaded">
              <div class="tgk-news-state tgk-news-state--error">
                Unable to load live headlines.
              </div>
            </template>
            <template x-if="!loading && !error && loaded && filteredItems.length === 0">
              <div class="tgk-news-state">
                No live headlines matched your filters.
              </div>
            </template>
            <div class="tgk-news-list" x-show="loaded && filteredItems.length > 0">
              <template x-for="item in filteredItems" :key="item.title">
                <a
                  :href="item.link || '#'"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="tgk-news-item"
                  :class="{ 'tgk-news-item--disabled': !item.link }">
                  <div class="tgk-news-item__meta">
                    <span class="tgk-news-item__eyebrow" x-text="item.category"></span>
                    <template x-if="item.badge">
                      <span class="tgk-badge" :class="item.badgeColor" x-text="item.badge"></span>
                    </template>
                    <span class="tgk-news-item__time" x-text="item.time"></span>
                  </div>
                  <div class="tgk-news-item__headline" x-text="item.title"></div>
                  <div class="tgk-news-item__summary" x-text="item.summary"></div>
                  <div class="tgk-news-item__impact">
                    <div class="tgk-news-impact-dot" :class="impactColor(item.impact)"></div>
                    <span x-text="item.impact + ' impact'"></span>
                  </div>
                </a>
              </template>
            </div>
            <div class="tgk-news-footer" x-show="loaded && filteredItems.length > 0">
              <span class="tgk-news-live-dot"></span> Live feed
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
      <div class="tgk-settings-stack">
        <section class="tgk-settings-card">
              <div class="tgk-settings-card__header">
              <div class="tgk-settings-card__eyebrow">Portal Settings</div>
              <p class="tgk-settings-card__text">Adjust shared branding and the IAM sidebar.</p>
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

              <div class="tgk-field-card">
                <label class="tgk-field-label">IAM Sidebar</label>
                <p class="tgk-help-text">Choose which IAM products appear in the sidebar.</p>
                <div class="tgk-settings-toggle-list">
                  <template x-for="product in sidebarOptions()" :key="product.key">
                    <label class="tgk-settings-toggle-row">
                      <div class="tgk-settings-toggle-copy">
                        <div class="tgk-settings-toggle-title" x-text="product.label"></div>
                        <div class="tgk-settings-toggle-text" x-text="product.key === 'monitor' ? 'Live demo section.' : 'Coming soon.'"></div>
                      </div>
                      <span class="tgk-switch">
                        <input
                          type="checkbox"
                          class="tgk-switch__input"
                          :checked="isSidebarProductEnabled(product.key)"
                          @change="toggleSidebarProduct(product.key, $event.target.checked)">
                        <span class="tgk-switch__track"></span>
                        <span class="tgk-switch__thumb"></span>
                      </span>
                    </label>
                  </template>
                </div>
              </div>

              <div class="tgk-inline-actions">
                <button @click="save()" :disabled="!dirty || resettingDefaults" class="tgk-button tgk-button--primary">Save Changes</button>
                <button @click="resetCustomizations()" :disabled="resettingDefaults" class="tgk-button tgk-button--secondary" x-text="resettingDefaults ? 'Resetting...' : 'Reset Defaults'"></button>
              </div>
            </div>
        </section>
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
