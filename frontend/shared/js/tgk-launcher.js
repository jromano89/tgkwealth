(function () {
  const HERO_COPY = 'Select vertical and workflow to launch the demo.';
  const defaults = {
    vertical: 'wealth',
    workflow: 'onboarding'
  };

  const verticals = {
    banking: true,
    wealth: true,
    insurance: true
  };

  const workflows = {
    onboarding: true,
    maintenance: true
  };

  const portalTargets = {
    onboarding: {
      path: 'advisor/',
      launchLabel: 'Launch Advisor Portal ->'
    },
    maintenance: {
      path: 'investor/',
      launchLabel: 'Launch Investor Portal ->'
    }
  };

  const scenarioOverrides = {
    wealth: {
      onboarding: {
        path: 'scenes/wealth/account-onboarding/',
        label: 'Generate Story Demo ->',
        params: {
          scene: 'problem'
        }
      }
    }
  };

  function readStateValue(name, options, fallback) {
    const value = new URL(window.location.href).searchParams.get(name);
    return Object.prototype.hasOwnProperty.call(options, value) ? value : fallback;
  }

  function setSelectedOption(name, value) {
    document.querySelectorAll(`[data-option="${name}"]`).forEach((button) => {
      const isSelected = button.dataset.value === value;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  function buildHref(pathname, extraParams = {}) {
    const url = new URL(pathname, window.location.href);

    Object.entries(extraParams).forEach(([key, value]) => {
      if (value == null || value === '') {
        return;
      }
      url.searchParams.set(key, value);
    });

    return `${url.pathname}${url.search}`;
  }

  function syncUrl(state) {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('vertical', state.vertical);
    currentUrl.searchParams.set('workflow', state.workflow);
    window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}`);
  }

  function getPortalTarget(workflow) {
    return portalTargets[workflow] || portalTargets[defaults.workflow];
  }

  function getPrimaryScenario(state) {
    const override = scenarioOverrides[state.vertical]?.[state.workflow];
    if (override) {
      return override;
    }

    const portalTarget = getPortalTarget(state.workflow);
    return {
      path: portalTarget.path,
      label: portalTarget.launchLabel,
      params: {
        mode: 'normal'
      }
    };
  }

  function getConfigurableScenario(state) {
    const portalTarget = getPortalTarget(state.workflow);
    return {
      path: portalTarget.path,
      params: {
        mode: 'advanced'
      }
    };
  }

  function bootLauncher() {
    const heroCopy = document.getElementById('hero-copy');
    const generateLink = document.getElementById('generate-demo-link');
    const generateLabel = document.getElementById('generate-demo-label');
    const configurablePortalLink = document.getElementById('configurable-portal-link');
    const backendServiceLink = document.getElementById('backend-service-link');

    if (!heroCopy || !generateLink || !generateLabel || !configurablePortalLink || !backendServiceLink) {
      return;
    }

    const state = {
      vertical: readStateValue('vertical', verticals, defaults.vertical),
      workflow: readStateValue('workflow', workflows, defaults.workflow)
    };

    function render() {
      const primaryScenario = getPrimaryScenario(state);
      const configurableScenario = getConfigurableScenario(state);

      setSelectedOption('vertical', state.vertical);
      setSelectedOption('workflow', state.workflow);

      heroCopy.textContent = HERO_COPY;
      generateLabel.textContent = primaryScenario.label;
      generateLink.href = buildHref(primaryScenario.path, primaryScenario.params);
      configurablePortalLink.href = buildHref(configurableScenario.path, configurableScenario.params);
      backendServiceLink.href = window.TGK_CONFIG?.backendUrl || '#';
      syncUrl(state);
    }

    document.querySelectorAll('[data-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const { option, value } = button.dataset;
        if (!option || !value) {
          return;
        }

        state[option] = value;
        render();
      });
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLauncher, { once: true });
    return;
  }

  bootLauncher();
})();
