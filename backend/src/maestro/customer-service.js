const { createCustomer, getCustomer, getCustomerById, listCustomers, updateCustomer } = require('./resource-client');
const { createDataIoService } = require('./dataio-service');
const { TYPE_ALIASES, TYPE_NAME } = require('./customer-type-definitions');
const {
  asObject,
  collectExtensionFields,
  normalizeOptionalText,
  normalizePhone,
  parseDataValue,
  pickFirstDefined,
  readRecordValue,
  serializeData
} = require('./service-utils');

const STRUCTURED_DATA_KEYS = ['Data', 'data', 'CustomerData', 'customerData', 'Metadata', 'metadata', 'DataJson', 'dataJson'];
const CONSUMED_INPUT_KEYS = new Set([
  'Id', 'id',
  'AppSlug', 'appSlug',
  'EmployeeId', 'employeeId',
  'DisplayName', 'displayName',
  'FirstName', 'firstName',
  'LastName', 'lastName',
  'Email', 'email',
  'Phone', 'phone',
  'Organization', 'organization', 'Company', 'company',
  'Status', 'status',
  'Data', 'data', 'CustomerData', 'customerData', 'Metadata', 'metadata', 'DataJson', 'dataJson'
]);

function buildDisplayName(input, existingCustomer) {
  const explicitDisplayName = normalizeOptionalText(pickFirstDefined(input, ['DisplayName', 'displayName']));
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const firstName = normalizeOptionalText(pickFirstDefined(input, ['FirstName', 'firstName']));
  const lastName = normalizeOptionalText(pickFirstDefined(input, ['LastName', 'lastName']));
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();

  return combined
    || normalizeOptionalText(readRecordValue(existingCustomer, 'displayName', 'display_name'))
    || normalizeOptionalText(pickFirstDefined(input, ['Email', 'email']))
    || normalizeOptionalText(pickFirstDefined(input, ['Organization', 'organization', 'Company', 'company']))
    || undefined;
}

function buildCustomerData(input, existingData) {
  const structuredData = parseDataValue(pickFirstDefined(input, STRUCTURED_DATA_KEYS));
  const mergedInput = {
    ...structuredData,
    ...input
  };
  const nextData = {
    ...asObject(existingData),
    ...structuredData
  };

  const firstName = normalizeOptionalText(pickFirstDefined(mergedInput, ['FirstName', 'firstName']));
  const lastName = normalizeOptionalText(pickFirstDefined(mergedInput, ['LastName', 'lastName']));

  if (firstName !== undefined) {
    nextData.firstName = firstName;
  }
  if (lastName !== undefined) {
    nextData.lastName = lastName;
  }

  const extensionFields = collectExtensionFields(input, CONSUMED_INPUT_KEYS);
  if (Object.keys(extensionFields).length > 0) {
    nextData.extensionFields = {
      ...asObject(nextData.extensionFields),
      ...extensionFields
    };
  }

  return nextData;
}

function buildCustomerPayload(rawInput, { existingRecord, recordId } = {}) {
  const input = asObject(rawInput);
  const payload = {
    data: buildCustomerData(input, existingRecord?.data)
  };

  const displayName = buildDisplayName({ ...payload.data, ...input }, existingRecord);
  if (displayName !== undefined) {
    payload.displayName = displayName;
  }

  const id = recordId || pickFirstDefined(input, ['Id', 'id']);
  const employeeId = pickFirstDefined(input, ['EmployeeId', 'employeeId']);
  const email = pickFirstDefined(input, ['Email', 'email']);
  const phone = pickFirstDefined(input, ['Phone', 'phone']);
  const organization = pickFirstDefined(input, ['Organization', 'organization', 'Company', 'company']);
  const status = pickFirstDefined(input, ['Status', 'status']);

  if (id !== undefined) {
    payload.id = id;
  }
  if (employeeId !== undefined) {
    payload.employeeId = employeeId || null;
  }
  if (email !== undefined) {
    payload.email = normalizeOptionalText(email) || null;
  }
  if (phone !== undefined) {
    payload.phone = normalizePhone(phone);
  }
  if (organization !== undefined) {
    payload.organization = normalizeOptionalText(organization) || null;
  }
  if (status !== undefined) {
    payload.status = normalizeOptionalText(status) || null;
  }

  return payload;
}

function mapCustomerToDataRecord(customer) {
  const data = asObject(customer?.data);
  const extensionFields = asObject(data.extensionFields);

  return {
    ...extensionFields,
    Id: customer.id,
    AppSlug: readRecordValue(customer, 'appSlug', 'app_slug') || '',
    EmployeeId: readRecordValue(customer, 'employeeId', 'employee_id') || '',
    DisplayName: readRecordValue(customer, 'displayName', 'display_name') || '',
    FirstName: data.firstName || '',
    LastName: data.lastName || '',
    Email: customer.email || '',
    Phone: customer.phone || '',
    Organization: customer.organization || '',
    Status: customer.status || '',
    DataJson: serializeData(data),
    CreatedAt: readRecordValue(customer, 'createdAt', 'created_at') || '',
    UpdatedAt: readRecordValue(customer, 'updatedAt', 'updated_at') || ''
  };
}

module.exports = createDataIoService({
  typeName: TYPE_NAME,
  typeAliases: TYPE_ALIASES,
  createBackendRecord: (appSlug, payload) => createCustomer(appSlug, payload),
  updateBackendRecord: (appSlug, recordId, payload) => updateCustomer(appSlug, recordId, payload),
  listRecords: (appSlug) => listCustomers(appSlug),
  loadExistingRecord: (appSlug, recordId) => getCustomer(appSlug, recordId),
  loadExistingRecordById: (recordId) => getCustomerById(recordId),
  buildPayload: buildCustomerPayload,
  mapRecordToDataRecord: mapCustomerToDataRecord
});
