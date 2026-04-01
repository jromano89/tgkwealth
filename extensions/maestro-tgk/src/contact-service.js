const { createCustomer, getCustomer, listCustomers, updateCustomer } = require('./backend-client');
const { TYPE_ALIASES, TYPE_NAME } = require('./contact-type-definitions');
const { evaluateOperation, filterAttributes, normalizeSearchRequest } = require('./query-utils');
const { asObject, createServiceError, parseDataValue, pickFirstDefined, requireSupportedType } = require('./service-utils');

const STRUCTURED_DATA_KEYS = ['Data', 'data', 'CustomerData', 'customerData', 'Metadata', 'metadata', 'DataJson', 'dataJson'];
const CONSUMED_INPUT_KEYS = new Set([
  'Id', 'id',
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

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizePhone(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return value.number || value.normalizedNumber || value.phone || null;
  }

  return String(value);
}

function collectExtensionFields(input) {
  const fields = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (CONSUMED_INPUT_KEYS.has(key) || value === undefined) {
      continue;
    }
    fields[key] = value;
  }
  return fields;
}

function buildDisplayName(input, existingCustomer) {
  const explicitDisplayName = normalizeOptionalText(pickFirstDefined(input, ['DisplayName', 'displayName']));
  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  const firstName = normalizeOptionalText(pickFirstDefined(input, ['FirstName', 'firstName']));
  const lastName = normalizeOptionalText(pickFirstDefined(input, ['LastName', 'lastName']));
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();

  return combined
    || normalizeOptionalText(existingCustomer?.display_name)
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

  const extensionFields = collectExtensionFields(input);
  if (Object.keys(extensionFields).length > 0) {
    nextData.extensionFields = {
      ...asObject(nextData.extensionFields),
      ...extensionFields
    };
  }

  return nextData;
}

function buildCustomerPayload(rawInput, existingCustomer, requestedId) {
  const input = asObject(rawInput);
  const payload = {
    data: buildCustomerData(input, existingCustomer?.data)
  };

  const displayName = buildDisplayName({ ...payload.data, ...input }, existingCustomer);
  if (displayName !== undefined) {
    payload.displayName = displayName;
  }

  const id = requestedId || pickFirstDefined(input, ['Id', 'id']);
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
  const fullName = customer?.display_name || [data.firstName, data.lastName].filter(Boolean).join(' ').trim();

  return {
    ...extensionFields,
    Id: customer.id,
    EmployeeId: customer.employee_id || '',
    DisplayName: customer.display_name || '',
    FirstName: data.firstName || '',
    LastName: data.lastName || '',
    Email: customer.email || '',
    Phone: customer.phone || '',
    Organization: customer.organization || '',
    Status: customer.status || '',
    DataJson: JSON.stringify(data || {}),
    CreatedAt: customer.created_at || '',
    UpdatedAt: customer.updated_at || ''
  };
}

async function createRecord(body) {
  const data = body?.data;
  const requestedId = body?.recordId;
  const typeName = body?.typeName;

  if (!data || !typeName) {
    throw createServiceError(400, 'BAD_REQUEST', 'data or typeName missing in request');
  }

  requireSupportedType(typeName, TYPE_ALIASES, TYPE_NAME);
  const created = await createCustomer(buildCustomerPayload(data, null, requestedId));
  return { recordId: created.id };
}

async function patchRecord(body) {
  const data = body?.data;
  const typeName = body?.typeName;
  const recordId = body?.recordId;

  if (!data || !typeName || !recordId) {
    throw createServiceError(400, 'BAD_REQUEST', 'data, typeName or recordId missing in request');
  }

  requireSupportedType(typeName, TYPE_ALIASES, TYPE_NAME);

  let existing;
  try {
    existing = await getCustomer(recordId);
  } catch (error) {
    throw createServiceError(error.statusCode === 404 ? 404 : 500, error.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', error.message);
  }

  await updateCustomer(recordId, buildCustomerPayload(data, existing));
  return { success: true };
}

async function searchRecords(body) {
  const { query, pagination } = normalizeSearchRequest(body);

  if (!query) {
    throw createServiceError(400, 'BAD_REQUEST', 'Query missing in request');
  }

  requireSupportedType(query.from || TYPE_NAME, TYPE_ALIASES, TYPE_NAME);
  const customers = await listCustomers();
  const results = customers
    .map(mapCustomerToDataRecord)
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
