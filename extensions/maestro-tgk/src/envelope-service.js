const { createEnvelope, listEnvelopes, listUsers, updateEnvelope } = require('./backend-client');
const envelopeTypeDefs = require('./envelope-type-definitions');
const { evaluateOperation, filterAttributes, getLiteralComparisonValue, normalizeSearchRequest } = require('./query-utils');
const { createServiceError, pickFirstDefined, requireSupportedType } = require('./service-utils');

function buildEnvelopePayload(rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};

  return {
    docusignEnvelopeId: pickFirstDefined(input, ['DocusignEnvelopeId', 'docusignEnvelopeId', 'EnvelopeId', 'envelopeId']) || null,
    contactId: pickFirstDefined(input, ['ContactId', 'contactId']) || null,
    userId: pickFirstDefined(input, ['UserId', 'userId', 'OwnerUserId', 'ownerUserId']) || null,
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
    UserId: envelope.user_id || '',
    CreatedAt: envelope.created_at || ''
  };
}

async function getDefaultUserId() {
  const users = await listUsers();
  if (!Array.isArray(users) || users.length === 0) {
    return null;
  }

  return users
    .slice()
    .sort((left, right) => String(left?.created_at || '').localeCompare(String(right?.created_at || '')))[0]?.id || null;
}

function buildEnvelopeSearchFilters(query) {
  const operation = query?.queryFilter?.operation;
  const filters = {
    id: getLiteralComparisonValue(operation, 'Id'),
    docusignEnvelopeId: getLiteralComparisonValue(operation, 'DocusignEnvelopeId'),
    contactId: getLiteralComparisonValue(operation, 'ContactId'),
    userId: getLiteralComparisonValue(operation, 'UserId'),
    status: getLiteralComparisonValue(operation, 'Status')
  };

  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

async function buildEnvelopeCreatePayload(rawInput, requestedId) {
  const payload = buildEnvelopePayload(rawInput);
  if (requestedId) {
    payload.id = requestedId;
  }

  if (!payload.contactId && !payload.userId) {
    payload.userId = await getDefaultUserId();
  }

  if (!payload.contactId && !payload.userId) {
    throw createServiceError(400, 'BAD_REQUEST', 'Envelope create requires ContactId or UserId, and no default app user is available');
  }

  return payload;
}

async function listEnvelopesForQuery(query) {
  return listEnvelopes(buildEnvelopeSearchFilters(query));
}

async function createRecord(body) {
  const data = body?.data;
  const requestedId = body?.recordId;
  const typeName = body?.typeName;

  if (!data || !typeName) {
    throw createServiceError(400, 'BAD_REQUEST', 'data or typeName missing in request');
  }

  requireSupportedType(typeName, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
  const payload = await buildEnvelopeCreatePayload(data, requestedId);
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
