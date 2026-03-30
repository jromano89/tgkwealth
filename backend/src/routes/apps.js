const express = require('express');
const { getDb } = require('../db/database');
const { getAppBySlug, getAppConfigFromRequest, getAppSlug, getAppStats, getConnectionForApp } = require('../utils');
const { bootstrapAppData } = require('../services/app-bootstrap-service');

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

/**
 * @swagger
 * /api/apps/current:
 *   get:
 *     summary: Get the current demo app and connection state
 *     tags: [Apps]
 */
router.get('/current', createJsonRoute((req, res) => {
  const db = getDb();
  const slug = getAppSlug(req);

  if (!slug) {
    res.json({ app: null, connection: null, stats: null });
    return;
  }

  const app = getAppBySlug(db, slug);
  if (!app) {
    res.json({ app: null, connection: null, stats: null, slug });
    return;
  }

  res.json({
    app,
    connection: getConnectionForApp(db, app.id),
    stats: getAppStats(db, app.id)
  });
}));

/**
 * @swagger
 * /api/apps/bootstrap:
 *   post:
 *     summary: Initialize or reset an app's bootstrap data
 *     tags: [Apps]
 */
router.post('/bootstrap', createJsonRoute((req, res) => {
  const db = getDb();
  const appConfig = getAppConfigFromRequest(req);
  const existingApp = getAppBySlug(db, appConfig.slug);

  res.json(bootstrapAppData(db, existingApp, appConfig, req.body));
}));

module.exports = router;
