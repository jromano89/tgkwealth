const { getDb } = require('../db/database');
const { getConnectionForApp, getRequiredApp, requireSelectedDocusignAccount } = require('../utils');

function requireDocusignConnection(req, res, next) {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const connection = requireSelectedDocusignAccount(getConnectionForApp(db, app.id));

    req.demoApp = app;
    req.docusign = {
      appId: app.id,
      appSlug: app.slug,
      userId: connection.docusign_user_id,
      accountId: connection.docusign_account_id,
      accountName: connection.account_name,
      email: connection.email
    };

    next();
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { requireDocusignConnection };
