const { createTask, listTasks, updateTask } = require('./resource-client');
const { createDataIoService } = require('./dataio-service');
const { TYPE_ALIASES, TYPE_NAME } = require('./task-type-definitions');
const { getLiteralComparisonValue } = require('./query-utils');
const {
  asObject,
  createServiceError,
  hasOwnField,
  normalizeOptionalText,
  pickFirstDefined,
  readOptionalDataField,
  readRecordValue,
  readOptionalTextField,
  serializeData
} = require('./service-utils');

function buildTaskPayload(rawInput, { recordId } = {}) {
  const input = asObject(rawInput);
  const payload = {};

  if (recordId || hasOwnField(input, ['TaskId', 'taskId', 'Id', 'id'])) {
    payload.id = normalizeOptionalText(recordId || pickFirstDefined(input, ['TaskId', 'taskId', 'Id', 'id'])) || undefined;
  }

  payload.customerId = readOptionalTextField(input, ['CustomerId', 'customerId']);
  payload.employeeId = readOptionalTextField(input, ['EmployeeId', 'employeeId']);
  payload.title = readOptionalTextField(input, ['Title', 'title']);
  payload.description = readOptionalTextField(input, ['Description', 'description']);
  payload.status = readOptionalTextField(input, ['Status', 'status']);
  payload.dueAt = readOptionalTextField(input, ['DueAt', 'dueAt']);
  payload.data = readOptionalDataField(input, ['Data', 'data', 'TaskData', 'taskData', 'Metadata', 'metadata', 'DataJson', 'dataJson']);

  return payload;
}

function mapTaskToDataRecord(task) {
  return {
    Id: task.id,
    EmployeeId: readRecordValue(task, 'employeeId', 'employee_id') || '',
    CustomerId: readRecordValue(task, 'customerId', 'customer_id') || '',
    Title: task.title || '',
    Description: task.description || '',
    Status: task.status || '',
    DueAt: readRecordValue(task, 'dueAt', 'due_at') || '',
    DataJson: serializeData(asObject(task.data)),
    CreatedAt: readRecordValue(task, 'createdAt', 'created_at') || '',
    UpdatedAt: readRecordValue(task, 'updatedAt', 'updated_at') || ''
  };
}

function buildTaskSearchFilters(query) {
  const operation = query?.queryFilter?.operation;
  const filters = {
    id: getLiteralComparisonValue(operation, 'Id') || getLiteralComparisonValue(operation, 'TaskId'),
    customerId: getLiteralComparisonValue(operation, 'CustomerId'),
    employeeId: getLiteralComparisonValue(operation, 'EmployeeId'),
    status: getLiteralComparisonValue(operation, 'Status')
  };

  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

function normalizeTaskWriteError(error) {
  if (error?.statusCode !== 400) {
    return error;
  }

  if (error.message === 'customerId must belong to the current app') {
    return createServiceError(
      400,
      'BAD_REQUEST',
      'Task CustomerId must be the TGK customer Id for this app.'
    );
  }

  if (error.message === 'employeeId must belong to the current app') {
    return createServiceError(
      400,
      'BAD_REQUEST',
      'Task EmployeeId must be the TGK employee Id for this app.'
    );
  }

  return error;
}

module.exports = createDataIoService({
  typeName: TYPE_NAME,
  typeAliases: TYPE_ALIASES,
  createBackendRecord: createTask,
  updateBackendRecord: updateTask,
  listRecords: (query) => listTasks(query),
  buildPayload: buildTaskPayload,
  buildSearchFilters: buildTaskSearchFilters,
  mapRecordToDataRecord: mapTaskToDataRecord,
  normalizeWriteError: normalizeTaskWriteError
});
