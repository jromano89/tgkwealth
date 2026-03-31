/**
 * Docusign Settings Panel Component
 * Drop-in Alpine.js component for the Docusign JWT consent flow.
 */
function getDefaultDocusignScopes() {
  return 'signature impersonation aow_manage organization_read webforms_manage webforms_read webforms_instance_read webforms_instance_write adm_store_unified_repo_read models_read';
}

function docusignSettings() {
  const DEFAULT_SCOPES = getDefaultDocusignScopes();

  function normalizeScopes(scopes) {
    const values = String(scopes || '')
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);

    return [...new Set(values)].join(' ');
  }

  return {
    session: null,
    loading: true,
    error: null,
    notice: null,
    showScopesModal: false,
    requestedScopesText: DEFAULT_SCOPES,
    selectedAccountId: '',
    showAccountPicker: false,
    savingAccount: false,
    savingScopes: false,
    authInProgress: false,
    popupWindow: null,
    popupPoller: null,
    authMessageHandler: null,

    async init() {
      const callbackStatus = this.consumeCallbackStatus();
      this.authMessageHandler = (event) => this.handleAuthMessage(event);
      window.addEventListener('message', this.authMessageHandler);

      await this.checkSession();

      if (callbackStatus?.status === 'error') {
        this.error = callbackStatus.message || 'Docusign connection failed.';
      } else if (callbackStatus?.status === 'connected') {
        this.notice = this.connectionNotice();
      } else {
        this.notice = null;
      }
    },

    async checkSession(options = {}) {
      this.loading = true;
      try {
        this.session = await TGK_API.getSession(options);
        this.error = null;
        this.syncRequestedScopes();
        this.syncAccountSelectionState();
      } catch (e) {
        this.session = null;
        this.error = e.message;
        this.selectedAccountId = '';
        this.showAccountPicker = false;
        this.syncRequestedScopes();
      }
      this.loading = false;
    },

    syncRequestedScopes() {
      const savedScopes = normalizeScopes(this.session?.requestedScopes);
      this.requestedScopesText = savedScopes || DEFAULT_SCOPES;
    },

    syncAccountSelectionState() {
      const accounts = this.availableAccounts();
      const selectedAccountStillExists = accounts.some((account) => account.accountId === this.selectedAccountId);
      if (!selectedAccountStillExists) {
        this.selectedAccountId = this.session?.accountId || accounts[0]?.accountId || '';
      }
      if (!this.session?.connected) {
        this.showAccountPicker = false;
        return;
      }
      if (!this.session?.accountId) {
        this.showAccountPicker = accounts.length > 0;
      }
    },

    consumeCallbackStatus() {
      const url = new URL(window.location.href);
      const status = url.searchParams.get('docusign');
      const message = url.searchParams.get('message');

      if (!status) {
        return null;
      }

      url.searchParams.delete('docusign');
      url.searchParams.delete('message');
      const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', cleanUrl);

      return { status, message };
    },

    async handleAuthMessage(event) {
      if (event.origin !== TGK_API.getBackendOrigin()) {
        return;
      }

      if (!event.data || event.data.source !== 'tgk-docusign-auth') {
        return;
      }

      await this.handleAuthResult(event.data);
    },

    async handleAuthResult(result) {
      this.stopPopupMonitor();
      this.authInProgress = false;

      if (result?.status === 'error') {
        await this.checkSession({ force: true });
        this.error = result.message || 'Docusign connection failed.';
        this.notice = null;
        return;
      }

      await this.checkSession({ force: true });

      if (result?.status === 'connected') {
        this.notice = this.connectionNotice();
      } else {
        this.notice = null;
      }
    },

    login() {
      this.error = null;
      this.notice = null;
      this.authInProgress = true;

      const popup = window.open(
        TGK_API.getLoginUrl(undefined, this.normalizedScopes(), 'popup'),
        'tgk-docusign-consent',
        'width=560,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes'
      );

      if (!popup) {
        window.location.href = TGK_API.getLoginUrl(undefined, this.normalizedScopes(), 'redirect');
        return;
      }

      this.popupWindow = popup;
      this.popupWindow.focus();
      this.startPopupMonitor();
    },

    startPopupMonitor() {
      this.stopPopupMonitor();
      this.popupPoller = window.setInterval(async () => {
        if (!this.popupWindow || this.popupWindow.closed) {
          this.stopPopupMonitor();
          if (this.authInProgress) {
            this.authInProgress = false;
            await this.checkSession({ force: true });
          }
        }
      }, 500);
    },

    stopPopupMonitor() {
      if (this.popupPoller) {
        window.clearInterval(this.popupPoller);
        this.popupPoller = null;
      }
    },

    beginAccountSelection() {
      this.selectedAccountId = this.session?.accountId || this.availableAccounts()[0]?.accountId || '';
      this.showAccountPicker = true;
      this.error = null;
      this.notice = null;
    },

    cancelAccountSelection() {
      if (!this.hasSavedAccount()) {
        return;
      }
      this.selectedAccountId = this.session?.accountId || '';
      this.showAccountPicker = false;
      this.error = null;
    },

    async selectAccount(accountId) {
      try {
        if (!accountId) {
          return;
        }
        if (accountId === this.session?.accountId) {
          this.showAccountPicker = false;
          this.notice = `${this.session?.accountName || 'This account'} is already active.`;
          return;
        }
        this.savingAccount = true;
        await TGK_API.selectAccount(accountId);
        await this.checkSession({ force: true });
        this.showAccountPicker = false;
        this.notice = `Saved ${this.session?.accountName || 'the selected account'} as the active account.`;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.savingAccount = false;
      }
    },

    async logout() {
      try {
        await TGK_API.logout();
        this.notice = 'Docusign disconnected.';
        await this.checkSession({ force: true });
      } catch (e) {
        this.error = e.message;
      }
    },

    normalizedScopes() {
      return normalizeScopes(this.requestedScopesText) || DEFAULT_SCOPES;
    },

    openScopesModal() {
      this.syncRequestedScopes();
      this.showScopesModal = true;
    },

    closeScopesModal() {
      this.syncRequestedScopes();
      this.showScopesModal = false;
    },

    async saveRequestedScopes() {
      this.requestedScopesText = this.normalizedScopes();
      this.error = null;

      try {
        this.savingScopes = true;
        await TGK_API.saveDocusignScopes(this.requestedScopesText);
        await this.checkSession({ force: true });
        this.showScopesModal = false;
        this.notice = 'Saved scopes. Backend DocuSign tokens now use this scope set.';
      } catch (e) {
        this.error = e.message;
      } finally {
        this.savingScopes = false;
      }
    },

    connectionNotice() {
      return this.needsAccountSelection()
        ? 'Docusign connected. Select an account to finish setup.'
        : 'Docusign connected.';
    },

    hasConnection() {
      return !!this.session?.connected;
    },

    hasSavedAccount() {
      return !!this.session?.accountId;
    },

    needsAccountSelection() {
      return this.hasConnection() && !this.hasSavedAccount();
    },

    shouldShowAccountPicker() {
      return this.showAccountPicker && this.availableAccounts().length > 0;
    },

    canChangeAccount() {
      return this.hasSavedAccount() && this.availableAccounts().length > 1;
    },

    availableAccounts() {
      return this.session?.accounts || [];
    }
  };
}
