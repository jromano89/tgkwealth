function investorApp() {
  return {
    ...createBrandingState(),
    ...createEnvelopeModalHelpers(),
    tab: 'overview',
    advisors: [],
    assignedAdvisor: null,
    customers: [],
    selectedClientId: null,
    selectedClient: null,
    accounts: [],
    envelopes: [],
    sidebarCollapsed: false,
    loading: true,

    tasks: [],

    async init() {
      this.initializeBrandingState();
      try {
        this.advisors = await TGK_API.getEmployees();
        this.assignedAdvisor = this.advisors[0] || null;
        this.customers = this.sortCustomers(await TGK_API.getCustomers());
        this.setTab('overview');
        const preferredClientId = TGK_API.getPreferredCustomerId();
        const initialClient = this.customers.find((customer) => customer.id === preferredClientId) || this.customers[0];
        if (initialClient) {
          this.selectedClientId = initialClient.id;
          await this.loadClient();
        }
      } catch (e) {
        console.error('Failed to load:', e);
      }
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    sortCustomers(customers) {
      return [...(customers || [])].sort((a, b) => {
        const left = `${a.first_name || ''} ${a.last_name || ''}`.trim();
        const right = `${b.first_name || ''} ${b.last_name || ''}`.trim();
        return left.localeCompare(right, undefined, { sensitivity: 'base' });
      });
    },

    setTab(nextTab) {
      const allowedTabs = new Set(['overview', 'documents', 'tasks', 'settings']);
      this.tab = allowedTabs.has(nextTab) ? nextTab : 'overview';
    },

    async loadClient() {
      if (!this.selectedClientId) return;
      try {
        const detail = await TGK_API.getCustomer(this.selectedClientId);
        this.selectedClient = detail;
        TGK_API.setPreferredCustomerId(detail.id);
        this.accounts = detail.accounts || [];
        this.envelopes = detail.envelopes || [];
        this.tasks = detail.tasks || [];
        this.assignedAdvisor = this.advisors.find((advisor) => advisor.id === detail.employee_id) || this.advisors[0] || null;
      } catch (e) {
        console.error('Failed to load client:', e);
        this.selectedClient = null;
        this.accounts = [];
        this.envelopes = [];
        this.tasks = [];
      }
    },

    async switchClient() {
      await this.loadClient();
    },

    get clientName() {
      return this.selectedClient ? `${this.selectedClient.first_name} ${this.selectedClient.last_name}` : '';
    },

    get portfolioDateLabel() {
      return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }).format(new Date());
    },

    get totalPortfolioValue() {
      return this.accounts.reduce((sum, a) => sum + (a.metadata?.value || 0), 0);
    },

    get ytdReturn() {
      const portfolioValue = this.totalPortfolioValue;
      if (this.accounts.length === 0 || portfolioValue === 0) return 0;
      const total = this.accounts.reduce((sum, a) => sum + ((a.metadata?.ytdReturn || 0) * (a.metadata?.value || 0)), 0);
      return total / portfolioValue;
    },

    async dismissTask(id) {
      try {
        const nextTasks = this.tasks.filter((task) => task.id !== id);
        await TGK_API.deleteTask(id);
        this.tasks = nextTasks;
        if (this.selectedClient) {
          this.selectedClient = {
            ...this.selectedClient,
            tasks: nextTasks
          };
        }
      } catch (e) {
        console.error('Failed to dismiss task:', e);
      }
    },

    initials(name) {
      return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }
  };
}
