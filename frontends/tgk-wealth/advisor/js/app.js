const TGK_SELECTED_CLIENT_STORAGE_KEY = 'tgk_selected_client_id';
const TGK_ADVISOR_VIEW_STORAGE_KEY = 'tgk_advisor_view';

function advisorApp() {
  return {
    view: 'dashboard',
    contacts: [],
    selectedContact: null,
    selectedContactAccounts: [],
    searchQuery: '',
    showOnboarding: false,
    maestroWorkflowId: '7cc7fa67-843e-4e45-8ea8-80f451819028',
    maestroInstanceUrl: '',
    maestroError: null,
    maestroLoading: false,
    maestroCompleted: false,
    maestroNewContact: null,
    maestroIframeLoadCount: 0,
    onboardingLoadingIndex: 0,
    onboardingLoadingTimer: null,
    sidebarCollapsed: false,
    loading: true,

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

    async openOnboarding() {
      this.showOnboarding = true;
      this.maestroCompleted = false;
      this.maestroNewContact = null;
      this.maestroIframeLoadCount = 0;
      await this.loadMaestroWorkflow();
    },

    closeOnboarding() {
      this.showOnboarding = false;
      this.maestroInstanceUrl = '';
      this.maestroError = null;
      this.maestroLoading = false;
      this.maestroCompleted = false;
      this.maestroNewContact = null;
      this.stopOnboardingLoading();
    },

    onMaestroIframeLoad() {
      this.maestroIframeLoadCount++;
      // Skip the initial load and don't re-trigger if already completing
      if (this.maestroIframeLoadCount <= 1 || this.maestroCompleted) return;

      // Debounce: each navigation resets the timer so only the last one (done-page) fires
      if (this._maestroRedirectTimer) clearTimeout(this._maestroRedirectTimer);

      const app = this;
      this._maestroRedirectTimer = setTimeout(function () {
        app.maestroCompleted = true;

        TGK_API.getContacts().then(function (contacts) {
          app.contacts = contacts;

          // Find the most recently created contact
          const target = contacts.reduce(function (a, b) {
            return new Date(b.created_at) > new Date(a.created_at) ? b : a;
          });
          app.maestroNewContact = target;

          // Show confirmation briefly, then close and navigate
          setTimeout(function () {
            app.showOnboarding = false;
            app.maestroInstanceUrl = '';
            app.maestroCompleted = false;
            app.maestroNewContact = null;
            if (target) {
              app.viewClient(target);
            }
          }, 2000);
        }).catch(function () {
          app.showOnboarding = false;
          app.maestroCompleted = false;
        });
      }, 1000);
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
