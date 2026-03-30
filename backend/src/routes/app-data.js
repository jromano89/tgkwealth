const express = require('express');
const { getDb } = require('../database');
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

function withAppContext(handler) {
  return createJsonRoute((req, res) => {
    const db = getDb();
    const app = getRequiredApp(db, req);
    handler(req, res, db, app);
  });
}

router.get('/users', withAppContext((req, res, db, app) => {
  res.json(appDataService.listUsersForApp(db, app.id, req.query));
}));

router.post('/users', withAppContext((req, res, db, app) => {
  const user = appDataService.createUserForApp(db, app.id, req.body);
  res.status(201).json(user);
}));

router.put('/users/:id', withAppContext((req, res, db, app) => {
  res.json(appDataService.updateUserForApp(db, app.id, req.params.id, req.body));
}));

router.get('/contacts', withAppContext((req, res, db, app) => {
  res.json(appDataService.listContactsForApp(db, app.id, req.query));
}));

router.post('/contacts', withAppContext((req, res, db, app) => {
  const contact = appDataService.createContactForApp(db, app.id, req.body);
  res.status(201).json(contact);
}));

router.get('/contacts/:id', withAppContext((req, res, db, app) => {
  res.json(appDataService.getContactDetailsForApp(db, app.id, req.params.id));
}));

router.put('/contacts/:id', withAppContext((req, res, db, app) => {
  res.json(appDataService.updateContactForApp(db, app.id, req.params.id, req.body));
}));

router.delete('/contacts/:id', withAppContext((req, res, db, app) => {
  res.json(appDataService.deleteContactForApp(db, app.id, req.params.id));
}));

router.post('/envelopes', withAppContext((req, res, db, app) => {
  const envelope = appDataService.createEnvelopeForApp(db, app.id, req.body);
  res.status(201).json(envelope);
}));

router.put('/envelopes/:id', withAppContext((req, res, db, app) => {
  res.json(appDataService.updateEnvelopeForApp(db, app.id, req.params.id, req.body));
}));

router.post('/tasks', withAppContext((req, res, db, app) => {
  const task = appDataService.createTaskForApp(db, app.id, req.body);
  res.status(201).json(task);
}));

router.delete('/tasks/:id', withAppContext((req, res, db, app) => {
  res.json(appDataService.deleteTaskForApp(db, app.id, req.params.id));
}));

module.exports = router;
