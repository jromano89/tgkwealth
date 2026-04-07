const { createApp, isDocusignConfigured } = require('./app');
const { getDbPath } = require('./database');

const PORT = process.env.PORT || 3000;
const LOCAL_URL = `http://localhost:${PORT}`;
const app = createApp();

app.listen(PORT, () => {
  console.log(`TGK Demo Backend running on ${LOCAL_URL}`);
  console.log(`Database path: ${getDbPath()}`);
  console.log(`Docusign configured: ${isDocusignConfigured()}`);
});
