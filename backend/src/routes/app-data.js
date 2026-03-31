const express = require('express');
const { getDb } = require('../database');
const service = require('../services/app-data-service');
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

router.get('/users', withApp((req, res, db, app) => {
  res.json(service.listUsersForApp(db, app.id, req.query));
}));

router.post('/users', withApp((req, res, db, app) => {
  created(res, service.createUserForApp(db, app.id, req.body));
}));

router.put('/users/:id', withApp((req, res, db, app) => {
  res.json(service.updateUserForApp(db, app.id, req.params.id, req.body));
}));

router.get('/contacts', withApp((req, res, db, app) => {
  res.json(service.listContactsForApp(db, app.id, req.query));
}));

router.post('/contacts', withApp((req, res, db, app) => {
  created(res, service.createContactForApp(db, app.id, req.body));
}));

router.get('/contacts/:id', withApp((req, res, db, app) => {
  res.json(service.getContactDetailsForApp(db, app.id, req.params.id));
}));

router.put('/contacts/:id', withApp((req, res, db, app) => {
  res.json(service.updateContactForApp(db, app.id, req.params.id, req.body));
}));

router.delete('/contacts/:id', withApp((req, res, db, app) => {
  res.json(service.deleteContactForApp(db, app.id, req.params.id));
}));

router.post('/envelopes', withApp((req, res, db, app) => {
  created(res, service.createEnvelopeForApp(db, app.id, req.body));
}));

router.put('/envelopes/:id', withApp((req, res, db, app) => {
  res.json(service.updateEnvelopeForApp(db, app.id, req.params.id, req.body));
}));

module.exports = router;
