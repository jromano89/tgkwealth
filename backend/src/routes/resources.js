const express = require('express');
const { getDb } = require('../database');
const service = require('../resources/service');
const { getRequiredApp, route } = require('../utils');

const router = express.Router();

function withApp(handler) {
  return route((req, res) => {
    const db = getDb();
    const app = getRequiredApp(db, req);
    return handler(req, res, db, app);
  });
}

function created(res, payload) {
  res.status(201).json(payload);
}

Object.entries(service.RESOURCE_DEFINITIONS).forEach(([resourceKey, resource]) => {
  const collectionPath = `/${resourceKey}`;
  const itemPath = `${collectionPath}/:id`;

  router.get(collectionPath, withApp((req, res, db, app) => {
    res.json(service.listRecordsForApp(db, app.slug, resourceKey, req.query));
  }));

  router.get(itemPath, withApp((req, res, db, app) => {
    res.json(service.getRecordForApp(db, app.slug, resourceKey, req.params.id));
  }));

  router.post(collectionPath, withApp((req, res, db, app) => {
    created(res, service.createRecordForApp(db, app.slug, resourceKey, req.body));
  }));

  router.put(itemPath, withApp((req, res, db, app) => {
    res.json(service.updateRecordForApp(db, app.slug, resourceKey, req.params.id, req.body));
  }));

  if (resource.allowDelete) {
    router.delete(itemPath, withApp((req, res, db, app) => {
      res.json(service.deleteRecordForApp(db, app.slug, resourceKey, req.params.id));
    }));
  }
});

module.exports = router;
