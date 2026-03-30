const { v4: uuidv4 } = require('uuid');
const { createError, getAppStats, getConnectionForApp, parseJsonFields, upsertApp } = require('../utils');
const appDataStore = require('../repositories/app-data-store');

function getBootstrapItems(body, key) {
  return Array.isArray(body?.[key]) ? body[key] : [];
}

function hasBootstrapData(stats) {
  return stats.profiles > 0 || stats.records > 0;
}

function isCurrentBootstrap(existingApp, bootstrapVersion) {
  return Boolean(
    existingApp &&
    existingApp.bootstrap_version &&
    existingApp.bootstrap_version === (bootstrapVersion || null)
  );
}

function validateBootstrapProfile(profile) {
  if (profile?.ref && profile?.displayName) {
    return;
  }
  throw createError(400, 'Each bootstrap profile requires ref and displayName');
}

function validateBootstrapRecord(record, profileIdByRef) {
  if (!record?.ref || !record?.title) {
    throw createError(400, 'Each bootstrap record requires ref and title');
  }

  if (record.profileRef && !profileIdByRef.get(record.profileRef)) {
    throw createError(400, `Bootstrap record references unknown profileRef: ${record.profileRef}`);
  }
}

function addBootstrapIds(items) {
  return items.map((item) => ({
    ...item,
    id: item.id || uuidv4()
  }));
}

function bootstrapAppData(db, existingApp, appConfig, body) {
  if (!appConfig.slug) {
    throw createError(400, 'Bootstrap requires app.slug');
  }

  const profiles = addBootstrapIds(getBootstrapItems(body, 'profiles'));
  const records = addBootstrapIds(getBootstrapItems(body, 'records'));
  const app = upsertApp(db, appConfig);
  const stats = getAppStats(db, app.id);

  if (isCurrentBootstrap(existingApp, appConfig.bootstrapVersion) && hasBootstrapData(stats)) {
    return {
      app,
      bootstrapped: false,
      reason: 'already-current',
      stats,
      connection: getConnectionForApp(db, app.id)
    };
  }

  db.transaction(() => {
    appDataStore.resetAppData(db, app.id);

    for (const profile of profiles) {
      validateBootstrapProfile(profile);
    }

    const profileIdByRef = appDataStore.insertBootstrapProfiles(db, app.id, profiles);

    for (const record of records) {
      validateBootstrapRecord(record, profileIdByRef);
    }

    appDataStore.insertBootstrapRecords(db, app.id, records, profileIdByRef);
  })();

  return {
    app: parseJsonFields(app),
    bootstrapped: true,
    stats: getAppStats(db, app.id),
    connection: getConnectionForApp(db, app.id)
  };
}

module.exports = {
  bootstrapAppData
};
