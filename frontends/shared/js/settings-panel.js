/**
 * Shared settings state for branding and demo configuration.
 * Persists to localStorage so the advisor and investor portals stay aligned.
 */

const TGK_DEMO_SETTINGS_STORAGE_KEY = 'tgk_demo_settings';
const TGK_BRANDING_EVENT = 'tgk:branding-change';
const TGK_RUNTIME_DEFAULTS = window.TGK_RUNTIME_CONFIG?.shared?.config || {};
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
    appName: 'TGK Wealth',
    brandColor: '#3b5bdb'
  },
  config: {
    idVerification: false,
    idvWorkflowId: TGK_RUNTIME_DEFAULTS.idvWorkflowId || '8a7bbe6b-badc-4413-818b-2e92868de402',
    assetTransferWorkflowId: TGK_RUNTIME_DEFAULTS.assetTransferWorkflowId || 'b59acbee-8052-403a-a752-c04287ad6ee1'
  }
};

function normalizeHexColor(value, fallback = TGK_DEMO_DEFAULTS.branding.brandColor) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim()) ? String(value).trim() : fallback;
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

function clearStoredSettings() {
  try {
    window.localStorage.removeItem(TGK_DEMO_SETTINGS_STORAGE_KEY);
  } catch (error) {}
}

function buildDemoSettingsSnapshot(savedSettings) {
  const savedBranding = savedSettings.branding || {};
  return {
    branding: {
      appName: savedBranding.appName || TGK_DEMO_DEFAULTS.branding.appName,
      brandColor: normalizeHexColor(savedBranding.brandColor)
    },
    config: {
      ...TGK_DEMO_DEFAULTS.config,
      ...(savedSettings.config || {})
    },
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
  const branding = {
    appName: resolveBrandingAppName(nextBranding.appName),
    brandColor: normalizeHexColor(nextBranding.brandColor)
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
  return {
    brandingAppName: resolveBrandingAppName(),
    _brandingChangeHandler: null,

    syncBranding(detail = {}) {
      this.brandingAppName = resolveBrandingAppName(detail.appName);
    },

    get brandingInitial() {
      return getBrandingInitial(this.brandingAppName);
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
    idVerification: window.TGK_DEMO.config.idVerification,
    idvWorkflowId: window.TGK_DEMO.config.idvWorkflowId,
    assetTransferWorkflowId: window.TGK_DEMO.config.assetTransferWorkflowId,
    dirty: false,

    previewBranding() {
      applyBrandingPreview({
        appName: this.appName,
        brandColor: this.brandColor
      });
    },

    previewAppName(value) {
      this.appName = value;
      this.dirty = true;
      this.previewBranding();
    },

    applyColor(hex) {
      this.brandColor = normalizeHexColor(hex);
      this.dirty = true;
      this.previewBranding();
    },

    save() {
      const existing = readStoredSettings();
      const nextBrandColor = normalizeHexColor(this.brandColor);
      const nextAppName = this.appName.trim() || TGK_DEMO_DEFAULTS.branding.appName;
      writeStoredSettings({
        branding: {
          appName: nextAppName,
          brandColor: nextBrandColor
        },
        config: {
          ...window.TGK_DEMO.DEFAULTS.config,
          ...(existing.config || {}),
          idVerification: this.idVerification,
          idvWorkflowId: this.idvWorkflowId,
          assetTransferWorkflowId: this.assetTransferWorkflowId
        }
      });

      applyBrandingPreview({
        appName: nextAppName,
        brandColor: nextBrandColor
      });
      window.location.reload();
    },

    saveConfig() {
      const existing = readStoredSettings();
      existing.config = {
        ...existing.config,
        idVerification: this.idVerification,
        idvWorkflowId: this.idvWorkflowId,
        assetTransferWorkflowId: this.assetTransferWorkflowId
      };
      delete existing.config.countersignatures;
      writeStoredSettings(existing);
    },

    resetDefaults() {
      clearStoredSettings();
      applyBrandingPreview(TGK_DEMO_DEFAULTS.branding);
      window.location.reload();
    }
  };
}
