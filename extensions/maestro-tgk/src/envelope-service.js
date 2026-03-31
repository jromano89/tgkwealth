const { createEnvelope, getContact, listContacts, updateEnvelope } = require('./backend-client');
const envelopeTypeDefs = require('./envelope-type-definitions');
const { evaluateOperation, filterAttributes, getLiteralComparisonValue, normalizeSearchRequest } = require('./query-utils');
const { createServiceError, pickFirstDefined, requireSupportedType } = require('./service-utils');

function buildEnvelopePayload(rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};

  return {
    docusignEnvelopeId: pickFirstDefined(input, ['DocusignEnvelopeId', 'docusignEnvelopeId', 'EnvelopeId', 'envelopeId']) || null,
    contactId: pickFirstDefined(input, ['ContactId', 'contactId']) || null,
    status: pickFirstDefined(input, ['Status', 'status']) || 'sent',
    documentName: pickFirstDefined(input, ['DocumentName', 'documentName']) || null
  };
}

function mapEnvelopeToDataRecord(envelope) {
  return {
    Id: envelope.id,
    DocusignEnvelopeId: envelope.docusign_envelope_id || '',
    DocumentName: envelope.document_name || '',
    Status: envelope.status || '',
    ContactId: envelope.contact_id || '',
    CreatedAt: envelope.created_at || ''
  };
}

async function listEnvelopesFromContacts() {
  const contacts = await listContacts();
  const contactDetails = await Promise.all(contacts.map(async (contact) => {
    return getContact(contact.id);
  }));

  return contactDetails.flatMap((contact) => Array.isArray(contact?.envelopes) ? contact.envelopes : []);
}

async function listEnvelopesForQuery(query) {
  const contactId = getLiteralComparisonValue(query?.queryFilter?.operation, 'ContactId');
  if (!contactId) {
    return listEnvelopesFromContacts();
  }

  try {
    const contact = await getContact(contactId);
    return Array.isArray(contact?.envelopes) ? contact.envelopes : [];
  } catch (error) {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  }
}

async function createRecord(body) {
  const data = body?.data;
  const requestedId = body?.recordId;
  const typeName = body?.typeName;

  if (!data || !typeName) {
    throw createServiceError(400, 'BAD_REQUEST', 'data or typeName missing in request');
  }

  requireSupportedType(typeName, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
  const payload = buildEnvelopePayload(data);
  if (requestedId) {
    payload.id = requestedId;
  }
  const created = await createEnvelope(payload);
  return { recordId: created.id };
}

async function patchRecord(body) {
  const data = body?.data;
  const typeName = body?.typeName;
  const recordId = body?.recordId;

  if (!data || !typeName || !recordId) {
    throw createServiceError(400, 'BAD_REQUEST', 'data, typeName or recordId missing in request');
  }

  requireSupportedType(typeName, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
  const payload = buildEnvelopePayload(data);
  await updateEnvelope(recordId, payload);
  return { success: true };
}

async function searchRecords(body) {
  const { query, pagination } = normalizeSearchRequest(body);

  if (!query) {
    throw createServiceError(400, 'BAD_REQUEST', 'Query missing in request');
  }

  requireSupportedType(query.from || envelopeTypeDefs.TYPE_NAME, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
  const envelopes = await listEnvelopesForQuery(query);
  const results = envelopes
    .map(mapEnvelopeToDataRecord)
    .filter((record) => evaluateOperation(record, query.queryFilter?.operation))
    .slice(pagination.skip, pagination.skip + pagination.limit)
    .map((record) => filterAttributes(record, query.attributesToSelect));

  return { records: results };
}

module.exports = {
  createRecord,
  patchRecord,
  searchRecords
};
