/**
 * Demo Settings Component
 * Shared settings panel for branding and demo configuration.
 * Persists to localStorage so settings survive reloads and work across portals.
 *
 * Color theming uses CSS custom properties so changes apply instantly.
 * Tailwind config references these variables, so all bg-brand, text-brand etc. just work.
 */

// ── Color utilities ──
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function deriveBrandLight(hex) {
  const [h, s, l] = hexToHSL(hex);
  return hslToHex(h, Math.min(s + 10, 100), Math.min(l + 15, 85));
}

function deriveSidebarColor(hex) {
  const [h, s] = hexToHSL(hex);
  return hslToHex(h, Math.max(s * 0.4, 15), 12);
}

function deriveSidebarLightColor(hex) {
  const [h, s] = hexToHSL(hex);
  return hslToHex(h, Math.max(s * 0.35, 12), 20);
}

// ── Load saved settings before anything else ──
(function () {
  const STORAGE_KEY = 'tgk_demo_settings';
  const DEFAULTS = {
    branding: {
      appName: 'TGK Wealth',
      brandColor: '#3b5bdb'
    },
    config: {
      idVerification: false
    }
  };

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const savedBranding = saved.branding || {};
  window.TGK_DEMO = {
    branding: {
      appName: savedBranding.appName || DEFAULTS.branding.appName,
      brandColor: savedBranding.brandColor || DEFAULTS.branding.brandColor
    },
    config: { ...DEFAULTS.config, ...saved.config },
    DEFAULTS
  };

  // Apply CSS custom properties immediately (before Tailwind processes)
  const brand = window.TGK_DEMO.branding.brandColor;
  const root = document.documentElement.style;
  root.setProperty('--color-brand', brand);
  root.setProperty('--color-brand-light', deriveBrandLight(brand));
  root.setProperty('--color-navy', deriveSidebarColor(brand));
  root.setProperty('--color-navy-light', deriveSidebarLightColor(brand));
})();

// ── Alpine.js component ──
function demoSettingsPanel() {
  const STORAGE_KEY = 'tgk_demo_settings';

  return {
    appName: window.TGK_DEMO.branding.appName,
    brandColor: window.TGK_DEMO.branding.brandColor,
    idVerification: window.TGK_DEMO.config.idVerification,
    dirty: false,

    applyColor(hex) {
      this.brandColor = hex;
      this.dirty = true;
      const root = document.documentElement.style;
      root.setProperty('--color-brand', hex);
      root.setProperty('--color-brand-light', deriveBrandLight(hex));
      root.setProperty('--color-navy', deriveSidebarColor(hex));
      root.setProperty('--color-navy-light', deriveSidebarLightColor(hex));
    },

    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        branding: {
          appName: this.appName.trim() || 'TGK Wealth',
          brandColor: this.brandColor
        },
        config: { idVerification: this.idVerification }
      }));
      window.location.reload();
    },

    saveConfig() {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      existing.config = { ...existing.config, idVerification: this.idVerification };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    },

    resetDefaults() {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  };
}
