const { createError, parseJsonFields, serializeJson } = require('./utils');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeTaskRecord(task, defaults = {}) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  return {
    id: task.id,
    user_id: task.user_id || task.userId || defaults.userId || null,
    contact_id: task.contact_id || task.contactId || defaults.contactId || null,
    title: task.title,
    description: task.description || null,
    status: task.status || 'pending',
    created_at: task.created_at || task.createdAt || defaults.createdAt || new Date().toISOString()
  };
}

function normalizeTasks(tasks, defaults = {}) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .map((task) => normalizeTaskRecord(task, defaults))
    .filter((task) => task && task.id && task.title)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
}

function normalizeData(data, taskDefaults = {}) {
  const normalized = asObject(data);
  normalized.tasks = normalizeTasks(normalized.tasks, taskDefaults);
  return normalized;
}

function parseUser(row) {
  if (!row) {
    return row;
  }

  const parsed = parseJsonFields(row);
  return {
    ...parsed,
    data: normalizeData(parsed.data)
  };
}

function parseContact(row) {
  if (!row) {
    return row;
  }

  const parsed = parseJsonFields(row);
  return {
    ...parsed,
    data: normalizeData(parsed.data)
  };
}

function parseEnvelope(row) {
  return row ? { ...row } : row;
}

function getScopedRow(db, table, appId, id, parseRow = parseJsonFields) {
  return parseRow(
    db.prepare(`SELECT * FROM ${table} WHERE id = ? AND app_id = ?`).get(id, appId)
  );
}

function requireScopedRow(db, table, appId, id, label, parseRow = parseJsonFields) {
  const row = getScopedRow(db, table, appId, id, parseRow);
  if (!row) {
    throw createError(404, `${label} not found`);
  }
  return row;
}

function listScopedRows(db, table, appId, { filters = [], params = [], orderBy = 'created_at DESC', parseRow = parseJsonFields } = {}) {
  const whereClause = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';
  const query = `SELECT * FROM ${table} WHERE app_id = ?${whereClause} ORDER BY ${orderBy}`;
  return db.prepare(query).all(appId, ...params).map(parseRow);
}

function updateRecordData(db, table, appId, id, data, normalizeRecordData) {
  db.prepare(`
    UPDATE ${table} SET
      data = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND app_id = ?
  `).run(serializeJson(normalizeRecordData(data)), id, appId);
}

function getPrimaryUser(db, appId) {
  return parseUser(
    db.prepare('SELECT * FROM users WHERE app_id = ? ORDER BY created_at ASC LIMIT 1').get(appId)
  );
}

function getUser(db, appId, userId) {
  return getScopedRow(db, 'users', appId, userId, parseUser);
}

function getContact(db, appId, contactId) {
  return getScopedRow(db, 'contacts', appId, contactId, parseContact);
}

function ensureUserBelongsToApp(db, appId, userId) {
  if (!userId) {
    return null;
  }

  const user = getUser(db, appId, userId);
  if (!user) {
    throw createError(400, 'userId must belong to the current app');
  }

  return user;
}

function ensureContactBelongsToApp(db, appId, contactId) {
  if (!contactId) {
    return null;
  }

  const contact = getContact(db, appId, contactId);
  if (!contact) {
    throw createError(400, 'contactId must belong to the current app');
  }

  return contact;
}

function listUsers(db, appId, filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.search) {
    conditions.push('(display_name LIKE ? OR email LIKE ? OR title LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'users', appId, { filters: conditions, params, parseRow: parseUser });
}

function createUser(db, appId, user) {
  db.prepare(`
    INSERT INTO users (id, app_id, display_name, email, phone, title, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    appId,
    user.displayName,
    user.email || null,
    user.phone || null,
    user.title || null,
    serializeJson(normalizeData(user.data))
  );

  return getUser(db, appId, user.id);
}

function updateUser(db, appId, userId, user) {
  db.prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      title = COALESCE(?, title),
      data = COALESCE(?, data),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND app_id = ?
  `).run(
    user.displayName,
    user.email,
    user.phone,
    user.title,
    user.data !== undefined ? serializeJson(normalizeData(user.data)) : null,
    userId,
    appId
  );

  return getUser(db, appId, userId);
}

function listContacts(db, appId, filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.source) {
    conditions.push('source = ?');
    params.push(filters.source);
  }
  if (filters.ownerUserId) {
    conditions.push('owner_user_id = ?');
    params.push(filters.ownerUserId);
  }
  if (filters.search) {
    conditions.push('(display_name LIKE ? OR email LIKE ? OR organization LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'contacts', appId, { filters: conditions, params, parseRow: parseContact });
}

function createContact(db, appId, contact) {
  db.prepare(`
    INSERT INTO contacts (
      id,
      app_id,
      owner_user_id,
      ref,
      display_name,
      email,
      phone,
      organization,
      status,
      data,
      source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contact.id,
    appId,
    contact.ownerUserId,
    contact.ref || null,
    contact.displayName,
    contact.email || null,
    contact.phone || null,
    contact.organization || null,
    contact.status || 'active',
    serializeJson(normalizeData(contact.data)),
    contact.source || 'api'
  );

  return getContact(db, appId, contact.id);
}

function updateContact(db, appId, contactId, contact) {
  db.prepare(`
    UPDATE contacts SET
      owner_user_id = COALESCE(?, owner_user_id),
      ref = COALESCE(?, ref),
      display_name = COALESCE(?, display_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      organization = COALESCE(?, organization),
      status = COALESCE(?, status),
      data = COALESCE(?, data),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND app_id = ?
  `).run(
    contact.ownerUserId,
    contact.ref,
    contact.displayName,
    contact.email,
    contact.phone,
    contact.organization,
    contact.status,
    contact.data !== undefined ? serializeJson(normalizeData(contact.data)) : null,
    contactId,
    appId
  );

  return getContact(db, appId, contactId);
}

function getContactDetails(db, appId, contactId) {
  const contact = requireScopedRow(db, 'contacts', appId, contactId, 'Contact', parseContact);
  const owner = contact.owner_user_id ? getUser(db, appId, contact.owner_user_id) : null;
  const envelopes = db.prepare(
    'SELECT * FROM envelopes WHERE app_id = ? AND contact_id = ? ORDER BY created_at DESC'
  ).all(appId, contact.id).map(parseEnvelope);

  return {
    ...contact,
    owner,
    envelopes,
    tasks: normalizeTasks(contact.data.tasks, {
      contactId: contact.id,
      userId: contact.owner_user_id
    })
  };
}

function deleteContactCascade(db, appId, contactId) {
  db.prepare('DELETE FROM envelopes WHERE app_id = ? AND contact_id = ?').run(appId, contactId);
  db.prepare('DELETE FROM contacts WHERE id = ? AND app_id = ?').run(contactId, appId);
}

function createEnvelope(db, appId, envelope) {
  db.prepare(`
    INSERT INTO envelopes (
      id,
      app_id,
      user_id,
      docusign_envelope_id,
      contact_id,
      status,
      document_name,
      completed_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    envelope.id,
    appId,
    envelope.userId || null,
    envelope.docusignEnvelopeId || null,
    envelope.contactId || null,
    envelope.status || 'sent',
    envelope.documentName || null,
    envelope.status === 'completed'
      ? (envelope.completedAt || new Date().toISOString())
      : (envelope.completedAt || null),
    envelope.createdAt || new Date().toISOString()
  );

  return getScopedRow(db, 'envelopes', appId, envelope.id, parseEnvelope);
}

function findEnvelope(db, appId, idOrEnvelopeId) {
  return parseEnvelope(
    db.prepare(
      'SELECT * FROM envelopes WHERE app_id = ? AND (id = ? OR docusign_envelope_id = ?)'
    ).get(appId, idOrEnvelopeId, idOrEnvelopeId)
  );
}

function updateEnvelope(db, appId, idOrEnvelopeId, envelope) {
  const existing = findEnvelope(db, appId, idOrEnvelopeId);
  if (!existing) {
    throw createError(404, 'Envelope not found');
  }

  const nextStatus = envelope.status || existing.status;
  db.prepare(`
    UPDATE envelopes SET
      user_id = COALESCE(?, user_id),
      docusign_envelope_id = COALESCE(?, docusign_envelope_id),
      contact_id = COALESCE(?, contact_id),
      status = COALESCE(?, status),
      document_name = COALESCE(?, document_name),
      completed_at = CASE
        WHEN ? = 'completed' THEN COALESCE(?, completed_at, CURRENT_TIMESTAMP)
        ELSE completed_at
      END
    WHERE id = ? AND app_id = ?
  `).run(
    envelope.userId,
    envelope.docusignEnvelopeId,
    envelope.contactId,
    envelope.status,
    envelope.documentName,
    nextStatus,
    envelope.completedAt || null,
    existing.id,
    appId
  );

  return getScopedRow(db, 'envelopes', appId, existing.id, parseEnvelope);
}

function createTask(db, appId, task) {
  const record = normalizeTaskRecord(task, {
    userId: task.userId,
    contactId: task.contactId,
    createdAt: task.createdAt
  });

  if (!record) {
    return null;
  }

  if (task.contactId) {
    const contact = requireScopedRow(db, 'contacts', appId, task.contactId, 'Contact', parseContact);
    updateRecordData(db, 'contacts', appId, contact.id, {
      ...contact.data,
      tasks: [...contact.data.tasks, record]
    }, normalizeData);
    return record;
  }

  if (task.userId) {
    const user = requireScopedRow(db, 'users', appId, task.userId, 'User', parseUser);
    updateRecordData(db, 'users', appId, user.id, {
      ...user.data,
      tasks: [...user.data.tasks, record]
    }, normalizeData);
    return record;
  }

  return null;
}

function createTasks(db, appId, contactId, tasks) {
  const contact = requireScopedRow(db, 'contacts', appId, contactId, 'Contact', parseContact);
  updateRecordData(db, 'contacts', appId, contact.id, {
    ...contact.data,
    tasks: [...contact.data.tasks, ...normalizeTasks(tasks, { contactId, userId: contact.owner_user_id })]
  }, normalizeData);
}

function findTaskContainer(db, appId, taskId) {
  const contactRows = db.prepare('SELECT id, app_id, data FROM contacts WHERE app_id = ?').all(appId);
  for (const row of contactRows) {
    const contact = parseContact(row);
    if (contact.data.tasks.some((task) => task.id === taskId)) {
      return { table: 'contacts', id: contact.id, data: contact.data };
    }
  }

  const userRows = db.prepare('SELECT id, app_id, data FROM users WHERE app_id = ?').all(appId);
  for (const row of userRows) {
    const user = parseUser(row);
    if (user.data.tasks.some((task) => task.id === taskId)) {
      return { table: 'users', id: user.id, data: user.data };
    }
  }

  return null;
}

function deleteTask(db, appId, taskId) {
  const container = findTaskContainer(db, appId, taskId);
  if (!container) {
    return false;
  }

  updateRecordData(db, container.table, appId, container.id, {
    ...container.data,
    tasks: container.data.tasks.filter((task) => task.id !== taskId)
  }, normalizeData);

  return true;
}

module.exports = {
  createContact,
  createEnvelope,
  createTask,
  createTasks,
  createUser,
  deleteContactCascade,
  deleteTask,
  ensureContactBelongsToApp,
  ensureUserBelongsToApp,
  findEnvelope,
  getContact,
  getContactDetails,
  getPrimaryUser,
  getScopedRow,
  getUser,
  listContacts,
  listUsers,
  requireScopedRow,
  updateContact,
  updateEnvelope,
  updateUser
};
