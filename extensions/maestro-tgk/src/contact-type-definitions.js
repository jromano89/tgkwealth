const { mm, createDecorator, crudDecorator, createPropertyDeclaration } = require('./type-helpers');

const TYPE_NAME = 'Customer';
const TYPE_ALIASES = new Set(['customer', 'contact', 'investor', 'client']);

const TYPE_NAMES = [
  {
    typeName: TYPE_NAME,
    label: 'Customer',
    description: 'TGK customer row'
  }
];

const FIELD_DEFINITIONS = [
  { name: 'Id', label: 'Customer ID', type: 'String', optional: false, readableOnly: true },
  { name: 'EmployeeId', label: 'Employee ID', type: 'String', optional: true },
  { name: 'DisplayName', label: 'Display Name', type: 'String', optional: true },
  { name: 'FirstName', label: 'First Name', type: 'String', optional: true },
  { name: 'LastName', label: 'Last Name', type: 'String', optional: true },
  { name: 'Email', label: 'Email', type: 'String', optional: true },
  { name: 'Phone', label: 'Phone', type: 'String', optional: true },
  { name: 'Organization', label: 'Organization', type: 'String', optional: true },
  { name: 'Status', label: 'Status', type: 'String', optional: true },
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
        name: 'Id'
      },
      decorators: [
        createDecorator('Term', 'Customer'),
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
  TYPE_NAME
};
