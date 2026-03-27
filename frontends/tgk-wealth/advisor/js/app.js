const TGK_SELECTED_CLIENT_STORAGE_KEY = 'tgk_selected_client_id';
const TGK_ADVISOR_VIEW_STORAGE_KEY = 'tgk_advisor_view';
const MAESTRO_CONTACT_SOURCE = 'maestro-extension';
const MAESTRO_POLL_INTERVAL_MS = 1500;
const MAESTRO_COMPLETION_SETTLE_DELAY_MS = 400;
const MAESTRO_SUCCESS_REDIRECT_DELAY_MS = 2000;

function advisorApp() {
  return {
    view: 'dashboard',
    contacts: [],
    selectedContact: null,
    selectedContactAccounts: [],
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
        return window.localStorage.getItem(TGK_SELECTED_CLIENT_STORAGE_KEY);
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
      } catch (e) {
        this.selectedContactAccounts = [];
      }
      this.setView('client');
    },

    rememberSelectedContact(contactId) {
      if (!contactId) return;
      try {
        window.localStorage.setItem(TGK_SELECTED_CLIENT_STORAGE_KEY, contactId);
      } catch (e) {}
    },

    goBack() {
      this.setView('dashboard');
      this.selectedContact = null;
      this.selectedContactAccounts = [];
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
