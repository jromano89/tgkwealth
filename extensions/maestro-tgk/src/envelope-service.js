const { createEnvelope, updateEnvelope } = require('./backend-client');
const envelopeTypeDefs = require('./envelope-type-definitions');
const { createServiceError, pickFirstDefined, requireSupportedType } = require('./service-utils');

function buildEnvelopePayload(rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};

  return {
    docusignEnvelopeId: pickFirstDefined(input, ['DocusignEnvelopeId', 'docusignEnvelopeId', 'EnvelopeId', 'envelopeId']) || null,
    templateName: pickFirstDefined(input, ['DocumentName', 'documentName', 'TemplateName', 'templateName']) || null,
    status: pickFirstDefined(input, ['Status', 'status']) || 'sent',
    profileId: pickFirstDefined(input, ['ProfileId', 'profileId']) || null,
    recordId: pickFirstDefined(input, ['RecordId', 'recordId']) || null,
    metadata: {
      documentName: pickFirstDefined(input, ['DocumentName', 'documentName', 'TemplateName', 'templateName']) || null
    },
    source: 'maestro-extension'
  };
}

async function createRecord(body) {
  const data = body?.data;
  const requestedId = body?.recordId;
  const typeName = body?.typeName;

  if (!data || !typeName) {
    throw createServiceError(400, 'BAD_REQUEST', 'data or typeName missing in request');
  }

  requireSupportedType(typeName, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
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
    throw createServiceError(400, 'BAD_REQUEST', 'data, typeName or recordId missing in request');
  }

  requireSupportedType(typeName, envelopeTypeDefs.TYPE_ALIASES, envelopeTypeDefs.TYPE_NAME);
  const payload = buildEnvelopePayload(data);
  await updateEnvelope(recordId, payload);
  return { success: true };
}

module.exports = {
  createRecord,
  patchRecord
};
