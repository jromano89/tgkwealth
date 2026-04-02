(function () {
  const LOCAL_BACKEND_URL = 'http://localhost:3000';
  const DEPLOYED_BACKEND_URL = 'https://tgk-dev.up.railway.app';
  const hostname = window.location.hostname || '';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const role = document.body?.dataset?.portal || document.documentElement?.dataset?.portal || 'advisor';

  const baseConfig = {
    appSlug: 'tgk-wealth',
    appName: 'TGK Wealth',
    backendUrl: isLocal ? LOCAL_BACKEND_URL : DEPLOYED_BACKEND_URL,
    docusignIamBaseUrl: 'https://api-d.docusign.com',
    advisorId: '4871abfa-8868-4501-b068-5936c6363e6b',
    workflows: {
      accountOpeningId: 'e26e565e-fb6a-433b-b004-bd2083c8963b',
      assetTransferId: 'b59acbee-8052-403a-a752-c04287ad6ee1'
    }
  };

  const roleConfig = {
    advisor: {
      portalName: 'ADVISOR PORTAL',
      labels: {
        employee: 'Advisor',
        customer: 'Investor',
        contactValue: 'AUM',
        riskLevel: 'Risk Profile',
        assignedTo: 'Wealth Advisor',
        accountTypes: {
          'type-a': 'Brokerage',
          'type-b': 'IRA',
          'type-c': 'Trust',
          'type-d': 'Trust'
        }
      }
    },
    investor: {
      portalName: 'INVESTOR PORTAL',
      labels: {
        employee: 'Advisor',
        customer: 'Investor',
        contactValue: 'Portfolio Value',
        riskLevel: 'Risk Profile',
        assignedTo: 'Advisor',
        accountTypes: {
          'type-a': 'Brokerage',
          'type-b': 'IRA',
          'type-c': 'Trust',
          'type-d': 'Trust'
        }
      }
    }
  };

  window.TGK_CONFIG = {
    ...baseConfig,
    role,
    ...(roleConfig[role] || roleConfig.advisor)
  };
})();
