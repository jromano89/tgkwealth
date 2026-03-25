const { getAccessToken } = require('./docusign-auth');

const API_BASE = () => process.env.DOCUSIGN_API_BASE || 'https://demo.docusign.net/restapi';

/**
 * Create and send an envelope.
 * @param {string} userId - Docusign user ID
 * @param {string} accountId - Docusign account ID
 * @param {object} envelopeDefinition - Docusign envelope definition
 */
async function createEnvelope(userId, accountId, envelopeDefinition) {
  const token = await getAccessToken(userId, accountId);

  const response = await fetch(
    `${API_BASE()}/v2.1/accounts/${accountId}/envelopes`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(envelopeDefinition)
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create envelope: ${response.status} ${err}`);
  }

  return await response.json();
}

/**
 * Get envelope status/details.
 */
async function getEnvelope(userId, accountId, envelopeId) {
  const token = await getAccessToken(userId, accountId);

  const response = await fetch(
    `${API_BASE()}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to get envelope: ${response.status} ${err}`);
  }

  return await response.json();
}

/**
 * Generate embedded signing URL (recipient view).
 */
async function getSigningUrl(userId, accountId, envelopeId, recipientView) {
  const token = await getAccessToken(userId, accountId);

  const response = await fetch(
    `${API_BASE()}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/views/recipient`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(recipientView)
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to get signing URL: ${response.status} ${err}`);
  }

  return await response.json();
}

/**
 * Get envelope documents.
 */
async function getDocuments(userId, accountId, envelopeId) {
  const token = await getAccessToken(userId, accountId);

  const response = await fetch(
    `${API_BASE()}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to get documents: ${response.status} ${err}`);
  }

  return await response.json();
}

module.exports = { createEnvelope, getEnvelope, getSigningUrl, getDocuments };
