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
    onboarding: {
      routeHref: 'advisor/'
    },
    maintenance: {
      routeHref: 'investor/'
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

  function buildHref(pathname, state, extraParams = {}) {
    const url = new URL(pathname, window.location.href);
    url.searchParams.set('vertical', state.vertical);
    url.searchParams.set('workflow', state.workflow);

    Object.entries(extraParams).forEach(([key, value]) => {
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

  function bootLauncher() {
    const heroCopy = document.getElementById('hero-copy');
    const generateLink = document.getElementById('generate-demo-link');
    const configurablePortalLink = document.getElementById('configurable-portal-link');

    if (!heroCopy || !generateLink || !configurablePortalLink) {
      return;
    }

    const state = {
      vertical: readStateValue('vertical', verticals, defaults.vertical),
      workflow: readStateValue('workflow', workflows, defaults.workflow)
    };

    function render() {
      const selectedWorkflow = workflows[state.workflow];

      setSelectedOption('vertical', state.vertical);
      setSelectedOption('workflow', state.workflow);

      heroCopy.textContent = HERO_COPY;
      generateLink.href = buildHref(selectedWorkflow.routeHref, state);
      configurablePortalLink.href = buildHref(selectedWorkflow.routeHref, state, { mode: 'advanced' });
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
