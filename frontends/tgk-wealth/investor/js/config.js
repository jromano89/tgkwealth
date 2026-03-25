(function () {
  const runtime = window.TGK_RUNTIME_CONFIG || {};
  const shared = runtime.shared || {};
  const portal = runtime.investor || {};
  const defaults = {
    backendUrl: 'http://localhost:3000',
    appSlug: 'tgk-wealth',
    portalName: 'INVESTOR PORTAL',
    appName: 'TGK Wealth',
    advisor: {
      name: 'Gordon Gecko',
      title: 'Senior Advisor',
      email: 'g.gecko@tgkwealth.com',
      phone: '(212) 555-0100',
      avatar: 'GG'
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
    }
  };
})();
