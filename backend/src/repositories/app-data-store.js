const { createError, parseJsonFields, serializeJson } = require('../utils');

function buildListQuery(table, filters, orderBy) {
  let query = `SELECT * FROM ${table} WHERE app_id = ?`;
  if (filters.length > 0) {
    query += ` AND ${filters.join(' AND ')}`;
  }
  query += ` ORDER BY ${orderBy}`;
  return query;
}

function listScopedRows(db, table, appId, filters, params, orderBy = 'created_at DESC') {
  const query = buildListQuery(table, filters, orderBy);
  return db.prepare(query).all(appId, ...params).map(parseJsonFields);
}

function getScopedRow(db, table, appId, id) {
  return parseJsonFields(
    db.prepare(`SELECT * FROM ${table} WHERE id = ? AND app_id = ?`).get(id, appId)
  );
}

function requireScopedRow(db, table, appId, id, label) {
  const row = getScopedRow(db, table, appId, id);
  if (!row) {
    throw createError(404, `${label} not found`);
  }
  return row;
}

function ensureProfileBelongsToApp(db, appId, profileId) {
  if (!profileId) {
    return null;
  }

  const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND app_id = ?').get(profileId, appId);
  if (!profile) {
    throw createError(400, 'profileId must belong to the current app');
  }
  return profile.id;
}

function listProfiles(db, appId, filters = {}) {
  const where = [];
  const params = [];

  if (filters.kind) {
    where.push('kind = ?');
    params.push(filters.kind);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.source) {
    where.push('source = ?');
    params.push(filters.source);
  }
  if (filters.search) {
    where.push('(display_name LIKE ? OR email LIKE ? OR organization LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  return listScopedRows(db, 'profiles', appId, where, params);
}

function createProfile(db, appId, profile) {
  db.prepare(`
    INSERT INTO profiles (id, app_id, ref, kind, display_name, email, phone, organization, status, tags, data, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    profile.id,
    appId,
    profile.ref || null,
    profile.kind || 'profile',
    profile.displayName,
    profile.email || null,
    profile.phone || null,
    profile.organization || null,
    profile.status || 'active',
    serializeJson(profile.tags || []),
    serializeJson(profile.data || {}),
    profile.source || 'api'
  );

  return getScopedRow(db, 'profiles', appId, profile.id);
}

function updateProfile(db, appId, profileId, profile) {
  db.prepare(`
    UPDATE profiles SET
      ref = COALESCE(?, ref),
      kind = COALESCE(?, kind),
      display_name = COALESCE(?, display_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      organization = COALESCE(?, organization),
      status = COALESCE(?, status),
      tags = COALESCE(?, tags),
      data = COALESCE(?, data),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND app_id = ?
  `).run(
    profile.ref,
    profile.kind,
    profile.displayName,
    profile.email,
    profile.phone,
    profile.organization,
    profile.status,
    profile.tags !== undefined ? serializeJson(profile.tags) : null,
    profile.data !== undefined ? serializeJson(profile.data) : null,
    profileId,
    appId
  );

  return getScopedRow(db, 'profiles', appId, profileId);
}

function getProfileDetails(db, appId, profileId) {
  const profile = requireScopedRow(db, 'profiles', appId, profileId, 'Profile');
  const records = db.prepare(
    'SELECT * FROM records WHERE profile_id = ? AND app_id = ? ORDER BY created_at DESC'
  ).all(profile.id, appId).map(parseJsonFields);
  const envelopes = db.prepare(
    'SELECT * FROM envelopes WHERE profile_id = ? AND app_id = ? ORDER BY created_at DESC'
  ).all(profile.id, appId).map(parseJsonFields);
  const tasks = db.prepare(
    'SELECT * FROM tasks WHERE profile_id = ? AND app_id = ? ORDER BY created_at ASC'
  ).all(profile.id, appId);

  return {
    ...profile,
    records,
    envelopes,
    tasks
  };
}

function deleteProfileCascade(db, appId, profileId) {
  db.prepare('DELETE FROM tasks WHERE profile_id = ? AND app_id = ?').run(profileId, appId);
  db.prepare('DELETE FROM envelopes WHERE profile_id = ? AND app_id = ?').run(profileId, appId);
  db.prepare('DELETE FROM records WHERE profile_id = ? AND app_id = ?').run(profileId, appId);
  db.prepare('DELETE FROM profiles WHERE id = ? AND app_id = ?').run(profileId, appId);
}

function listRecords(db, appId, filters = {}) {
  const where = [];
  const params = [];

  if (filters.kind) {
    where.push('kind = ?');
    params.push(filters.kind);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.source) {
    where.push('source = ?');
    params.push(filters.source);
  }
  if (filters.profileId) {
    where.push('profile_id = ?');
    params.push(filters.profileId);
  }
  if (filters.search) {
    where.push('title LIKE ?');
    params.push(`%${filters.search}%`);
  }

  return listScopedRows(db, 'records', appId, where, params);
}

function createRecord(db, appId, record) {
  db.prepare(`
    INSERT INTO records (id, app_id, profile_id, ref, kind, title, status, data, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    appId,
    record.profileId || null,
    record.ref || null,
    record.kind || 'record',
    record.title,
    record.status || 'active',
    serializeJson(record.data || {}),
    record.source || 'api'
  );

  return getScopedRow(db, 'records', appId, record.id);
}

function updateRecord(db, appId, recordId, record) {
  db.prepare(`
    UPDATE records SET
      ref = COALESCE(?, ref),
      profile_id = COALESCE(?, profile_id),
      kind = COALESCE(?, kind),
      title = COALESCE(?, title),
      status = COALESCE(?, status),
      data = COALESCE(?, data),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND app_id = ?
  `).run(
    record.ref,
    record.profileId,
    record.kind,
    record.title,
    record.status,
    record.data !== undefined ? serializeJson(record.data) : null,
    recordId,
    appId
  );

  return getScopedRow(db, 'records', appId, recordId);
}

function getRecordDetails(db, appId, recordId) {
  const record = requireScopedRow(db, 'records', appId, recordId, 'Record');
  const envelopes = db.prepare(
    'SELECT * FROM envelopes WHERE record_id = ? AND app_id = ? ORDER BY created_at DESC'
  ).all(record.id, appId).map(parseJsonFields);

  return {
    ...record,
    envelopes
  };
}

function createEnvelope(db, appId, envelope) {
  db.prepare(`
    INSERT INTO envelopes (id, app_id, docusign_envelope_id, profile_id, record_id, template_id, template_name, status, metadata, source, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    envelope.id,
    appId,
    envelope.docusignEnvelopeId || null,
    envelope.profileId || null,
    envelope.recordId || null,
    envelope.templateId || null,
    envelope.templateName || null,
    envelope.status || 'sent',
    serializeJson(envelope.metadata || {}),
    envelope.source || 'api'
  );

  return getScopedRow(db, 'envelopes', appId, envelope.id);
}

function findEnvelope(db, appId, idOrEnvelopeId) {
  return parseJsonFields(
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

  db.prepare(`
    UPDATE envelopes SET
      docusign_envelope_id = COALESCE(?, docusign_envelope_id),
      profile_id = COALESCE(?, profile_id),
      record_id = COALESCE(?, record_id),
      template_name = COALESCE(?, template_name),
      status = COALESCE(?, status),
      metadata = COALESCE(?, metadata),
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
    WHERE id = ?
  `).run(
    envelope.docusignEnvelopeId,
    envelope.profileId,
    envelope.recordId,
    envelope.templateName,
    envelope.status,
    envelope.metadata !== undefined ? serializeJson(envelope.metadata) : null,
    envelope.status || existing.status,
    existing.id
  );

  return getScopedRow(db, 'envelopes', appId, existing.id);
}

function updateEnvelopeStatus(db, appId, envelopeId, status) {
  db.prepare(`
    UPDATE envelopes SET
      status = ?,
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
    WHERE id = ? AND app_id = ?
  `).run(status, status, envelopeId, appId);

  return getScopedRow(db, 'envelopes', appId, envelopeId);
}

function listEnvelopes(db, appId, filters = {}) {
  const where = [];
  const params = [];

  if (filters.source) {
    const sources = String(filters.source)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (sources.length > 0) {
      where.push(`source IN (${sources.map(() => '?').join(',')})`);
      params.push(...sources);
    }
  }
  if (filters.profileId) {
    where.push('profile_id = ?');
    params.push(filters.profileId);
  }
  if (filters.recordId) {
    where.push('record_id = ?');
    params.push(filters.recordId);
  }

  return listScopedRows(db, 'envelopes', appId, where, params);
}

function addTasks(db, appId, profileId, tasks) {
  const insertTask = db.prepare(
    'INSERT INTO tasks (id, app_id, profile_id, title, description) VALUES (?, ?, ?, ?, ?)'
  );

  for (const task of tasks) {
    insertTask.run(task.id, appId, profileId, task.title, task.description || null);
  }
}

function deleteTask(db, appId, taskId) {
  db.prepare('DELETE FROM tasks WHERE id = ? AND app_id = ?').run(taskId, appId);
}

function resetAppData(db, appId) {
  db.prepare('DELETE FROM webhook_events WHERE app_id = ?').run(appId);
  db.prepare('DELETE FROM tasks WHERE app_id = ?').run(appId);
  db.prepare('DELETE FROM envelopes WHERE app_id = ?').run(appId);
  db.prepare('DELETE FROM records WHERE app_id = ?').run(appId);
  db.prepare('DELETE FROM profiles WHERE app_id = ?').run(appId);
}

function insertBootstrapProfiles(db, appId, profiles) {
  const profileIdByRef = new Map();
  const insertProfile = db.prepare(`
    INSERT INTO profiles (id, app_id, ref, kind, display_name, email, phone, organization, status, tags, data, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bootstrap')
  `);

  for (const profile of profiles) {
    insertProfile.run(
      profile.id,
      appId,
      profile.ref,
      profile.kind || 'profile',
      profile.displayName,
      profile.email || null,
      profile.phone || null,
      profile.organization || null,
      profile.status || 'active',
      serializeJson(profile.tags || []),
      serializeJson(profile.data || {})
    );
    profileIdByRef.set(profile.ref, profile.id);
  }

  return profileIdByRef;
}

function insertBootstrapRecords(db, appId, records, profileIdByRef) {
  const insertRecord = db.prepare(`
    INSERT INTO records (id, app_id, profile_id, ref, kind, title, status, data, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bootstrap')
  `);

  for (const record of records) {
    const profileId = record.profileRef ? profileIdByRef.get(record.profileRef) : null;
    insertRecord.run(
      record.id,
      appId,
      profileId,
      record.ref,
      record.kind || 'record',
      record.title,
      record.status || 'active',
      serializeJson(record.data || {})
    );
  }
}

module.exports = {
  addTasks,
  createEnvelope,
  createProfile,
  createRecord,
  deleteProfileCascade,
  deleteTask,
  ensureProfileBelongsToApp,
  findEnvelope,
  getProfileDetails,
  getRecordDetails,
  getScopedRow,
  insertBootstrapProfiles,
  insertBootstrapRecords,
  listEnvelopes,
  listProfiles,
  listRecords,
  requireScopedRow,
  resetAppData,
  updateEnvelope,
  updateEnvelopeStatus,
  updateProfile,
  updateRecord
};
