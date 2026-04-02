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
    create(appSlug, payload) {
      return requireResource(resourceName).create(appSlug, payload);
    },
    get(appSlug, id) {
      return requireResource(resourceName).get(appSlug, id);
    },
    getById(id) {
      return requireResource(resourceName).get(null, id);
    },
    list(appSlug, query) {
      return requireResource(resourceName).list(appSlug, query);
    },
    update(appSlug, id, payload) {
      return requireResource(resourceName).update(appSlug, id, payload);
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
  getCustomerById: customerClient.getById,
  getEmployee: employeeClient.get,
  getEmployeeById: employeeClient.getById,
  getEnvelope: envelopeClient.get,
  getEnvelopeById: envelopeClient.getById,
  getTask: taskClient.get,
  getTaskById: taskClient.getById,
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
