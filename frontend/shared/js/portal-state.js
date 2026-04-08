(function () {
  function createPortalChromeState({
    currentKey = 'view',
    defaultView = 'dashboard',
    coreViews = []
  } = {}) {
    const resolvedCurrentKey = String(currentKey || 'view');
    const resolvedDefaultView = String(defaultView || 'dashboard');
    const resolvedCoreViews = Array.isArray(coreViews) ? [...coreViews] : [];

    return {
      ...createBrandingState(),
      iamProducts: getIamProducts(),
      sidebarCollapsed: false,
      _sidebarChangeHandler: null,
      monitorAlerts: [],

      initializePortalChrome() {
        this.initializeBrandingState();
        this.refreshSidebarProducts();
        if (this._sidebarChangeHandler) {
          return;
        }

        this._sidebarChangeHandler = () => this.refreshSidebarProducts();
        window.addEventListener('tgk:sidebar-change', this._sidebarChangeHandler);
      },

      canSeeSettings() {
        return window.TGK_ACCESS?.canSeeSettings?.() ?? true;
      },

      canSeeIamProducts() {
        return (window.TGK_ACCESS?.canSeeIamProducts?.() ?? this.canSeeSettings()) && this.iamProducts.length > 0;
      },

      isCorePortalView(viewName = this[resolvedCurrentKey]) {
        return resolvedCoreViews.includes(viewName);
      },

      buildAllowedPortalViews() {
        const allowedViews = new Set(resolvedCoreViews);

        if (this.canSeeSettings()) {
          allowedViews.add('settings');
        }

        if (this.canSeeIamProducts()) {
          this.iamProducts.forEach((product) => {
            allowedViews.add(product.key);
          });
        }

        return allowedViews;
      },

      refreshSidebarProducts() {
        const currentView = this[resolvedCurrentKey];
        this.iamProducts = getIamProducts();

        if (this.isCorePortalView(currentView) || currentView === 'settings') {
          return;
        }

        if (!this.iamProducts.some((product) => product.key === currentView)) {
          this[resolvedCurrentKey] = resolvedDefaultView;
        }
      },

      setPortalView(nextView) {
        const allowedViews = this.buildAllowedPortalViews();
        this[resolvedCurrentKey] = allowedViews.has(nextView) ? nextView : resolvedDefaultView;
        return this[resolvedCurrentKey];
      },

      activateIamProduct(productKey) {
        this.setPortalView(productKey);
      },

      isActiveIamProduct(productKey) {
        return this[resolvedCurrentKey] === productKey;
      },

      getCurrentIamProduct() {
        return getIamProduct(this[resolvedCurrentKey]);
      },

      getCurrentIamPlaceholder() {
        return getIamProductPlaceholder(this[resolvedCurrentKey]);
      },

      ensureMonitorAlerts(customers = this.customers || []) {
        if (this.monitorAlerts.length) {
          return;
        }

        this.monitorAlerts = buildMonitorAlerts(customers);
      },

      monitorTimeAgo(isoString) {
        return monitorTimeAgo(isoString);
      }
    };
  }

  function createWorkflowLoadingState({
    loadingKey = 'loading',
    loadingIndexKey = 'loadingIndex',
    loadingTimerKey = 'loadingTimer',
    stepsKey = 'workflowLoadingSteps',
    steps = []
  } = {}) {
    const resolvedSteps = Object.freeze([...(Array.isArray(steps) ? steps : [])]);

    return {
      [loadingKey]: false,
      [loadingIndexKey]: 0,
      [loadingTimerKey]: null,

      get [stepsKey]() {
        return resolvedSteps;
      },

      startWorkflowLoading() {
        const maxIndex = Math.max(this[stepsKey].length - 1, 0);

        this.stopWorkflowLoading();
        this[loadingIndexKey] = 0;
        this[loadingTimerKey] = window.setInterval(() => {
          this[loadingIndexKey] = Math.min(this[loadingIndexKey] + 1, maxIndex);
        }, 1400);
      },

      stopWorkflowLoading() {
        if (!this[loadingTimerKey]) {
          return;
        }

        window.clearInterval(this[loadingTimerKey]);
        this[loadingTimerKey] = null;
      }
    };
  }

  window.createPortalChromeState = createPortalChromeState;
  window.createWorkflowLoadingState = createWorkflowLoadingState;
})();
