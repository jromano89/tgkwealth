const { createError, parseJsonFields, serializeJson } = require('./utils');

function normalizeContactData(data) {
  const normalized = data && typeof data === 'object' && !Array.isArray(data)
    ? { ...data }
    : {};

  if (!Array.isArray(normalized.accounts)) {
    normalized.accounts = [];
  }

  return normalized;
}

function parseUser(row) {
  return parseJsonFields(row);
}

function parseContact(row) {
  if (!row) {
    return row;
  }

  const parsed = parseJsonFields(row);
  return {
    ...parsed,
    data: normalizeContactData(parsed.data)
  };
}

function parseEnvelope(row) {
  return row ? { ...row } : row;
}

function parseTask(row) {
  return row ? { ...row } : row;
}

function buildListQuery(table, filters, orderBy) {
  let query = `SELECT * FROM ${table} WHERE app_id = ?`;
  if (filters.length > 0) {
    query += ` AND ${filters.join(' AND ')}`;
  }
  query += ` ORDER BY ${orderBy}`;
  return query;
}

function listScopedRows(db, table, appId, filters, params, parseRow, orderBy = 'created_at DESC') {
  const query = buildListQuery(table, filters, orderBy);
  return db.prepare(query).all(appId, ...params).map(parseRow);
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

function getPrimaryUser(db, appId) {
  return parseUser(
    db.prepare('SELECT * FROM users WHERE app_id = ? ORDER BY created_at ASC LIMIT 1').get(appId)
  );
}

function ensureUserBelongsToApp(db, appId, userId) {
  if (!userId) {
    return null;
  }

  const user = getScopedRow(db, 'users', appId, userId, parseUser);
  if (!user) {
    throw createError(400, 'ownerUserId must belong to the current app');
  }

  return user;
}

function ensureContactBelongsToApp(db, appId, contactId) {
  if (!contactId) {
    return null;
  }

  const contact = getScopedRow(db, 'contacts', appId, contactId, parseContact);
  if (!contact) {
    throw createError(400, 'contactId must belong to the current app');
  }

  return contact;
}

function listUsers(db, appId, filters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    where.push('(display_name LIKE ? OR email LIKE ? OR title LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'users', appId, where, params, parseUser);
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
    serializeJson(user.data || {})
  );

  return getScopedRow(db, 'users', appId, user.id, parseUser);
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
    user.data !== undefined ? serializeJson(user.data) : null,
    userId,
    appId
  );

  return getScopedRow(db, 'users', appId, userId, parseUser);
}

function listContacts(db, appId, filters = {}) {
  const where = [];
  const params = [];

  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.source) {
    where.push('source = ?');
    params.push(filters.source);
  }
  if (filters.ownerUserId) {
    where.push('owner_user_id = ?');
    params.push(filters.ownerUserId);
  }
  if (filters.search) {
    where.push('(display_name LIKE ? OR email LIKE ? OR organization LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'contacts', appId, where, params, parseContact);
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
    contact.ownerUserId || null,
    contact.ref || null,
    contact.displayName,
    contact.email || null,
    contact.phone || null,
    contact.organization || null,
    contact.status || 'active',
    serializeJson(normalizeContactData(contact.data)),
    contact.source || 'api'
  );

  return getScopedRow(db, 'contacts', appId, contact.id, parseContact);
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
    contact.data !== undefined ? serializeJson(normalizeContactData(contact.data)) : null,
    contactId,
    appId
  );

  return getScopedRow(db, 'contacts', appId, contactId, parseContact);
}

function getContactDetails(db, appId, contactId) {
  const contact = requireScopedRow(db, 'contacts', appId, contactId, 'Contact', parseContact);
  const owner = contact.owner_user_id
    ? getScopedRow(db, 'users', appId, contact.owner_user_id, parseUser)
    : null;
  const envelopes = db.prepare(
    'SELECT * FROM envelopes WHERE contact_id = ? AND app_id = ? ORDER BY created_at DESC'
  ).all(contact.id, appId).map(parseEnvelope);
  const tasks = db.prepare(
    'SELECT * FROM tasks WHERE contact_id = ? AND app_id = ? ORDER BY created_at ASC'
  ).all(contact.id, appId).map(parseTask);

  return {
    ...contact,
    owner,
    envelopes,
    tasks
  };
}

function deleteContactCascade(db, appId, contactId) {
  db.prepare('DELETE FROM tasks WHERE contact_id = ? AND app_id = ?').run(contactId, appId);
  db.prepare('DELETE FROM envelopes WHERE contact_id = ? AND app_id = ?').run(contactId, appId);
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    envelope.id,
    appId,
    envelope.userId || null,
    envelope.docusignEnvelopeId || null,
    envelope.contactId || null,
    envelope.status || 'sent',
    envelope.documentName || null,
    envelope.status === 'completed' ? (envelope.completedAt || new Date().toISOString()) : (envelope.completedAt || null),
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
  db.prepare(`
    INSERT INTO tasks (id, app_id, user_id, contact_id, title, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    appId,
    task.userId || null,
    task.contactId || null,
    task.title,
    task.description || null,
    task.status || 'pending'
  );

  return getScopedRow(db, 'tasks', appId, task.id, parseTask);
}

function createTasks(db, appId, contactId, tasks) {
  const insertTask = db.prepare(
    'INSERT INTO tasks (id, app_id, user_id, contact_id, title, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  for (const task of tasks) {
    insertTask.run(task.id, appId, task.userId || null, contactId || null, task.title, task.description || null, task.status || 'pending');
  }
}

function deleteTask(db, appId, taskId) {
  db.prepare('DELETE FROM tasks WHERE id = ? AND app_id = ?').run(taskId, appId);
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
  getContactDetails,
  getPrimaryUser,
  listContacts,
  listUsers,
  requireScopedRow,
  updateContact,
  updateEnvelope,
  updateUser
};
