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
  createServiceError,
  pickFirstDefined,
  requireSupportedType
};
