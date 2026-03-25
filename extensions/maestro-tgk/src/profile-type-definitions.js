const TYPE_NAME = 'Profile';
const TYPE_ALIASES = new Set(['profile', 'investor']);

const TYPE_NAMES = [
  {
    typeName: TYPE_NAME,
    label: 'Profile',
    description: 'TGK profile row'
  }
];

const FIELD_DEFINITIONS = [
  { name: 'Id', label: 'Profile ID', type: 'String', optional: false, readableOnly: true },
  { name: 'Ref', label: 'Reference', type: 'String', optional: true },
  { name: 'Kind', label: 'Kind', type: 'String', optional: true },
  { name: 'DisplayName', label: 'Display Name', type: 'String', optional: true },
  { name: 'FullName', label: 'Full Name', type: 'String', optional: true },
  { name: 'FirstName', label: 'First Name', type: 'String', optional: true },
  { name: 'LastName', label: 'Last Name', type: 'String', optional: true },
  { name: 'Email', label: 'Email', type: 'String', optional: true },
  { name: 'Phone', label: 'Phone', type: 'String', optional: true },
  { name: 'Organization', label: 'Organization', type: 'String', optional: true },
  { name: 'Status', label: 'Status', type: 'String', optional: true },
  { name: 'Source', label: 'Source', type: 'String', optional: true },
  { name: 'DataJson', label: 'Data JSON', type: 'String', optional: true },
  { name: 'Aum', label: 'Assets Under Management', type: 'Double', optional: true },
  { name: 'NetWorth', label: 'Net Worth', type: 'Double', optional: true },
  { name: 'RiskProfile', label: 'Risk Profile', type: 'String', optional: true },
  { name: 'Role', label: 'Role', type: 'String', optional: true },
  { name: 'AssignedTo', label: 'Assigned To', type: 'String', optional: true },
  { name: 'LifecycleStage', label: 'Lifecycle Stage', type: 'String', optional: true },
  { name: 'CompletedEnvelopeId', label: 'Completed Envelope ID', type: 'String', optional: true },
  { name: 'CreatedAt', label: 'Created At', type: 'DateTime', optional: true, readableOnly: true },
  { name: 'UpdatedAt', label: 'Updated At', type: 'DateTime', optional: true, readableOnly: true }
];

function createDecorator(name, value) {
  return {
    $class: 'concerto.metamodel@1.0.0.Decorator',
    name,
    arguments: [
      {
        $class: 'concerto.metamodel@1.0.0.DecoratorString',
        value
      }
    ]
  };
}

function createPropertyDeclaration(field) {
  const propertyClass = field.type === 'Double'
    ? 'concerto.metamodel@1.0.0.DoubleProperty'
    : field.type === 'DateTime'
      ? 'concerto.metamodel@1.0.0.DateTimeProperty'
      : 'concerto.metamodel@1.0.0.StringProperty';

  return {
    $class: propertyClass,
    name: field.name,
    isArray: false,
    isOptional: !!field.optional,
    decorators: [
      createDecorator('Term', field.label),
      createDecorator('Crud', field.readableOnly ? 'Readable' : 'Createable,Readable,Updateable')
    ]
  };
}

const TYPE_DEFINITIONS = {
  declarations: [
    {
      $class: 'concerto.metamodel@1.0.0.ConceptDeclaration',
      name: TYPE_NAME,
      namespace: 'org.tgk.maestro',
      fullyQualifiedName: `org.tgk.maestro.${TYPE_NAME}`,
      identified: true,
      identifierFieldName: 'Id',
      decorators: [
        createDecorator('Term', 'Profile'),
        createDecorator('Crud', 'Createable,Readable,Updateable')
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
