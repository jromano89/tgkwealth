const { getAccessToken } = require('./docusign-auth');

const API_BASE = () => process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi';

async function docusignRequest(userId, accountId, path, options = {}) {
  const token = await getAccessToken(userId, accountId);
  const headers = { 'Authorization': `Bearer ${token}`, ...options.headers };

  const response = await fetch(`${API_BASE()}/v2.1/accounts/${accountId}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${options.errorPrefix || 'Docusign request failed'}: ${response.status} ${err}`);
  }

  return await response.json();
}

async function createEnvelope(userId, accountId, envelopeDefinition) {
  return docusignRequest(userId, accountId, '/envelopes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelopeDefinition),
    errorPrefix: 'Failed to create envelope'
  });
}

async function getEnvelope(userId, accountId, envelopeId) {
  return docusignRequest(userId, accountId, `/envelopes/${envelopeId}`, {
    errorPrefix: 'Failed to get envelope'
  });
}

async function getSigningUrl(userId, accountId, envelopeId, recipientView) {
  return docusignRequest(userId, accountId, `/envelopes/${envelopeId}/views/recipient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipientView),
    errorPrefix: 'Failed to get signing URL'
  });
}

async function getDocuments(userId, accountId, envelopeId) {
  return docusignRequest(userId, accountId, `/envelopes/${envelopeId}/documents`, {
    errorPrefix: 'Failed to get documents'
  });
}

async function getConsoleViewUrl(userId, accountId, envelopeId, returnUrl) {
  return docusignRequest(userId, accountId, `/envelopes/${envelopeId}/views/console`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl: returnUrl || 'https://docusign.com' }),
    errorPrefix: 'Failed to get console view URL'
  });
}

async function getAuditEvents(userId, accountId, envelopeId) {
  return docusignRequest(userId, accountId, `/envelopes/${envelopeId}/audit_events`, {
    errorPrefix: 'Failed to get audit events'
  });
}

async function downloadDocument(userId, accountId, envelopeId, documentId) {
  const token = await getAccessToken(userId, accountId);
  const response = await fetch(`${API_BASE()}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/${documentId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to download document: ${response.status} ${err}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/pdf',
    contentDisposition: response.headers.get('content-disposition') || `attachment; filename="document.pdf"`
  };
}

module.exports = { createEnvelope, getEnvelope, getSigningUrl, getConsoleViewUrl, getDocuments, getAuditEvents, downloadDocument };
