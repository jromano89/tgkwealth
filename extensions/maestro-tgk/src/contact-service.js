const { createContact, getContact, listContacts, updateContact } = require('./backend-client');
const { TYPE_ALIASES, TYPE_NAME } = require('./contact-type-definitions');
const { evaluateOperation, filterAttributes, normalizeSearchRequest } = require('./query-utils');
const { createServiceError, pickFirstDefined, requireSupportedType } = require('./service-utils');

const COLOR_PALETTE = ['#3b5bdb', '#16a34a', '#0ea5e9', '#ec4899', '#f59f00', '#dc2626', '#7c3aed'];
const RISK_PROFILES = ['Balanced', 'Moderate Growth', 'Growth', 'Conservative Income'];
const DEFAULT_ROLE = 'Prospective Client';
const DEFAULT_NEW_CONTACT_TASKS = [
  { title: 'Begin Asset Transfer', description: 'Move assets into the new brokerage relationship.' }
];
const RISK_ACCOUNT_ALLOCATIONS = {
  Balanced: { allocEquity: 56, allocFixed: 24, allocAlt: 12, allocCash: 8 },
  'Moderate Growth': { allocEquity: 64, allocFixed: 18, allocAlt: 12, allocCash: 6 },
  Growth: { allocEquity: 74, allocFixed: 8, allocAlt: 12, allocCash: 6 },
  'Conservative Income': { allocEquity: 32, allocFixed: 46, allocAlt: 8, allocCash: 14 }
};

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

function deterministicRatio(seed, salt = '') {
  return (hashString(`${seed}:${salt}`) % 1000) / 999;
}

function deterministicRange(seed, salt, min, max, step = 1) {
  const ratio = deterministicRatio(seed, salt);
  const raw = min + ((max - min) * ratio);
  return Math.round(raw / step) * step;
}

function defaultPortfolioValue(seed, status) {
  if (status === 'pending') {
    return deterministicRange(seed, 'portfolio-pending', 1250000, 4200000, 50000);
  }
  return deterministicRange(seed, 'portfolio-active', 2800000, 12800000, 50000);
}

function defaultNetWorth(value, seed, status) {
  const multiple = status === 'pending'
    ? deterministicRange(seed, 'net-worth-pending', 2.1, 3.4, 0.1)
    : deterministicRange(seed, 'net-worth-active', 2.8, 5.2, 0.1);
  return Math.round((value * multiple) / 50000) * 50000;
}

function summarizeAccounts(accounts, seed) {
  const normalizedAccounts = (Array.isArray(accounts) ? accounts : []).filter((account) => account && typeof account === 'object');
  const totalValue = normalizedAccounts.reduce((sum, account) => sum + normalizeNumber(account.value, 0), 0);
  const weightedYtdReturn = totalValue > 0
    ? normalizedAccounts.reduce((sum, account) => sum + (normalizeNumber(account.value, 0) * normalizeNumber(account.ytdReturn, 0)), 0) / totalValue
    : deterministicRange(seed, 'fallback-ytd', 0.028, 0.082, 0.001);
  const drift = deterministicRange(seed, 'change-drift', -0.004, 0.004, 0.001);
  const monthlyChange = Math.max(-0.045, Math.min(0.045, weightedYtdReturn / 3.5 + drift));

  return {
    totalValue,
    weightedYtdReturn: Number(weightedYtdReturn.toFixed(3)),
    monthlyChange: Number(monthlyChange.toFixed(3))
  };
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

function buildDefaultAccount(refSeed, options = {}) {
  const status = options.status || 'pending';
  const riskProfile = options.riskProfile || deterministicPick(RISK_PROFILES, refSeed);
  const allocation = RISK_ACCOUNT_ALLOCATIONS[riskProfile] || RISK_ACCOUNT_ALLOCATIONS.Balanced;
  const value = normalizeNumber(options.value, defaultPortfolioValue(refSeed, status));
  const ytdReturn = status === 'pending'
    ? deterministicRange(refSeed, 'ytd-pending', 0.012, 0.036, 0.001)
    : deterministicRange(refSeed, 'ytd-active', 0.038, 0.118, 0.001);

  return {
    kind: 'account',
    status,
    name: 'Individual Brokerage',
    accountType: 'Taxable',
    typeCode: 'type-a',
    value,
    ytdReturn: Number(ytdReturn.toFixed(3)),
    allocEquity: allocation.allocEquity,
    allocFixed: allocation.allocFixed,
    allocAlt: allocation.allocAlt,
    allocCash: allocation.allocCash
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
  const riskProfile = pickFirstDefined(mergedInput, ['RiskProfile', 'riskProfile']) || existingData.riskProfile || deterministicPick(RISK_PROFILES, sourceSeed);

  const value = normalizeNumber(
    pickFirstDefined(mergedInput, ['Aum', 'aum', 'Value', 'value']),
    existingContact
      ? normalizeNumber(existingData.value, defaultPortfolioValue(sourceSeed, status))
      : defaultPortfolioValue(sourceSeed, status)
  );
  const netWorth = normalizeNumber(
    pickFirstDefined(mergedInput, ['NetWorth', 'netWorth']),
    existingContact
      ? normalizeNumber(existingData.netWorth, defaultNetWorth(value, sourceSeed, status))
      : defaultNetWorth(value, sourceSeed, status)
  );

  const extensionFields = collectExtensionFields(input, consumedKeys);
  const existingExtensionFields = existingData.extensionFields && typeof existingData.extensionFields === 'object'
    ? existingData.extensionFields
    : {};
  const existingAccounts = Array.isArray(existingData.accounts) ? existingData.accounts : [];
  const accounts = existingAccounts.length > 0
    ? existingAccounts
    : [buildDefaultAccount(sourceSeed, { value, riskProfile, status })];
  const accountSummary = summarizeAccounts(accounts, sourceSeed);
  const resolvedValue = value > 0 ? value : accountSummary.totalValue;

  const normalizedData = {
    ...existingData,
    ...structuredData,
    firstName,
    lastName,
    contactType: 'investor',
    value: resolvedValue,
    netWorth,
    changePct: existingContact && existingData.changePct !== undefined && existingData.changePct !== null
      ? normalizeNumber(existingData.changePct, accountSummary.monthlyChange)
      : accountSummary.monthlyChange,
    riskProfile,
    role: pickFirstDefined(mergedInput, ['Role', 'role']) || existingData.role || DEFAULT_ROLE,
    assignedTo: pickFirstDefined(mergedInput, ['AssignedTo', 'assignedTo']) || existingData.assignedTo || 'Gordon Gecko',
    avatar: existingData.avatar || deterministicPick(COLOR_PALETTE, sourceSeed),
    lifecycleStage: pickFirstDefined(mergedInput, ['LifecycleStage', 'lifecycleStage']) || existingData.lifecycleStage || (status === 'pending' ? 'pending_signature' : status),
    externalId: pickFirstDefined(mergedInput, ['ExternalId', 'externalId']) || existingData.externalId || null,
    accounts,
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
  const { query, pagination } = normalizeSearchRequest(body);

  if (!query) {
    throw createServiceError(400, 'BAD_REQUEST', 'Query missing in request');
  }

  requireSupportedType(query.from || TYPE_NAME, TYPE_ALIASES, TYPE_NAME);
  const contacts = await listContacts();
  const results = contacts
    .map(mapContactToDataRecord)
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
