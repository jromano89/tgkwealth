const TGK_SELECTED_CLIENT_STORAGE_KEY = 'tgk_selected_client_id';
const TGK_INVESTOR_TAB_STORAGE_KEY = 'tgk_investor_tab';

function investorApp() {
  return {
    tab: 'overview',
    contacts: [],
    selectedClientId: null,
    selectedClient: null,
    accounts: [],
    envelopes: [],
    sidebarCollapsed: false,
    loading: true,

    messages: [],
    newMessage: '',

    async init() {
      try {
        this.contacts = this.sortContacts(await TGK_API.getContacts());
        this.setTab(this.restoreTab());
        let requestedClientId = null;
        try {
          requestedClientId = window.localStorage.getItem(TGK_SELECTED_CLIENT_STORAGE_KEY);
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
      const allowedTabs = new Set(['overview', 'documents', 'messages', 'settings']);
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
      } catch (e) {
        console.error('Failed to load client:', e);
      }
    },

    rememberSelectedClient(clientId) {
      if (!clientId) return;
      try {
        window.localStorage.setItem(TGK_SELECTED_CLIENT_STORAGE_KEY, clientId);
      } catch (e) {}
    },

    async switchClient() {
      this.rememberSelectedClient(this.selectedClientId);
      await this.loadClient();
    },

    get clientName() {
      return this.selectedClient ? `${this.selectedClient.first_name} ${this.selectedClient.last_name}` : '';
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

    get unreadCount() {
      return this.messages.filter(m => m.unread).length;
    },

    async openEnvelope(env) {
      const id = env.docusign_envelope_id || env.id;
      if (!id) return;
      try {
        const { url } = await TGK_API.post(`/api/envelopes/${id}/console-view`, { returnUrl: window.location.href });
        window.open(url, '_blank');
      } catch (e) {
        window.open(`https://app.docusign.com/documents/details/${id}`, '_blank');
      }
    },

    sendMessage() {
      if (!this.newMessage.trim()) return;
      this.messages.unshift({
        from: this.clientName,
        body: this.newMessage,
        time: 'Just now',
        unread: false,
        isAdvisor: false
      });
      this.newMessage = '';
    }
  };
}
