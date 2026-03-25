const fs = require('fs');
const path = require('path');

function setIfPresent(target, key, value) {
  if (value !== undefined && value !== null && value !== '') {
    target[key] = value;
  }
}

const runtimeConfig = {
  shared: {},
  advisor: {},
  investor: {}
};

setIfPresent(runtimeConfig.shared, 'backendUrl', process.env.TGK_FRONTEND_BACKEND_URL);
setIfPresent(runtimeConfig.shared, 'docusignIamBaseUrl', process.env.TGK_FRONTEND_DOCUSIGN_IAM_BASE_URL);
setIfPresent(runtimeConfig.shared, 'appSlug', process.env.TGK_FRONTEND_APP_SLUG);
setIfPresent(runtimeConfig.shared, 'appName', process.env.TGK_FRONTEND_APP_NAME);

const sharedAdvisor = {};
setIfPresent(sharedAdvisor, 'name', process.env.TGK_FRONTEND_ADVISOR_NAME);
setIfPresent(sharedAdvisor, 'title', process.env.TGK_FRONTEND_ADVISOR_TITLE);
setIfPresent(sharedAdvisor, 'email', process.env.TGK_FRONTEND_ADVISOR_EMAIL);
setIfPresent(sharedAdvisor, 'phone', process.env.TGK_FRONTEND_ADVISOR_PHONE);
setIfPresent(sharedAdvisor, 'avatar', process.env.TGK_FRONTEND_ADVISOR_AVATAR);
if (Object.keys(sharedAdvisor).length > 0) {
  runtimeConfig.shared.advisor = sharedAdvisor;
}

setIfPresent(runtimeConfig.advisor, 'portalName', process.env.TGK_FRONTEND_ADVISOR_PORTAL_NAME);
setIfPresent(runtimeConfig.investor, 'portalName', process.env.TGK_FRONTEND_INVESTOR_PORTAL_NAME);

const output = `window.TGK_RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`;
const outputPath = path.join(__dirname, '..', 'frontends', 'tgk-wealth', 'runtime-config.js');

fs.writeFileSync(outputPath, output);
console.log(`Wrote ${outputPath}`);
