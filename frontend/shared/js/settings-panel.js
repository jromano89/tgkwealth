/**
 * Shared settings state for branding and advanced sidebar controls.
 * Persists to localStorage so the advisor and investor portals stay aligned.
 */

const TGK_DEMO_SETTINGS_STORAGE_KEY = 'tgk_demo_settings';
const TGK_BRANDING_EVENT = 'tgk:branding-change';
const TGK_SIDEBAR_EVENT = 'tgk:sidebar-change';
const TGK_IAM_PRODUCT_OPTIONS = Array.isArray(window.TGK_CONFIG?.iamProducts)
  ? window.TGK_CONFIG.iamProducts.map((product) => ({ ...product }))
  : [];
const TGK_DEFAULT_IAM_PRODUCTS = Array.isArray(window.TGK_CONFIG?.defaultIamProducts)
  ? window.TGK_CONFIG.defaultIamProducts
  : TGK_IAM_PRODUCT_OPTIONS.map((product) => product.key);
const TGK_PORTAL_TONES = {
  advisor: {
    pageBackground: '#f4f5f7',
    sidebarLightness: 12,
    sidebarLightLightness: 20
  },
  investor: {
    pageBackground: '#f5f7fb',
    sidebarLightness: 18,
    sidebarLightLightness: 26
  }
};
const TGK_DEMO_DEFAULTS = {
  branding: {
    appName: window.TGK_CONFIG?.appName || 'TGK Wealth',
    brandColor: window.TGK_CONFIG?.brandColor || '#3b5bdb'
  },
  sidebar: {
    iamProductKeys: normalizeIamProductKeys(TGK_DEFAULT_IAM_PRODUCTS)
  }
};

function normalizeHexColor(value, fallback = TGK_DEMO_DEFAULTS.branding.brandColor) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim()) ? String(value).trim() : fallback;
}

function canUseAdvancedCustomizations() {
  return Boolean(window.TGK_ACCESS?.canSeeSettings?.());
}

function normalizeIamProductKeys(keys, fallback = []) {
  const validKeys = new Set(
    TGK_IAM_PRODUCT_OPTIONS.map((product) => String(product.key || '').trim().toLowerCase()).filter(Boolean)
  );
  const source = Array.isArray(keys) ? keys : fallback;
  const normalizedKeys = [];

  source.forEach((key) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!validKeys.has(normalizedKey) || normalizedKeys.includes(normalizedKey)) {
      return;
    }

    normalizedKeys.push(normalizedKey);
  });

  return normalizedKeys;
}

function resolveBrandingAppName(value) {
  return String(value || window.TGK_DEMO?.branding?.appName || window.TGK_CONFIG?.appName || TGK_DEMO_DEFAULTS.branding.appName).trim()
    || TGK_DEMO_DEFAULTS.branding.appName;
}

function getBrandingInitial(value) {
  return (resolveBrandingAppName(value).match(/[A-Za-z0-9]/) || ['T'])[0].toUpperCase();
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = 0;
    s = 0;
  } else {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / delta + 2) / 6;
        break;
      default:
        h = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  const normalizedS = s / 100;
  const normalizedL = l / 100;
  const alpha = normalizedS * Math.min(normalizedL, 1 - normalizedL);
  const channel = (offset) => {
    const key = (offset + h / 30) % 12;
    return normalizedL - alpha * Math.max(Math.min(key - 3, 9 - key, 1), -1);
  };

  return '#' + [channel(0), channel(8), channel(4)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, '0'))
    .join('');
}

function deriveBrandLight(hex) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(s + 10, 100), Math.min(l + 15, 85));
}

function deriveSidebarColor(hex, portalTone) {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.max(s * 0.4, 15), portalTone.sidebarLightness);
}

function deriveSidebarLightColor(hex, portalTone) {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.max(s * 0.35, 12), portalTone.sidebarLightLightness);
}

function getPortalTone(portalName = document.body?.dataset.portal || document.documentElement?.dataset.portal || 'advisor') {
  return TGK_PORTAL_TONES[portalName] || TGK_PORTAL_TONES.advisor;
}

function applyThemeVariables(target, variables) {
  if (!target) return;

  Object.entries(variables).forEach(([name, value]) => {
    target.style.setProperty(name, value);
  });
}

function readStoredSettings() {
  try {
    const storedValue = window.localStorage.getItem(TGK_DEMO_SETTINGS_STORAGE_KEY);
    const parsed = storedValue ? JSON.parse(storedValue) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeStoredSettings(settings) {
  try {
    window.localStorage.setItem(TGK_DEMO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {}
}

function resolveSidebarSettings(savedSidebar = {}) {
  if (Array.isArray(savedSidebar.iamProductKeys)) {
    return {
      iamProductKeys: normalizeIamProductKeys(savedSidebar.iamProductKeys)
    };
  }

  return {
    iamProductKeys: normalizeIamProductKeys(TGK_DEMO_DEFAULTS.sidebar.iamProductKeys)
  };
}

function syncRuntimeSidebar(nextSidebar) {
  if (!window.TGK_DEMO) {
    window.TGK_DEMO = buildDemoSettingsSnapshot(readStoredSettings());
  }

  const resolvedSidebar = resolveSidebarSettings({
    ...(window.TGK_DEMO.sidebar || {}),
    ...nextSidebar
  });

  window.TGK_DEMO.sidebar = resolvedSidebar;
  return resolvedSidebar;
}

function dispatchSidebarChange(nextSidebar) {
  window.dispatchEvent(new CustomEvent(TGK_SIDEBAR_EVENT, {
    detail: resolveSidebarSettings(nextSidebar)
  }));
}

function persistDemoSettings({ branding, sidebar } = {}) {
  const existing = readStoredSettings();
  const nextBrandingSource = {
    ...(existing.branding || {}),
    ...(branding || {})
  };
  const nextBranding = {
    appName: resolveBrandingAppName(nextBrandingSource.appName),
    brandColor: normalizeHexColor(nextBrandingSource.brandColor)
  };
  const nextSidebar = resolveSidebarSettings(sidebar !== undefined ? sidebar : (existing.sidebar || {}));

  writeStoredSettings({
    ...existing,
    branding: nextBranding,
    sidebar: nextSidebar
  });

  applyBrandingPreview(nextBranding);
  syncRuntimeSidebar(nextSidebar);
  dispatchSidebarChange(nextSidebar);

  return {
    branding: nextBranding,
    sidebar: nextSidebar
  };
}

function buildDemoSettingsSnapshot(savedSettings) {
  const savedBranding = savedSettings.branding || {};
  const isAdvanced = canUseAdvancedCustomizations();

  return {
    branding: {
      appName: isAdvanced
        ? (savedBranding.appName || TGK_DEMO_DEFAULTS.branding.appName)
        : TGK_DEMO_DEFAULTS.branding.appName,
      brandColor: isAdvanced
        ? normalizeHexColor(savedBranding.brandColor)
        : TGK_DEMO_DEFAULTS.branding.brandColor
    },
    sidebar: isAdvanced
      ? resolveSidebarSettings(savedSettings.sidebar || {})
      : { iamProductKeys: [] },
    DEFAULTS: TGK_DEMO_DEFAULTS
  };
}

function applyThemeColor(brandColor) {
  const portalTone = getPortalTone();
  const variables = {
    '--color-brand': brandColor,
    '--color-brand-light': deriveBrandLight(brandColor),
    '--color-navy': deriveSidebarColor(brandColor, portalTone),
    '--color-navy-light': deriveSidebarLightColor(brandColor, portalTone),
    '--tgk-page-bg': portalTone.pageBackground
  };

  applyThemeVariables(document.documentElement, variables);
  applyThemeVariables(document.body, variables);
}

function applyBrandingPreview(nextBranding = {}) {
  const sourceBranding = canUseAdvancedCustomizations()
    ? nextBranding
    : TGK_DEMO_DEFAULTS.branding;
  const branding = {
    appName: resolveBrandingAppName(sourceBranding.appName),
    brandColor: normalizeHexColor(sourceBranding.brandColor)
  };

  if (!window.TGK_DEMO) {
    window.TGK_DEMO = buildDemoSettingsSnapshot(readStoredSettings());
  }

  window.TGK_DEMO.branding = {
    ...(window.TGK_DEMO.branding || {}),
    ...branding
  };

  applyThemeColor(branding.brandColor);
  window.dispatchEvent(new CustomEvent(TGK_BRANDING_EVENT, { detail: branding }));
  return branding;
}

function createBrandingState() {
  const initialAppName = resolveBrandingAppName();

  return {
    brandingAppName: initialAppName,
    brandingInitial: getBrandingInitial(initialAppName),
    _brandingChangeHandler: null,

    syncBranding(detail = {}) {
      this.brandingAppName = resolveBrandingAppName(detail.appName);
      this.brandingInitial = getBrandingInitial(this.brandingAppName);
    },

    initializeBrandingState() {
      this.syncBranding();
      if (this._brandingChangeHandler) {
        return;
      }

      this._brandingChangeHandler = (event) => this.syncBranding(event.detail || {});
      window.addEventListener(TGK_BRANDING_EVENT, this._brandingChangeHandler);
    }
  };
}

(function initializeDemoTheme() {
  window.TGK_DEMO = buildDemoSettingsSnapshot(readStoredSettings());
  applyBrandingPreview(window.TGK_DEMO.branding);
})();

function settingsPanelState() {
  return {
    appName: window.TGK_DEMO.branding.appName,
    brandColor: window.TGK_DEMO.branding.brandColor,
    sidebarProductKeys: [...(window.TGK_DEMO.sidebar?.iamProductKeys || [])],
    docusignConsentBusy: false,
    docusignConsentStatus: 'idle',
    docusignConsentMessage: '',

    currentSidebar() {
      return resolveSidebarSettings({
        iamProductKeys: this.sidebarProductKeys
      });
    },

    sidebarOptions() {
      return TGK_IAM_PRODUCT_OPTIONS;
    },

    get docusignConfig() {
      return window.TGK_API?.getDocusignAuthConfig?.() || {
        userId: '',
        accountId: '',
        scopes: ''
      };
    },

    hasDocusignAuthConfig() {
      return !!window.TGK_API?.hasDocusignAuthConfig?.();
    },

    async grantDocusignConsent() {
      if (this.docusignConsentBusy) {
        return;
      }

      this.docusignConsentBusy = true;
      this.docusignConsentStatus = 'working';
      this.docusignConsentMessage = 'Waiting for popup...';

      try {
        await window.TGK_API.startDocusignConsent();
        window.TGK_API.clearDocusignTokenCache();
        this.docusignConsentStatus = 'success';
        this.docusignConsentMessage = 'Consent granted.';
      } catch (error) {
        this.docusignConsentStatus = 'error';
        this.docusignConsentMessage = error.message || 'Consent failed.';
      } finally {
        this.docusignConsentBusy = false;
      }
    },

    isSidebarProductEnabled(productKey) {
      const key = String(productKey || '').trim().toLowerCase();
      return this.sidebarProductKeys.includes(key);
    },

    toggleSidebarProduct(productKey, enabled) {
      const key = String(productKey || '').trim().toLowerCase();
      const selectedKeys = new Set(this.sidebarProductKeys);

      if (enabled) {
        selectedKeys.add(key);
      } else {
        selectedKeys.delete(key);
      }

      this.sidebarProductKeys = TGK_IAM_PRODUCT_OPTIONS
        .map((product) => product.key)
        .filter((productKeyValue) => selectedKeys.has(productKeyValue));

      this.applySettingsUpdate();
    },

    applySettingsUpdate() {
      const nextState = persistDemoSettings({
        branding: {
          appName: this.appName,
          brandColor: this.brandColor
        },
        sidebar: this.currentSidebar()
      });

      this.appName = nextState.branding.appName;
      this.brandColor = nextState.branding.brandColor;
      this.sidebarProductKeys = [...nextState.sidebar.iamProductKeys];
    },

    updateAppName(value) {
      this.appName = value;
      this.applySettingsUpdate();
    },

    updateBrandColor(hex) {
      this.brandColor = normalizeHexColor(hex);
      this.applySettingsUpdate();
    },

    resetAllCustomizations() {
      this.appName = TGK_DEMO_DEFAULTS.branding.appName;
      this.brandColor = TGK_DEMO_DEFAULTS.branding.brandColor;
      this.sidebarProductKeys = [...TGK_DEMO_DEFAULTS.sidebar.iamProductKeys];
      this.applySettingsUpdate();
    }
  };
}
