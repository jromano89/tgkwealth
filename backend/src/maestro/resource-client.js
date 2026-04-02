let resourceAccess = null;

function requireResource(resourceName) {
  const resource = resourceAccess?.[resourceName];
  if (!resource) {
    throw new Error(`Maestro resource access is not configured for "${resourceName}".`);
  }

  return resource;
}

function setResourceAccess(nextAccess) {
  resourceAccess = nextAccess || null;
}

function createResourceClient(resourceName) {
  return {
    create(payload) {
      return requireResource(resourceName).create(payload);
    },
    get(id) {
      return requireResource(resourceName).get(id);
    },
    list(query) {
      return requireResource(resourceName).list(query);
    },
    update(id, payload) {
      return requireResource(resourceName).update(id, payload);
    }
  };
}

const employeeClient = createResourceClient('employees');
const customerClient = createResourceClient('customers');
const envelopeClient = createResourceClient('envelopes');
const taskClient = createResourceClient('tasks');

module.exports = {
  createCustomer: customerClient.create,
  createEmployee: employeeClient.create,
  createEnvelope: envelopeClient.create,
  createTask: taskClient.create,
  getCustomer: customerClient.get,
  getEmployee: employeeClient.get,
  getEnvelope: envelopeClient.get,
  getTask: taskClient.get,
  listCustomers: customerClient.list,
  listEmployees: employeeClient.list,
  listEnvelopes: envelopeClient.list,
  listTasks: taskClient.list,
  setResourceAccess,
  updateCustomer: customerClient.update,
  updateEmployee: employeeClient.update,
  updateEnvelope: envelopeClient.update,
  updateTask: taskClient.update
};
