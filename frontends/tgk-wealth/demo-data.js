const DEMO_BOOTSTRAP = {
  app: {
    slug: 'tgk-wealth',
    name: 'TGK Wealth',
    bootstrapVersion: '1'
  },
  profiles: [
    {
      ref: 'bud-fox',
      kind: 'investor',
      displayName: 'Bud Fox',
      email: 'bud.fox@bluestar.com',
      phone: '(212) 555-0147',
      organization: 'Blue Star Airlines',
      status: 'active',
      tags: ['high-value', 'active'],
      data: { firstName: 'Bud', lastName: 'Fox', value: 472000000, netWorth: 472000000, changePct: 8.4, riskProfile: 'Aggressive Growth', role: 'Private Banking Client', assignedTo: 'Gordon Gecko', avatar: '#3b5bdb' }
    },
    {
      ref: 'mary-jones',
      kind: 'investor',
      displayName: 'Mary Jones',
      email: 'mary.jones@email.com',
      phone: '(415) 555-0298',
      status: 'active',
      tags: ['active'],
      data: { firstName: 'Mary', lastName: 'Jones', value: 285000000, netWorth: 320000000, changePct: 4.2, riskProfile: 'Moderate Growth', role: 'Wealth Management Client', assignedTo: 'Gordon Gecko', avatar: '#16a34a' }
    },
    {
      ref: 'richard-ashworth',
      kind: 'investor',
      displayName: 'Richard & Elena Ashworth',
      email: 'r.ashworth@ashworthfamily.com',
      phone: '(617) 555-0183',
      organization: 'Ashworth Family Office',
      status: 'active',
      tags: ['high-value', 'family-office'],
      data: { firstName: 'Richard & Elena', lastName: 'Ashworth', value: 1520000000, netWorth: 1870000000, changePct: 2.8, riskProfile: 'Conservative Income', role: 'Family Office', assignedTo: 'Gordon Gecko', avatar: '#f59f00' }
    },
    {
      ref: 'david-nakamura',
      kind: 'investor',
      displayName: 'David Nakamura',
      email: 'd.nakamura@techventures.io',
      phone: '(650) 555-0412',
      organization: 'Tech Ventures Capital',
      status: 'review',
      tags: ['review-needed'],
      data: { firstName: 'David', lastName: 'Nakamura', value: 710000000, netWorth: 845000000, changePct: -1.3, riskProfile: 'Aggressive Growth', role: 'Private Banking Client', assignedTo: 'Gordon Gecko', avatar: '#dc2626' }
    },
    {
      ref: 'catherine-beaumont',
      kind: 'investor',
      displayName: 'Catherine Beaumont',
      email: 'c.beaumont@bostontrust.org',
      phone: '(508) 555-0376',
      organization: 'Beaumont Boston Trust',
      status: 'active',
      tags: ['high-value', 'trust'],
      data: { firstName: 'Catherine', lastName: 'Beaumont', value: 1080000000, netWorth: 1230000000, changePct: 1.7, riskProfile: 'Balanced', role: 'Trust & Estate Client', assignedTo: 'Gordon Gecko', avatar: '#7c3aed' }
    },
    {
      ref: 'james-holden',
      kind: 'investor',
      displayName: 'James & Priya Holden',
      email: 'holden.family@email.com',
      phone: '(312) 555-0589',
      status: 'active',
      tags: ['active'],
      data: { firstName: 'James & Priya', lastName: 'Holden', value: 490000000, netWorth: 560000000, changePct: 3.1, riskProfile: 'Moderate Growth', role: 'Wealth Management Client', assignedTo: 'Gordon Gecko', avatar: '#0ea5e9' }
    },
    {
      ref: 'sophia-reyes-martin',
      kind: 'investor',
      displayName: 'Sophia Reyes-Martin',
      email: 'sophia.rm@brickellwealth.com',
      phone: '(305) 555-0721',
      organization: 'Brickell Wealth Group',
      status: 'pending',
      tags: ['pending-onboard'],
      data: { firstName: 'Sophia', lastName: 'Reyes-Martin', value: 620000000, netWorth: 780000000, changePct: 2.1, riskProfile: 'Growth', role: 'Private Banking Client', assignedTo: 'Gordon Gecko', avatar: '#ec4899' }
    }
  ],
  records: [
    { ref: 'acct-bud-1', profileRef: 'bud-fox', kind: 'account', title: 'Individual Brokerage', status: 'active', data: { typeCode: 'type-a', accountType: 'Taxable', value: 218000000, ytdReturn: 11.2, allocEquity: 65, allocFixed: 15, allocAlt: 12, allocCash: 8 } },
    { ref: 'acct-bud-2', profileRef: 'bud-fox', kind: 'account', title: 'Traditional IRA', status: 'active', data: { typeCode: 'type-b', accountType: 'Tax-Deferred', value: 105000000, ytdReturn: 5.3, allocEquity: 55, allocFixed: 30, allocAlt: 10, allocCash: 5 } },
    { ref: 'acct-bud-3', profileRef: 'bud-fox', kind: 'account', title: 'Roth IRA', status: 'active', data: { typeCode: 'type-c', accountType: 'Tax-Free', value: 89000000, ytdReturn: 9.1, allocEquity: 70, allocFixed: 10, allocAlt: 15, allocCash: 5 } },
    { ref: 'acct-bud-4', profileRef: 'bud-fox', kind: 'account', title: 'Trust Account', status: 'active', data: { typeCode: 'type-d', accountType: 'Trust', value: 60000000, ytdReturn: 3.8, allocEquity: 40, allocFixed: 40, allocAlt: 10, allocCash: 10 } },
    { ref: 'acct-mary-1', profileRef: 'mary-jones', kind: 'account', title: 'Individual Brokerage', status: 'active', data: { typeCode: 'type-a', accountType: 'Taxable', value: 165000000, ytdReturn: 8.7, allocEquity: 60, allocFixed: 20, allocAlt: 12, allocCash: 8 } },
    { ref: 'acct-mary-2', profileRef: 'mary-jones', kind: 'account', title: '401(k) Rollover IRA', status: 'active', data: { typeCode: 'type-b', accountType: 'Tax-Deferred', value: 120000000, ytdReturn: 4.9, allocEquity: 50, allocFixed: 35, allocAlt: 10, allocCash: 5 } },
    { ref: 'acct-ashworth-1', profileRef: 'richard-ashworth', kind: 'account', title: 'Family Office Portfolio', status: 'active', data: { typeCode: 'type-a', accountType: 'Taxable', value: 820000000, ytdReturn: 6.2, allocEquity: 45, allocFixed: 25, allocAlt: 20, allocCash: 10 } },
    { ref: 'acct-ashworth-2', profileRef: 'richard-ashworth', kind: 'account', title: 'Charitable Trust', status: 'active', data: { typeCode: 'type-c', accountType: 'Trust', value: 350000000, ytdReturn: 3.1, allocEquity: 30, allocFixed: 45, allocAlt: 15, allocCash: 10 } },
    { ref: 'acct-ashworth-3', profileRef: 'richard-ashworth', kind: 'account', title: 'Generation-Skipping Trust', status: 'active', data: { typeCode: 'type-d', accountType: 'Trust', value: 350000000, ytdReturn: 4.5, allocEquity: 50, allocFixed: 30, allocAlt: 15, allocCash: 5 } },
    { ref: 'acct-david-1', profileRef: 'david-nakamura', kind: 'account', title: 'Individual Brokerage', status: 'active', data: { typeCode: 'type-a', accountType: 'Taxable', value: 450000000, ytdReturn: -2.1, allocEquity: 80, allocFixed: 5, allocAlt: 10, allocCash: 5 } },
    { ref: 'acct-david-2', profileRef: 'david-nakamura', kind: 'account', title: 'SEP IRA', status: 'active', data: { typeCode: 'type-b', accountType: 'Tax-Deferred', value: 260000000, ytdReturn: 1.4, allocEquity: 70, allocFixed: 15, allocAlt: 10, allocCash: 5 } },
    { ref: 'acct-catherine-1', profileRef: 'catherine-beaumont', kind: 'account', title: 'Beaumont Family Trust', status: 'active', data: { typeCode: 'type-c', accountType: 'Trust', value: 680000000, ytdReturn: 4.2, allocEquity: 40, allocFixed: 35, allocAlt: 15, allocCash: 10 } },
    { ref: 'acct-catherine-2', profileRef: 'catherine-beaumont', kind: 'account', title: 'Personal Brokerage', status: 'active', data: { typeCode: 'type-a', accountType: 'Taxable', value: 400000000, ytdReturn: 5.8, allocEquity: 55, allocFixed: 25, allocAlt: 12, allocCash: 8 } },
    { ref: 'acct-james-1', profileRef: 'james-holden', kind: 'account', title: 'Joint Brokerage', status: 'active', data: { typeCode: 'type-a', accountType: 'Taxable', value: 280000000, ytdReturn: 7.3, allocEquity: 60, allocFixed: 20, allocAlt: 12, allocCash: 8 } },
    { ref: 'acct-james-2', profileRef: 'james-holden', kind: 'account', title: 'James IRA', status: 'active', data: { typeCode: 'type-b', accountType: 'Tax-Deferred', value: 120000000, ytdReturn: 4.1, allocEquity: 50, allocFixed: 30, allocAlt: 10, allocCash: 10 } },
    { ref: 'acct-james-3', profileRef: 'james-holden', kind: 'account', title: 'Priya IRA', status: 'active', data: { typeCode: 'type-b', accountType: 'Tax-Deferred', value: 90000000, ytdReturn: 4.8, allocEquity: 55, allocFixed: 25, allocAlt: 12, allocCash: 8 } },
    { ref: 'acct-sophia-1', profileRef: 'sophia-reyes-martin', kind: 'account', title: 'Individual Brokerage', status: 'pending', data: { typeCode: 'type-a', accountType: 'Taxable', value: 420000000, ytdReturn: 6.5, allocEquity: 65, allocFixed: 15, allocAlt: 12, allocCash: 8 } },
    { ref: 'acct-sophia-2', profileRef: 'sophia-reyes-martin', kind: 'account', title: 'Roth IRA', status: 'pending', data: { typeCode: 'type-b', accountType: 'Tax-Free', value: 200000000, ytdReturn: 8.2, allocEquity: 70, allocFixed: 10, allocAlt: 15, allocCash: 5 } }
  ]
};

if (typeof window !== 'undefined') {
  window.DEMO_BOOTSTRAP = DEMO_BOOTSTRAP;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DEMO_BOOTSTRAP;
}
