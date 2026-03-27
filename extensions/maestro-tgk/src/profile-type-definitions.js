const { mm, createDecorator, crudDecorator, createPropertyDeclaration } = require('./type-helpers');

const TYPE_NAME = 'Profile';
const NAMESPACE = 'org.tgk.maestro';
const TYPE_ALIASES = new Set(['profile', 'investor']);

const TYPE_NAMES = [
  {
    typeName: TYPE_NAME,
    label: 'Profile',
    description: 'TGK profile row'
  }
];

// ── Field schema ──────────────────────────────────────────────────────
// Each entry drives both the Concerto metamodel output and record mapping.
// `type` must be one of: String, Double, DateTime, Integer, Long, Boolean.

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
  { name: 'CreatedAt', label: 'Created At', type: 'DateTime', optional: true, readableOnly: true },
  { name: 'UpdatedAt', label: 'Updated At', type: 'DateTime', optional: true, readableOnly: true }
];

// ── Exported type definition (Concerto ConceptDeclaration) ────────────

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
        createDecorator('Term', 'Profile'),
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
