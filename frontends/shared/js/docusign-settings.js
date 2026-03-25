/**
 * Docusign Settings Panel Component
 * Drop-in Alpine.js component for the Docusign JWT consent flow.
 */
function docusignSettings() {
  const STORAGE_KEY = `tgk_docusign_scopes_${window.TGK_CONFIG?.appSlug || 'default'}`;
  const DEFAULT_SCOPES = 'signature impersonation aow_manage organization_read webforms_manage webforms_read webforms_instance_read webforms_instance_write adm_store_unified_repo_read models_read';

  function normalizeScopes(scopes) {
    const values = String(scopes || '')
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);

    return [...new Set(['signature', 'impersonation', 'aow_manage', ...values])].join(' ') || DEFAULT_SCOPES;
  }

  return {
    session: null,
    loading: true,
    error: null,
    notice: null,
    showScopesModal: false,
    requestedScopesText: DEFAULT_SCOPES,
    selectedAccountId: '',
    authInProgress: false,
    popupWindow: null,
    popupPoller: null,
    authMessageHandler: null,

    async init() {
      this.loadRequestedScopes();
      const callbackStatus = this.consumeCallbackStatus();
      this.authMessageHandler = (event) => this.handleAuthMessage(event);
      window.addEventListener('message', this.authMessageHandler);

      await this.checkSession();

      if (callbackStatus?.status === 'error') {
        this.error = callbackStatus.message || 'Docusign connection failed.';
      } else if (callbackStatus?.status === 'select-account' || this.session?.pendingAccountSelection) {
        this.notice = 'Select the Docusign account to use.';
      } else {
        this.notice = null;
      }
    },

    async checkSession() {
      this.loading = true;
      try {
        this.session = await TGK_API.getSession();
        this.error = null;
        this.selectedAccountId = this.session?.accountId || this.session?.accounts?.[0]?.accountId || '';
      } catch (e) {
        this.session = null;
        this.error = e.message;
      }
      this.loading = false;
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
        await this.checkSession();
        this.error = result.message || 'Docusign connection failed.';
        this.notice = null;
        return;
      }

      await this.checkSession();

      if (result?.status === 'select-account') {
        this.notice = 'Select the Docusign account to use.';
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
            await this.checkSession();
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

    async selectAccount(accountId) {
      try {
        if (!accountId || accountId === this.session?.accountId) {
          return;
        }
        await TGK_API.selectAccount(accountId);
        await this.checkSession();
        this.notice = `Using ${this.session?.accountName || 'the selected Docusign account'}.`;
      } catch (e) {
        this.error = e.message;
      }
    },

    async logout() {
      try {
        await TGK_API.logout();
        this.notice = 'Docusign account disconnected.';
        await this.checkSession();
      } catch (e) {
        this.error = e.message;
      }
    },

    loadRequestedScopes() {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      this.requestedScopesText = stored || DEFAULT_SCOPES;
    },

    normalizedScopes() {
      return normalizeScopes(this.requestedScopesText);
    },

    openScopesModal() {
      this.showScopesModal = true;
    },

    closeScopesModal() {
      this.showScopesModal = false;
    },

    saveRequestedScopes() {
      this.requestedScopesText = this.normalizedScopes();
      window.localStorage.setItem(STORAGE_KEY, this.requestedScopesText);
      this.showScopesModal = false;
      this.notice = 'Scopes saved.';
    },

    resetRequestedScopes() {
      this.requestedScopesText = DEFAULT_SCOPES;
    },

    availableAccounts() {
      return this.session?.accounts || [];
    }
  };
}
