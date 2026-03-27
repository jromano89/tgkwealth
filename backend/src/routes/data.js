const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { createError, getRequiredApp, parseJsonFields, serializeJson } = require('../utils');

const router = express.Router();

/**
 * @swagger
 * /api/data/profiles:
 *   get:
 *     summary: List app-scoped profiles
 *     tags: [Data]
 */
router.get('/profiles', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const { kind, status, source, search } = req.query;
    let query = 'SELECT * FROM profiles WHERE app_id = ?';
    const params = [app.id];

    if (kind) {
      query += ' AND kind = ?';
      params.push(kind);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }
    if (search) {
      query += ' AND (display_name LIKE ? OR email LIKE ? OR organization LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows.map(parseJsonFields));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/profiles:
 *   post:
 *     summary: Create an app-scoped profile
 *     tags: [Data]
 */
router.post('/profiles', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const id = req.body.id || uuidv4();
    const { ref, kind, displayName, email, phone, organization, status, tags, data, source } = req.body;

    if (!displayName) {
      throw createError(400, 'displayName is required');
    }

    db.prepare(`
      INSERT INTO profiles (id, app_id, ref, kind, display_name, email, phone, organization, status, tags, data, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      app.id,
      ref || null,
      kind || 'profile',
      displayName,
      email || null,
      phone || null,
      organization || null,
      status || 'active',
      serializeJson(tags || []),
      serializeJson(data || {}),
      source || 'api'
    );

    // Auto-create default tasks for new profiles
    const defaultTasks = req.body.tasks || [
      { title: 'Begin Asset Transfer', description: 'Initiate the transfer of assets from your external accounts to your new brokerage account.' }
    ];
    for (const task of defaultTasks) {
      db.prepare('INSERT INTO tasks (id, app_id, profile_id, title, description) VALUES (?, ?, ?, ?, ?)')
        .run(uuidv4(), app.id, id, task.title, task.description || null);
    }

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ? AND app_id = ?').get(id, app.id);
    res.status(201).json(parseJsonFields(profile));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/profiles/{id}:
 *   get:
 *     summary: Get one profile with related records and envelopes
 *     tags: [Data]
 */
router.get('/profiles/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ? AND app_id = ?').get(req.params.id, app.id);

    if (!profile) {
      throw createError(404, 'Profile not found');
    }

    const records = db.prepare('SELECT * FROM records WHERE profile_id = ? AND app_id = ? ORDER BY created_at DESC').all(profile.id, app.id);
    const envelopes = db.prepare('SELECT * FROM envelopes WHERE profile_id = ? AND app_id = ? ORDER BY created_at DESC').all(profile.id, app.id);
    const tasks = db.prepare('SELECT * FROM tasks WHERE profile_id = ? AND app_id = ? ORDER BY created_at ASC').all(profile.id, app.id);

    res.json({
      ...parseJsonFields(profile),
      records: records.map(parseJsonFields),
      envelopes: envelopes.map(parseJsonFields),
      tasks
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/profiles/{id}:
 *   put:
 *     summary: Update an app-scoped profile
 *     tags: [Data]
 */
router.put('/profiles/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const existing = db.prepare('SELECT * FROM profiles WHERE id = ? AND app_id = ?').get(req.params.id, app.id);

    if (!existing) {
      throw createError(404, 'Profile not found');
    }

    const { ref, kind, displayName, email, phone, organization, status, tags, data } = req.body;

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
      ref,
      kind,
      displayName,
      email,
      phone,
      organization,
      status,
      tags !== undefined ? serializeJson(tags) : null,
      data !== undefined ? serializeJson(data) : null,
      req.params.id,
      app.id
    );

    const updated = db.prepare('SELECT * FROM profiles WHERE id = ? AND app_id = ?').get(req.params.id, app.id);
    res.json(parseJsonFields(updated));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/profiles/{id}:
 *   delete:
 *     summary: Delete a profile and its related records and envelopes
 *     tags: [Data]
 */
router.delete('/profiles/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND app_id = ?').get(req.params.id, app.id);
    if (!profile) throw createError(404, 'Profile not found');

    db.prepare('DELETE FROM tasks WHERE profile_id = ? AND app_id = ?').run(profile.id, app.id);
    db.prepare('DELETE FROM envelopes WHERE profile_id = ? AND app_id = ?').run(profile.id, app.id);
    db.prepare('DELETE FROM records WHERE profile_id = ? AND app_id = ?').run(profile.id, app.id);
    db.prepare('DELETE FROM profiles WHERE id = ? AND app_id = ?').run(profile.id, app.id);

    res.json({ deleted: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/records:
 *   get:
 *     summary: List app-scoped records
 *     tags: [Data]
 */
router.get('/records', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const { kind, status, source, profileId, search } = req.query;
    let query = 'SELECT * FROM records WHERE app_id = ?';
    const params = [app.id];

    if (kind) {
      query += ' AND kind = ?';
      params.push(kind);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }
    if (profileId) {
      query += ' AND profile_id = ?';
      params.push(profileId);
    }
    if (search) {
      query += ' AND title LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows.map(parseJsonFields));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/records:
 *   post:
 *     summary: Create an app-scoped record
 *     tags: [Data]
 */
router.post('/records', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const id = req.body.id || uuidv4();
    const { ref, profileId, kind, title, status, data, source } = req.body;

    if (!title) {
      throw createError(400, 'title is required');
    }

    if (profileId) {
      const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND app_id = ?').get(profileId, app.id);
      if (!profile) {
        throw createError(400, 'profileId must belong to the current app');
      }
    }

    db.prepare(`
      INSERT INTO records (id, app_id, profile_id, ref, kind, title, status, data, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      app.id,
      profileId || null,
      ref || null,
      kind || 'record',
      title,
      status || 'active',
      serializeJson(data || {}),
      source || 'api'
    );

    const record = db.prepare('SELECT * FROM records WHERE id = ? AND app_id = ?').get(id, app.id);
    res.status(201).json(parseJsonFields(record));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/records/{id}:
 *   get:
 *     summary: Get one record with related envelopes
 *     tags: [Data]
 */
router.get('/records/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const record = db.prepare('SELECT * FROM records WHERE id = ? AND app_id = ?').get(req.params.id, app.id);

    if (!record) {
      throw createError(404, 'Record not found');
    }

    const envelopes = db.prepare('SELECT * FROM envelopes WHERE record_id = ? AND app_id = ? ORDER BY created_at DESC').all(record.id, app.id);
    res.json({
      ...parseJsonFields(record),
      envelopes: envelopes.map(parseJsonFields)
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/records/{id}:
 *   put:
 *     summary: Update an app-scoped record
 *     tags: [Data]
 */
router.put('/records/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const existing = db.prepare('SELECT * FROM records WHERE id = ? AND app_id = ?').get(req.params.id, app.id);

    if (!existing) {
      throw createError(404, 'Record not found');
    }

    const { ref, profileId, kind, title, status, data } = req.body;
    if (profileId) {
      const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND app_id = ?').get(profileId, app.id);
      if (!profile) {
        throw createError(400, 'profileId must belong to the current app');
      }
    }

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
      ref,
      profileId,
      kind,
      title,
      status,
      data !== undefined ? serializeJson(data) : null,
      req.params.id,
      app.id
    );

    const updated = db.prepare('SELECT * FROM records WHERE id = ? AND app_id = ?').get(req.params.id, app.id);
    res.json(parseJsonFields(updated));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Envelopes (tracking-only CRUD — no Docusign call) ─────────────────

/**
 * @swagger
 * /api/data/envelopes:
 *   post:
 *     summary: Create an envelope tracking row (no Docusign call)
 *     tags: [Data]
 */
router.post('/envelopes', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const id = req.body.id || uuidv4();
    const { docusignEnvelopeId, profileId, recordId, templateId, templateName, status, metadata, source } = req.body;

    if (profileId) {
      const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND app_id = ?').get(profileId, app.id);
      if (!profile) throw createError(400, 'profileId must belong to the current app');
    }

    db.prepare(`
      INSERT INTO envelopes (id, app_id, docusign_envelope_id, profile_id, record_id, template_id, template_name, status, metadata, source, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id, app.id,
      docusignEnvelopeId || null,
      profileId || null,
      recordId || null,
      templateId || null,
      templateName || null,
      status || 'sent',
      serializeJson(metadata || {}),
      source || 'api'
    );

    const envelope = db.prepare('SELECT * FROM envelopes WHERE id = ? AND app_id = ?').get(id, app.id);
    res.status(201).json(parseJsonFields(envelope));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/envelopes/{id}:
 *   put:
 *     summary: Update an envelope tracking row
 *     tags: [Data]
 */
router.put('/envelopes/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const existing = db.prepare('SELECT * FROM envelopes WHERE app_id = ? AND (id = ? OR docusign_envelope_id = ?)').get(app.id, req.params.id, req.params.id);

    if (!existing) throw createError(404, 'Envelope not found');

    const { docusignEnvelopeId, profileId, recordId, templateName, status, metadata } = req.body;

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
      docusignEnvelopeId,
      profileId,
      recordId,
      templateName,
      status,
      metadata !== undefined ? serializeJson(metadata) : null,
      status || existing.status,
      existing.id
    );

    const updated = db.prepare('SELECT * FROM envelopes WHERE id = ?').get(existing.id);
    res.json(parseJsonFields(updated));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/data/tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Data]
 */
router.delete('/tasks/:id', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND app_id = ?').get(req.params.id, app.id);
    if (!task) throw createError(404, 'Task not found');

    db.prepare('DELETE FROM tasks WHERE id = ? AND app_id = ?').run(task.id, app.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
