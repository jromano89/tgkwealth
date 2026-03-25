const { createProfile, getProfile, listProfiles, updateProfile } = require('./tgk-client');
const { TYPE_ALIASES, TYPE_DEFINITIONS, TYPE_NAME, TYPE_NAMES } = require('./profile-type-definitions');

const COLOR_PALETTE = ['#3b5bdb', '#16a34a', '#0ea5e9', '#ec4899', '#f59f00', '#dc2626', '#7c3aed'];
const RISK_PROFILES = ['Balanced', 'Moderate Growth', 'Growth', 'Conservative Income'];
const ROLES = ['Prospective Client', 'New Investor', 'Pending Onboarding'];
const ADVISORS = ['Gordon Gecko', 'Avery Quinn', 'Morgan Lee'];

function createError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requireSupportedType(typeName) {
  if (!TYPE_ALIASES.has(String(typeName || '').toLowerCase())) {
    throw createError(400, 'BAD_REQUEST', `Unsupported typeName "${typeName}". Use "${TYPE_NAME}".`);
  }
}

function pick(input, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined && input[key] !== null && input[key] !== '') {
      return input[key];
    }
  }
  return undefined;
}

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
  return combined || existingDisplayName || 'Pending Investor';
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

function mapProfileToRecord(profile) {
  const data = profile?.data || {};
  return {
    Id: profile.id,
    Ref: profile.ref || '',
    Kind: profile.kind || '',
    DisplayName: profile.display_name || '',
    FullName: profile.display_name || '',
    FirstName: data.firstName || '',
    LastName: data.lastName || '',
    Email: profile.email || '',
    Phone: profile.phone || '',
    Organization: profile.organization || '',
    Status: profile.status || '',
    Source: profile.source || '',
    DataJson: JSON.stringify(data || {}),
    Aum: normalizeNumber(data.value, 0),
    NetWorth: normalizeNumber(data.netWorth, 0),
    RiskProfile: data.riskProfile || '',
    Role: data.role || '',
    AssignedTo: data.assignedTo || '',
    LifecycleStage: data.lifecycleStage || '',
    CompletedEnvelopeId: data.completedEnvelopeId || '',
    CreatedAt: profile.created_at || '',
    UpdatedAt: profile.updated_at || '',
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

function buildProfilePayload(rawInput, existingProfile) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const structuredData = parseDataValue(
    pick(input, ['Data', 'data', 'ProfileData', 'profileData', 'Metadata', 'metadata', 'DataJson', 'dataJson'])
  );
  const mergedInput = {
    ...structuredData,
    ...input
  };
  const existingData = existingProfile?.data || {};

  const consumedKeys = new Set([
    'Id', 'id',
    'Ref', 'ref',
    'Kind', 'kind',
    'DisplayName', 'displayName',
    'FullName', 'fullName', 'DisplayName', 'displayName',
    'FirstName', 'firstName',
    'LastName', 'lastName',
    'Email', 'email',
    'Phone', 'phone',
    'Organization', 'organization', 'Company', 'company',
    'Status', 'status',
    'Source', 'source',
    'Data', 'data', 'ProfileData', 'profileData', 'Metadata', 'metadata', 'DataJson', 'dataJson',
    'Aum', 'aum', 'Value', 'value',
    'NetWorth', 'netWorth',
    'RiskProfile', 'riskProfile',
    'Role', 'role',
    'AssignedTo', 'assignedTo',
    'LifecycleStage', 'lifecycleStage',
    'CompletedEnvelopeId', 'completedEnvelopeId', 'EnvelopeId', 'envelopeId',
    'ExternalId', 'externalId'
  ]);

  const firstName = pick(mergedInput, ['FirstName', 'firstName']) || existingData.firstName || '';
  const lastName = pick(mergedInput, ['LastName', 'lastName']) || existingData.lastName || '';
  const displayNameInput = pick(mergedInput, ['DisplayName', 'displayName']);
  const fullName = displayNameInput || pick(mergedInput, ['FullName', 'fullName']);
  const displayName = buildDisplayName(firstName, lastName, fullName, existingProfile?.display_name);
  const status = normalizeStatus(pick(mergedInput, ['Status', 'status']), existingProfile?.status || 'pending');
  const sourceSeed = pick(mergedInput, ['Ref', 'ref', 'Email', 'email']) || displayName || existingProfile?.id || Date.now();

  const value = normalizeNumber(
    pick(mergedInput, ['Aum', 'aum', 'Value', 'value']),
    normalizeNumber(existingData.value, 0)
  );
  const netWorth = normalizeNumber(
    pick(mergedInput, ['NetWorth', 'netWorth']),
    existingProfile ? normalizeNumber(existingData.netWorth, value) : value
  );

  const lifecycleStage = pick(mergedInput, ['LifecycleStage', 'lifecycleStage'])
    || existingData.lifecycleStage
    || (status === 'pending' ? 'pending_signature' : status);

  const completedEnvelopeId = pick(mergedInput, ['CompletedEnvelopeId', 'completedEnvelopeId', 'EnvelopeId', 'envelopeId'])
    || existingData.completedEnvelopeId
    || null;

  const extensionFields = collectExtensionFields(input, consumedKeys);
  const existingExtensionFields = existingData.extensionFields && typeof existingData.extensionFields === 'object'
    ? existingData.extensionFields
    : {};

  const normalizedData = {
    ...existingData,
    ...structuredData,
    firstName,
    lastName,
    profileType: 'investor',
    value,
    netWorth,
    changePct: existingProfile ? normalizeNumber(existingData.changePct, 0) : 0,
    riskProfile: pick(mergedInput, ['RiskProfile', 'riskProfile']) || existingData.riskProfile || deterministicPick(RISK_PROFILES, sourceSeed),
    role: pick(mergedInput, ['Role', 'role']) || existingData.role || deterministicPick(ROLES, sourceSeed),
    assignedTo: pick(mergedInput, ['AssignedTo', 'assignedTo']) || existingData.assignedTo || deterministicPick(ADVISORS, sourceSeed),
    avatar: existingData.avatar || deterministicPick(COLOR_PALETTE, sourceSeed),
    lifecycleStage,
    completedEnvelopeId,
    externalId: pick(mergedInput, ['ExternalId', 'externalId']) || existingData.externalId || null,
    extensionFields: {
      ...existingExtensionFields,
      ...extensionFields
    }
  };

  return {
    id: pick(mergedInput, ['Id', 'id']) || existingProfile?.id,
    ref: pick(mergedInput, ['Ref', 'ref']) || existingProfile?.ref || `${slugify(displayName) || 'profile'}-${Date.now().toString(36)}`,
    kind: pick(mergedInput, ['Kind', 'kind']) || existingProfile?.kind || 'investor',
    displayName,
    email: pick(mergedInput, ['Email', 'email']) || existingProfile?.email || null,
    phone: normalizePhone(pick(mergedInput, ['Phone', 'phone'])) || existingProfile?.phone || null,
    organization: pick(mergedInput, ['Organization', 'organization', 'Company', 'company']) || existingProfile?.organization || null,
    status,
    data: normalizedData,
    source: pick(mergedInput, ['Source', 'source']) || existingProfile?.source || 'maestro-extension'
  };
}

async function createRecord(body) {
  const data = body?.data;
  const requestedId = body?.recordId;
  const typeName = body?.typeName;

  if (!data || !typeName) {
    throw createError(400, 'BAD_REQUEST', 'data or typeName missing in request');
  }

  requireSupportedType(typeName);
  const payload = buildProfilePayload({
    ...data,
    ...(requestedId ? { Id: requestedId } : {})
  });
  const created = await createProfile(payload);
  return { recordId: created.id };
}

async function patchRecord(body) {
  const data = body?.data;
  const typeName = body?.typeName;
  const recordId = body?.recordId;

  if (!data || !typeName || !recordId) {
    throw createError(400, 'BAD_REQUEST', 'data, typeName or recordId missing in request');
  }

  requireSupportedType(typeName);
  let existing;
  try {
    existing = await getProfile(recordId);
  } catch (error) {
    throw createError(error.statusCode === 404 ? 404 : 500, error.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', error.message);
  }

  const payload = buildProfilePayload(data, existing);
  await updateProfile(recordId, payload);
  return { success: true };
}

async function searchRecords(body) {
  const query = body?.query;
  const pagination = body?.pagination || { limit: 50, skip: 0 };

  if (!query) {
    throw createError(400, 'BAD_REQUEST', 'Query missing in request');
  }

  requireSupportedType(query.from);
  const profiles = await listProfiles();
  const records = profiles
    .map(mapProfileToRecord)
    .filter((record) => evaluateOperation(record, query.queryFilter?.operation))
    .slice(Math.max(0, pagination.skip || 0), Math.max(0, pagination.skip || 0) + Math.max(0, pagination.limit || 50))
    .map((record) => filterAttributes(record, query.attributesToSelect));

  return { records };
}

function getTypeNames() {
  return { typeNames: TYPE_NAMES };
}

function getTypeDefinitions(body) {
  const typeNames = body?.typeNames;
  if (!Array.isArray(typeNames) || typeNames.length === 0) {
    throw createError(400, 'BAD_REQUEST', 'Missing typeNames in request');
  }

  const requested = new Set(typeNames.map((item) => String(item?.typeName || '').toLowerCase()));
  const errors = [];
  const hasSupportedType = [...requested].some((typeName) => TYPE_ALIASES.has(typeName));

  if (!hasSupportedType) {
    for (const typeName of requested) {
      errors.push({
        typeName,
        code: 'UNKNOWN',
        message: `Unsupported type "${typeName}".`
      });
    }
    return { declarations: [], errors };
  }

  return {
    declarations: TYPE_DEFINITIONS.declarations,
    errors
  };
}

module.exports = {
  createRecord,
  getTypeDefinitions,
  getTypeNames,
  patchRecord,
  searchRecords
};
