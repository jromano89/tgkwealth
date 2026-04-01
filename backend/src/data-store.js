const { createError, parseJsonFields, serializeJson } = require('./utils');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeData(data) {
  return asObject(data);
}

function parseRecord(row) {
  if (!row) {
    return row;
  }

  const parsed = parseJsonFields(row);
  return {
    ...parsed,
    data: normalizeData(parsed.data)
  };
}

function parseApp(row) {
  if (!row) {
    return row;
  }

  const parsed = parseJsonFields(row);
  return {
    ...parsed,
    data: normalizeData(parsed.data),
    docusign_available_accounts: Array.isArray(parsed.docusign_available_accounts)
      ? parsed.docusign_available_accounts
      : []
  };
}

function listScopedRows(db, table, appSlug, options = {}) {
  const filters = options.filters || [];
  const params = options.params || [];
  const orderBy = options.orderBy || 'created_at DESC';
  const parseRow = options.parseRow || parseRecord;
  const whereClause = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';
  const query = `SELECT * FROM ${table} WHERE app_slug = ?${whereClause} ORDER BY ${orderBy}`;
  return db.prepare(query).all(appSlug, ...params).map(parseRow);
}

function getScopedRow(db, table, appSlug, id, parseRow = parseRecord) {
  return parseRow(
    db.prepare(`SELECT * FROM ${table} WHERE id = ? AND app_slug = ?`).get(id, appSlug)
  );
}

function requireScopedRow(db, table, appSlug, id, label, parseRow = parseRecord) {
  const row = getScopedRow(db, table, appSlug, id, parseRow);
  if (!row) {
    throw createError(404, `${label} not found`);
  }
  return row;
}

function buildDynamicUpdate(table, recordId, appSlug, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return null;
  }

  const assignments = entries.map(([column]) => `${column} = ?`);
  const values = entries.map(([, value]) => value);
  assignments.push('updated_at = CURRENT_TIMESTAMP');

  return {
    query: `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = ? AND app_slug = ?`,
    values: [...values, recordId, appSlug]
  };
}

function ensureAppBelongsToDb(db, appSlug) {
  const app = parseApp(
    db.prepare('SELECT * FROM apps WHERE slug = ?').get(appSlug)
  );

  if (!app) {
    throw createError(404, 'App not found');
  }

  return app;
}

function getEmployee(db, appSlug, employeeId) {
  return getScopedRow(db, 'employees', appSlug, employeeId, parseRecord);
}

function getCustomer(db, appSlug, customerId) {
  return getScopedRow(db, 'customers', appSlug, customerId, parseRecord);
}

function getEnvelope(db, appSlug, envelopeId) {
  return getScopedRow(db, 'envelopes', appSlug, envelopeId, parseRecord);
}

function getTask(db, appSlug, taskId) {
  return getScopedRow(db, 'tasks', appSlug, taskId, parseRecord);
}

function ensureEmployeeBelongsToApp(db, appSlug, employeeId) {
  if (!employeeId) {
    return null;
  }

  const employee = getEmployee(db, appSlug, employeeId);
  if (!employee) {
    throw createError(400, 'employeeId must belong to the current app');
  }

  return employee;
}

function ensureCustomerBelongsToApp(db, appSlug, customerId) {
  if (!customerId) {
    return null;
  }

  const customer = getCustomer(db, appSlug, customerId);
  if (!customer) {
    throw createError(400, 'customerId must belong to the current app');
  }

  return customer;
}

function listEmployees(db, appSlug, filters = {}) {
  ensureAppBelongsToDb(db, appSlug);
  const conditions = [];
  const params = [];

  if (filters.search) {
    conditions.push('(display_name LIKE ? OR email LIKE ? OR title LIKE ? OR id LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'employees', appSlug, {
    filters: conditions,
    params,
    orderBy: 'COALESCE(display_name, email, title, id) COLLATE NOCASE ASC'
  });
}

function createEmployee(db, appSlug, employee) {
  db.prepare(`
    INSERT INTO employees (
      id,
      app_slug,
      display_name,
      email,
      phone,
      title,
      data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    employee.id,
    appSlug,
    employee.display_name ?? null,
    employee.email ?? null,
    employee.phone ?? null,
    employee.title ?? null,
    serializeJson(normalizeData(employee.data)),
    employee.created_at || new Date().toISOString(),
    employee.updated_at || employee.created_at || new Date().toISOString()
  );

  return getEmployee(db, appSlug, employee.id);
}

function updateEmployee(db, appSlug, employeeId, employee) {
  const statement = buildDynamicUpdate('employees', employeeId, appSlug, {
    display_name: employee.display_name,
    email: employee.email,
    phone: employee.phone,
    title: employee.title,
    data: employee.data !== undefined ? serializeJson(normalizeData(employee.data)) : undefined
  });

  if (statement) {
    db.prepare(statement.query).run(...statement.values);
  }

  return getEmployee(db, appSlug, employeeId);
}

function listCustomers(db, appSlug, filters = {}) {
  ensureAppBelongsToDb(db, appSlug);
  const conditions = [];
  const params = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.employeeId) {
    conditions.push('employee_id = ?');
    params.push(filters.employeeId);
  }
  if (filters.search) {
    conditions.push('(display_name LIKE ? OR email LIKE ? OR organization LIKE ? OR id LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'customers', appSlug, {
    filters: conditions,
    params,
    orderBy: 'COALESCE(display_name, email, organization, id) COLLATE NOCASE ASC'
  });
}

function createCustomer(db, appSlug, customer) {
  db.prepare(`
    INSERT INTO customers (
      id,
      app_slug,
      employee_id,
      display_name,
      email,
      phone,
      organization,
      status,
      data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer.id,
    appSlug,
    customer.employee_id ?? null,
    customer.display_name ?? null,
    customer.email ?? null,
    customer.phone ?? null,
    customer.organization ?? null,
    customer.status ?? 'active',
    serializeJson(normalizeData(customer.data)),
    customer.created_at || new Date().toISOString(),
    customer.updated_at || customer.created_at || new Date().toISOString()
  );

  return getCustomer(db, appSlug, customer.id);
}

function updateCustomer(db, appSlug, customerId, customer) {
  const statement = buildDynamicUpdate('customers', customerId, appSlug, {
    employee_id: customer.employee_id,
    display_name: customer.display_name,
    email: customer.email,
    phone: customer.phone,
    organization: customer.organization,
    status: customer.status,
    data: customer.data !== undefined ? serializeJson(normalizeData(customer.data)) : undefined
  });

  if (statement) {
    db.prepare(statement.query).run(...statement.values);
  }

  return getCustomer(db, appSlug, customerId);
}

function deleteCustomer(db, appSlug, customerId) {
  db.prepare('UPDATE envelopes SET customer_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE app_slug = ? AND customer_id = ?').run(appSlug, customerId);
  db.prepare('UPDATE tasks SET customer_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE app_slug = ? AND customer_id = ?').run(appSlug, customerId);
  db.prepare('DELETE FROM customers WHERE id = ? AND app_slug = ?').run(customerId, appSlug);
}

function listEnvelopes(db, appSlug, filters = {}) {
  ensureAppBelongsToDb(db, appSlug);
  const conditions = [];
  const params = [];

  if (filters.id) {
    conditions.push('id = ?');
    params.push(filters.id);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.employeeId) {
    conditions.push('employee_id = ?');
    params.push(filters.employeeId);
  }
  if (filters.customerId) {
    conditions.push('customer_id = ?');
    params.push(filters.customerId);
  }
  if (filters.search) {
    conditions.push('(name LIKE ? OR id LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'envelopes', appSlug, {
    filters: conditions,
    params,
    orderBy: 'created_at DESC'
  });
}

function createEnvelope(db, appSlug, envelope) {
  db.prepare(`
    INSERT INTO envelopes (
      id,
      app_slug,
      employee_id,
      customer_id,
      status,
      name,
      data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    envelope.id,
    appSlug,
    envelope.employee_id ?? null,
    envelope.customer_id ?? null,
    envelope.status ?? 'created',
    envelope.name ?? null,
    serializeJson(normalizeData(envelope.data)),
    envelope.created_at || new Date().toISOString(),
    envelope.updated_at || envelope.created_at || new Date().toISOString()
  );

  return getEnvelope(db, appSlug, envelope.id);
}

function updateEnvelope(db, appSlug, envelopeId, envelope) {
  const existing = getEnvelope(db, appSlug, envelopeId);
  if (!existing) {
    throw createError(404, 'Envelope not found');
  }

  const statement = buildDynamicUpdate('envelopes', envelopeId, appSlug, {
    employee_id: envelope.employee_id,
    customer_id: envelope.customer_id,
    status: envelope.status,
    name: envelope.name,
    data: envelope.data !== undefined ? serializeJson(normalizeData(envelope.data)) : undefined
  });

  if (statement) {
    db.prepare(statement.query).run(...statement.values);
  }

  return getEnvelope(db, appSlug, envelopeId);
}

function listTasks(db, appSlug, filters = {}) {
  ensureAppBelongsToDb(db, appSlug);
  const conditions = [];
  const params = [];

  if (filters.id) {
    conditions.push('id = ?');
    params.push(filters.id);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.employeeId) {
    conditions.push('employee_id = ?');
    params.push(filters.employeeId);
  }
  if (filters.customerId) {
    conditions.push('customer_id = ?');
    params.push(filters.customerId);
  }
  if (filters.search) {
    conditions.push('(title LIKE ? OR description LIKE ? OR id LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'tasks', appSlug, {
    filters: conditions,
    params,
    orderBy: 'COALESCE(due_at, created_at) DESC'
  });
}

function createTask(db, appSlug, task) {
  db.prepare(`
    INSERT INTO tasks (
      id,
      app_slug,
      employee_id,
      customer_id,
      title,
      description,
      status,
      due_at,
      data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    appSlug,
    task.employee_id ?? null,
    task.customer_id ?? null,
    task.title ?? null,
    task.description ?? null,
    task.status ?? 'pending',
    task.due_at ?? null,
    serializeJson(normalizeData(task.data)),
    task.created_at || new Date().toISOString(),
    task.updated_at || task.created_at || new Date().toISOString()
  );

  return getTask(db, appSlug, task.id);
}

function updateTask(db, appSlug, taskId, task) {
  const statement = buildDynamicUpdate('tasks', taskId, appSlug, {
    employee_id: task.employee_id,
    customer_id: task.customer_id,
    title: task.title,
    description: task.description,
    status: task.status,
    due_at: task.due_at,
    data: task.data !== undefined ? serializeJson(normalizeData(task.data)) : undefined
  });

  if (statement) {
    db.prepare(statement.query).run(...statement.values);
  }

  return getTask(db, appSlug, taskId);
}

function deleteTask(db, appSlug, taskId) {
  db.prepare('DELETE FROM tasks WHERE id = ? AND app_slug = ?').run(taskId, appSlug);
}

module.exports = {
  createCustomer,
  createEmployee,
  createEnvelope,
  createTask,
  deleteCustomer,
  deleteTask,
  ensureAppBelongsToDb,
  ensureCustomerBelongsToApp,
  ensureEmployeeBelongsToApp,
  getCustomer,
  getEmployee,
  getEnvelope,
  getScopedRow,
  getTask,
  listCustomers,
  listEmployees,
  listEnvelopes,
  listTasks,
  requireScopedRow,
  updateCustomer,
  updateEmployee,
  updateEnvelope,
  updateTask
};
