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

router.get('/employees', withApp((req, res, db, app) => {
  res.json(service.listEmployeesForApp(db, app.slug, req.query));
}));

router.get('/employees/:id', withApp((req, res, db, app) => {
  res.json(service.getEmployeeForApp(db, app.slug, req.params.id));
}));

router.post('/employees', withApp((req, res, db, app) => {
  created(res, service.createEmployeeForApp(db, app.slug, req.body));
}));

router.put('/employees/:id', withApp((req, res, db, app) => {
  res.json(service.updateEmployeeForApp(db, app.slug, req.params.id, req.body));
}));

router.get('/customers', withApp((req, res, db, app) => {
  res.json(service.listCustomersForApp(db, app.slug, req.query));
}));

router.get('/customers/:id', withApp((req, res, db, app) => {
  res.json(service.getCustomerForApp(db, app.slug, req.params.id));
}));

router.post('/customers', withApp((req, res, db, app) => {
  created(res, service.createCustomerForApp(db, app.slug, req.body));
}));

router.put('/customers/:id', withApp((req, res, db, app) => {
  res.json(service.updateCustomerForApp(db, app.slug, req.params.id, req.body));
}));

router.delete('/customers/:id', withApp((req, res, db, app) => {
  res.json(service.deleteCustomerForApp(db, app.slug, req.params.id));
}));

router.get('/envelopes', withApp((req, res, db, app) => {
  res.json(service.listEnvelopesForApp(db, app.slug, req.query));
}));

router.get('/envelopes/:id', withApp((req, res, db, app) => {
  res.json(service.getEnvelopeForApp(db, app.slug, req.params.id));
}));

router.post('/envelopes', withApp((req, res, db, app) => {
  created(res, service.createEnvelopeForApp(db, app.slug, req.body));
}));

router.put('/envelopes/:id', withApp((req, res, db, app) => {
  res.json(service.updateEnvelopeForApp(db, app.slug, req.params.id, req.body));
}));

router.get('/tasks', withApp((req, res, db, app) => {
  res.json(service.listTasksForApp(db, app.slug, req.query));
}));

router.get('/tasks/:id', withApp((req, res, db, app) => {
  res.json(service.getTaskForApp(db, app.slug, req.params.id));
}));

router.post('/tasks', withApp((req, res, db, app) => {
  created(res, service.createTaskForApp(db, app.slug, req.body));
}));

router.put('/tasks/:id', withApp((req, res, db, app) => {
  res.json(service.updateTaskForApp(db, app.slug, req.params.id, req.body));
}));

router.delete('/tasks/:id', withApp((req, res, db, app) => {
  res.json(service.deleteTaskForApp(db, app.slug, req.params.id));
}));

module.exports = router;
