function investorApp() {
  return {
    tab: 'overview',
    contacts: [],
    selectedClientId: null,
    selectedClient: null,
    accounts: [],
    sidebarCollapsed: false,
    loading: true,

    messages: [],
    newMessage: '',

    async init() {
      try {
        this.contacts = await TGK_API.getContacts();
        if (this.contacts.length > 0) {
          this.selectedClientId = this.contacts[0].id;
          await this.loadClient();
        }
      } catch (e) {
        console.error('Failed to load:', e);
      }
      this.loading = false;
    },

    async loadClient() {
      if (!this.selectedClientId) return;
      try {
        const detail = await TGK_API.getContact(this.selectedClientId);
        this.selectedClient = detail;
        this.accounts = detail.accounts || [];
      } catch (e) {
        console.error('Failed to load client:', e);
      }
    },

    async switchClient() {
      await this.loadClient();
    },

    get clientName() {
      return this.selectedClient ? `${this.selectedClient.first_name} ${this.selectedClient.last_name}` : '';
    },

    get totalPortfolioValue() {
      return this.accounts.reduce((sum, a) => sum + (a.metadata?.value || 0), 0);
    },

    get ytdReturn() {
      if (this.accounts.length === 0) return 0;
      const total = this.accounts.reduce((sum, a) => sum + ((a.metadata?.ytdReturn || 0) * (a.metadata?.value || 0)), 0);
      return total / this.totalPortfolioValue;
    },

    get unreadCount() {
      return this.messages.filter(m => m.unread).length;
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
