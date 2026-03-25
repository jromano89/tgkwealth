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

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ? AND app_id = ?').get(id, app.id);
    res.status(201).json(parseJsonFields(profile));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

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

    res.json({
      ...parseJsonFields(profile),
      records: records.map(parseJsonFields),
      envelopes: envelopes.map(parseJsonFields)
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

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

module.exports = router;
