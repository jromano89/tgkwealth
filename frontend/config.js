(function () {
  const APP_SLUG = 'tgk-wealth';
  const APP_NAME = 'TGK Wealth';
  const BRAND_COLOR = '#3b5bdb';
  const BACKEND_URL = 'https://backend-tgk.up.railway.app';
  const DOCUSIGN_BASE_URL = 'https://api-d.docusign.com';
  const ADVISOR_ID = '4871abfa-8868-4501-b068-5936c6363e6b';
  const DEFAULT_MODE = 'advanced';
  const DEFAULT_IAM_PRODUCTS = [
    'doc-gen',
    'id-verification',
    'monitor',
    'notary',
    'web-forms',
    'workspaces'
  ];
  const WORKFLOWS = Object.freeze({
    accountOpeningId: 'e26e565e-fb6a-433b-b004-bd2083c8963b',
    assetTransferId: 'b59acbee-8052-403a-a752-c04287ad6ee1'
  });
  const IAM_PRODUCTS = Object.freeze([
    { key: 'doc-gen', label: 'Doc Gen', icon: 'doc-gen' },
    { key: 'id-verification', label: 'ID Verification', icon: 'id-verification' },
    { key: 'monitor', label: 'Monitor', icon: 'monitor' },
    { key: 'notary', label: 'Notary', icon: 'notary' },
    { key: 'web-forms', label: 'Web Forms', icon: 'web-forms' },
    { key: 'workspaces', label: 'Workspaces', icon: 'workspaces' }
  ]);

  function resolveBackendUrl() {
    const hostname = window.location.hostname || '';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocal) {
      return `${window.location.protocol}//${hostname}:3000`;
    }

    return BACKEND_URL;
  }

  function normalizeMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'normal' ? 'normal' : DEFAULT_MODE;
  }

  function resolveMode() {
    return normalizeMode(new URL(window.location.href).searchParams.get('mode'));
  }

  function createAccess(mode) {
    const isAdvanced = mode === 'advanced';

    return {
      mode,
      isAdvanced,
      canSeeSettings() {
        return isAdvanced;
      },
      canSeeIamProducts() {
        return isAdvanced;
      }
    };
  }

  const mode = resolveMode();

  window.TGK_CONFIG = {
    appSlug: APP_SLUG,
    appName: APP_NAME,
    brandColor: BRAND_COLOR,
    backendUrl: resolveBackendUrl(),
    docusignBaseUrl: DOCUSIGN_BASE_URL,
    advisorId: ADVISOR_ID,
    defaultMode: DEFAULT_MODE,
    workflows: { ...WORKFLOWS },
    iamProducts: IAM_PRODUCTS.map((product) => ({ ...product })),
    defaultIamProducts: [...DEFAULT_IAM_PRODUCTS],
    mode
  };

  window.TGK_ACCESS = createAccess(mode);
})();
