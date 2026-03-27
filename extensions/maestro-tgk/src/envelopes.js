const { createEnvelope, updateEnvelope } = require('./tgk-client');
const envelopeTypeDefs = require('./envelope-type-definitions');

function createError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requireSupportedType(typeName) {
  if (!envelopeTypeDefs.TYPE_ALIASES.has(String(typeName || '').toLowerCase())) {
    throw createError(400, 'BAD_REQUEST', `Unsupported typeName "${typeName}". Use "${envelopeTypeDefs.TYPE_NAME}".`);
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

function buildEnvelopePayload(rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};

  return {
    docusignEnvelopeId: pick(input, ['DocusignEnvelopeId', 'docusignEnvelopeId', 'EnvelopeId', 'envelopeId']) || null,
    templateName: pick(input, ['DocumentName', 'documentName', 'TemplateName', 'templateName']) || null,
    status: pick(input, ['Status', 'status']) || 'sent',
    profileId: pick(input, ['ProfileId', 'profileId']) || null,
    recordId: pick(input, ['RecordId', 'recordId']) || null,
    metadata: {
      documentName: pick(input, ['DocumentName', 'documentName', 'TemplateName', 'templateName']) || null
    },
    source: 'maestro-extension'
  };
}

function mapEnvelopeToRecord(envelope) {
  const metadata = envelope?.metadata || {};
  return {
    Id: envelope.id,
    DocusignEnvelopeId: envelope.docusign_envelope_id || '',
    DocumentName: metadata.documentName || envelope.template_name || '',
    Status: envelope.status || '',
    ProfileId: envelope.profile_id || '',
    RecordId: envelope.record_id || '',
    TemplateName: envelope.template_name || '',
    CreatedAt: envelope.created_at || ''
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
  const payload = buildEnvelopePayload(data);
  if (requestedId) {
    payload.id = requestedId;
  }
  const created = await createEnvelope(payload);
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
  const payload = buildEnvelopePayload(data);
  await updateEnvelope(recordId, payload);
  return { success: true };
}

module.exports = {
  createRecord,
  patchRecord,
  mapEnvelopeToRecord
};
