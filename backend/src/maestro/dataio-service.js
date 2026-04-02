const { evaluateOperation, filterAttributes, normalizeSearchRequest } = require('./query-utils');
const { createServiceError, requireSupportedType } = require('./service-utils');

function wrapLookupError(error) {
  return createServiceError(
    error?.statusCode === 404 ? 404 : 500,
    error?.statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
    error?.message || 'Unexpected lookup failure.'
  );
}

function createDataIoService({
  typeName,
  typeAliases,
  createBackendRecord,
  updateBackendRecord,
  listRecords,
  mapRecordToDataRecord,
  buildPayload,
  buildSearchFilters,
  idField = 'Id',
  loadExistingRecord,
  normalizeWriteError = (error) => error
}) {
  async function createRecord(body) {
    const data = body?.data;
    const requestedId = body?.recordId;
    const requestedTypeName = body?.typeName;

    if (!data || !requestedTypeName) {
      throw createServiceError(400, 'BAD_REQUEST', 'data or typeName missing in request');
    }

    requireSupportedType(requestedTypeName, typeAliases, typeName);

    try {
      const payload = buildPayload(data, { existingRecord: null, recordId: requestedId });
      if (requestedId && payload.id === undefined) {
        payload.id = requestedId;
      }
      const created = await createBackendRecord(payload);
      return { recordId: created.id };
    } catch (error) {
      throw normalizeWriteError(error);
    }
  }

  async function patchRecord(body) {
    const data = body?.data;
    const requestedTypeName = body?.typeName;
    const recordId = body?.recordId;

    if (!data || !requestedTypeName || !recordId) {
      throw createServiceError(400, 'BAD_REQUEST', 'data, typeName or recordId missing in request');
    }

    requireSupportedType(requestedTypeName, typeAliases, typeName);

    let existingRecord = null;
    if (loadExistingRecord) {
      try {
        existingRecord = await loadExistingRecord(recordId);
      } catch (error) {
        throw wrapLookupError(error);
      }
    }

    try {
      await updateBackendRecord(recordId, buildPayload(data, { existingRecord, recordId }));
      return { success: true };
    } catch (error) {
      throw normalizeWriteError(error);
    }
  }

  async function searchRecords(body) {
    const { query, pagination } = normalizeSearchRequest(body);

    if (!query) {
      throw createServiceError(400, 'BAD_REQUEST', 'Query missing in request');
    }

    requireSupportedType(query.from || typeName, typeAliases, typeName);

    const records = await listRecords(buildSearchFilters ? buildSearchFilters(query) : undefined);
    return {
      records: records
        .map(mapRecordToDataRecord)
        .filter((record) => evaluateOperation(record, query.queryFilter?.operation))
        .slice(pagination.skip, pagination.skip + pagination.limit)
        .map((record) => {
          const filtered = filterAttributes(record, query.attributesToSelect);
          if (!Object.prototype.hasOwnProperty.call(filtered, idField) && record[idField]) {
            filtered[idField] = record[idField];
          }
          return filtered;
        })
    };
  }

  return {
    createRecord,
    patchRecord,
    searchRecords
  };
}

module.exports = {
  createDataIoService
};
