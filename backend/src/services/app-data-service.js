const { randomUUID } = require('crypto');
const appDataStore = require('../data-store');
const { createError } = require('../utils');

function buildTaskRecords(tasks, defaultUserId) {
  return tasks.map((task) => ({
    id: randomUUID(),
    userId: task.userId || defaultUserId || null,
    title: requireText(task.title, 'task title is required'),
    description: task.description || null,
    status: task.status || 'pending'
  }));
}

function requireText(value, message) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw createError(400, message);
  }
  return normalized;
}

function getObjectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildContactData(input = {}, existingData = {}) {
  const nextData = {
    ...existingData,
    ...getObjectValue(input.data)
  };

  if (!Array.isArray(nextData.accounts)) {
    nextData.accounts = Array.isArray(existingData.accounts) ? existingData.accounts : [];
  }

  if (!Array.isArray(nextData.tags)) {
    nextData.tags = Array.isArray(existingData.tags) ? existingData.tags : [];
  }

  if (!nextData.contactType && (input.contactType || existingData.contactType)) {
    nextData.contactType = input.contactType || existingData.contactType;
  }

  return nextData;
}

function resolveOwnerUserId(db, appId, ownerUserId) {
  if (ownerUserId) {
    return appDataStore.ensureUserBelongsToApp(db, appId, ownerUserId).id;
  }

  const primaryUser = appDataStore.getPrimaryUser(db, appId);
  if (!primaryUser) {
    throw createError(400, 'No user is configured for this app');
  }

  return primaryUser.id;
}

function resolveContactId(db, appId, contactId) {
  if (!contactId) {
    return null;
  }

  return appDataStore.ensureContactBelongsToApp(db, appId, contactId).id;
}

function resolveAssociatedUserId(db, appId, inputUserId, contactId) {
  if (inputUserId) {
    return appDataStore.ensureUserBelongsToApp(db, appId, inputUserId).id;
  }

  if (contactId) {
    return appDataStore.ensureContactBelongsToApp(db, appId, contactId).owner_user_id;
  }

  return null;
}

function listUsersForApp(db, appId, filters) {
  return appDataStore.listUsers(db, appId, filters);
}

function createUserForApp(db, appId, input) {
  return appDataStore.createUser(db, appId, {
    ...input,
    displayName: requireText(input.displayName, 'displayName is required'),
    id: input.id || randomUUID()
  });
}

function updateUserForApp(db, appId, userId, input) {
  appDataStore.requireScopedRow(db, 'users', appId, userId, 'User');
  return appDataStore.updateUser(db, appId, userId, input);
}

function listContactsForApp(db, appId, filters) {
  return appDataStore.listContacts(db, appId, filters);
}

function createContactForApp(db, appId, input) {
  const ownerUserId = resolveOwnerUserId(db, appId, input.ownerUserId);
  const contact = appDataStore.createContact(db, appId, {
    ...input,
    displayName: requireText(input.displayName, 'displayName is required'),
    id: input.id || randomUUID(),
    ownerUserId,
    data: buildContactData(input)
  });

  if (Array.isArray(input.tasks) && input.tasks.length > 0) {
    appDataStore.createTasks(db, appId, contact.id, buildTaskRecords(input.tasks, ownerUserId));
  }
  return contact;
}

function getContactDetailsForApp(db, appId, contactId) {
  return appDataStore.getContactDetails(db, appId, contactId);
}

function updateContactForApp(db, appId, contactId, input) {
  const existing = appDataStore.requireScopedRow(db, 'contacts', appId, contactId, 'Contact', (row) => row && ({
    ...row,
    data: row.data ? JSON.parse(row.data) : {}
  }));
  const ownerUserId = input.ownerUserId !== undefined
    ? resolveOwnerUserId(db, appId, input.ownerUserId)
    : undefined;

  return appDataStore.updateContact(db, appId, contactId, {
    ...input,
    ownerUserId,
    data: input.data !== undefined ? buildContactData(input, existing.data || {}) : undefined
  });
}

function deleteContactForApp(db, appId, contactId) {
  appDataStore.requireScopedRow(db, 'contacts', appId, contactId, 'Contact');
  appDataStore.deleteContactCascade(db, appId, contactId);
  return { deleted: true };
}

function createEnvelopeForApp(db, appId, input) {
  const contactId = resolveContactId(db, appId, input.contactId);
  const userId = resolveAssociatedUserId(db, appId, input.userId, contactId);

  if (!contactId && !userId) {
    throw createError(400, 'contactId or userId is required');
  }

  return appDataStore.createEnvelope(db, appId, {
    ...input,
    id: input.id || randomUUID(),
    contactId,
    userId
  });
}

function updateEnvelopeForApp(db, appId, envelopeId, input) {
  const contactId = resolveContactId(db, appId, input.contactId);
  const userId = resolveAssociatedUserId(db, appId, input.userId, contactId);
  return appDataStore.updateEnvelope(db, appId, envelopeId, {
    ...input,
    contactId,
    userId
  });
}

function createTaskForApp(db, appId, input) {
  const contactId = resolveContactId(db, appId, input.contactId);
  const userId = resolveAssociatedUserId(db, appId, input.userId, contactId);

  if (!contactId && !userId) {
    throw createError(400, 'contactId or userId is required');
  }

  return appDataStore.createTask(db, appId, {
    id: input.id || randomUUID(),
    contactId,
    userId,
    title: requireText(input.title, 'title is required'),
    description: input.description || null,
    status: input.status || 'pending'
  });
}

function deleteTaskForApp(db, appId, taskId) {
  appDataStore.requireScopedRow(db, 'tasks', appId, taskId, 'Task');
  appDataStore.deleteTask(db, appId, taskId);
  return { deleted: true };
}

module.exports = {
  createContactForApp,
  createEnvelopeForApp,
  createTaskForApp,
  createUserForApp,
  deleteContactForApp,
  deleteTaskForApp,
  getContactDetailsForApp,
  listContactsForApp,
  listUsersForApp,
  updateContactForApp,
  updateEnvelopeForApp,
  updateUserForApp
};
