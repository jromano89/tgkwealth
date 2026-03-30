const { randomUUID } = require('crypto');
const store = require('../data-store');
const { createError } = require('../utils');

function requireText(value, message) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw createError(400, message);
  }
  return normalized;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function mergeData(existingData, nextData) {
  if (nextData === undefined) {
    return undefined;
  }

  return {
    ...asObject(existingData),
    ...asObject(nextData)
  };
}

function resolveOwnerUserId(db, appId, ownerUserId) {
  if (ownerUserId) {
    return store.ensureUserBelongsToApp(db, appId, ownerUserId).id;
  }

  const defaultUser = store.getPrimaryUser(db, appId);
  if (!defaultUser) {
    throw createError(400, 'No user is configured for this app');
  }

  return defaultUser.id;
}

function resolveAssociations(db, appId, input = {}) {
  const contact = input.contactId ? store.ensureContactBelongsToApp(db, appId, input.contactId) : null;
  const user = input.userId
    ? store.ensureUserBelongsToApp(db, appId, input.userId)
    : (contact ? store.ensureUserBelongsToApp(db, appId, contact.owner_user_id) : null);

  return {
    contactId: contact?.id || null,
    userId: user?.id || null
  };
}

function buildTaskRecords(tasks, defaults = {}) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => ({
    id: task.id || randomUUID(),
    user_id: task.userId || task.user_id || defaults.userId || null,
    contact_id: task.contactId || task.contact_id || defaults.contactId || null,
    title: requireText(task.title, 'task title is required'),
    description: task.description || null,
    status: task.status || 'pending',
    created_at: task.created_at || task.createdAt || new Date().toISOString()
  }));
}

function listUsersForApp(db, appId, filters) {
  return store.listUsers(db, appId, filters);
}

function createUserForApp(db, appId, input = {}) {
  return store.createUser(db, appId, {
    id: input.id || randomUUID(),
    displayName: requireText(input.displayName, 'displayName is required'),
    email: input.email || null,
    phone: input.phone || null,
    title: input.title || null,
    data: asObject(input.data)
  });
}

function updateUserForApp(db, appId, userId, input = {}) {
  const existing = store.getUser(db, appId, userId);
  if (!existing) {
    throw createError(404, 'User not found');
  }
  return store.updateUser(db, appId, userId, {
    displayName: input.displayName,
    email: input.email,
    phone: input.phone,
    title: input.title,
    data: mergeData(existing.data, input.data)
  });
}

function listContactsForApp(db, appId, filters) {
  return store.listContacts(db, appId, filters);
}

function createContactForApp(db, appId, input = {}) {
  const ownerUserId = resolveOwnerUserId(db, appId, input.ownerUserId);
  const contact = store.createContact(db, appId, {
    id: input.id || randomUUID(),
    ownerUserId,
    ref: input.ref || null,
    displayName: requireText(input.displayName, 'displayName is required'),
    email: input.email || null,
    phone: input.phone || null,
    organization: input.organization || null,
    status: input.status || 'active',
    source: input.source || 'api',
    data: asObject(input.data)
  });

  if (Array.isArray(input.tasks) && input.tasks.length > 0) {
    store.createTasks(db, appId, contact.id, buildTaskRecords(input.tasks, {
      contactId: contact.id,
      userId: ownerUserId
    }));
  }

  return contact;
}

function getContactDetailsForApp(db, appId, contactId) {
  return store.getContactDetails(db, appId, contactId);
}

function updateContactForApp(db, appId, contactId, input = {}) {
  const existing = store.getContact(db, appId, contactId);
  if (!existing) {
    throw createError(404, 'Contact not found');
  }
  return store.updateContact(db, appId, contactId, {
    ownerUserId: input.ownerUserId !== undefined ? resolveOwnerUserId(db, appId, input.ownerUserId) : undefined,
    ref: input.ref,
    displayName: input.displayName,
    email: input.email,
    phone: input.phone,
    organization: input.organization,
    status: input.status,
    data: mergeData(existing.data, input.data)
  });
}

function deleteContactForApp(db, appId, contactId) {
  if (!store.getContact(db, appId, contactId)) {
    throw createError(404, 'Contact not found');
  }
  store.deleteContactCascade(db, appId, contactId);
  return { deleted: true };
}

function createEnvelopeForApp(db, appId, input = {}) {
  const { contactId, userId } = resolveAssociations(db, appId, input);
  if (!contactId && !userId) {
    throw createError(400, 'contactId or userId is required');
  }

  return store.createEnvelope(db, appId, {
    id: input.id || randomUUID(),
    userId,
    docusignEnvelopeId: input.docusignEnvelopeId || input.docusign_envelope_id || null,
    contactId,
    status: input.status || 'sent',
    documentName: input.documentName || input.document_name || null,
    completedAt: input.completedAt || input.completed_at || null,
    createdAt: input.createdAt || input.created_at || null
  });
}

function updateEnvelopeForApp(db, appId, envelopeId, input = {}) {
  const { contactId, userId } = resolveAssociations(db, appId, input);
  return store.updateEnvelope(db, appId, envelopeId, {
    userId,
    docusignEnvelopeId: input.docusignEnvelopeId || input.docusign_envelope_id || null,
    contactId,
    status: input.status,
    documentName: input.documentName || input.document_name || null,
    completedAt: input.completedAt || input.completed_at || null
  });
}

function createTaskForApp(db, appId, input = {}) {
  const { contactId, userId } = resolveAssociations(db, appId, input);
  if (!contactId && !userId) {
    throw createError(400, 'contactId or userId is required');
  }

  return store.createTask(db, appId, {
    id: input.id || randomUUID(),
    contactId,
    userId,
    title: requireText(input.title, 'title is required'),
    description: input.description || null,
    status: input.status || 'pending',
    createdAt: input.createdAt || input.created_at || new Date().toISOString()
  });
}

function deleteTaskForApp(db, appId, taskId) {
  if (!store.deleteTask(db, appId, taskId)) {
    throw createError(404, 'Task not found');
  }

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
