const { createEmployee, getEmployee, getEmployeeById, listEmployees, updateEmployee } = require('./resource-client');
const { createDataIoService } = require('./dataio-service');
const { TYPE_ALIASES, TYPE_NAME } = require('./employee-type-definitions');
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

const STRUCTURED_DATA_KEYS = ['Data', 'data', 'EmployeeData', 'employeeData', 'Metadata', 'metadata', 'DataJson', 'dataJson'];
const CONSUMED_INPUT_KEYS = new Set([
  'Id', 'id',
  'AppSlug', 'appSlug',
  'DisplayName', 'displayName',
  'FirstName', 'firstName',
  'LastName', 'lastName',
  'Email', 'email',
  'Phone', 'phone',
  'Title', 'title',
  'Data', 'data', 'EmployeeData', 'employeeData', 'Metadata', 'metadata', 'DataJson', 'dataJson'
]);

function buildDisplayName(input, existingEmployee) {
  const explicitDisplayName = normalizeOptionalText(pickFirstDefined(input, ['DisplayName', 'displayName']));
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const firstName = normalizeOptionalText(pickFirstDefined(input, ['FirstName', 'firstName']));
  const lastName = normalizeOptionalText(pickFirstDefined(input, ['LastName', 'lastName']));
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();

  return combined
    || normalizeOptionalText(readRecordValue(existingEmployee, 'displayName', 'display_name'))
    || normalizeOptionalText(pickFirstDefined(input, ['Email', 'email']))
    || normalizeOptionalText(pickFirstDefined(input, ['Title', 'title']))
    || undefined;
}

function buildEmployeeData(input, existingData) {
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

function buildEmployeePayload(rawInput, { existingRecord, recordId } = {}) {
  const input = asObject(rawInput);
  const payload = {
    data: buildEmployeeData(input, existingRecord?.data)
  };

  const displayName = buildDisplayName({ ...payload.data, ...input }, existingRecord);
  if (displayName !== undefined) {
    payload.displayName = displayName;
  }

  const id = recordId || pickFirstDefined(input, ['Id', 'id']);
  const email = pickFirstDefined(input, ['Email', 'email']);
  const phone = pickFirstDefined(input, ['Phone', 'phone']);
  const title = pickFirstDefined(input, ['Title', 'title']);

  if (id !== undefined) {
    payload.id = id;
  }
  if (email !== undefined) {
    payload.email = normalizeOptionalText(email) || null;
  }
  if (phone !== undefined) {
    payload.phone = normalizePhone(phone);
  }
  if (title !== undefined) {
    payload.title = normalizeOptionalText(title) || null;
  }

  return payload;
}

function mapEmployeeToDataRecord(employee) {
  const data = asObject(employee?.data);
  const extensionFields = asObject(data.extensionFields);

  return {
    ...extensionFields,
    Id: employee.id,
    AppSlug: readRecordValue(employee, 'appSlug', 'app_slug') || '',
    DisplayName: readRecordValue(employee, 'displayName', 'display_name') || '',
    FirstName: data.firstName || '',
    LastName: data.lastName || '',
    Email: employee.email || '',
    Phone: employee.phone || '',
    Title: employee.title || '',
    DataJson: serializeData(data),
    CreatedAt: readRecordValue(employee, 'createdAt', 'created_at') || '',
    UpdatedAt: readRecordValue(employee, 'updatedAt', 'updated_at') || ''
  };
}

module.exports = createDataIoService({
  typeName: TYPE_NAME,
  typeAliases: TYPE_ALIASES,
  createBackendRecord: (appSlug, payload) => createEmployee(appSlug, payload),
  updateBackendRecord: (appSlug, recordId, payload) => updateEmployee(appSlug, recordId, payload),
  listRecords: (appSlug, query) => listEmployees(appSlug, query),
  loadExistingRecord: (appSlug, recordId) => getEmployee(appSlug, recordId),
  loadExistingRecordById: (recordId) => getEmployeeById(recordId),
  buildPayload: buildEmployeePayload,
  mapRecordToDataRecord: mapEmployeeToDataRecord
});
