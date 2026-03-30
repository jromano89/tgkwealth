const TGK_SELECTED_CONTACT_STORAGE_KEY = 'tgk_selected_client_id';
const TGK_INVESTOR_TAB_STORAGE_KEY = 'tgk_investor_tab';

function investorApp() {
  return {
    ...createEnvelopeModalHelpers(),
    tab: 'overview',
    contacts: [],
    selectedClientId: null,
    selectedClient: null,
    accounts: [],
    envelopes: [],
    sidebarCollapsed: false,
    loading: true,

    tasks: [],

    async init() {
      try {
        this.contacts = this.sortContacts(await TGK_API.getContacts());
        this.setTab(this.restoreTab());
        let requestedClientId = null;
        try {
          requestedClientId = window.localStorage.getItem(TGK_SELECTED_CONTACT_STORAGE_KEY);
        } catch (e) {}
        const initialClient = this.contacts.find(contact => contact.id === requestedClientId) || this.contacts[0];
        if (initialClient) {
          this.selectedClientId = initialClient.id;
          this.rememberSelectedClient(this.selectedClientId);
          await this.loadClient();
        }
      } catch (e) {
        console.error('Failed to load:', e);
      }
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    sortContacts(contacts) {
      return [...(contacts || [])].sort((a, b) => {
        const left = `${a.first_name || ''} ${a.last_name || ''}`.trim();
        const right = `${b.first_name || ''} ${b.last_name || ''}`.trim();
        return left.localeCompare(right, undefined, { sensitivity: 'base' });
      });
    },

    restoreTab() {
      try {
        return window.localStorage.getItem(TGK_INVESTOR_TAB_STORAGE_KEY) || 'overview';
      } catch (e) {
        return 'overview';
      }
    },

    setTab(nextTab) {
      const allowedTabs = new Set(['overview', 'documents', 'tasks', 'settings']);
      this.tab = allowedTabs.has(nextTab) ? nextTab : 'overview';
      try {
        window.localStorage.setItem(TGK_INVESTOR_TAB_STORAGE_KEY, this.tab);
      } catch (e) {}
    },

    async loadClient() {
      if (!this.selectedClientId) return;
      try {
        const detail = await TGK_API.getContact(this.selectedClientId);
        this.selectedClient = detail;
        this.accounts = detail.accounts || [];
        this.envelopes = detail.envelopes || [];
        this.tasks = detail.tasks || [];
      } catch (e) {
        console.error('Failed to load client:', e);
      }
    },

    rememberSelectedClient(clientId) {
      if (!clientId) return;
      try {
        window.localStorage.setItem(TGK_SELECTED_CONTACT_STORAGE_KEY, clientId);
      } catch (e) {}
    },

    async switchClient() {
      this.rememberSelectedClient(this.selectedClientId);
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
        await TGK_API.deleteTask(id);
        this.tasks = this.tasks.filter(t => t.id !== id);
      } catch (e) {
        console.error('Failed to dismiss task:', e);
      }
    },

    initials(name) {
      return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }
  };
}
