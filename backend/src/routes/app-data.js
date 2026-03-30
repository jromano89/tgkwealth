const express = require('express');
const { getDb } = require('../db/database');
const { getRequiredApp } = require('../utils');
const appDataService = require('../services/app-data-service');

const router = express.Router();

function sendRouteError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message });
}

function createJsonRoute(handler) {
  return function jsonRouteHandler(req, res) {
    try {
      handler(req, res);
    } catch (error) {
      sendRouteError(res, error);
    }
  };
}

function getAppContext(req) {
  const db = getDb();
  return { db, app: getRequiredApp(db, req) };
}

/**
 * @swagger
 * /api/data/profiles:
 *   get:
 *     summary: List app-scoped profiles
 *     tags: [Data]
 */
router.get('/profiles', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.listProfilesForApp(db, app.id, req.query));
}));

/**
 * @swagger
 * /api/data/profiles:
 *   post:
 *     summary: Create an app-scoped profile
 *     tags: [Data]
 */
router.post('/profiles', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  const profile = appDataService.createProfileForApp(db, app.id, req.body);
  res.status(201).json(profile);
}));

/**
 * @swagger
 * /api/data/profiles/{id}:
 *   get:
 *     summary: Get one profile with related records and envelopes
 *     tags: [Data]
 */
router.get('/profiles/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.getProfileDetailsForApp(db, app.id, req.params.id));
}));

/**
 * @swagger
 * /api/data/profiles/{id}:
 *   put:
 *     summary: Update an app-scoped profile
 *     tags: [Data]
 */
router.put('/profiles/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.updateProfileForApp(db, app.id, req.params.id, req.body));
}));

/**
 * @swagger
 * /api/data/profiles/{id}:
 *   delete:
 *     summary: Delete an app-scoped profile and related data
 *     tags: [Data]
 */
router.delete('/profiles/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.deleteProfileForApp(db, app.id, req.params.id));
}));

/**
 * @swagger
 * /api/data/records:
 *   get:
 *     summary: List app-scoped records
 *     tags: [Data]
 */
router.get('/records', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.listRecordsForApp(db, app.id, req.query));
}));

/**
 * @swagger
 * /api/data/records:
 *   post:
 *     summary: Create an app-scoped record
 *     tags: [Data]
 */
router.post('/records', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  const record = appDataService.createRecordForApp(db, app.id, req.body);
  res.status(201).json(record);
}));

/**
 * @swagger
 * /api/data/records/{id}:
 *   get:
 *     summary: Get one record with related envelopes
 *     tags: [Data]
 */
router.get('/records/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.getRecordDetailsForApp(db, app.id, req.params.id));
}));

/**
 * @swagger
 * /api/data/records/{id}:
 *   put:
 *     summary: Update an app-scoped record
 *     tags: [Data]
 */
router.put('/records/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.updateRecordForApp(db, app.id, req.params.id, req.body));
}));

/**
 * @swagger
 * /api/data/envelopes:
 *   post:
 *     summary: Create an app-scoped envelope
 *     tags: [Data]
 */
router.post('/envelopes', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  const envelope = appDataService.createTrackedEnvelopeForApp(db, app.id, req.body);
  res.status(201).json(envelope);
}));

/**
 * @swagger
 * /api/data/envelopes/{id}:
 *   put:
 *     summary: Update an app-scoped envelope
 *     tags: [Data]
 */
router.put('/envelopes/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.updateTrackedEnvelopeForApp(db, app.id, req.params.id, req.body));
}));

/**
 * @swagger
 * /api/data/tasks/{id}:
 *   delete:
 *     summary: Delete an app-scoped task
 *     tags: [Data]
 */
router.delete('/tasks/:id', createJsonRoute((req, res) => {
  const { db, app } = getAppContext(req);
  res.json(appDataService.deleteTaskForApp(db, app.id, req.params.id));
}));

module.exports = router;
