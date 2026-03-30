const { createProfile, createRecord: createBackendRecord, getProfile, listProfiles, updateProfile } = require('./backend-client');
const { TYPE_ALIASES, TYPE_NAME } = require('./profile-type-definitions');
const { createServiceError, pickFirstDefined, requireSupportedType } = require('./service-utils');

const COLOR_PALETTE = ['#3b5bdb', '#16a34a', '#0ea5e9', '#ec4899', '#f59f00', '#dc2626', '#7c3aed'];
const RISK_PROFILES = ['Balanced', 'Moderate Growth', 'Growth', 'Conservative Income'];
const DEFAULT_ROLE = 'Prospective Client';
const ADVISORS = ['Gordon Gecko', 'Avery Quinn', 'Morgan Lee'];

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
    pickFirstDefined(input, ['Data', 'data', 'ProfileData', 'profileData', 'Metadata', 'metadata', 'DataJson', 'dataJson'])
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
    'ExternalId', 'externalId'
  ]);

  const firstName = pickFirstDefined(mergedInput, ['FirstName', 'firstName']) || existingData.firstName || '';
  const lastName = pickFirstDefined(mergedInput, ['LastName', 'lastName']) || existingData.lastName || '';
  const displayNameInput = pickFirstDefined(mergedInput, ['DisplayName', 'displayName']);
  const fullName = displayNameInput || pickFirstDefined(mergedInput, ['FullName', 'fullName']);
  const displayName = buildDisplayName(firstName, lastName, fullName, existingProfile?.display_name);
  const status = normalizeStatus(pickFirstDefined(mergedInput, ['Status', 'status']), existingProfile?.status || 'pending');
  const sourceSeed = pickFirstDefined(mergedInput, ['Ref', 'ref', 'Email', 'email']) || displayName || existingProfile?.id || Date.now();

  const value = normalizeNumber(
    pickFirstDefined(mergedInput, ['Aum', 'aum', 'Value', 'value']),
    normalizeNumber(existingData.value, 0)
  );
  const netWorth = normalizeNumber(
    pickFirstDefined(mergedInput, ['NetWorth', 'netWorth']),
    existingProfile ? normalizeNumber(existingData.netWorth, value) : value
  );

  const lifecycleStage = pickFirstDefined(mergedInput, ['LifecycleStage', 'lifecycleStage'])
    || existingData.lifecycleStage
    || (status === 'pending' ? 'pending_signature' : status);

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
    riskProfile: pickFirstDefined(mergedInput, ['RiskProfile', 'riskProfile']) || existingData.riskProfile || deterministicPick(RISK_PROFILES, sourceSeed),
    role: pickFirstDefined(mergedInput, ['Role', 'role']) || existingData.role || DEFAULT_ROLE,
    assignedTo: pickFirstDefined(mergedInput, ['AssignedTo', 'assignedTo']) || existingData.assignedTo || deterministicPick(ADVISORS, sourceSeed),
    avatar: existingData.avatar || deterministicPick(COLOR_PALETTE, sourceSeed),
    lifecycleStage,
    externalId: pickFirstDefined(mergedInput, ['ExternalId', 'externalId']) || existingData.externalId || null,
    extensionFields: {
      ...existingExtensionFields,
      ...extensionFields
    }
  };

  return {
    id: pickFirstDefined(mergedInput, ['Id', 'id']) || existingProfile?.id,
    ref: pickFirstDefined(mergedInput, ['Ref', 'ref']) || existingProfile?.ref || `${slugify(displayName) || 'profile'}-${Date.now().toString(36)}`,
    kind: pickFirstDefined(mergedInput, ['Kind', 'kind']) || existingProfile?.kind || 'investor',
    displayName,
    email: pickFirstDefined(mergedInput, ['Email', 'email']) || existingProfile?.email || null,
    phone: normalizePhone(pickFirstDefined(mergedInput, ['Phone', 'phone'])) || existingProfile?.phone || null,
    organization: pickFirstDefined(mergedInput, ['Organization', 'organization', 'Company', 'company']) || existingProfile?.organization || null,
    status,
    data: normalizedData,
    source: pickFirstDefined(mergedInput, ['Source', 'source']) || existingProfile?.source || 'maestro-extension'
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
  const payload = buildProfilePayload({
    ...data,
    ...(requestedId ? { Id: requestedId } : {})
  });
  const created = await createProfile(payload);

  // Create a $0 Individual Brokerage account for every new profile
  try {
    await createBackendRecord({
      profileId: created.id,
      kind: 'account',
      title: 'Individual Brokerage',
      status: 'pending',
      data: {
        typeCode: 'type-a',
        accountType: 'Taxable',
        value: 0,
        ytdReturn: 0,
        allocEquity: 0,
        allocFixed: 0,
        allocAlt: 0,
        allocCash: 100
      },
      source: 'maestro-extension'
    });
  } catch (err) {
    console.warn('Could not create default account for profile:', err.message);
  }

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
    existing = await getProfile(recordId);
  } catch (error) {
    throw createServiceError(error.statusCode === 404 ? 404 : 500, error.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', error.message);
  }

  const payload = buildProfilePayload(data, existing);
  await updateProfile(recordId, payload);
  return { success: true };
}

async function searchRecords(body) {
  const query = body?.query;
  const pagination = body?.pagination || { limit: 50, skip: 0 };

  if (!query) {
    throw createServiceError(400, 'BAD_REQUEST', 'Query missing in request');
  }

  requireSupportedType(query.from, TYPE_ALIASES, TYPE_NAME);
  const profiles = await listProfiles();
  const records = profiles
    .map(mapProfileToRecord)
    .filter((record) => evaluateOperation(record, query.queryFilter?.operation))
    .slice(Math.max(0, pagination.skip || 0), Math.max(0, pagination.skip || 0) + Math.max(0, pagination.limit || 50))
    .map((record) => filterAttributes(record, query.attributesToSelect));

  return { records };
}

module.exports = {
  createRecord,
  patchRecord,
  searchRecords
};
