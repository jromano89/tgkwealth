(function () {
  const runtime = window.TGK_RUNTIME_CONFIG || {};
  const shared = runtime.shared || {};
  const portal = runtime.advisor || {};
  const defaults = {
    backendUrl: 'http://localhost:3000',
    appSlug: 'tgk-wealth',
    portalName: 'ADVISOR PORTAL',
    appName: 'TGK Wealth',
    advisor: { name: 'Gordon Gecko', title: 'Senior Advisor', avatar: 'GG' },
    labels: {
      contactValue: 'AUM',
      riskLevel: 'Risk Profile',
      accountTypes: { 'type-a': 'Brokerage', 'type-b': 'IRA', 'type-c': 'Trust', 'type-d': 'Trust' },
      assignedTo: 'Wealth Advisor'
    }
  };

  window.TGK_CONFIG = {
    ...defaults,
    ...shared,
    ...portal,
    advisor: {
      ...defaults.advisor,
      ...(shared.advisor || {}),
      ...(portal.advisor || {})
    },
    labels: {
      ...defaults.labels,
      ...(shared.labels || {}),
      ...(portal.labels || {}),
      accountTypes: {
        ...defaults.labels.accountTypes,
        ...((shared.labels && shared.labels.accountTypes) || {}),
        ...((portal.labels && portal.labels.accountTypes) || {})
      }
    }
  };
})();
