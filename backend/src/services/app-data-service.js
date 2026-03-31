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

function normalizeTasksInput(tasks, defaults = {}) {
  if (tasks === undefined) {
    return undefined;
  }

  if (!Array.isArray(tasks)) {
    throw createError(400, 'tasks must be an array');
  }

  return tasks.map((task) => {
    const normalizedTask = asObject(task);

    return {
      id: normalizedTask.id || randomUUID(),
      user_id: normalizedTask.userId || normalizedTask.user_id || defaults.userId || null,
      contact_id: normalizedTask.contactId || normalizedTask.contact_id || defaults.contactId || null,
      title: requireText(normalizedTask.title, 'task title is required'),
      description: normalizedTask.description || null,
      status: normalizedTask.status || 'pending',
      created_at: normalizedTask.created_at || normalizedTask.createdAt || new Date().toISOString()
    };
  });
}

function listUsersForApp(db, appId, filters) {
  return store.listUsers(db, appId, filters);
}

function createUserForApp(db, appId, input = {}) {
  const id = input.id || randomUUID();
  return store.createUser(db, appId, {
    id,
    displayName: requireText(input.displayName, 'displayName is required'),
    email: input.email || null,
    phone: input.phone || null,
    title: input.title || null,
    data: asObject(input.data),
    tasks: normalizeTasksInput(input.tasks, { userId: id })
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
    data: mergeData(existing.data, input.data),
    tasks: normalizeTasksInput(input.tasks, { userId })
  });
}

function listContactsForApp(db, appId, filters) {
  return store.listContacts(db, appId, filters);
}

function listEnvelopesForApp(db, appId, filters) {
  return store.listEnvelopes(db, appId, filters);
}

function createContactForApp(db, appId, input = {}) {
  const id = input.id || randomUUID();
  const ownerUserId = resolveOwnerUserId(db, appId, input.ownerUserId);
  return store.createContact(db, appId, {
    id,
    ownerUserId,
    ref: input.ref || null,
    displayName: requireText(input.displayName, 'displayName is required'),
    email: input.email || null,
    phone: input.phone || null,
    organization: input.organization || null,
    status: input.status || 'active',
    source: input.source || 'api',
    data: asObject(input.data),
    tasks: normalizeTasksInput(input.tasks, {
      contactId: id,
      userId: ownerUserId
    })
  });
}

function getContactDetailsForApp(db, appId, contactId) {
  return store.getContactDetails(db, appId, contactId);
}

function updateContactForApp(db, appId, contactId, input = {}) {
  const existing = store.getContact(db, appId, contactId);
  if (!existing) {
    throw createError(404, 'Contact not found');
  }

  const ownerUserId = input.ownerUserId !== undefined
    ? resolveOwnerUserId(db, appId, input.ownerUserId)
    : existing.owner_user_id;

  return store.updateContact(db, appId, contactId, {
    ownerUserId: input.ownerUserId !== undefined ? ownerUserId : undefined,
    ref: input.ref,
    displayName: input.displayName,
    email: input.email,
    phone: input.phone,
    organization: input.organization,
    status: input.status,
    data: mergeData(existing.data, input.data),
    tasks: normalizeTasksInput(input.tasks, {
      contactId,
      userId: ownerUserId
    })
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

module.exports = {
  createContactForApp,
  createEnvelopeForApp,
  createUserForApp,
  deleteContactForApp,
  getContactDetailsForApp,
  listContactsForApp,
  listEnvelopesForApp,
  listUsersForApp,
  updateContactForApp,
  updateEnvelopeForApp,
  updateUserForApp
};
