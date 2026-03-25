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
    onboardingLoadingIndex: 0,
    onboardingLoadingTimer: null,
    sidebarCollapsed: false,
    loading: true,

    async init() {
      try {
        this.contacts = await TGK_API.getContacts();
      } catch (e) {
        console.error('Failed to load contacts:', e);
      }
      this.loading = false;
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
      this.selectedContact = contact;
      try {
        const detail = await TGK_API.getContact(contact.id);
        this.selectedContact = detail;
        this.selectedContactAccounts = detail.accounts || [];
      } catch (e) {
        this.selectedContactAccounts = [];
      }
      this.view = 'client';
    },

    goBack() {
      this.view = 'dashboard';
      this.selectedContact = null;
    },

    async openOnboarding() {
      this.showOnboarding = true;
      await this.loadMaestroWorkflow();
    },

    closeOnboarding() {
      this.showOnboarding = false;
      this.maestroInstanceUrl = '';
      this.maestroError = null;
      this.maestroLoading = false;
      this.stopOnboardingLoading();
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
        if (!session?.connected || !session?.accountId) {
          throw new Error('Connect a Docusign account before launching account opening.');
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
