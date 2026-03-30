const { v4: uuidv4 } = require('uuid');
const appDataStore = require('../repositories/app-data-store');
const { createError } = require('../utils');

const DEFAULT_PROFILE_TASKS = [
  {
    title: 'Begin Asset Transfer',
    description: 'Initiate the transfer of assets from your external accounts to your new brokerage account.'
  }
];

function buildTaskSeed(tasks) {
  return tasks.map((task) => ({
    id: uuidv4(),
    title: task.title,
    description: task.description || null
  }));
}

function assertRequired(value, message) {
  if (!value) {
    throw createError(400, message);
  }
}

function listProfilesForApp(db, appId, filters) {
  return appDataStore.listProfiles(db, appId, filters);
}

function createProfileForApp(db, appId, input) {
  assertRequired(input.displayName, 'displayName is required');

  const profile = appDataStore.createProfile(db, appId, {
    ...input,
    id: input.id || uuidv4()
  });

  const tasks = Array.isArray(input.tasks) ? input.tasks : DEFAULT_PROFILE_TASKS;
  appDataStore.addTasks(db, appId, profile.id, buildTaskSeed(tasks));
  return profile;
}

function getProfileDetailsForApp(db, appId, profileId) {
  return appDataStore.getProfileDetails(db, appId, profileId);
}

function updateProfileForApp(db, appId, profileId, input) {
  appDataStore.requireScopedRow(db, 'profiles', appId, profileId, 'Profile');
  return appDataStore.updateProfile(db, appId, profileId, input);
}

function deleteProfileForApp(db, appId, profileId) {
  appDataStore.requireScopedRow(db, 'profiles', appId, profileId, 'Profile');
  appDataStore.deleteProfileCascade(db, appId, profileId);
  return { deleted: true };
}

function listRecordsForApp(db, appId, filters) {
  return appDataStore.listRecords(db, appId, filters);
}

function createRecordForApp(db, appId, input) {
  assertRequired(input.title, 'title is required');
  appDataStore.ensureProfileBelongsToApp(db, appId, input.profileId);

  return appDataStore.createRecord(db, appId, {
    ...input,
    id: input.id || uuidv4()
  });
}

function getRecordDetailsForApp(db, appId, recordId) {
  return appDataStore.getRecordDetails(db, appId, recordId);
}

function updateRecordForApp(db, appId, recordId, input) {
  appDataStore.requireScopedRow(db, 'records', appId, recordId, 'Record');
  appDataStore.ensureProfileBelongsToApp(db, appId, input.profileId);
  return appDataStore.updateRecord(db, appId, recordId, input);
}

function createTrackedEnvelopeForApp(db, appId, input) {
  appDataStore.ensureProfileBelongsToApp(db, appId, input.profileId);

  return appDataStore.createEnvelope(db, appId, {
    ...input,
    id: input.id || uuidv4()
  });
}

function updateTrackedEnvelopeForApp(db, appId, envelopeId, input) {
  appDataStore.ensureProfileBelongsToApp(db, appId, input.profileId);
  return appDataStore.updateEnvelope(db, appId, envelopeId, input);
}

function deleteTaskForApp(db, appId, taskId) {
  appDataStore.requireScopedRow(db, 'tasks', appId, taskId, 'Task');
  appDataStore.deleteTask(db, appId, taskId);
  return { deleted: true };
}

module.exports = {
  createProfileForApp,
  createRecordForApp,
  createTrackedEnvelopeForApp,
  deleteProfileForApp,
  deleteTaskForApp,
  getProfileDetailsForApp,
  getRecordDetailsForApp,
  listProfilesForApp,
  listRecordsForApp,
  updateProfileForApp,
  updateRecordForApp,
  updateTrackedEnvelopeForApp
};
