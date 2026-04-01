const MAESTRO_POLL_INTERVAL_MS = 1500;
const MAESTRO_COMPLETION_SETTLE_DELAY_MS = 400;
const MAESTRO_SUCCESS_REDIRECT_DELAY_MS = 2000;
const CLIENT_DETAIL_REFRESH_MS = 5000;
const CLIENT_DETAIL_REFRESH_MAX_MS = 20 * 60 * 1000;

function normalizeStatusValue(value) {
  return String(value || '').trim().toLowerCase();
}

function advisorApp() {
  return {
    ...createBrandingState(),
    ...createEnvelopeModalHelpers(),
    view: 'dashboard',
    currentUser: null,
    customers: [],
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
    _maestroCreationPollTimer: null,
    _maestroRedirectTimer: null,
    _maestroTrackingStarted: false,
    _maestroKnownContactIds: new Set(),

    async init() {
      this.initializeBrandingState();
      try {
        const employees = await TGK_API.getEmployees();
        this.currentUser = employees[0] || null;
        this.customers = await TGK_API.getCustomers();
        this.setView('dashboard');
      } catch (e) {
        console.error('Failed to load customers:', e);
      }
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    setView(nextView) {
      const allowedViews = new Set(['dashboard', 'documents', 'settings', 'client']);
      this.view = allowedViews.has(nextView) ? nextView : 'dashboard';
    },

    get filteredCustomers() {
      if (!this.searchQuery.trim()) return this.customers;
      const q = this.searchQuery.toLowerCase();
      return this.customers.filter(c =>
        `${c.first_name} ${c.last_name} ${c.email} ${c.metadata?.role || ''} ${c.metadata?.riskProfile || ''}`.toLowerCase().includes(q)
      );
    },

    get totalAum() {
      return this.customers.reduce((sum, c) => sum + (c.metadata?.value || 0), 0);
    },

    get totalNetWorth() {
      return this.customers.reduce((sum, c) => sum + (c.metadata?.netWorth || 0), 0);
    },

    get pendingReviews() {
      return this.customers.filter(c => normalizeStatusValue(c.metadata?.status) === 'review').length;
    },

    get complianceAlerts() {
      return this.customers.filter(c => c.tags?.includes('review-needed')).length;
    },

    async viewClient(contact) {
      TGK_API.setPreferredCustomerId(contact?.id);
      this.selectedContact = contact;
      try {
        const detail = await TGK_API.getCustomer(contact.id, { includeTasks: false });
        this.selectedContact = detail;
        TGK_API.setPreferredCustomerId(detail.id);
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
      if (normalizeStatusValue(this.selectedContact?.metadata?.status) !== 'pending') return;
      const app = this;
      const refreshDeadlineAt = Date.now() + CLIENT_DETAIL_REFRESH_MAX_MS;
      this._clientDetailRefreshTimer = window.setInterval(async function () {
        if (app.view !== 'client' || !app.selectedContact || app.selectedContact.id !== contactId) {
          app.stopClientDetailRefresh();
          return;
        }
        if (Date.now() >= refreshDeadlineAt) {
          app.stopClientDetailRefresh();
          return;
        }
        try {
          const detail = await TGK_API.getCustomer(contactId, { includeTasks: false });
          app.selectedContact = detail;
          app.selectedContactAccounts = detail.accounts || [];
          app.selectedContactEnvelopes = detail.envelopes || [];
          const idx = app.customers.findIndex(c => c.id === contactId);
          if (idx !== -1) {
            app.customers[idx] = { ...app.customers[idx], ...detail, accounts: undefined, envelopes: undefined };
          }
          if (normalizeStatusValue(detail.metadata?.status) === 'active') {
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

    async deleteCustomer(contact, event) {
      event.stopPropagation();
      try {
        await TGK_API.deleteCustomer(contact.id);
        this.customers = this.customers.filter(c => c.id !== contact.id);
        if (this.selectedContact?.id === contact.id) {
          this.goBack();
        }
      } catch (e) {
        console.error('Failed to delete customer:', e);
      }
    },

    goBack() {
      this.stopClientDetailRefresh();
      this.setView('dashboard');
      this.selectedContact = null;
      this.selectedContactAccounts = [];
      this.selectedContactEnvelopes = [];
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

    async fetchMaestroCustomers() {
      try {
        return await TGK_API.getCustomers();
      } catch (e) {
        return [];
      }
    },

    async snapshotMaestroCustomers() {
      const customers = await this.fetchMaestroCustomers();
      this._maestroKnownContactIds = new Set((customers || []).map((customer) => customer.id));
    },

    async refreshContactsAfterOnboarding(targetId) {
      try {
        const customers = await TGK_API.getCustomers();
        this.customers = customers;
        return customers.find((customer) => customer.id === targetId) || null;
      } catch (e) {
        return null;
      }
    },

    async handleOnboardingFrameLoad() {
      if (this._maestroTrackingStarted || this.maestroCompleted || this.maestroError) {
        return;
      }
      this._maestroTrackingStarted = true;
      await this.snapshotMaestroCustomers();
      if (!this.showOnboarding || this.maestroCompleted) {
        return;
      }
      this.startMaestroCreationPolling();
    },

    findNewMaestroCustomer(extensionCustomers) {
      const knownIds = this._maestroKnownContactIds || new Set();
      const newCustomers = (extensionCustomers || []).filter((customer) => !knownIds.has(customer.id));
      if (newCustomers.length === 0) return null;
      return newCustomers.reduce(function (a, b) {
        return new Date(b.created_at) > new Date(a.created_at) ? b : a;
      });
    },

    startMaestroCreationPolling() {
      this.stopMaestroCreationPolling();
      const app = this;
      const poll = async function () {
        if (!app.showOnboarding || app.maestroCompleted) return;
        try {
          const extensionCustomers = await app.fetchMaestroCustomers();
          const target = app.findNewMaestroCustomer(extensionCustomers);
          if (target) {
            await app.completeOnboardingWithContact(target);
            return;
          }
        } catch (e) {
          console.warn('Could not poll for Maestro-created customers:', e);
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
      if (!target || this.maestroCompleted) return;
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

    getAccountOpeningIdvValue() {
      return window.TGK_DEMO?.config?.accountOpeningIdVerification ? 'true' : 'false';
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
        const result = await TGK_API.triggerMaestroWorkflow(this.maestroWorkflowId, {
          instance_name: `TGK Wealth Account Opening ${new Date().toISOString()}`,
          trigger_inputs: {
            idv: this.getAccountOpeningIdvValue()
          }
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
    }
  };
}
