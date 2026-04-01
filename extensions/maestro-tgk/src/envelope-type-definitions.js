const { mm, createDecorator, crudDecorator, createPropertyDeclaration } = require('./type-helpers');

const TYPE_NAME = 'Envelope';
const NAMESPACE = 'org.tgk.maestro';
const TYPE_ALIASES = new Set(['envelope', 'document', 'agreement']);

const TYPE_NAMES = [
  {
    typeName: TYPE_NAME,
    label: 'Envelope',
    description: 'Docusign envelope tracking row'
  }
];

const FIELD_DEFINITIONS = [
  { name: 'EnvelopeId', label: 'Envelope ID', type: 'String', optional: false },
  { name: 'Name', label: 'Envelope Name', type: 'String', optional: true },
  { name: 'Status', label: 'Status', type: 'String', optional: true },
  { name: 'CustomerId', label: 'Customer ID', type: 'String', optional: true },
  { name: 'EmployeeId', label: 'Employee ID', type: 'String', optional: true },
  { name: 'DataJson', label: 'Data JSON', type: 'String', optional: true },
  { name: 'CreatedAt', label: 'Created At', type: 'DateTime', optional: true, readableOnly: true },
  { name: 'UpdatedAt', label: 'Updated At', type: 'DateTime', optional: true, readableOnly: true }
];

const TYPE_DEFINITIONS = {
  declarations: [
    {
      $class: mm('ConceptDeclaration'),
      name: TYPE_NAME,
      isAbstract: false,
      identified: {
        $class: mm('IdentifiedBy'),
        name: 'EnvelopeId'
      },
      decorators: [
        createDecorator('Term', 'Envelope'),
        crudDecorator(false)
      ],
      properties: FIELD_DEFINITIONS.map(createPropertyDeclaration)
    }
  ]
};

module.exports = {
  TYPE_ALIASES,
  TYPE_DEFINITIONS,
  TYPE_NAMES,
  TYPE_NAME,
  NAMESPACE
};
