const { createContact, getContact, listContacts, updateContact } = require('./backend-client');
const { TYPE_ALIASES, TYPE_NAME } = require('./contact-type-definitions');
const { createServiceError, pickFirstDefined, requireSupportedType } = require('./service-utils');

const COLOR_PALETTE = ['#3b5bdb', '#16a34a', '#0ea5e9', '#ec4899', '#f59f00', '#dc2626', '#7c3aed'];
const RISK_PROFILES = ['Balanced', 'Moderate Growth', 'Growth', 'Conservative Income'];
const DEFAULT_ROLE = 'Prospective Client';
const DEFAULT_NEW_CONTACT_TASKS = [
  { title: 'Begin Asset Transfer', description: 'Move assets into the new brokerage relationship.' }
];

function normalizeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizePhone(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    return value.number || value.normalizedNumber || value.phone || null;
  }
  return null;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value || '')) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

function deterministicPick(items, seed) {
  return items[hashString(seed) % items.length];
}

function buildDisplayName(firstName, lastName, fullName, existingDisplayName) {
  if (fullName) {
    return String(fullName).trim();
  }
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  return combined || existingDisplayName || 'Pending Contact';
}

function normalizeStatus(value, fallback = 'pending') {
  return String(value || fallback).trim().toLowerCase() || fallback;
}

function collectExtensionFields(input, consumedKeys) {
  const extensionFields = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (consumedKeys.has(key) || value === undefined) {
      continue;
    }
    extensionFields[key] = value;
  }
  return extensionFields;
}

function buildDefaultAccount(refSeed) {
  return {
    kind: 'account',
    status: 'pending',
    name: 'Individual Brokerage',
    accountType: 'Taxable',
    typeCode: 'type-a',
    value: 0,
    ytdReturn: 0,
    allocEquity: 0,
    allocFixed: 0,
    allocAlt: 0,
    allocCash: 100
  };
}

function mapContactToDataRecord(contact) {
  const data = contact?.data || {};
  return {
    Id: contact.id,
    Ref: contact.ref || '',
    DisplayName: contact.display_name || '',
    FullName: contact.display_name || '',
    FirstName: data.firstName || '',
    LastName: data.lastName || '',
    Email: contact.email || '',
    Phone: contact.phone || '',
    Organization: contact.organization || '',
    Status: contact.status || '',
    Source: contact.source || '',
    DataJson: JSON.stringify(data || {}),
    Aum: normalizeNumber(data.value, 0),
    NetWorth: normalizeNumber(data.netWorth, 0),
    RiskProfile: data.riskProfile || '',
    Role: data.role || '',
    AssignedTo: data.assignedTo || '',
    LifecycleStage: data.lifecycleStage || '',
    CreatedAt: contact.created_at || '',
    UpdatedAt: contact.updated_at || '',
    ...((data.extensionFields && typeof data.extensionFields === 'object') ? data.extensionFields : {})
  };
}

function filterAttributes(record, attributesToSelect) {
  if (!Array.isArray(attributesToSelect) || attributesToSelect.length === 0) {
    return record;
  }

  const filtered = {};
  for (const attribute of attributesToSelect) {
    if (Object.prototype.hasOwnProperty.call(record, attribute)) {
      filtered[attribute] = record[attribute];
    }
  }

  if (!Object.prototype.hasOwnProperty.call(filtered, 'Id') && record.Id) {
    filtered.Id = record.Id;
  }

  return filtered;
}

function resolveOperand(record, operand) {
  if (!operand) {
    return undefined;
  }
  if (operand.isLiteral) {
    return operand.name;
  }
  return record[operand.name];
}

function compareValues(operator, left, right) {
  const normalizedOperator = String(operator || '').toUpperCase();
  const leftValue = left == null ? '' : left;
  const rightValue = right == null ? '' : right;
  const leftString = String(leftValue).toLowerCase();
  const rightString = String(rightValue).toLowerCase();
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const useNumericComparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftString !== '' && rightString !== '';

  switch (normalizedOperator) {
    case 'EQUALS':
      return useNumericComparison ? leftNumber === rightNumber : leftString === rightString;
    case 'NOT_EQUALS':
      return useNumericComparison ? leftNumber !== rightNumber : leftString !== rightString;
    case 'CONTAINS':
      return leftString.includes(rightString);
    case 'DOES_NOT_CONTAIN':
      return !leftString.includes(rightString);
    case 'STARTS_WITH':
      return leftString.startsWith(rightString);
    case 'DOES_NOT_START_WITH':
      return !leftString.startsWith(rightString);
    case 'ENDS_WITH':
      return leftString.endsWith(rightString);
    case 'DOES_NOT_END_WITH':
      return !leftString.endsWith(rightString);
    case 'GREATER_THAN':
      return useNumericComparison ? leftNumber > rightNumber : leftString > rightString;
    case 'GREATER_THAN_OR_EQUALS_TO':
      return useNumericComparison ? leftNumber >= rightNumber : leftString >= rightString;
    case 'LESS_THAN':
      return useNumericComparison ? leftNumber < rightNumber : leftString < rightString;
    case 'LESS_THAN_OR_EQUALS_TO':
      return useNumericComparison ? leftNumber <= rightNumber : leftString <= rightString;
    default:
      return false;
  }
}

function evaluateOperation(record, operation) {
  if (!operation) {
    return true;
  }

  if (operation.leftOperation || operation.rightOperation) {
    const leftResult = evaluateOperation(record, operation.leftOperation);
    const rightResult = evaluateOperation(record, operation.rightOperation);
    return String(operation.operator || '').toUpperCase() === 'OR'
      ? leftResult || rightResult
      : leftResult && rightResult;
  }

  return compareValues(
    operation.operator,
    resolveOperand(record, operation.leftOperand),
    resolveOperand(record, operation.rightOperand)
  );
}

function parseDataValue(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function buildContactPayload(rawInput, existingContact) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const structuredData = parseDataValue(
    pickFirstDefined(input, ['Data', 'data', 'ContactData', 'contactData', 'Metadata', 'metadata', 'DataJson', 'dataJson'])
  );
  const mergedInput = {
    ...structuredData,
    ...input
  };
  const existingData = existingContact?.data || {};

  const consumedKeys = new Set([
    'Id', 'id',
    'Ref', 'ref',
    'DisplayName', 'displayName',
    'FullName', 'fullName',
    'FirstName', 'firstName',
    'LastName', 'lastName',
    'Email', 'email',
    'Phone', 'phone',
    'Organization', 'organization', 'Company', 'company',
    'Status', 'status',
    'Source', 'source',
    'Data', 'data', 'ContactData', 'contactData', 'Metadata', 'metadata', 'DataJson', 'dataJson',
    'Aum', 'aum', 'Value', 'value',
    'NetWorth', 'netWorth',
    'RiskProfile', 'riskProfile',
    'Role', 'role',
    'AssignedTo', 'assignedTo',
    'LifecycleStage', 'lifecycleStage',
    'ExternalId', 'externalId'
  ]);

  const firstName = pickFirstDefined(mergedInput, ['FirstName', 'firstName']) || existingData.firstName || '';
  const lastName = pickFirstDefined(mergedInput, ['LastName', 'lastName']) || existingData.lastName || '';
  const displayNameInput = pickFirstDefined(mergedInput, ['DisplayName', 'displayName']);
  const fullName = displayNameInput || pickFirstDefined(mergedInput, ['FullName', 'fullName']);
  const displayName = buildDisplayName(firstName, lastName, fullName, existingContact?.display_name);
  const status = normalizeStatus(pickFirstDefined(mergedInput, ['Status', 'status']), existingContact?.status || 'pending');
  const sourceSeed = pickFirstDefined(mergedInput, ['Ref', 'ref', 'Email', 'email']) || displayName || existingContact?.id || Date.now();

  const value = normalizeNumber(
    pickFirstDefined(mergedInput, ['Aum', 'aum', 'Value', 'value']),
    normalizeNumber(existingData.value, 0)
  );
  const netWorth = normalizeNumber(
    pickFirstDefined(mergedInput, ['NetWorth', 'netWorth']),
    existingContact ? normalizeNumber(existingData.netWorth, value) : value
  );

  const extensionFields = collectExtensionFields(input, consumedKeys);
  const existingExtensionFields = existingData.extensionFields && typeof existingData.extensionFields === 'object'
    ? existingData.extensionFields
    : {};
  const existingAccounts = Array.isArray(existingData.accounts) ? existingData.accounts : [];

  const normalizedData = {
    ...existingData,
    ...structuredData,
    firstName,
    lastName,
    contactType: 'investor',
    value,
    netWorth,
    changePct: existingContact ? normalizeNumber(existingData.changePct, 0) : 0,
    riskProfile: pickFirstDefined(mergedInput, ['RiskProfile', 'riskProfile']) || existingData.riskProfile || deterministicPick(RISK_PROFILES, sourceSeed),
    role: pickFirstDefined(mergedInput, ['Role', 'role']) || existingData.role || DEFAULT_ROLE,
    assignedTo: pickFirstDefined(mergedInput, ['AssignedTo', 'assignedTo']) || existingData.assignedTo || 'Gordon Gecko',
    avatar: existingData.avatar || deterministicPick(COLOR_PALETTE, sourceSeed),
    lifecycleStage: pickFirstDefined(mergedInput, ['LifecycleStage', 'lifecycleStage']) || existingData.lifecycleStage || (status === 'pending' ? 'pending_signature' : status),
    externalId: pickFirstDefined(mergedInput, ['ExternalId', 'externalId']) || existingData.externalId || null,
    accounts: existingAccounts.length > 0 ? existingAccounts : [buildDefaultAccount(sourceSeed)],
    extensionFields: {
      ...existingExtensionFields,
      ...extensionFields
    }
  };

  return {
    id: pickFirstDefined(mergedInput, ['Id', 'id']) || existingContact?.id,
    ref: pickFirstDefined(mergedInput, ['Ref', 'ref']) || existingContact?.ref || `${slugify(displayName) || 'contact'}-${Date.now().toString(36)}`,
    displayName,
    email: pickFirstDefined(mergedInput, ['Email', 'email']) || existingContact?.email || null,
    phone: normalizePhone(pickFirstDefined(mergedInput, ['Phone', 'phone'])) || existingContact?.phone || null,
    organization: pickFirstDefined(mergedInput, ['Organization', 'organization', 'Company', 'company']) || existingContact?.organization || null,
    status,
    data: normalizedData,
    source: pickFirstDefined(mergedInput, ['Source', 'source']) || existingContact?.source || 'maestro-extension'
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
  const payload = buildContactPayload({
    ...data,
    ...(requestedId ? { Id: requestedId } : {})
  });
  payload.tasks = DEFAULT_NEW_CONTACT_TASKS;
  const created = await createContact(payload);
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
    existing = await getContact(recordId);
  } catch (error) {
    throw createServiceError(error.statusCode === 404 ? 404 : 500, error.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', error.message);
  }

  const payload = buildContactPayload(data, existing);
  await updateContact(recordId, payload);
  return { success: true };
}

async function searchRecords(body) {
  const query = body?.query;
  const pagination = body?.pagination || { limit: 50, skip: 0 };

  if (!query) {
    throw createServiceError(400, 'BAD_REQUEST', 'Query missing in request');
  }

  requireSupportedType(query.from, TYPE_ALIASES, TYPE_NAME);
  const contacts = await listContacts();
  const results = contacts
    .map(mapContactToDataRecord)
    .filter((record) => evaluateOperation(record, query.queryFilter?.operation))
    .slice(Math.max(0, pagination.skip || 0), Math.max(0, pagination.skip || 0) + Math.max(0, pagination.limit || 50))
    .map((record) => filterAttributes(record, query.attributesToSelect));

  return { records: results };
}

module.exports = {
  createRecord,
  patchRecord,
  searchRecords
};
