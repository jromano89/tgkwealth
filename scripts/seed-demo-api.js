const BASE_URL = String(process.env.TGK_SEED_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const APP_SLUG = process.env.TGK_SEED_APP_SLUG || 'tgk-wealth';
const DEFAULT_SCOPES = 'signature impersonation aow_manage organization_read webforms_manage webforms_read webforms_instance_read webforms_instance_write adm_store_unified_repo_read';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'X-Demo-App': APP_SLUG
};

function account(id, name, accountType, typeCode, value, ytdReturn, allocations, extra = {}) {
  return {
    id,
    kind: 'account',
    status: extra.status || 'active',
    name,
    accountType,
    typeCode,
    value,
    ytdReturn,
    allocEquity: allocations.equity,
    allocFixed: allocations.fixed,
    allocAlt: allocations.alt,
    allocCash: allocations.cash,
    ...extra
  };
}

const employees = [
  {
    id: '4871abfa-8868-4501-b068-5936c6363e6b',
    displayName: 'Gordon Gecko',
    email: 'g.gecko@tgkwealth.com',
    phone: '(212) 555-0100',
    title: 'Senior Advisor',
    data: { firstName: 'Gordon', lastName: 'Gecko', avatar: 'GG' }
  },
  {
    id: '0cb0b7b2-78db-4e38-9c14-d665bbbe8ad9',
    displayName: 'Serena Blake',
    email: 's.blake@tgkwealth.com',
    phone: '(212) 555-0144',
    title: 'Private Wealth Advisor',
    data: { firstName: 'Serena', lastName: 'Blake', avatar: 'SB' }
  }
];

const customers = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    employeeId: employees[0].id,
    displayName: 'Amina Rahal',
    email: 'amina.rahal@rahalventures.com',
    phone: '(917) 555-0111',
    organization: 'Rahal Ventures',
    status: 'review',
    data: {
      firstName: 'Amina',
      lastName: 'Rahal',
      avatar: '#355c7d',
      contactType: 'investor',
      role: 'Founder Household',
      riskProfile: 'Balanced Growth',
      status: 'review',
      value: 9600000,
      netWorth: 21700000,
      changePct: 0.028,
      tags: ['review-needed', 'philanthropy'],
      accounts: [
        account('acct-amina-1', 'Global Growth Portfolio', 'Taxable', 'brokerage', 6100000, 0.083, { equity: 61, fixed: 15, alt: 18, cash: 6 }),
        account('acct-amina-2', 'Impact Reserve', 'Trust', 'trust', 3500000, 0.051, { equity: 34, fixed: 32, alt: 20, cash: 14 })
      ]
    }
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    employeeId: employees[1].id,
    displayName: 'Camila Roth',
    email: 'camila@rothstudio.com',
    phone: '(646) 555-0112',
    organization: 'Roth Studio Holdings',
    status: 'active',
    data: {
      firstName: 'Camila',
      lastName: 'Roth',
      avatar: '#c06c84',
      contactType: 'investor',
      role: 'Executive Household',
      riskProfile: 'Moderate',
      status: 'active',
      value: 10800000,
      netWorth: 24300000,
      changePct: 0.019,
      tags: ['income', 'estate-planning'],
      accounts: [
        account('acct-camila-1', 'Family Opportunity Account', 'Taxable', 'brokerage', 6800000, 0.072, { equity: 52, fixed: 22, alt: 16, cash: 10 }),
        account('acct-camila-2', 'Municipal Income Sleeve', 'Trust', 'income', 4000000, 0.039, { equity: 16, fixed: 61, alt: 8, cash: 15 })
      ]
    }
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    employeeId: employees[0].id,
    displayName: 'Eleanor Wren',
    email: 'eleanor@wrencapital.com',
    phone: '(212) 555-0113',
    organization: 'Wren Capital',
    status: 'active',
    data: {
      firstName: 'Eleanor',
      lastName: 'Wren',
      avatar: '#6c5b7b',
      contactType: 'investor',
      role: 'Family Office Principal',
      riskProfile: 'Balanced Growth',
      status: 'active',
      value: 22400000,
      netWorth: 48100000,
      changePct: 0.024,
      tags: ['long-term', 'tax-aware'],
      accounts: [
        account('acct-eleanor-1', 'Wren Family Office Core', 'Family Office', 'brokerage', 14700000, 0.076, { equity: 55, fixed: 18, alt: 20, cash: 7 }),
        account('acct-eleanor-2', 'Private Markets Reserve', 'Alternative', 'alternative', 7700000, 0.064, { equity: 22, fixed: 11, alt: 55, cash: 12 })
      ]
    }
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    employeeId: employees[1].id,
    displayName: 'Isabella Monroe',
    email: 'isabella@monroefamily.com',
    phone: '(917) 555-0114',
    organization: 'Monroe Family Office',
    status: 'active',
    data: {
      firstName: 'Isabella',
      lastName: 'Monroe',
      avatar: '#f67280',
      contactType: 'investor',
      role: 'Multi-Generational Family',
      riskProfile: 'Moderate Growth',
      status: 'active',
      value: 15900000,
      netWorth: 33600000,
      changePct: 0.017,
      tags: ['trusts', 'family-governance'],
      accounts: [
        account('acct-isabella-1', 'Monroe Family Partnership', 'Partnership', 'brokerage', 9800000, 0.069, { equity: 48, fixed: 24, alt: 18, cash: 10 }),
        account('acct-isabella-2', 'Generational Trust Reserve', 'Trust', 'trust', 6100000, 0.044, { equity: 28, fixed: 46, alt: 12, cash: 14 })
      ]
    }
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    employeeId: employees[0].id,
    displayName: 'Julian Mercer',
    email: 'julian@mercerlogistics.com',
    phone: '(347) 555-0115',
    organization: 'Mercer Logistics Group',
    status: 'pending',
    data: {
      firstName: 'Julian',
      lastName: 'Mercer',
      avatar: '#99b898',
      contactType: 'investor',
      role: 'Business Owner',
      riskProfile: 'Growth',
      status: 'pending',
      value: 12300000,
      netWorth: 27200000,
      changePct: 0.013,
      tags: ['new-household', 'transfer-in-progress'],
      accounts: [
        account('acct-julian-1', 'Founder Liquidity Account', 'Taxable', 'brokerage', 7300000, 0.058, { equity: 57, fixed: 12, alt: 16, cash: 15 }),
        account('acct-julian-2', 'Short Duration Reserve', 'Cash Management', 'cash', 5000000, 0.021, { equity: 0, fixed: 28, alt: 0, cash: 72 }, { status: 'pending' })
      ]
    }
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    employeeId: employees[1].id,
    displayName: 'Nathaniel Brooks',
    email: 'nathaniel@brooksadvisory.com',
    phone: '(929) 555-0116',
    organization: 'Brooks Advisory Partners',
    status: 'active',
    data: {
      firstName: 'Nathaniel',
      lastName: 'Brooks',
      avatar: '#45ada8',
      contactType: 'investor',
      role: 'Retiring Executive',
      riskProfile: 'Balanced',
      status: 'active',
      value: 14100000,
      netWorth: 29800000,
      changePct: 0.015,
      tags: ['retirement-income', 'tax-aware'],
      accounts: [
        account('acct-nathaniel-1', 'Executive Transition Portfolio', 'Taxable', 'brokerage', 8600000, 0.061, { equity: 41, fixed: 31, alt: 13, cash: 15 }),
        account('acct-nathaniel-2', 'IRA Income Sleeve', 'Retirement', 'retirement', 5500000, 0.049, { equity: 29, fixed: 52, alt: 7, cash: 12 })
      ]
    }
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    employeeId: employees[0].id,
    displayName: 'Sebastian Vale',
    email: 'sebastian@valeindustries.com',
    phone: '(718) 555-0117',
    organization: 'Vale Industries',
    status: 'review',
    data: {
      firstName: 'Sebastian',
      lastName: 'Vale',
      avatar: '#355c7d',
      contactType: 'investor',
      role: 'Concentrated Position Household',
      riskProfile: 'Growth',
      status: 'review',
      value: 18700000,
      netWorth: 41400000,
      changePct: -0.008,
      tags: ['review-needed', 'concentrated-position'],
      accounts: [
        account('acct-sebastian-1', 'Vale Core Equity', 'Taxable', 'brokerage', 12500000, 0.071, { equity: 73, fixed: 7, alt: 12, cash: 8 }),
        account('acct-sebastian-2', 'Hedging Reserve', 'Cash Management', 'cash', 6200000, 0.018, { equity: 6, fixed: 18, alt: 19, cash: 57 })
      ]
    }
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    employeeId: employees[1].id,
    displayName: 'Victor Chen',
    email: 'victor@chenholdings.com',
    phone: '(646) 555-0118',
    organization: 'Chen Holdings',
    status: 'active',
    data: {
      firstName: 'Victor',
      lastName: 'Chen',
      avatar: '#2a363b',
      contactType: 'investor',
      role: 'Serial Entrepreneur',
      riskProfile: 'Moderate Growth',
      status: 'active',
      value: 16800000,
      netWorth: 36200000,
      changePct: 0.022,
      tags: ['liquidity-planning', 'alternative-heavy'],
      accounts: [
        account('acct-victor-1', 'Chen Strategic Growth', 'Taxable', 'brokerage', 9900000, 0.074, { equity: 49, fixed: 14, alt: 25, cash: 12 }),
        account('acct-victor-2', 'Private Credit Reserve', 'Alternative', 'alternative', 6900000, 0.056, { equity: 10, fixed: 33, alt: 45, cash: 12 })
      ]
    }
  }
];

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${path} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  await request('/api/auth/scopes', {
    method: 'POST',
    body: JSON.stringify({ scopes: DEFAULT_SCOPES })
  });

  for (const employee of employees) {
    await request('/api/data/employees', { method: 'POST', body: JSON.stringify(employee) });
  }

  for (const customer of customers) {
    await request('/api/data/customers', { method: 'POST', body: JSON.stringify(customer) });
  }

  const [seededEmployees, seededCustomers, seededTasks, seededEnvelopes] = await Promise.all([
    request('/api/data/employees'),
    request('/api/data/customers'),
    request('/api/data/tasks'),
    request('/api/data/envelopes')
  ]);

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    appSlug: APP_SLUG,
    employees: seededEmployees.length,
    customers: seededCustomers.length,
    tasks: seededTasks.length,
    envelopes: seededEnvelopes.length,
    totalAum: seededCustomers.reduce((sum, customer) => sum + Number(customer.data?.value || 0), 0)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
