const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { createError, getAppBySlug, getAppConfigFromRequest, getAppSlug, getAppStats, getConnectionForApp, parseJsonFields, serializeJson, upsertApp } = require('../utils');

const router = express.Router();

/**
 * @swagger
 * /api/apps/current:
 *   get:
 *     summary: Get the current demo app and connection state
 *     tags: [Apps]
 */
router.get('/current', (req, res) => {
  const db = getDb();
  const slug = getAppSlug(req);

  if (!slug) {
    return res.json({ app: null, connection: null, stats: null });
  }

  const app = getAppBySlug(db, slug);
  if (!app) {
    return res.json({ app: null, connection: null, stats: null, slug });
  }

  res.json({
    app,
    connection: getConnectionForApp(db, app.id),
    stats: getAppStats(db, app.id)
  });
});

/**
 * @swagger
 * /api/apps/bootstrap:
 *   post:
 *     summary: Initialize or reset an app's bootstrap data
 *     tags: [Apps]
 */
router.post('/bootstrap', (req, res) => {
  const db = getDb();

  try {
    const appConfig = getAppConfigFromRequest(req);
    if (!appConfig.slug) {
      throw createError(400, 'Bootstrap requires app.slug');
    }

    const profiles = Array.isArray(req.body?.profiles) ? req.body.profiles : [];
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    const existingApp = getAppBySlug(db, appConfig.slug);
    const app = upsertApp(db, appConfig);
    const stats = getAppStats(db, app.id);
    const sameVersion = existingApp && existingApp.bootstrap_version && existingApp.bootstrap_version === (appConfig.bootstrapVersion || null);
    const hasData = stats.profiles > 0 || stats.records > 0;

    if (sameVersion && hasData) {
      return res.json({
        app,
        bootstrapped: false,
        reason: 'already-current',
        stats,
        connection: getConnectionForApp(db, app.id)
      });
    }

    const bootstrap = db.transaction(() => {
      db.prepare('DELETE FROM webhook_events WHERE app_id = ?').run(app.id);
      db.prepare('DELETE FROM envelopes WHERE app_id = ?').run(app.id);
      db.prepare('DELETE FROM records WHERE app_id = ?').run(app.id);
      db.prepare('DELETE FROM profiles WHERE app_id = ?').run(app.id);

      const profileIdByRef = new Map();
      const insertProfile = db.prepare(`
        INSERT INTO profiles (id, app_id, ref, kind, display_name, email, phone, organization, status, tags, data, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bootstrap')
      `);
      const insertRecord = db.prepare(`
        INSERT INTO records (id, app_id, profile_id, ref, kind, title, status, data, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bootstrap')
      `);

      for (const profile of profiles) {
        if (!profile?.ref || !profile?.displayName) {
          throw createError(400, 'Each bootstrap profile requires ref and displayName');
        }

        const id = uuidv4();
        insertProfile.run(
          id,
          app.id,
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
        profileIdByRef.set(profile.ref, id);
      }

      for (const record of records) {
        if (!record?.ref || !record?.title) {
          throw createError(400, 'Each bootstrap record requires ref and title');
        }

        const profileId = record.profileRef ? profileIdByRef.get(record.profileRef) : null;
        if (record.profileRef && !profileId) {
          throw createError(400, `Bootstrap record references unknown profileRef: ${record.profileRef}`);
        }

        insertRecord.run(
          uuidv4(),
          app.id,
          profileId,
          record.ref,
          record.kind || 'record',
          record.title,
          record.status || 'active',
          serializeJson(record.data || {})
        );
      }
    });

    bootstrap();

    res.json({
      app: parseJsonFields(app),
      bootstrapped: true,
      stats: getAppStats(db, app.id),
      connection: getConnectionForApp(db, app.id)
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
