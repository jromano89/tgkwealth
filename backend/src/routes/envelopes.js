const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireDocusignConnection } = require('../middleware/docusign-connection');
const { createError, getConnectionForApp, getRequiredApp } = require('../utils');
const appDataStore = require('../repositories/app-data-store');
const envelopeService = require('../services/docusign-envelopes');

const router = express.Router();

function sendRouteError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message });
}

function createAsyncRoute(handler) {
  return async function asyncRouteHandler(req, res) {
    try {
      await handler(req, res);
    } catch (error) {
      sendRouteError(res, error);
    }
  };
}

function getEnvelopeOrThrow(db, appId, idOrEnvelopeId) {
  const envelope = appDataStore.findEnvelope(db, appId, idOrEnvelopeId);
  if (!envelope) {
    throw createError(404, 'Envelope not found');
  }
  return envelope;
}

function requireLinkedEnvelope(envelope) {
  if (!envelope || !envelope.docusign_envelope_id) {
    throw createError(404, 'Envelope not found or not linked to Docusign');
  }
  return envelope;
}

/**
 * @swagger
 * /api/envelopes:
 *   post:
 *     summary: Create and send an envelope
 *     tags: [Envelopes]
 */
router.post('/', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const { envelopeDefinition, profileId, recordId, templateName, source } = req.body;
  const result = await envelopeService.createEnvelope(userId, accountId, envelopeDefinition);

  const envelope = appDataStore.createEnvelope(db, req.demoApp.id, {
    id: uuidv4(),
    docusignEnvelopeId: result.envelopeId,
    profileId,
    recordId,
    templateId: envelopeDefinition.templateId || null,
    templateName,
    status: result.status || 'sent',
    source
  });

  res.status(201).json({
    id: envelope.id,
    docusignEnvelopeId: result.envelopeId,
    status: result.status,
    statusDateTime: result.statusDateTime
  });
}));

/**
 * @swagger
 * /api/envelopes:
 *   get:
 *     summary: List tracked envelopes
 *     tags: [Envelopes]
 */
router.get('/', createAsyncRoute(async (req, res) => {
  const db = getDb();
  const app = getRequiredApp(db, req);
  res.json(appDataStore.listEnvelopes(db, app.id, req.query));
}));

/**
 * @swagger
 * /api/envelopes/{id}:
 *   get:
 *     summary: Get envelope details (from DB + optionally refresh from Docusign)
 *     tags: [Envelopes]
 */
router.get('/:id', createAsyncRoute(async (req, res) => {
  const db = getDb();
  const app = getRequiredApp(db, req);
  let envelope = getEnvelopeOrThrow(db, app.id, req.params.id);

  const connection = getConnectionForApp(db, app.id);
  if (connection?.docusign_account_id && envelope.docusign_envelope_id) {
    try {
      const live = await envelopeService.getEnvelope(
        connection.docusign_user_id,
        connection.docusign_account_id,
        envelope.docusign_envelope_id
      );

      if (live.status !== envelope.status) {
        envelope = appDataStore.updateEnvelopeStatus(db, app.id, envelope.id, live.status);
      }
    } catch (error) {
      console.warn('Could not refresh envelope status:', error.message);
    }
  }

  res.json(envelope);
}));

/**
 * @swagger
 * /api/envelopes/{id}/signing-url:
 *   post:
 *     summary: Generate embedded signing URL
 *     tags: [Envelopes]
 */
router.post('/:id/signing-url', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const envelope = requireLinkedEnvelope(getEnvelopeOrThrow(db, req.demoApp.id, req.params.id));
  const { recipientEmail, recipientName, returnUrl, clientUserId } = req.body;

  const result = await envelopeService.getSigningUrl(
    userId,
    accountId,
    envelope.docusign_envelope_id,
    {
      email: recipientEmail,
      userName: recipientName,
      returnUrl: returnUrl || `${req.headers.referer || '/'}?signing=complete`,
      clientUserId,
      authenticationMethod: 'none'
    }
  );

  res.json({ url: result.url });
}));

/**
 * @swagger
 * /api/envelopes/{id}/console-view:
 *   post:
 *     summary: Generate embedded console view URL (no login required)
 *     tags: [Envelopes]
 */
router.post('/:id/console-view', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const envelope = requireLinkedEnvelope(getEnvelopeOrThrow(db, req.demoApp.id, req.params.id));

  const result = await envelopeService.getConsoleViewUrl(
    userId,
    accountId,
    envelope.docusign_envelope_id,
    req.body.returnUrl || `${req.headers.referer || '/'}`
  );

  res.json({ url: result.url });
}));

/**
 * @swagger
 * /api/envelopes/{id}/documents:
 *   get:
 *     summary: List envelope documents
 *     tags: [Envelopes]
 */
router.get('/:id/documents', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const envelope = requireLinkedEnvelope(getEnvelopeOrThrow(db, req.demoApp.id, req.params.id));
  res.json(await envelopeService.getDocuments(userId, accountId, envelope.docusign_envelope_id));
}));

/**
 * @swagger
 * /api/envelopes/{id}/audit-events:
 *   get:
 *     summary: Get envelope audit events/history
 *     tags: [Envelopes]
 */
router.get('/:id/audit-events', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const envelope = requireLinkedEnvelope(getEnvelopeOrThrow(db, req.demoApp.id, req.params.id));
  res.json(await envelopeService.getAuditEvents(userId, accountId, envelope.docusign_envelope_id));
}));

/**
 * @swagger
 * /api/envelopes/{id}/documents/combined/download:
 *   get:
 *     summary: Download the combined envelope PDF
 *     tags: [Envelopes]
 */
router.get('/:id/documents/combined/download', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const envelope = requireLinkedEnvelope(getEnvelopeOrThrow(db, req.demoApp.id, req.params.id));

  const { buffer, contentType, contentDisposition } = await envelopeService.downloadCombinedDocument(
    userId,
    accountId,
    envelope.docusign_envelope_id
  );

  res.set('Content-Type', contentType);
  res.set('Content-Disposition', contentDisposition || 'inline');
  res.send(buffer);
}));

/**
 * @swagger
 * /api/envelopes/{id}/documents/{documentId}/download:
 *   get:
 *     summary: Download a specific document from an envelope
 *     tags: [Envelopes]
 */
router.get('/:id/documents/:documentId/download', requireDocusignConnection, createAsyncRoute(async (req, res) => {
  const db = getDb();
  const { userId, accountId } = req.docusign;
  const envelope = requireLinkedEnvelope(getEnvelopeOrThrow(db, req.demoApp.id, req.params.id));

  const { buffer, contentType, contentDisposition } = await envelopeService.downloadDocument(
    userId,
    accountId,
    envelope.docusign_envelope_id,
    req.params.documentId
  );

  res.set('Content-Type', contentType);
  res.set('Content-Disposition', contentDisposition || 'inline');
  res.send(buffer);
}));

module.exports = router;
