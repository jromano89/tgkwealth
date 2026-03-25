const express = require('express');
const { getDb } = require('../db/database');
const router = express.Router();

function parseWebhookPayload(body) {
  if (Buffer.isBuffer(body)) {
    return {
      raw: body.toString('utf-8'),
      data: JSON.parse(body.toString('utf-8'))
    };
  }

  if (typeof body === 'string') {
    return {
      raw: body,
      data: JSON.parse(body)
    };
  }

  if (body && typeof body === 'object') {
    return {
      raw: JSON.stringify(body),
      data: body
    };
  }

  throw new Error('Invalid JSON payload');
}

/**
 * @swagger
 * /api/webhooks/docusign:
 *   post:
 *     summary: Docusign Connect webhook receiver
 *     tags: [Webhooks]
 *     description: Receives envelope status updates from Docusign Connect
 */
router.post('/docusign', express.raw({ type: () => true, limit: '2mb' }), (req, res) => {
  try {
    const db = getDb();
    const { raw: payload, data } = parseWebhookPayload(req.body);

    const envelopeId = data.envelopeId || data.data?.envelopeId;
    const eventType = data.event || data.eventType || 'unknown';
    const status = data.status || data.data?.envelopeSummary?.status;

    if (!envelopeId) {
      return res.status(400).json({ error: 'Missing envelopeId in payload' });
    }

    const envelope = db.prepare('SELECT app_id FROM envelopes WHERE docusign_envelope_id = ?').get(envelopeId);
    db.prepare(
      'INSERT INTO webhook_events (app_id, docusign_envelope_id, event_type, payload) VALUES (?, ?, ?, ?)'
    ).run(envelope?.app_id || null, envelopeId, eventType, payload);

    if (status) {
      const completedAt = status === 'completed' ? new Date().toISOString() : null;
      db.prepare(`
        UPDATE envelopes SET
          status = ?,
          completed_at = COALESCE(?, completed_at)
        WHERE docusign_envelope_id = ?
      `).run(status, completedAt, envelopeId);
    }

    res.json({ success: true, envelopeId, event: eventType });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
