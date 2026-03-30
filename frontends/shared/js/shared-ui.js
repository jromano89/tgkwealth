/**
 * Shared UI helpers and mount points for TGK frontends.
 */

// Format cents to display value (e.g. 472000000 -> "$4.72M")
function fmtMoney(cents) {
  if (cents == null) return '$0';
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1e9) return '$' + (dollars / 1e9).toFixed(2) + 'B';
  if (Math.abs(dollars) >= 1e6) return '$' + (dollars / 1e6).toFixed(2) + 'M';
  if (Math.abs(dollars) >= 1e3) return '$' + (dollars / 1e3).toFixed(0) + 'K';
  return '$' + dollars.toFixed(2);
}

// Format percentage
function fmtPct(n) {
  if (n == null) return '0%';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(1) + '%';
}

// Status badge classes
function statusClasses(status) {
  const map = {
    active: 'bg-green-100 text-green-700',
    review: 'bg-amber-100 text-amber-700',
    pending: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    sent: 'bg-blue-100 text-blue-700',
    created: 'bg-gray-100 text-gray-600',
    declined: 'bg-red-100 text-red-700',
    voided: 'bg-gray-100 text-gray-500'
  };
  return map[(status || '').toLowerCase()] || 'bg-gray-100 text-gray-600';
}

// Activity type dot color
function activityDotColor(type) {
  const map = {
    call: 'bg-blue-500',
    document: 'bg-amber-500',
    meeting: 'bg-green-500',
    alert: 'bg-red-500',
    trade: 'bg-purple-500',
    note: 'bg-gray-400'
  };
  return map[type] || 'bg-gray-400';
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

function mountSharedTemplate(element, template) {
  if (!element) return;
  element.innerHTML = template;
  if (window.Alpine && typeof window.Alpine.initTree === 'function') {
    window.Alpine.initTree(element);
  }
}

function buildEnvelopeDocumentPath(envelopeId, documentId) {
  const safeEnvelopeId = encodeURIComponent(envelopeId);
  const safeDocumentId = encodeURIComponent(documentId || 'combined');
  return TGK_API.withAppQuery(`/api/envelopes/${safeEnvelopeId}/documents/${safeDocumentId}/download`);
}

function buildEnvelopeDocumentUrl(envelopeId, documentId) {
  return new URL(buildEnvelopeDocumentPath(envelopeId, documentId), TGK_API.baseUrl).toString();
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
      const envelopeId = envelope?.docusign_envelope_id || envelope?.id;
      if (!envelopeId) return;

      const requestKey = `${envelopeId}:${Date.now()}`;
      const title = envelope?.metadata?.documentName || envelope?.template_name || 'Document';
      const downloadUrl = buildEnvelopeDocumentUrl(envelopeId, 'combined');

      this.closeEnvelopeDocModal();
      this.envelopeDocModal = {
        envelopeId,
        title,
        downloadUrl,
        previewUrl: '',
        loading: true,
        error: null,
        requestKey
      };

      try {
        const response = await TGK_API.requestResponse(`/api/envelopes/${encodeURIComponent(envelopeId)}/documents/combined/download`);
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
      const envelopeId = envelope?.docusign_envelope_id || envelope?.id;
      if (!envelopeId) return;

      const title = envelope?.metadata?.documentName || envelope?.template_name || 'Document';
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
        const result = await TGK_API.get(`/api/envelopes/${encodeURIComponent(envelopeId)}/audit-events`);
        const events = (result.auditEvents || [])
          .map((event) => {
            const fields = {};
            (event.eventFields || []).forEach((field) => {
              fields[field.name] = field.value;
            });
            return fields;
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
      <div class="tgk-settings-hero">
        <div class="tgk-settings-hero__content">
          <div class="tgk-settings-card__eyebrow tgk-settings-card__eyebrow--light">Shared Controls</div>
          <h1 class="tgk-settings-hero__title">Settings</h1>
          <p class="tgk-settings-hero__text">Branding, workflow settings, and the Docusign connection stay aligned across both portals.</p>
        </div>

        <div class="tgk-settings-hero__preview">
          <div class="tgk-settings-hero__chip">Live Theme</div>
          <div class="tgk-settings-hero__preview-card">
            <div class="tgk-settings-hero__mark" x-text="((appName.trim() || 'TGK Wealth').match(/[A-Za-z0-9]/) || ['T'])[0].toUpperCase()"></div>
            <div class="tgk-settings-hero__preview-copy">
              <div class="tgk-settings-hero__preview-title" x-text="appName.trim() || 'TGK Wealth'"></div>
              <div class="tgk-settings-hero__preview-meta">Advisor and investor settings stay in sync.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="tgk-settings-grid">
        <div class="tgk-settings-stack">
          <section class="tgk-settings-card">
            <div class="tgk-settings-card__header">
              <div class="tgk-settings-card__eyebrow">Experience Controls</div>
              <h2 class="tgk-settings-card__title">Demo Configuration</h2>
              <p class="tgk-settings-card__text">Set the shared workflow IDs and signing rules used across the demo.</p>
            </div>

            <div class="tgk-settings-card__body">
              <label class="tgk-settings-toggle-row">
                <div class="tgk-settings-toggle-copy">
                  <div class="tgk-settings-toggle-title">ID Verification</div>
                  <div class="tgk-settings-toggle-text">Require ID verification before signing can finish.</div>
                </div>
                <div class="relative">
                  <input type="checkbox" x-model="idVerification" @change="saveConfig()" class="sr-only peer">
                  <div class="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-brand transition-colors"></div>
                  <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5"></div>
                </div>
              </label>

              <div class="tgk-settings-field-grid">
                <div class="tgk-field-card">
                  <label class="tgk-field-label" for="tgk-idvWorkflowId">Account Opening Workflow ID</label>
                  <input id="tgk-idvWorkflowId" type="text" x-model="idvWorkflowId" @change="saveConfig()" class="tgk-form-input tgk-form-input--mono" placeholder="workflow-id">
                  <p class="tgk-help-text">Used for the account opening flow.</p>
                </div>

                <div class="tgk-field-card">
                  <label class="tgk-field-label" for="tgk-assetTransferWorkflowId">Asset Transfer Workflow ID</label>
                  <input id="tgk-assetTransferWorkflowId" type="text" x-model="assetTransferWorkflowId" @change="saveConfig()" class="tgk-form-input tgk-form-input--mono" placeholder="workflow-id">
                  <p class="tgk-help-text">Used for asset transfer packets.</p>
                </div>
              </div>
            </div>
          </section>

          <section class="tgk-settings-card" x-data="docusignSettings()">
            <div class="tgk-settings-card__header tgk-settings-card__header--split">
              <div>
                <div class="tgk-settings-card__eyebrow">Connection</div>
                <h2 class="tgk-settings-card__title">Docusign Workspace</h2>
                <p class="tgk-settings-card__text">Connect once, then save the Docusign account used across both portals.</p>
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

              <template x-if="notice">
                <div class="tgk-banner tgk-banner--info">
                  <div class="tgk-banner__label">Status</div>
                  <div class="tgk-banner__meta" x-text="notice"></div>
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
                      <p class="text-xs text-gray-400 mt-1">Edit the scope string used on the next connection.</p>
                    </div>
                    <button @click="closeScopesModal()" class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                  </div>

                  <textarea x-model="requestedScopesText" rows="8" class="tgk-form-input tgk-form-textarea tgk-form-input--mono"></textarea>
                  <p class="tgk-help-text mt-2">The required <span class="font-medium">signature</span>, <span class="font-medium">impersonation</span>, and <span class="font-medium">aow_manage</span> scopes are always included.</p>

                  <div class="flex items-center justify-between gap-3 mt-5">
                    <button @click="resetRequestedScopes()" class="tgk-button tgk-button--secondary">Reset Default</button>
                    <div class="tgk-inline-actions tgk-inline-actions--end">
                      <button @click="closeScopesModal()" class="tgk-button tgk-button--secondary">Cancel</button>
                      <button @click="saveRequestedScopes()" class="tgk-button tgk-button--primary">Save Scopes</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside class="tgk-settings-stack">
          <section class="tgk-settings-card tgk-settings-card--sticky">
            <div class="tgk-settings-card__header">
              <div class="tgk-settings-card__eyebrow">Brand Studio</div>
              <h2 class="tgk-settings-card__title">Demo Branding</h2>
              <p class="tgk-settings-card__text">Preview the shared portal chrome as you update the name and accent color.</p>
            </div>

            <div class="tgk-settings-card__body">
              <div class="tgk-field-card">
                <label class="tgk-field-label" for="tgk-appName">App Name</label>
                <input id="tgk-appName" x-model="appName" @input="dirty = true" class="tgk-form-input" placeholder="TGK Wealth">
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

              <div class="tgk-brand-preview">
                <div class="tgk-brand-preview__sidebar">
                  <div class="tgk-brand-preview__logo">
                    <div class="tgk-brand-preview__logo-mark" x-text="((appName.trim() || 'TGK Wealth').match(/[A-Za-z0-9]/) || ['T'])[0].toUpperCase()"></div>
                    <div class="tgk-brand-preview__logo-copy">
                      <div class="tgk-brand-preview__logo-title" x-text="appName.trim() || 'TGK Wealth'"></div>
                      <div class="tgk-brand-preview__logo-meta">Shared chrome preview</div>
                    </div>
                  </div>
                  <div class="tgk-brand-preview__nav">
                    <span class="tgk-brand-preview__nav-item tgk-brand-preview__nav-item--active">Overview</span>
                    <span class="tgk-brand-preview__nav-item">Documents</span>
                    <span class="tgk-brand-preview__nav-item">Settings</span>
                  </div>
                </div>
                <div class="tgk-brand-preview__surface">
                  <div class="tgk-brand-preview__card">
                    <div class="tgk-brand-preview__eyebrow">Primary Accent</div>
                    <div class="tgk-brand-preview__pill">Live</div>
                  </div>
                  <div class="tgk-brand-preview__panel">
                    <div class="tgk-brand-preview__line tgk-brand-preview__line--strong"></div>
                    <div class="tgk-brand-preview__line"></div>
                    <div class="tgk-brand-preview__line tgk-brand-preview__line--short"></div>
                  </div>
                </div>
              </div>

              <div class="tgk-inline-actions">
                <button @click="save()" :disabled="!dirty" class="tgk-button tgk-button--primary">Apply Changes</button>
                <button @click="resetDefaults()" class="tgk-button tgk-button--secondary">Reset</button>
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
              <a :href="envelopeDocModal.downloadUrl" target="_blank" rel="noreferrer" class="tgk-button tgk-button--secondary">Open in New Tab</a>
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
