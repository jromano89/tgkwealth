const { randomUUID } = require('crypto');
const store = require('../data-store');
const { createError } = require('../utils');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw createError(400, `Missing ${label}`);
  }
  return normalized;
}

function normalizeOptionalDate(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const normalized = new Date(value);
  if (Number.isNaN(normalized.valueOf())) {
    throw createError(400, 'Invalid date value');
  }

  return normalized.toISOString();
}

function normalizeOptionalPhone(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }

  if (value && typeof value === 'object') {
    return normalizeOptionalText(value.number || value.normalizedNumber || value.phone);
  }

  return normalizeOptionalText(value);
}

function mergeData(existingData, nextData) {
  if (nextData === undefined) {
    return undefined;
  }

  if (nextData === null) {
    return {};
  }

  return {
    ...asObject(existingData),
    ...asObject(nextData)
  };
}

function deriveDisplayName({ displayName, data, email, organization, id }) {
  const explicit = normalizeOptionalText(displayName);
  if (explicit) {
    return explicit;
  }

  const mergedData = asObject(data);
  const firstName = normalizeOptionalText(mergedData.firstName);
  const lastName = normalizeOptionalText(mergedData.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (combinedName) {
    return combinedName;
  }

  const fallback = normalizeOptionalText(email)
    || normalizeOptionalText(organization)
    || normalizeOptionalText(id);

  return fallback || null;
}

function resolveEmployeeReference(db, appSlug, value) {
  const employeeId = normalizeOptionalText(value);
  if (!employeeId) {
    return null;
  }

  return store.ensureEmployeeBelongsToApp(db, appSlug, employeeId).id;
}

function resolveCustomerReference(db, appSlug, value) {
  const customerId = normalizeOptionalText(value);
  if (!customerId) {
    return null;
  }

  return store.ensureCustomerBelongsToApp(db, appSlug, customerId).id;
}

function normalizeRecordData(existingData, inputData) {
  return mergeData(existingData, inputData);
}

function normalizeEmployeeWrite(existingEmployee, input = {}) {
  const id = input.id || existingEmployee?.id || randomUUID();
  const data = normalizeRecordData(existingEmployee?.data, input.data);
  const email = normalizeOptionalText(input.email !== undefined ? input.email : existingEmployee?.email);
  const title = normalizeOptionalText(input.title !== undefined ? input.title : existingEmployee?.title);
  const displayName = deriveDisplayName({
    displayName: input.displayName !== undefined ? input.displayName : existingEmployee?.display_name,
    data: data !== undefined ? data : existingEmployee?.data,
    email,
    organization: title,
    id
  });

  return {
    id,
    display_name: displayName,
    email: input.email !== undefined ? normalizeOptionalText(input.email) : undefined,
    phone: input.phone !== undefined ? normalizeOptionalPhone(input.phone) : undefined,
    title: input.title !== undefined ? normalizeOptionalText(input.title) : undefined,
    data,
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function normalizeCustomerWrite(db, appSlug, existingCustomer, input = {}) {
  const id = input.id || existingCustomer?.id || randomUUID();
  const data = normalizeRecordData(existingCustomer?.data, input.data);
  const email = normalizeOptionalText(input.email !== undefined ? input.email : existingCustomer?.email);
  const organization = normalizeOptionalText(input.organization !== undefined ? input.organization : existingCustomer?.organization);
  const displayName = deriveDisplayName({
    displayName: input.displayName !== undefined ? input.displayName : existingCustomer?.display_name,
    data: data !== undefined ? data : existingCustomer?.data,
    email,
    organization,
    id
  });

  return {
    id,
    employee_id: input.employeeId !== undefined
      ? resolveEmployeeReference(db, appSlug, input.employeeId)
      : undefined,
    display_name: displayName,
    email: input.email !== undefined ? normalizeOptionalText(input.email) : undefined,
    phone: input.phone !== undefined ? normalizeOptionalPhone(input.phone) : undefined,
    organization: input.organization !== undefined ? normalizeOptionalText(input.organization) : undefined,
    status: input.status !== undefined ? normalizeOptionalText(input.status) : undefined,
    data,
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function normalizeEnvelopeWrite(db, appSlug, existingEnvelope, input = {}) {
  return {
    id: existingEnvelope?.id || normalizeRequiredText(input.id, 'envelope id'),
    employee_id: input.employeeId !== undefined
      ? resolveEmployeeReference(db, appSlug, input.employeeId)
      : undefined,
    customer_id: input.customerId !== undefined
      ? resolveCustomerReference(db, appSlug, input.customerId)
      : undefined,
    status: input.status !== undefined ? normalizeOptionalText(input.status) : undefined,
    name: input.name !== undefined ? normalizeOptionalText(input.name) : undefined,
    data: normalizeRecordData(existingEnvelope?.data, input.data),
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function normalizeTaskWrite(db, appSlug, existingTask, input = {}) {
  return {
    id: input.id || existingTask?.id || randomUUID(),
    employee_id: input.employeeId !== undefined
      ? resolveEmployeeReference(db, appSlug, input.employeeId)
      : undefined,
    customer_id: input.customerId !== undefined
      ? resolveCustomerReference(db, appSlug, input.customerId)
      : undefined,
    title: input.title !== undefined ? normalizeOptionalText(input.title) : undefined,
    description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
    status: input.status !== undefined ? normalizeOptionalText(input.status) : undefined,
    due_at: input.dueAt !== undefined ? normalizeOptionalDate(input.dueAt) : undefined,
    data: normalizeRecordData(existingTask?.data, input.data),
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function listEmployeesForApp(db, appSlug, filters) {
  return store.listEmployees(db, appSlug, filters);
}

function getEmployeeForApp(db, appSlug, employeeId) {
  return store.requireScopedRow(db, 'employees', appSlug, employeeId, 'Employee');
}

function createEmployeeForApp(db, appSlug, input = {}) {
  const record = normalizeEmployeeWrite(null, input);
  return store.createEmployee(db, appSlug, {
    ...record,
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString()
  });
}

function updateEmployeeForApp(db, appSlug, employeeId, input = {}) {
  const existing = store.getEmployee(db, appSlug, employeeId);
  if (!existing) {
    throw createError(404, 'Employee not found');
  }

  return store.updateEmployee(db, appSlug, employeeId, normalizeEmployeeWrite(existing, input));
}

function listCustomersForApp(db, appSlug, filters) {
  return store.listCustomers(db, appSlug, filters);
}

function getCustomerForApp(db, appSlug, customerId) {
  return store.requireScopedRow(db, 'customers', appSlug, customerId, 'Customer');
}

function createCustomerForApp(db, appSlug, input = {}) {
  const record = normalizeCustomerWrite(db, appSlug, null, input);
  return store.createCustomer(db, appSlug, {
    ...record,
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString()
  });
}

function updateCustomerForApp(db, appSlug, customerId, input = {}) {
  const existing = store.getCustomer(db, appSlug, customerId);
  if (!existing) {
    throw createError(404, 'Customer not found');
  }

  return store.updateCustomer(db, appSlug, customerId, normalizeCustomerWrite(db, appSlug, existing, input));
}

function deleteCustomerForApp(db, appSlug, customerId) {
  if (!store.getCustomer(db, appSlug, customerId)) {
    throw createError(404, 'Customer not found');
  }

  store.deleteCustomer(db, appSlug, customerId);
  return { success: true };
}

function listEnvelopesForApp(db, appSlug, filters) {
  return store.listEnvelopes(db, appSlug, filters);
}

function getEnvelopeForApp(db, appSlug, envelopeId) {
  return store.requireScopedRow(db, 'envelopes', appSlug, envelopeId, 'Envelope');
}

function createEnvelopeForApp(db, appSlug, input = {}) {
  const record = normalizeEnvelopeWrite(db, appSlug, null, input);
  return store.createEnvelope(db, appSlug, {
    ...record,
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString()
  });
}

function updateEnvelopeForApp(db, appSlug, envelopeId, input = {}) {
  const existing = store.getEnvelope(db, appSlug, envelopeId);
  if (!existing) {
    throw createError(404, 'Envelope not found');
  }

  return store.updateEnvelope(db, appSlug, envelopeId, normalizeEnvelopeWrite(db, appSlug, existing, input));
}

function listTasksForApp(db, appSlug, filters) {
  return store.listTasks(db, appSlug, filters);
}

function getTaskForApp(db, appSlug, taskId) {
  return store.requireScopedRow(db, 'tasks', appSlug, taskId, 'Task');
}

function createTaskForApp(db, appSlug, input = {}) {
  const record = normalizeTaskWrite(db, appSlug, null, input);
  return store.createTask(db, appSlug, {
    ...record,
    created_at: record.created_at || new Date().toISOString(),
    updated_at: record.updated_at || record.created_at || new Date().toISOString()
  });
}

function updateTaskForApp(db, appSlug, taskId, input = {}) {
  const existing = store.getTask(db, appSlug, taskId);
  if (!existing) {
    throw createError(404, 'Task not found');
  }

  return store.updateTask(db, appSlug, taskId, normalizeTaskWrite(db, appSlug, existing, input));
}

function deleteTaskForApp(db, appSlug, taskId) {
  if (!store.getTask(db, appSlug, taskId)) {
    throw createError(404, 'Task not found');
  }

  store.deleteTask(db, appSlug, taskId);
  return { success: true };
}

module.exports = {
  createCustomerForApp,
  createEmployeeForApp,
  createEnvelopeForApp,
  createTaskForApp,
  deleteCustomerForApp,
  deleteTaskForApp,
  getCustomerForApp,
  getEmployeeForApp,
  getEnvelopeForApp,
  getTaskForApp,
  listCustomersForApp,
  listEmployeesForApp,
  listEnvelopesForApp,
  listTasksForApp,
  updateCustomerForApp,
  updateEmployeeForApp,
  updateEnvelopeForApp,
  updateTaskForApp
};
