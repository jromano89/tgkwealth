const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireDocusignConnection } = require('../middleware/docusign-connection');
const { createError, getConnectionForApp, getRequiredApp, parseJsonFields } = require('../utils');
const envelopeService = require('../services/docusign-envelopes');
const router = express.Router();

function findEnvelope(db, appId, idOrEnvelopeId) {
  return db.prepare('SELECT * FROM envelopes WHERE app_id = ? AND (id = ? OR docusign_envelope_id = ?)')
    .get(appId, idOrEnvelopeId, idOrEnvelopeId);
}

/**
 * @swagger
 * /api/envelopes:
 *   post:
 *     summary: Create and send an envelope
 *     tags: [Envelopes]
 */
router.post('/', requireDocusignConnection, async (req, res) => {
  try {
    const db = getDb();
    const { userId, accountId } = req.docusign;
    const { envelopeDefinition, profileId, recordId, templateName, source } = req.body;

    // Create envelope in Docusign
    const result = await envelopeService.createEnvelope(userId, accountId, envelopeDefinition);

    // Track in our DB
    const id = uuidv4();
    db.prepare(`
      INSERT INTO envelopes (id, app_id, docusign_envelope_id, profile_id, record_id, template_id, template_name, status, sent_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(
      id, req.demoApp.id,
      result.envelopeId,
      profileId || null,
      recordId || null,
      envelopeDefinition.templateId || null,
      templateName || null,
      result.status || 'sent',
      source || 'api'
    );

    res.status(201).json({
      id,
      docusignEnvelopeId: result.envelopeId,
      status: result.status,
      statusDateTime: result.statusDateTime
    });
  } catch (err) {
    console.error('Create envelope error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes:
 *   get:
 *     summary: List tracked envelopes
 *     tags: [Envelopes]
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const app = getRequiredApp(db, req);
    const { source, profileId, recordId } = req.query;

    let query = 'SELECT * FROM envelopes WHERE app_id = ?';
    const params = [app.id];

    if (source) {
      const sources = source.split(',').map(s => s.trim());
      query += ` AND source IN (${sources.map(() => '?').join(',')})`;
      params.push(...sources);
    }
    if (profileId) {
      query += ' AND profile_id = ?';
      params.push(profileId);
    }
    if (recordId) {
      query += ' AND record_id = ?';
      params.push(recordId);
    }

    query += ' ORDER BY created_at DESC';
    const envelopes = db.prepare(query).all(...params);
    res.json(envelopes.map(parseJsonFields));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes/{id}:
 *   get:
 *     summary: Get envelope details (from DB + optionally refresh from Docusign)
 *     tags: [Envelopes]
 */
router.get('/:id', async (req, res) => {
  const db = getDb();

  try {
    const app = getRequiredApp(db, req);
    const envelope = findEnvelope(db, app.id, req.params.id);

    if (!envelope) throw createError(404, 'Envelope not found');

    const connection = getConnectionForApp(db, app.id);
    if (connection?.docusign_account_id && envelope.docusign_envelope_id) {
      try {
        const live = await envelopeService.getEnvelope(
          connection.docusign_user_id,
          connection.docusign_account_id,
          envelope.docusign_envelope_id
        );
        if (live.status !== envelope.status) {
          db.prepare('UPDATE envelopes SET status = ?, completed_at = CASE WHEN ? = \'completed\' THEN datetime(\'now\') ELSE completed_at END WHERE id = ?')
            .run(live.status, live.status, envelope.id);
          envelope.status = live.status;
        }
      } catch (err) {
        console.warn('Could not refresh envelope status:', err.message);
      }
    }

    res.json(parseJsonFields(envelope));
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes/{id}/signing-url:
 *   post:
 *     summary: Generate embedded signing URL
 *     tags: [Envelopes]
 */
router.post('/:id/signing-url', requireDocusignConnection, async (req, res) => {
  try {
    const db = getDb();
    const { userId, accountId } = req.docusign;
    const envelope = findEnvelope(db, req.demoApp.id, req.params.id);

    if (!envelope || !envelope.docusign_envelope_id) {
      return res.status(404).json({ error: 'Envelope not found or not linked to Docusign' });
    }

    const { recipientEmail, recipientName, returnUrl, clientUserId } = req.body;

    const result = await envelopeService.getSigningUrl(
      userId,
      accountId,
      envelope.docusign_envelope_id,
      {
        email: recipientEmail,
        userName: recipientName,
        returnUrl: returnUrl || `${req.headers.referer || '/'}?signing=complete`,
        clientUserId: clientUserId,
        authenticationMethod: 'none'
      }
    );

    res.json({ url: result.url });
  } catch (err) {
    console.error('Signing URL error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes/{id}/console-view:
 *   post:
 *     summary: Generate embedded console view URL (no login required)
 *     tags: [Envelopes]
 */
router.post('/:id/console-view', requireDocusignConnection, async (req, res) => {
  try {
    const db = getDb();
    const { userId, accountId } = req.docusign;
    const envelope = findEnvelope(db, req.demoApp.id, req.params.id);

    if (!envelope || !envelope.docusign_envelope_id) {
      return res.status(404).json({ error: 'Envelope not found or not linked to Docusign' });
    }

    const result = await envelopeService.getConsoleViewUrl(
      userId, accountId, envelope.docusign_envelope_id,
      req.body.returnUrl || `${req.headers.referer || '/'}`
    );

    res.json({ url: result.url });
  } catch (err) {
    console.error('Console view error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes/{id}/documents:
 *   get:
 *     summary: List envelope documents
 *     tags: [Envelopes]
 */
router.get('/:id/documents', requireDocusignConnection, async (req, res) => {
  try {
    const db = getDb();
    const { userId, accountId } = req.docusign;
    const envelope = findEnvelope(db, req.demoApp.id, req.params.id);

    if (!envelope || !envelope.docusign_envelope_id) {
      return res.status(404).json({ error: 'Envelope not found or not linked to Docusign' });
    }

    const result = await envelopeService.getDocuments(userId, accountId, envelope.docusign_envelope_id);
    res.json(result);
  } catch (err) {
    console.error('Documents error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes/{id}/audit-events:
 *   get:
 *     summary: Get envelope audit events/history
 *     tags: [Envelopes]
 */
router.get('/:id/audit-events', requireDocusignConnection, async (req, res) => {
  try {
    const db = getDb();
    const { userId, accountId } = req.docusign;
    const envelope = findEnvelope(db, req.demoApp.id, req.params.id);

    if (!envelope || !envelope.docusign_envelope_id) {
      return res.status(404).json({ error: 'Envelope not found or not linked to Docusign' });
    }

    const result = await envelopeService.getAuditEvents(userId, accountId, envelope.docusign_envelope_id);
    res.json(result);
  } catch (err) {
    console.error('Audit events error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/envelopes/{id}/documents/{documentId}/download:
 *   get:
 *     summary: Download a specific document from an envelope
 *     tags: [Envelopes]
 */
router.get('/:id/documents/:documentId/download', requireDocusignConnection, async (req, res) => {
  try {
    const db = getDb();
    const { userId, accountId } = req.docusign;
    const envelope = findEnvelope(db, req.demoApp.id, req.params.id);

    if (!envelope || !envelope.docusign_envelope_id) {
      return res.status(404).json({ error: 'Envelope not found or not linked to Docusign' });
    }

    const { buffer, contentType, contentDisposition } = await envelopeService.downloadDocument(
      userId, accountId, envelope.docusign_envelope_id, req.params.documentId
    );
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (err) {
    console.error('Document download error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
