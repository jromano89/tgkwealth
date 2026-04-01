const { createEnvelope, listEnvelopes, updateEnvelope } = require('./backend-client');
const envelopeTypeDefs = require('./envelope-type-definitions');
const { evaluateOperation, filterAttributes, getLiteralComparisonValue, normalizeSearchRequest } = require('./query-utils');
const { asObject, createServiceError, parseDataValue, pickFirstDefined, requireSupportedType } = require('./service-utils');

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function hasOwnField(input, aliases) {
  return aliases.some((alias) => Object.prototype.hasOwnProperty.call(input, alias));
}

function readOptionalTextField(input, aliases) {
  if (!hasOwnField(input, aliases)) {
    return undefined;
  }

  return normalizeOptionalText(pickFirstDefined(input, aliases)) || null;
}

function readOptionalDataField(input, aliases) {
  if (!hasOwnField(input, aliases)) {
    return undefined;
  }

  return parseDataValue(pickFirstDefined(input, aliases));
}

function buildEnvelopePayload(rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const payload = {};

  if (hasOwnField(input, ['EnvelopeId', 'envelopeId', 'Id', 'id'])) {
    payload.id = normalizeOptionalText(pickFirstDefined(input, ['EnvelopeId', 'envelopeId', 'Id', 'id'])) || undefined;
  }

  payload.customerId = readOptionalTextField(input, ['CustomerId', 'customerId']);
  payload.employeeId = readOptionalTextField(input, ['EmployeeId', 'employeeId']);
  payload.status = readOptionalTextField(input, ['Status', 'status']);
  payload.name = readOptionalTextField(input, ['Name', 'name']);
  payload.createdAt = readOptionalTextField(input, ['CreatedAt', 'createdAt']);
  payload.data = readOptionalDataField(input, ['Data', 'data', 'Metadata', 'metadata', 'DataJson', 'dataJson']);

  return payload;
}

function mapEnvelopeToDataRecord(envelope) {
  return {
    EnvelopeId: envelope.id,
    Name: envelope.name || '',
    Status: envelope.status || '',
    CustomerId: envelope.customer_id || '',
    EmployeeId: envelope.employee_id || '',
    DataJson: JSON.stringify(asObject(envelope.data)),
    CreatedAt: envelope.created_at || '',
    UpdatedAt: envelope.updated_at || ''
  };
}

function buildEnvelopeSearchFilters(query) {
  const operation = query?.queryFilter?.operation;
  const filters = {
    id: getLiteralComparisonValue(operation, 'EnvelopeId') || getLiteralComparisonValue(operation, 'Id'),
    customerId: getLiteralComparisonValue(operation, 'CustomerId'),
    employeeId: getLiteralComparisonValue(operation, 'EmployeeId'),
    status: getLiteralComparisonValue(operation, 'Status')
  };

  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function normalizeEnvelopeWriteError(error) {
  if (error?.statusCode !== 400) {
    return error;
  }

  if (error.message === 'customerId must belong to the current app') {
    return createServiceError(
      400,
      'BAD_REQUEST',
      'Envelope CustomerId must be the TGK customer Id for this app.'
    );
  }

  if (error.message === 'employeeId must belong to the current app') {
    return createServiceError(
      400,
      'BAD_REQUEST',
      'Envelope EmployeeId must be the TGK employee Id for this app.'
    );
  }

  return error;
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
  try {
    const payload = buildEnvelopePayload(data);
    if (requestedId) {
      payload.id = requestedId;
    }
    if (!payload.id) {
      throw createServiceError(400, 'BAD_REQUEST', 'EnvelopeId is required when creating an envelope record.');
    }
    const created = await createEnvelope(payload);
    return { recordId: created.id };
  } catch (error) {
    throw normalizeEnvelopeWriteError(error);
  }
}

async function patchRecord(body) {
  const data = body?.data;
  const typeName = body?.typeName;
  const recordId = body?.recordId;

  if (!data || !typeName || !recordId) {
    throw createServiceError(400, 'BAD_REQUEST', 'data, typeName or recordId missing in request');
  }

  requireSupportedType(typeName, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
  try {
    await updateEnvelope(recordId, buildEnvelopePayload(data));
    return { success: true };
  } catch (error) {
    throw normalizeEnvelopeWriteError(error);
  }
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
    .map((record) => {
      const filtered = filterAttributes(record, query.attributesToSelect);
      if (!Object.prototype.hasOwnProperty.call(filtered, 'EnvelopeId') && record.EnvelopeId) {
        filtered.EnvelopeId = record.EnvelopeId;
      }
      return filtered;
    });

  return { records: results };
}

module.exports = {
  createRecord,
  patchRecord,
  searchRecords
};
