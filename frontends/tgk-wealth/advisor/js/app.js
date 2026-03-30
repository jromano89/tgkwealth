const TGK_SELECTED_CONTACT_STORAGE_KEY = 'tgk_selected_client_id';
const TGK_ADVISOR_VIEW_STORAGE_KEY = 'tgk_advisor_view';
const MAESTRO_CONTACT_SOURCE = 'maestro-extension';
const MAESTRO_POLL_INTERVAL_MS = 1500;
const MAESTRO_COMPLETION_SETTLE_DELAY_MS = 400;
const MAESTRO_SUCCESS_REDIRECT_DELAY_MS = 2000;
const CLIENT_DETAIL_REFRESH_MS = 5000;

function getContactDisplayName(contact) {
  return `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim();
}

function formatNavigatorDate(dateString, options = {}) {
  if (!dateString) return '';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options
  }).format(parsed);
}

function formatNavigatorMoney(amount, currencyCode = 'USD') {
  if (amount == null) return 'Not mapped';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0
    }).format(amount);
  } catch (error) {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

function buildNavigatorMockAgreements(contacts) {
  const fallbackNames = [
    'Catherine Beaumont',
    'James Holden',
    'Sophia Reyes-Martin',
    'David Nakamura'
  ];
  const agreementNames = [
    ...new Set([...(contacts || []).map(getContactDisplayName).filter(Boolean), ...fallbackNames])
  ];
  const [primary, secondary, tertiary, quaternary] = agreementNames;

  return [
    {
      id: 'agr-household-msa',
      title: `${primary} Household Advisory Agreement`,
      file_name: 'household-advisory-agreement.pdf',
      type: 'agreement',
      category: 'Master agreement',
      summary: 'Core advisory engagement covering portfolio management, reporting cadence, and household service scope.',
      status: 'active',
      parties: [
        { id: 'party-client-1', preferred_name: primary, name_in_agreement: primary },
        { id: 'party-advisor', preferred_name: 'TGK Wealth', name_in_agreement: 'TGK Wealth' }
      ],
      provisions: {
        effective_date: '2025-01-12',
        expiration_date: '2027-01-11',
        governing_law: 'New York',
        renewal_type: 'Auto-renews annually',
        termination_period_for_convenience: '60 days',
        annual_agreement_value: 185000,
        annual_agreement_value_currency_code: 'USD'
      },
      related_agreement_documents: {},
      source_name: 'eSign',
      source_id: 'env-household-msa',
      source_account_id: 'mock-account',
      metadata: {
        created_at: '2025-01-12T14:10:00Z',
        modified_at: '2026-03-22T17:40:00Z'
      }
    },
    {
      id: 'agr-household-fee-amendment',
      title: `${primary} Fee Schedule Amendment`,
      file_name: 'fee-schedule-amendment.pdf',
      type: 'amendment',
      category: 'Fee amendment',
      summary: 'Adjusts the advisory fee schedule and household billing thresholds.',
      status: 'active',
      parties: [
        { id: 'party-client-1', preferred_name: primary, name_in_agreement: primary },
        { id: 'party-advisor', preferred_name: 'TGK Wealth', name_in_agreement: 'TGK Wealth' }
      ],
      provisions: {
        effective_date: '2025-09-01',
        expiration_date: '2027-01-11',
        governing_law: 'New York',
        renewal_type: 'Follows parent agreement',
        termination_period_for_convenience: '60 days',
        annual_agreement_value: 210000,
        annual_agreement_value_currency_code: 'USD'
      },
      related_agreement_documents: {
        parent_agreement_document_id: 'agr-household-msa'
      },
      source_name: 'eSign',
      source_id: 'env-fee-amendment',
      source_account_id: 'mock-account',
      metadata: {
        created_at: '2025-09-01T13:30:00Z',
        modified_at: '2026-02-14T15:05:00Z'
      }
    },
    {
      id: 'agr-household-ips',
      title: `${primary} Investment Policy Statement`,
      file_name: 'investment-policy-statement.pdf',
      type: 'policy',
      category: 'Investment policy',
      summary: 'Defines allocation guardrails, liquidity parameters, and household-specific risk tolerances.',
      status: 'review',
      parties: [
        { id: 'party-client-1', preferred_name: primary, name_in_agreement: primary },
        { id: 'party-advisor', preferred_name: 'TGK Wealth', name_in_agreement: 'TGK Wealth' }
      ],
      provisions: {
        effective_date: '2025-01-12',
        expiration_date: '2026-06-30',
        governing_law: 'New York',
        renewal_type: 'Manual review',
        termination_period_for_convenience: '30 days',
        annual_agreement_value: 185000,
        annual_agreement_value_currency_code: 'USD'
      },
      related_agreement_documents: {
        parent_agreement_document_id: 'agr-household-msa'
      },
      source_name: 'Navigator import',
      source_id: 'nav-ips-001',
      source_account_id: 'mock-account',
      metadata: {
        created_at: '2025-01-12T14:15:00Z',
        modified_at: '2026-03-18T12:25:00Z'
      }
    },
    {
      id: 'agr-retirement-advisory',
      title: `${secondary} Retirement Advisory Agreement`,
      file_name: 'retirement-advisory-agreement.pdf',
      type: 'agreement',
      category: 'Retirement account',
      summary: 'IRA-focused advisory agreement with beneficiary servicing and rollover support.',
      status: 'active',
      parties: [
        { id: 'party-client-2', preferred_name: secondary, name_in_agreement: secondary },
        { id: 'party-advisor', preferred_name: 'TGK Wealth', name_in_agreement: 'TGK Wealth' }
      ],
      provisions: {
        effective_date: '2024-11-04',
        expiration_date: '2026-11-03',
        governing_law: 'California',
        renewal_type: 'Auto-renews annually',
        termination_period_for_convenience: '45 days',
        annual_agreement_value: 92000,
        annual_agreement_value_currency_code: 'USD'
      },
      related_agreement_documents: {},
      source_name: 'eSign',
      source_id: 'env-retirement-001',
      source_account_id: 'mock-account',
      metadata: {
        created_at: '2024-11-04T16:45:00Z',
        modified_at: '2026-01-09T11:20:00Z'
      }
    },
    {
      id: 'agr-retirement-disclosure',
      title: `${secondary} Custody & Sweep Disclosure`,
      file_name: 'custody-sweep-disclosure.pdf',
      type: 'disclosure',
      category: 'Disclosure',
      summary: 'Supporting disclosure for custody, sweep mechanics, and settlement timing.',
      status: 'active',
      parties: [
        { id: 'party-client-2', preferred_name: secondary, name_in_agreement: secondary },
        { id: 'party-advisor', preferred_name: 'TGK Wealth', name_in_agreement: 'TGK Wealth' }
      ],
      provisions: {
        effective_date: '2024-11-04',
        expiration_date: '2026-11-03',
        governing_law: 'California',
        renewal_type: 'Follows parent agreement',
        termination_period_for_convenience: '45 days'
      },
      related_agreement_documents: {
        parent_agreement_document_id: 'agr-retirement-advisory'
      },
      source_name: 'Navigator import',
      source_id: 'nav-disclosure-001',
      source_account_id: 'mock-account',
      metadata: {
        created_at: '2024-11-04T16:50:00Z',
        modified_at: '2025-12-20T09:45:00Z'
      }
    },
    {
      id: 'agr-trust-services',
      title: `${tertiary} Trust Services Amendment`,
      file_name: 'trust-services-amendment.pdf',
      type: 'amendment',
      category: 'Trust services',
      summary: 'Captures trustee support, distribution review, and trust reporting cadence.',
      status: 'review',
      parties: [
        { id: 'party-client-3', preferred_name: tertiary, name_in_agreement: tertiary },
        { id: 'party-client-4', preferred_name: quaternary, name_in_agreement: quaternary },
        { id: 'party-advisor', preferred_name: 'TGK Wealth', name_in_agreement: 'TGK Wealth' }
      ],
      provisions: {
        effective_date: '2025-07-22',
        expiration_date: '2026-05-15',
        governing_law: 'Delaware',
        renewal_type: 'Manual review',
        termination_period_for_convenience: '30 days',
        annual_agreement_value: 128000,
        annual_agreement_value_currency_code: 'USD'
      },
      related_agreement_documents: {},
      source_name: 'CLM',
      source_id: 'clm-trust-004',
      source_account_id: 'mock-account',
      metadata: {
        created_at: '2025-07-22T10:20:00Z',
        modified_at: '2026-03-25T14:55:00Z'
      }
    }
  ];
}

function getNestedNavigatorValue(source, path) {
  if (!source || !path) return undefined;

  return String(path)
    .split('.')
    .reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);
}

function pickNavigatorValue(source, candidates) {
  for (const candidate of candidates) {
    const value = getNestedNavigatorValue(source, candidate);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function humanizeNavigatorLabel(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNavigatorStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'active';
  if (['active', 'signed', 'complete', 'completed', 'executed', 'in_force'].includes(normalized)) return 'active';
  if (['review', 'under_review', 'draft', 'pending', 'pending_review', 'in_review'].includes(normalized)) return 'review';
  if (['expiring', 'expired', 'terminated', 'voided'].includes(normalized)) return 'expiring';
  return normalized.replace(/_/g, ' ');
}

function normalizeNavigatorParty(party, index) {
  if (!party || typeof party !== 'object') {
    return null;
  }

  const preferredName = pickNavigatorValue(party, [
    'preferred_name',
    'preferredName',
    'display_name',
    'displayName',
    'name',
    'organization_name',
    'organizationName',
    'legal_name',
    'legalName'
  ]);
  const agreementName = pickNavigatorValue(party, [
    'name_in_agreement',
    'nameInAgreement',
    'agreement_name',
    'agreementName',
    'name'
  ]);

  if (!preferredName && !agreementName) {
    return null;
  }

  return {
    id: pickNavigatorValue(party, ['id', 'party_id', 'partyId']) || `party-${index}`,
    preferred_name: preferredName || agreementName,
    name_in_agreement: agreementName || preferredName
  };
}

function normalizeNavigatorParties(agreement) {
  const rawParties =
    pickNavigatorValue(agreement, ['parties', 'counterparties', 'participants', 'owners'])
    || [];

  if (!Array.isArray(rawParties)) {
    return [];
  }

  return rawParties
    .map((party, index) => normalizeNavigatorParty(party, index))
    .filter(Boolean);
}

function buildNavigatorSummary(agreement, category, sourceName) {
  const explicitSummary = pickNavigatorValue(agreement, ['summary', 'description', 'abstract']);
  if (explicitSummary) {
    return explicitSummary;
  }

  const normalizedCategory = category || 'Agreement';
  const normalizedSource = sourceName || 'Navigator';
  return `${normalizedCategory} indexed from ${normalizedSource}.`;
}

function normalizeNavigatorAgreement(agreement, index) {
  if (!agreement || typeof agreement !== 'object') {
    return null;
  }

  const sourceName = pickNavigatorValue(agreement, [
    'source_name',
    'sourceName',
    'source.name',
    'source'
  ]) || 'Navigator';
  const category = humanizeNavigatorLabel(pickNavigatorValue(agreement, [
    'category',
    'agreement_category',
    'agreementCategory',
    'document_type',
    'documentType',
    'type'
  ]) || 'Agreement');
  const primaryStatus = normalizeNavigatorStatus(pickNavigatorValue(agreement, ['status', 'agreement_status', 'agreementStatus']));
  const reviewStatus = normalizeNavigatorStatus(pickNavigatorValue(agreement, ['review_status', 'reviewStatus']));
  const provisions = {
    effective_date: pickNavigatorValue(agreement, [
      'provisions.effective_date',
      'provisions.effectiveDate',
      'effective_date',
      'effectiveDate',
      'start_date',
      'startDate'
    ]),
    expiration_date: pickNavigatorValue(agreement, [
      'provisions.expiration_date',
      'provisions.expirationDate',
      'expiration_date',
      'expirationDate',
      'end_date',
      'endDate'
    ]),
    governing_law: pickNavigatorValue(agreement, [
      'provisions.governing_law',
      'provisions.governingLaw',
      'governing_law',
      'governingLaw'
    ]),
    renewal_type: pickNavigatorValue(agreement, [
      'provisions.renewal_type',
      'provisions.renewalType',
      'renewal_type',
      'renewalType'
    ]),
    termination_period_for_convenience: pickNavigatorValue(agreement, [
      'provisions.termination_period_for_convenience',
      'provisions.terminationPeriodForConvenience',
      'termination_period_for_convenience',
      'terminationPeriodForConvenience'
    ]),
    annual_agreement_value: pickNavigatorValue(agreement, [
      'provisions.annual_agreement_value',
      'provisions.annualAgreementValue',
      'annual_agreement_value',
      'annualAgreementValue',
      'agreement_value.amount',
      'agreementValue.amount',
      'value.amount'
    ]),
    annual_agreement_value_currency_code: pickNavigatorValue(agreement, [
      'provisions.annual_agreement_value_currency_code',
      'provisions.annualAgreementValueCurrencyCode',
      'annual_agreement_value_currency_code',
      'annualAgreementValueCurrencyCode',
      'agreement_value.currency_code',
      'agreementValue.currencyCode',
      'value.currency_code',
      'value.currencyCode'
    ]) || 'USD'
  };
  const parentAgreementId = pickNavigatorValue(agreement, [
    'related_agreement_documents.parent_agreement_document_id',
    'relatedAgreementDocuments.parentAgreementDocumentId',
    'parent_agreement_document_id',
    'parentAgreementDocumentId'
  ]);
  const title = pickNavigatorValue(agreement, [
    'title',
    'name',
    'agreement_name',
    'agreementName',
    'file_name',
    'fileName'
  ]) || `Agreement ${index + 1}`;

  return {
    id: pickNavigatorValue(agreement, ['id', 'agreement_id', 'agreementId']) || `navigator-${index}`,
    title,
    file_name: pickNavigatorValue(agreement, ['file_name', 'fileName']),
    type: humanizeNavigatorLabel(pickNavigatorValue(agreement, ['type', 'agreement_type', 'agreementType']) || 'agreement'),
    category,
    summary: buildNavigatorSummary(agreement, category, sourceName),
    status: reviewStatus === 'review' ? reviewStatus : primaryStatus,
    parties: normalizeNavigatorParties(agreement),
    provisions,
    related_agreement_documents: parentAgreementId
      ? { parent_agreement_document_id: parentAgreementId }
      : {},
    source_name: sourceName,
    source_id: pickNavigatorValue(agreement, ['source_id', 'sourceId', 'id']),
    source_account_id: pickNavigatorValue(agreement, ['source_account_id', 'sourceAccountId', 'account_id', 'accountId']),
    metadata: {
      created_at: pickNavigatorValue(agreement, ['metadata.created_at', 'metadata.createdAt', 'created_at', 'createdAt']),
      modified_at: pickNavigatorValue(agreement, ['metadata.modified_at', 'metadata.modifiedAt', 'updated_at', 'updatedAt', 'modified_at', 'modifiedAt'])
    },
    is_live: true,
    raw: agreement
  };
}

function advisorApp() {
  return {
    ...createEnvelopeModalHelpers(),
    view: 'dashboard',
    contacts: [],
    selectedContact: null,
    selectedContactAccounts: [],
    selectedContactEnvelopes: [],
    _clientDetailRefreshTimer: null,
    searchQuery: '',
    showOnboarding: false,
    maestroWorkflowId: window.TGK_DEMO?.config?.idvWorkflowId || '8a7bbe6b-badc-4413-818b-2e92868de402',
    maestroInstanceUrl: '',
    maestroError: null,
    maestroLoading: false,
    maestroCompleted: false,
    maestroNewContact: null,
    onboardingLoadingIndex: 0,
    onboardingLoadingTimer: null,
    sidebarCollapsed: false,
    loading: true,
    navigatorMockAgreements: [],
    navigatorLiveAgreements: [],
    navigatorSearchQuery: '',
    navigatorStatusFilter: 'all',
    navigatorSelectedAgreementId: null,
    navigatorConnectionLoading: true,
    navigatorConnected: false,
    navigatorAccountName: '',
    navigatorAccountId: '',
    navigatorLiveLoading: false,
    navigatorLiveError: null,
    navigatorLastSyncAt: '',
    _maestroCreationPollTimer: null,
    _maestroRedirectTimer: null,
    _maestroTrackingStarted: false,
    _maestroKnownContactIds: new Set(),

    async init() {
      try {
        this.contacts = await TGK_API.getContacts();
        const requestedView = this.restoreView();
        const requestedClientId = this.restoreSelectedContactId();
        const requestedContact = this.contacts.find((contact) => contact.id === requestedClientId);

        if (requestedView === 'client' && requestedContact) {
          await this.viewClient(requestedContact);
        } else {
          this.setView(requestedView === 'client' ? 'dashboard' : requestedView);
        }
      } catch (e) {
        console.error('Failed to load contacts:', e);
      }

      this.refreshNavigatorMockAgreements();
      await this.loadNavigatorConnection();
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    restoreView() {
      try {
        return window.localStorage.getItem(TGK_ADVISOR_VIEW_STORAGE_KEY) || 'dashboard';
      } catch (e) {
        return 'dashboard';
      }
    },

    restoreSelectedContactId() {
      try {
        return window.localStorage.getItem(TGK_SELECTED_CONTACT_STORAGE_KEY);
      } catch (e) {
        return null;
      }
    },

    setView(nextView) {
      const allowedViews = new Set(['dashboard', 'documents', 'settings', 'client']);
      this.view = allowedViews.has(nextView) ? nextView : 'dashboard';
      try {
        window.localStorage.setItem(TGK_ADVISOR_VIEW_STORAGE_KEY, this.view);
      } catch (e) {}
    },

    get filteredContacts() {
      if (!this.searchQuery.trim()) return this.contacts;
      const q = this.searchQuery.toLowerCase();
      return this.contacts.filter(c =>
        `${c.first_name} ${c.last_name} ${c.email} ${c.metadata?.role || ''} ${c.metadata?.riskProfile || ''}`.toLowerCase().includes(q)
      );
    },

    get totalAum() {
      return this.contacts.reduce((sum, c) => sum + (c.metadata?.value || 0), 0);
    },

    get totalNetWorth() {
      return this.contacts.reduce((sum, c) => sum + (c.metadata?.netWorth || 0), 0);
    },

    get pendingReviews() {
      return this.contacts.filter(c => c.metadata?.status === 'review').length;
    },

    get complianceAlerts() {
      return this.contacts.filter(c => c.tags?.includes('review-needed')).length;
    },

    async viewClient(contact) {
      this.rememberSelectedContact(contact?.id);
      this.selectedContact = contact;
      try {
        const detail = await TGK_API.getContact(contact.id);
        this.selectedContact = detail;
        this.selectedContactAccounts = detail.accounts || [];
        this.selectedContactEnvelopes = detail.envelopes || [];
      } catch (e) {
        this.selectedContactAccounts = [];
        this.selectedContactEnvelopes = [];
      }
      this.setView('client');
      this.startClientDetailRefresh(contact.id);
    },

    startClientDetailRefresh(contactId) {
      this.stopClientDetailRefresh();
      // Only poll if the client is pending — no need to poll active clients
      if (this.selectedContact?.metadata?.status !== 'pending') return;
      const app = this;
      this._clientDetailRefreshTimer = window.setInterval(async function () {
        if (app.view !== 'client' || !app.selectedContact || app.selectedContact.id !== contactId) {
          app.stopClientDetailRefresh();
          return;
        }
        try {
          const detail = await TGK_API.getContact(contactId);
          app.selectedContact = detail;
          app.selectedContactAccounts = detail.accounts || [];
          app.selectedContactEnvelopes = detail.envelopes || [];
          const idx = app.contacts.findIndex(c => c.id === contactId);
          if (idx !== -1) {
            app.contacts[idx] = { ...app.contacts[idx], ...detail, accounts: undefined, envelopes: undefined };
          }
          // Stop polling once the client transitions to active
          if (detail.metadata?.status === 'active') {
            app.stopClientDetailRefresh();
          }
        } catch (e) {
          // Silently ignore refresh failures
        }
      }, CLIENT_DETAIL_REFRESH_MS);
    },

    stopClientDetailRefresh() {
      if (this._clientDetailRefreshTimer) {
        window.clearInterval(this._clientDetailRefreshTimer);
        this._clientDetailRefreshTimer = null;
      }
    },

    async deleteContact(contact, event) {
      event.stopPropagation();
      try {
        await TGK_API.deleteProfile(contact.id);
        this.contacts = this.contacts.filter(c => c.id !== contact.id);
        this.refreshNavigatorMockAgreements();
      } catch (e) {
        console.error('Failed to delete contact:', e);
      }
    },

    rememberSelectedContact(contactId) {
      if (!contactId) return;
      try {
        window.localStorage.setItem(TGK_SELECTED_CONTACT_STORAGE_KEY, contactId);
      } catch (e) {}
    },

    goBack() {
      this.stopClientDetailRefresh();
      this.setView('dashboard');
      this.selectedContact = null;
      this.selectedContactAccounts = [];
      this.selectedContactEnvelopes = [];
    },

    async loadNavigatorConnection() {
      this.navigatorConnectionLoading = true;
      try {
        const session = await TGK_API.getSession();
        this.navigatorConnected = !!session?.connected;
        this.navigatorAccountName = session?.accountName || '';
        this.navigatorAccountId = session?.accountId || '';
        if (this.navigatorConnected && this.navigatorAccountId) {
          await this.loadNavigatorAgreements();
        } else {
          this.navigatorLiveAgreements = [];
          this.navigatorLiveError = null;
          this.navigatorLastSyncAt = '';
          this.syncNavigatorSelection();
        }
      } catch (error) {
        this.navigatorConnected = false;
        this.navigatorAccountName = '';
        this.navigatorAccountId = '';
        this.navigatorLiveAgreements = [];
        this.navigatorLiveError = error.message || 'Unable to load the saved Docusign account.';
        this.navigatorLastSyncAt = '';
        this.syncNavigatorSelection();
      } finally {
        this.navigatorConnectionLoading = false;
      }
    },

    refreshNavigatorMockAgreements() {
      this.navigatorMockAgreements = buildNavigatorMockAgreements(this.contacts);
      this.syncNavigatorSelection();
    },

    syncNavigatorSelection() {
      if (!this.navigatorDisplayAgreements.some((agreement) => agreement.id === this.navigatorSelectedAgreementId)) {
        this.navigatorSelectedAgreementId = this.navigatorDisplayAgreements[0]?.id || null;
      }
    },

    async loadNavigatorAgreements() {
      if (!this.navigatorConnected || !this.navigatorAccountId) {
        this.navigatorLiveAgreements = [];
        this.navigatorLiveError = null;
        this.navigatorLastSyncAt = '';
        this.syncNavigatorSelection();
        return;
      }

      this.navigatorLiveLoading = true;
      try {
        const result = await TGK_API.listNavigatorAgreements({ limit: 50 });
        this.navigatorLiveAgreements = Array.isArray(result?.data)
          ? result.data
            .map((agreement, index) => normalizeNavigatorAgreement(agreement, index))
            .filter(Boolean)
            .sort((left, right) => {
              const leftTime = new Date(left?.metadata?.modified_at || left?.metadata?.created_at || 0).getTime();
              const rightTime = new Date(right?.metadata?.modified_at || right?.metadata?.created_at || 0).getTime();
              return rightTime - leftTime;
            })
          : [];
        this.navigatorLiveError = null;
        this.navigatorLastSyncAt = new Date().toISOString();
      } catch (error) {
        this.navigatorLiveAgreements = [];
        this.navigatorLiveError = error.message || 'Unable to load Navigator agreements.';
        this.navigatorLastSyncAt = '';
      } finally {
        this.navigatorLiveLoading = false;
        this.syncNavigatorSelection();
      }
    },

    refreshNavigatorAgreements() {
      return this.loadNavigatorConnection();
    },

    get navigatorHasLiveAgreements() {
      return this.navigatorLiveAgreements.length > 0;
    },

    get navigatorUsingMockData() {
      return !this.navigatorLiveLoading && !this.navigatorHasLiveAgreements;
    },

    get navigatorDisplayAgreements() {
      return this.navigatorHasLiveAgreements ? this.navigatorLiveAgreements : this.navigatorMockAgreements;
    },

    get navigatorSourceLabel() {
      if (this.navigatorLiveLoading) return 'Loading live agreements';
      if (this.navigatorHasLiveAgreements) return 'Live Navigator';
      return 'Concept dataset';
    },

    get navigatorAgreementCount() {
      return this.navigatorDisplayAgreements.length;
    },

    navigatorLiveStatusMessage() {
      if (this.navigatorConnectionLoading) {
        return 'Checking the saved Docusign account.';
      }

      if (!this.navigatorConnected) {
        return 'Connect and save a Docusign account to load live agreements.';
      }

      if (this.navigatorLiveLoading) {
        return 'Loading live Navigator agreements.';
      }

      if (this.navigatorLiveError) {
        return this.navigatorLiveError;
      }

      if (this.navigatorHasLiveAgreements) {
        const noun = this.navigatorLiveAgreements.length === 1 ? 'agreement' : 'agreements';
        return `Showing ${this.navigatorLiveAgreements.length} live ${noun} from ${this.navigatorAccountName || 'the saved Docusign account'}.`;
      }

      return `Live Navigator returned 0 agreements for ${this.navigatorAccountName || 'the saved Docusign account'}. Showing concept data for planning.`;
    },

    navigatorLiveStatusTone() {
      if (this.navigatorLiveError) {
        return 'border-red-200 bg-red-50 text-red-700';
      }
      if (this.navigatorHasLiveAgreements) {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      }
      if (this.navigatorConnected && !this.navigatorLiveLoading) {
        return 'border-amber-200 bg-amber-50 text-amber-700';
      }
      return 'border-gray-200 bg-slate-50 text-gray-600';
    },

    navigatorLastSyncLabel() {
      if (!this.navigatorLastSyncAt) return '';

      const date = new Date(this.navigatorLastSyncAt);
      if (Number.isNaN(date.getTime())) return '';

      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
    },

    setNavigatorStatusFilter(nextFilter) {
      this.navigatorStatusFilter = nextFilter;
    },

    selectNavigatorAgreement(agreementId) {
      this.navigatorSelectedAgreementId = agreementId;
    },

    get navigatorFilteredAgreements() {
      const query = this.navigatorSearchQuery.trim().toLowerCase();

      return this.navigatorDisplayAgreements.filter((agreement) => {
        if (this.navigatorStatusFilter !== 'all' && agreement.status !== this.navigatorStatusFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const partyNames = (agreement.parties || [])
          .map((party) => party.preferred_name || party.name_in_agreement || '')
          .join(' ');
        const searchIndex = [
          agreement.title,
          agreement.summary,
          agreement.category,
          agreement.type,
          agreement.status,
          agreement.source_name,
          partyNames
        ].join(' ').toLowerCase();

        return searchIndex.includes(query);
      });
    },

    get navigatorSelectedAgreement() {
      return this.navigatorFilteredAgreements.find((agreement) => agreement.id === this.navigatorSelectedAgreementId)
        || this.navigatorFilteredAgreements[0]
        || null;
    },

    get navigatorActiveAgreementCount() {
      return this.navigatorDisplayAgreements.filter((agreement) => agreement.status === 'active').length;
    },

    get navigatorLinkedAgreementCount() {
      return this.navigatorDisplayAgreements.filter((agreement) => agreement.related_agreement_documents?.parent_agreement_document_id).length;
    },

    get navigatorRenewalCount() {
      const threshold = Date.now() + (1000 * 60 * 60 * 24 * 180);
      return this.navigatorDisplayAgreements.filter((agreement) => {
        const expirationDate = new Date(agreement.provisions?.expiration_date || '').getTime();
        return expirationDate && expirationDate <= threshold;
      }).length;
    },

    get navigatorAttentionCount() {
      return this.navigatorDisplayAgreements.filter((agreement) => agreement.status === 'review').length;
    },

    navigatorAgreementStatusClasses(status) {
      const tones = {
        active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        review: 'bg-amber-50 text-amber-700 border-amber-100',
        expiring: 'bg-red-50 text-red-700 border-red-100'
      };
      return tones[status] || 'bg-slate-100 text-slate-600 border-slate-200';
    },

    navigatorAgreementDateLabel(agreement) {
      return formatNavigatorDate(agreement?.metadata?.modified_at || agreement?.metadata?.created_at);
    },

    navigatorAgreementParties(agreement) {
      const parties = (agreement?.parties || [])
        .map((party) => party.preferred_name || party.name_in_agreement)
        .filter(Boolean);
      return parties.length > 0 ? parties.join(' • ') : 'Parties not mapped';
    },

    navigatorAgreementValue(agreement) {
      return formatNavigatorMoney(
        agreement?.provisions?.annual_agreement_value,
        agreement?.provisions?.annual_agreement_value_currency_code || 'USD'
      );
    },

    navigatorAgreementHierarchy(agreement) {
      if (!agreement) return [];

      const parentId = agreement.related_agreement_documents?.parent_agreement_document_id;
      const rootId = parentId || agreement.id;
      const rootAgreement = this.navigatorDisplayAgreements.find((candidate) => candidate.id === rootId) || agreement;
      const children = this.navigatorDisplayAgreements.filter((candidate) => candidate.related_agreement_documents?.parent_agreement_document_id === rootAgreement.id);
      return [rootAgreement, ...children];
    },

    navigatorHierarchyLabel(agreement) {
      if (!agreement?.related_agreement_documents?.parent_agreement_document_id) {
        return 'Primary agreement';
      }
      return 'Linked agreement';
    },

    resetOnboardingState() {
      this.showOnboarding = false;
      this.maestroInstanceUrl = '';
      this.maestroError = null;
      this.maestroLoading = false;
      this.maestroCompleted = false;
      this.maestroNewContact = null;
      this.stopMaestroCreationPolling();
      this.clearOnboardingRedirectTimer();
      this.stopOnboardingLoading();
      this._maestroTrackingStarted = false;
      this._maestroKnownContactIds = new Set();
    },

    async openOnboarding() {
      this.resetOnboardingState();
      this.showOnboarding = true;
      this.warmOnboarding();
      await this.loadMaestroWorkflow();
    },

    closeOnboarding() {
      this.resetOnboardingState();
    },

    clearOnboardingRedirectTimer() {
      if (this._maestroRedirectTimer) {
        window.clearTimeout(this._maestroRedirectTimer);
        this._maestroRedirectTimer = null;
      }
    },

    warmOnboarding() {
      return TGK_API.warmDocusignExperience();
    },

    async fetchMaestroContacts() {
      try {
        return await TGK_API.getContacts({ source: MAESTRO_CONTACT_SOURCE });
      } catch (e) {
        return [];
      }
    },

    async snapshotMaestroContacts() {
      const contacts = await this.fetchMaestroContacts();
      this._maestroKnownContactIds = new Set((contacts || []).map((contact) => contact.id));
    },

    async refreshContactsAfterOnboarding(targetId) {
      try {
        const contacts = await TGK_API.getContacts();
        this.contacts = contacts;
        this.refreshNavigatorMockAgreements();
        return contacts.find((contact) => contact.id === targetId) || null;
      } catch (e) {
        return null;
      }
    },

    async handleOnboardingFrameLoad() {
      if (this._maestroTrackingStarted || this.maestroCompleted || this.maestroError) {
        return;
      }

      this._maestroTrackingStarted = true;
      await this.snapshotMaestroContacts();

      if (!this.showOnboarding || this.maestroCompleted) {
        return;
      }

      this.startMaestroCreationPolling();
    },

    findNewMaestroContact(extensionContacts) {
      const knownIds = this._maestroKnownContactIds || new Set();
      const newContacts = (extensionContacts || []).filter((contact) => !knownIds.has(contact.id));

      if (newContacts.length === 0) {
        return null;
      }

      return newContacts.reduce(function (a, b) {
        return new Date(b.created_at) > new Date(a.created_at) ? b : a;
      });
    },

    startMaestroCreationPolling() {
      this.stopMaestroCreationPolling();

      const app = this;
      const poll = async function () {
        if (!app.showOnboarding || app.maestroCompleted) {
          return;
        }

        try {
          const extensionContacts = await app.fetchMaestroContacts();
          const target = app.findNewMaestroContact(extensionContacts);

          if (target) {
            await app.completeOnboardingWithContact(target);
            return;
          }
        } catch (e) {
          console.warn('Could not poll for Maestro-created contacts:', e);
        }

        app._maestroCreationPollTimer = window.setTimeout(poll, MAESTRO_POLL_INTERVAL_MS);
      };

      this._maestroCreationPollTimer = window.setTimeout(poll, MAESTRO_POLL_INTERVAL_MS);
    },

    stopMaestroCreationPolling() {
      if (this._maestroCreationPollTimer) {
        window.clearTimeout(this._maestroCreationPollTimer);
        this._maestroCreationPollTimer = null;
      }
    },

    async completeOnboardingWithContact(target) {
      if (!target || this.maestroCompleted) {
        return;
      }

      this.stopMaestroCreationPolling();
      this.clearOnboardingRedirectTimer();
      if (this._maestroKnownContactIds) {
        this._maestroKnownContactIds.add(target.id);
      }
      const resolvedTarget = await this.refreshContactsAfterOnboarding(target.id) || target;

      const app = this;
      this._maestroRedirectTimer = window.setTimeout(function () {
        app.maestroCompleted = true;
        app.maestroNewContact = resolvedTarget;

        app._maestroRedirectTimer = window.setTimeout(function () {
          app.resetOnboardingState();
          app.viewClient(resolvedTarget);
        }, MAESTRO_SUCCESS_REDIRECT_DELAY_MS);
      }, MAESTRO_COMPLETION_SETTLE_DELAY_MS);
    },

    startOnboardingLoading() {
      this.stopOnboardingLoading();
      this.onboardingLoadingIndex = 0;
      this.onboardingLoadingTimer = window.setInterval(() => {
        this.onboardingLoadingIndex = Math.min(
          this.onboardingLoadingIndex + 1,
          this.onboardingLoadingSteps.length - 1
        );
      }, 1400);
    },

    stopOnboardingLoading() {
      if (this.onboardingLoadingTimer) {
        window.clearInterval(this.onboardingLoadingTimer);
        this.onboardingLoadingTimer = null;
      }
    },

    get onboardingLoadingSteps() {
      return [
        'Connecting to Docusign IAM',
        'Preparing account opening',
        'Launching the embedded experience'
      ];
    },

    async loadMaestroWorkflow() {
      this.stopMaestroCreationPolling();
      this.clearOnboardingRedirectTimer();
      this._maestroTrackingStarted = false;
      this._maestroKnownContactIds = new Set();
      this.maestroLoading = true;
      this.maestroError = null;
      this.maestroInstanceUrl = '';
      this.startOnboardingLoading();

      try {
        const session = await TGK_API.getSession();
        if (!session?.connected) {
          throw new Error('Connect a Docusign account before launching account opening.');
        }
        if (!session?.accountId) {
          throw new Error('Select and save a Docusign account in Settings before launching account opening.');
        }

        const result = await TGK_API.triggerMaestroWorkflow(this.maestroWorkflowId, {
          instance_name: `TGK Wealth Account Opening ${new Date().toISOString()}`,
          trigger_inputs: {}
        });

        if (!result?.instance_url) {
          throw new Error('Docusign IAM did not return a launch URL.');
        }

        this.maestroInstanceUrl = result.instance_url;
      } catch (e) {
        console.error('Failed to load Maestro workflow:', e);
        this.maestroError = e.message || 'Failed to launch account opening.';
        this.stopMaestroCreationPolling();
      } finally {
        this.maestroLoading = false;
        this.stopOnboardingLoading();
      }
    },

    // Activity feed (mock for now — use relative labels so it does not go stale)
    activities: [
      { client: 'James & Priya Holden', action: 'Called to discuss rebalancing IRA', date: 'Today', type: 'call' },
      { client: 'Catherine Beaumont', action: 'Trust distribution request submitted', date: 'Today', type: 'document' },
      { client: 'Richard & Elena Ashworth', action: 'Quarterly review meeting scheduled', date: 'Today', type: 'meeting' },
      { client: 'David Nakamura', action: 'Risk tolerance questionnaire overdue', date: '1 day ago', type: 'alert' },
      { client: 'Sophia Reyes-Martin', action: 'New account paperwork pending signature', date: '1 day ago', type: 'document' },
      { client: 'Mary Jones', action: 'Portfolio rebalance executed', date: '2 days ago', type: 'trade' },
      { client: 'Bud Fox', action: 'Annual review completed', date: '3 days ago', type: 'meeting' },
      { client: 'Catherine Beaumont', action: 'Updated beneficiary designations', date: '3 days ago', type: 'document' }
    ]
  };
}
