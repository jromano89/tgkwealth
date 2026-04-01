const { randomUUID } = require('crypto');
const store = require('../data-store');
const { asObject, createError, normalizeOptionalString } = require('../utils');

function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalString(value);
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
    return normalizeOptionalString(value.number || value.normalizedNumber || value.phone);
  }

  return normalizeOptionalString(value);
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
  const explicit = normalizeOptionalString(displayName);
  if (explicit) {
    return explicit;
  }

  const mergedData = asObject(data);
  const firstName = normalizeOptionalString(mergedData.firstName);
  const lastName = normalizeOptionalString(mergedData.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (combinedName) {
    return combinedName;
  }

  const fallback = normalizeOptionalString(email)
    || normalizeOptionalString(organization)
    || normalizeOptionalString(id);

  return fallback || null;
}

function resolveReference(db, appSlug, value, table, label) {
  const id = normalizeOptionalString(value);
  if (!id) {
    return null;
  }

  return store.ensureRecordBelongsToApp(db, table, appSlug, id, label).id;
}

function normalizeEmployeeWrite(existingEmployee, input = {}) {
  const id = input.id || existingEmployee?.id || randomUUID();
  const data = mergeData(existingEmployee?.data, input.data);
  const email = normalizeOptionalString(input.email !== undefined ? input.email : existingEmployee?.email);
  const title = normalizeOptionalString(input.title !== undefined ? input.title : existingEmployee?.title);
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
    email: input.email !== undefined ? normalizeOptionalString(input.email) : undefined,
    phone: input.phone !== undefined ? normalizeOptionalPhone(input.phone) : undefined,
    title: input.title !== undefined ? normalizeOptionalString(input.title) : undefined,
    data,
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function normalizeCustomerWrite(db, appSlug, existingCustomer, input = {}) {
  const id = input.id || existingCustomer?.id || randomUUID();
  const data = mergeData(existingCustomer?.data, input.data);
  const email = normalizeOptionalString(input.email !== undefined ? input.email : existingCustomer?.email);
  const organization = normalizeOptionalString(input.organization !== undefined ? input.organization : existingCustomer?.organization);
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
      ? resolveReference(db, appSlug, input.employeeId, 'employees', 'employeeId')
      : undefined,
    display_name: displayName,
    email: input.email !== undefined ? normalizeOptionalString(input.email) : undefined,
    phone: input.phone !== undefined ? normalizeOptionalPhone(input.phone) : undefined,
    organization: input.organization !== undefined ? normalizeOptionalString(input.organization) : undefined,
    status: input.status !== undefined ? normalizeOptionalString(input.status) : undefined,
    data,
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function normalizeEnvelopeWrite(db, appSlug, existingEnvelope, input = {}) {
  return {
    id: existingEnvelope?.id || normalizeRequiredText(input.id, 'envelope id'),
    employee_id: input.employeeId !== undefined
      ? resolveReference(db, appSlug, input.employeeId, 'employees', 'employeeId')
      : undefined,
    customer_id: input.customerId !== undefined
      ? resolveReference(db, appSlug, input.customerId, 'customers', 'customerId')
      : undefined,
    status: input.status !== undefined ? normalizeOptionalString(input.status) : undefined,
    name: input.name !== undefined ? normalizeOptionalString(input.name) : undefined,
    data: mergeData(existingEnvelope?.data, input.data),
    created_at: input.createdAt !== undefined ? normalizeOptionalDate(input.createdAt) : undefined
  };
}

function normalizeTaskWrite(db, appSlug, existingTask, input = {}) {
  return {
    id: input.id || existingTask?.id || randomUUID(),
    employee_id: input.employeeId !== undefined
      ? resolveReference(db, appSlug, input.employeeId, 'employees', 'employeeId')
      : undefined,
    customer_id: input.customerId !== undefined
      ? resolveReference(db, appSlug, input.customerId, 'customers', 'customerId')
      : undefined,
    title: input.title !== undefined ? normalizeOptionalString(input.title) : undefined,
    description: input.description !== undefined ? normalizeOptionalString(input.description) : undefined,
    status: input.status !== undefined ? normalizeOptionalString(input.status) : undefined,
    due_at: input.dueAt !== undefined ? normalizeOptionalDate(input.dueAt) : undefined,
    data: mergeData(existingTask?.data, input.data),
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
