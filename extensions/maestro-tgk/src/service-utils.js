function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function parseDataValue(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value));
    } catch (error) {
      return {};
    }
  }

  return asObject(value);
}

function createServiceError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function pickFirstDefined(input, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      continue;
    }

    const value = input[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function requireSupportedType(typeName, aliases, canonicalTypeName) {
  if (aliases.has(String(typeName || '').toLowerCase())) {
    return;
  }

  throw createServiceError(400, 'BAD_REQUEST', `Unsupported typeName "${typeName}". Use "${canonicalTypeName}".`);
}

module.exports = {
  asObject,
  createServiceError,
  parseDataValue,
  pickFirstDefined,
  requireSupportedType
};
