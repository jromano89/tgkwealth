const { createEnvelope, listEnvelopes, updateEnvelope } = require('./resource-client');
const { createDataIoService } = require('./dataio-service');
const { TYPE_ALIASES, TYPE_NAME } = require('./envelope-type-definitions');
const { getLiteralComparisonValue } = require('./query-utils');
const {
  asObject,
  createServiceError,
  hasOwnField,
  normalizeOptionalText,
  pickFirstDefined,
  readOptionalDataField,
  readRecordValue,
  readOptionalTextField,
  serializeData
} = require('./service-utils');

function buildEnvelopePayload(rawInput, { recordId } = {}) {
  const input = asObject(rawInput);
  const payload = {};

  if (recordId || hasOwnField(input, ['EnvelopeId', 'envelopeId', 'Id', 'id'])) {
    payload.id = normalizeOptionalText(recordId || pickFirstDefined(input, ['EnvelopeId', 'envelopeId', 'Id', 'id'])) || undefined;
  }

  if (!payload.id) {
    throw createServiceError(400, 'BAD_REQUEST', 'EnvelopeId is required when creating or updating an envelope record.');
  }

  payload.customerId = readOptionalTextField(input, ['CustomerId', 'customerId']);
  payload.employeeId = readOptionalTextField(input, ['EmployeeId', 'employeeId']);
  payload.status = readOptionalTextField(input, ['Status', 'status']);
  payload.name = readOptionalTextField(input, ['Name', 'name']);
  payload.data = readOptionalDataField(input, ['Data', 'data', 'Metadata', 'metadata', 'DataJson', 'dataJson']);

  return payload;
}

function mapEnvelopeToDataRecord(envelope) {
  return {
    EnvelopeId: envelope.id,
    Name: envelope.name || '',
    Status: envelope.status || '',
    CustomerId: readRecordValue(envelope, 'customerId', 'customer_id') || '',
    EmployeeId: readRecordValue(envelope, 'employeeId', 'employee_id') || '',
    DataJson: serializeData(asObject(envelope.data)),
    CreatedAt: readRecordValue(envelope, 'createdAt', 'created_at') || '',
    UpdatedAt: readRecordValue(envelope, 'updatedAt', 'updated_at') || ''
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

module.exports = createDataIoService({
  typeName: TYPE_NAME,
  typeAliases: TYPE_ALIASES,
  createBackendRecord: createEnvelope,
  updateBackendRecord: updateEnvelope,
  listRecords: (query) => listEnvelopes(query),
  buildPayload: buildEnvelopePayload,
  buildSearchFilters: buildEnvelopeSearchFilters,
  idField: 'EnvelopeId',
  mapRecordToDataRecord: mapEnvelopeToDataRecord,
  normalizeWriteError: normalizeEnvelopeWriteError
});
