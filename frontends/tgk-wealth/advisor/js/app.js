const MAESTRO_CONTACT_SOURCE = 'maestro-extension';
const MAESTRO_POLL_INTERVAL_MS = 1500;
const MAESTRO_COMPLETION_SETTLE_DELAY_MS = 400;
const MAESTRO_SUCCESS_REDIRECT_DELAY_MS = 2000;
const CLIENT_DETAIL_REFRESH_MS = 5000;
const RECENT_ACTIVITY_TEMPLATES = [
  { tone: 'emerald', action: 'Portfolio review queued' },
  { tone: 'blue', action: 'Documents ready for signature' },
  { tone: 'amber', action: 'Suitability refresh due soon' },
  { tone: 'violet', action: 'Household snapshot updated' }
];

const ADVISOR_DOCUMENT_CONTACT_FALLBACKS = [
  { first_name: 'Amelia', last_name: 'Hart', metadata: { riskProfile: 'Balanced' } },
  { first_name: 'Daniel', last_name: 'Kim', metadata: { riskProfile: 'Moderate Growth' } },
  { first_name: 'Priya', last_name: 'Shah', metadata: { riskProfile: 'Growth' } },
  { first_name: 'Marcus', last_name: 'Reed', metadata: { riskProfile: 'Moderate' } },
  { first_name: 'Sofia', last_name: 'Alvarez', metadata: { riskProfile: 'Conservative' } }
];

const ADVISOR_DOCUMENT_INSIGHT_TEMPLATES = [
  {
    id: 'fee-schedule-renewal',
    clientIndex: 0,
    agreement: 'Advisory Fee Schedule',
    category: 'Renewal',
    priority: 'High',
    tone: 'amber',
    dueAt: '2026-04-18',
    secondaryDateLabel: 'Notice deadline',
    secondaryDate: '2026-04-07',
    aiSignal: 'Auto-renewal + fee escalation',
    summary: 'Pricing rolls forward automatically unless notice is sent before the annual renewal window closes.',
    impact: 'The household could shift into a higher fee tier without an active review.',
    extractedClause: 'The schedule renews for successive one-year terms unless written notice is delivered at least 30 days before renewal.',
    nextStep: 'Confirm the intended fee tier and prepare notice if any pricing adjustment is needed.',
    detailNotes: [
      'Reconcile the current AUM band against the renewal schedule.',
      'Coordinate any pricing notice with operations before the objection window closes.'
    ]
  },
  {
    id: 'lending-indemnity',
    clientIndex: 1,
    agreement: 'Securities-Backed Lending Addendum',
    category: 'Clause risk',
    priority: 'High',
    tone: 'red',
    dueAt: '2026-04-11',
    secondaryDateLabel: 'Review with counsel',
    secondaryDate: '2026-04-04',
    aiSignal: 'Broad indemnity carve-out missing',
    summary: 'The lender indemnity appears broader than the firm standard and does not clearly exclude lender negligence.',
    impact: 'If a dispute arises, the client may absorb losses that would normally stay with the lender.',
    extractedClause: 'Client agrees to indemnify lender for all losses arising out of the credit facility, without a negligence or willful misconduct carve-out.',
    nextStep: 'Escalate to legal and confirm whether the current client package should be re-papered.',
    detailNotes: [
      'Compare against the latest house form before the facility is renewed.',
      'Confirm whether any negotiated side letter narrows the indemnity scope.'
    ]
  },
  {
    id: 'private-fund-side-letter',
    clientIndex: 2,
    agreement: 'Private Fund Side Letter',
    category: 'Expiration',
    priority: 'Medium',
    tone: 'blue',
    dueAt: '2026-05-09',
    secondaryDateLabel: 'Election window',
    secondaryDate: '2026-04-29',
    aiSignal: 'MFN election period closes soon',
    summary: 'The client has a narrow window to elect enhanced rights under the fund side letter.',
    impact: 'Missing the election date could leave the client on less favorable reporting and liquidity terms.',
    extractedClause: 'Most-favored nation elections must be exercised within ten business days after delivery of the annual side letter package.',
    nextStep: 'Review the available elections with the client and confirm whether any enhanced rights should be claimed.',
    detailNotes: [
      'Coordinate with fund counsel on the current election package.',
      'Capture any election in the client service checklist once submitted.'
    ]
  },
  {
    id: 'trust-assignment-consent',
    clientIndex: 3,
    agreement: 'Trust Services Engagement Letter',
    category: 'Consent',
    priority: 'Medium',
    tone: 'violet',
    dueAt: '2026-04-24',
    secondaryDateLabel: 'Operational handoff',
    secondaryDate: '2026-04-16',
    aiSignal: 'Assignment consent required',
    summary: 'The engagement letter requires written client consent before any advisor-of-record or servicing entity change.',
    impact: 'Operational changes could stall if the consent packet is not prepared early.',
    extractedClause: 'Neither party may assign this engagement without prior written consent from the other party, which may not be unreasonably withheld.',
    nextStep: 'Prepare a consent packet if the relationship is moving to a new servicing team this quarter.',
    detailNotes: [
      'Confirm whether any internal servicing move is already planned.',
      'Include trust officer and client signatures in the same packet if reassignment proceeds.'
    ]
  },
  {
    id: 'hedging-termination-trigger',
    clientIndex: 4,
    agreement: 'Concentrated Position Hedging Agreement',
    category: 'Clause risk',
    priority: 'High',
    tone: 'red',
    dueAt: '2026-04-15',
    secondaryDateLabel: 'Portfolio review',
    secondaryDate: '2026-04-08',
    aiSignal: 'Early termination trigger',
    summary: 'The hedge can be unwound early if the collateral position drops past a short NAV threshold.',
    impact: 'An early unwind could leave the client re-exposed to a concentrated single-name position.',
    extractedClause: 'Counterparty may terminate the hedge upon ten days’ notice if collateral value declines below the minimum support threshold.',
    nextStep: 'Review the current collateral buffer and decide whether the hedge should be resized or re-papered.',
    detailNotes: [
      'Validate the latest collateral mark before the next investment committee review.',
      'Consider whether a secondary hedge would reduce concentration risk.'
    ]
  }
];

function formatDisplayDate(dateString, options = {}) {
  if (!dateString) return '';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options
  }).format(parsed);
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
}

function formatDeadlineLabel(dateString) {
  const delta = daysUntil(dateString);
  if (delta == null) return 'No deadline';
  if (delta === 0) return 'Due today';
  if (delta === 1) return 'Due tomorrow';
  if (delta > 1) return `Due in ${delta} days`;
  if (delta === -1) return '1 day overdue';
  return `${Math.abs(delta)} days overdue`;
}

function resolveInsightContact(contacts, index) {
  return contacts[index] || ADVISOR_DOCUMENT_CONTACT_FALLBACKS[index] || ADVISOR_DOCUMENT_CONTACT_FALLBACKS[0];
}

function buildDocumentInsight(template, contacts, currentUser) {
  const contact = resolveInsightContact(contacts, template.clientIndex);
  return {
    ...template,
    clientId: contact.id || null,
    clientName: `${contact.first_name} ${contact.last_name}`,
    clientRiskProfile: contact.metadata?.riskProfile || 'Balanced',
    ownerName: currentUser?.name || 'Gordon Gecko',
    dueLabel: formatDeadlineLabel(template.dueAt),
    dueDateLabel: formatDisplayDate(template.dueAt, { month: 'short', day: 'numeric' }),
    secondaryDateValue: formatDisplayDate(template.secondaryDate, { month: 'short', day: 'numeric' })
  };
}

function buildDocumentInsights(contacts, currentUser) {
  return ADVISOR_DOCUMENT_INSIGHT_TEMPLATES
    .map((template) => buildDocumentInsight(template, contacts, currentUser))
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
}

function advisorApp() {
  return {
    ...createBrandingState(),
    ...createEnvelopeModalHelpers(),
    view: 'dashboard',
    currentUser: null,
    contacts: [],
    selectedContact: null,
    selectedContactAccounts: [],
    selectedContactEnvelopes: [],
    _clientDetailRefreshTimer: null,
    searchQuery: '',
    showOnboarding: false,
    maestroWorkflowId: window.TGK_DEMO?.config?.idvWorkflowId || '8a7bbe6b-badc-4413-818b-2e92868de402',
    maestroInstanceUrl: '',
    maestroError: null,
    maestroLoading: false,
    maestroCompleted: false,
    maestroNewContact: null,
    onboardingLoadingIndex: 0,
    onboardingLoadingTimer: null,
    sidebarCollapsed: false,
    loading: true,
    documentInsightOpenId: null,
    _maestroCreationPollTimer: null,
    _maestroRedirectTimer: null,
    _maestroTrackingStarted: false,
    _maestroKnownContactIds: new Set(),

    async init() {
      this.initializeBrandingState();
      try {
        const users = await TGK_API.getUsers();
        this.currentUser = users[0] || null;
        this.contacts = await TGK_API.getContacts();
        this.setView('dashboard');
      } catch (e) {
        console.error('Failed to load contacts:', e);
      }
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    setView(nextView) {
      const allowedViews = new Set(['dashboard', 'documents', 'settings', 'client']);
      const resolvedView = allowedViews.has(nextView) ? nextView : 'dashboard';

      this.view = resolvedView;

      if (resolvedView !== 'documents') {
        this.closeDocumentInsight();
      }
    },

    get filteredContacts() {
      if (!this.searchQuery.trim()) return this.contacts;
      const q = this.searchQuery.toLowerCase();
      return this.contacts.filter(c =>
        `${c.first_name} ${c.last_name} ${c.email} ${c.metadata?.role || ''} ${c.metadata?.riskProfile || ''}`.toLowerCase().includes(q)
      );
    },

    get totalAum() {
      return this.contacts.reduce((sum, c) => sum + (c.metadata?.value || 0), 0);
    },

    get totalNetWorth() {
      return this.contacts.reduce((sum, c) => sum + (c.metadata?.netWorth || 0), 0);
    },

    get pendingReviews() {
      return this.contacts.filter(c => c.metadata?.status === 'review').length;
    },

    get complianceAlerts() {
      return this.contacts.filter(c => c.tags?.includes('review-needed')).length;
    },

    get documentInsights() {
      return buildDocumentInsights(this.contacts, this.currentUser);
    },

    get documentSummaryCards() {
      const insights = this.documentInsights;
      const renewals = insights.filter((item) => ['Renewal', 'Expiration'].includes(item.category));
      const clauseAlerts = insights.filter((item) => item.category === 'Clause risk');
      const impactedClients = new Set(insights.map((item) => item.clientName));
      const nextDeadline = insights[0];

      return [
        {
          label: 'Upcoming renewals',
          value: String(renewals.length),
          detail: 'Renewal and expiration windows in the next cycle',
          tone: 'amber'
        },
        {
          label: 'Clause alerts',
          value: String(clauseAlerts.length),
          detail: 'Non-standard terms worth escalating',
          tone: 'red'
        },
        {
          label: 'Clients impacted',
          value: String(impactedClients.size),
          detail: 'Households with at least one agreement action',
          tone: 'blue'
        },
        {
          label: 'Next deadline',
          value: nextDeadline ? nextDeadline.dueDateLabel : 'None',
          detail: nextDeadline ? nextDeadline.aiSignal : 'No active review windows',
          tone: 'emerald'
        }
      ];
    },

    get documentRenewalTimeline() {
      return this.documentInsights.filter((item) => ['Renewal', 'Expiration'].includes(item.category)).slice(0, 4);
    },

    get documentClauseSignals() {
      return this.documentInsights.filter((item) => item.aiSignal).slice(0, 3);
    },

    get openDocumentInsight() {
      return this.documentInsights.find((item) => item.id === this.documentInsightOpenId) || null;
    },

    get recentActivities() {
      return this.contacts.slice(0, 4).map((contact, index) => {
        const template = RECENT_ACTIVITY_TEMPLATES[index % RECENT_ACTIVITY_TEMPLATES.length];
        return {
          id: `activity-${contact.id}`,
          contact: `${contact.first_name} ${contact.last_name}`,
          action: template.action,
          tone: template.tone,
          when: formatDisplayDate(contact.updated_at || contact.created_at, {
            month: 'short',
            day: 'numeric'
          }) || 'Today'
        };
      });
    },

    activityDotColor(tone) {
      const tones = {
        emerald: 'bg-emerald-400',
        blue: 'bg-sky-400',
        amber: 'bg-amber-400',
        violet: 'bg-violet-400'
      };
      return tones[tone] || 'bg-slate-400';
    },

    documentMetricBorderClasses(tone) {
      const tones = {
        amber: 'border-amber-500',
        red: 'border-red-500',
        blue: 'border-sky-500',
        emerald: 'border-emerald-500'
      };
      return tones[tone] || 'border-slate-400';
    },

    documentPillClasses(tone) {
      const tones = {
        amber: 'border-amber-100 bg-amber-50 text-amber-700',
        red: 'border-red-100 bg-red-50 text-red-700',
        blue: 'border-sky-100 bg-sky-50 text-sky-700',
        violet: 'border-violet-100 bg-violet-50 text-violet-700',
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700'
      };
      return tones[tone] || 'border-slate-200 bg-slate-100 text-slate-600';
    },

    documentDeadlineTextClasses(tone) {
      const tones = {
        amber: 'text-amber-700',
        red: 'text-red-700',
        blue: 'text-sky-700',
        violet: 'text-violet-700',
        emerald: 'text-emerald-700'
      };
      return tones[tone] || 'text-slate-600';
    },

    openDocumentInsightById(insightId) {
      this.documentInsightOpenId = insightId;
    },

    closeDocumentInsight() {
      this.documentInsightOpenId = null;
    },

    async viewClient(contact) {
      this.selectedContact = contact;
      try {
        const detail = await TGK_API.getContact(contact.id);
        this.selectedContact = detail;
        this.selectedContactAccounts = detail.accounts || [];
        this.selectedContactEnvelopes = detail.envelopes || [];
      } catch (e) {
        this.selectedContactAccounts = [];
        this.selectedContactEnvelopes = [];
      }
      this.setView('client');
      this.startClientDetailRefresh(contact.id);
    },

    startClientDetailRefresh(contactId) {
      this.stopClientDetailRefresh();
      // Only poll if the client is pending — no need to poll active clients
      if (this.selectedContact?.metadata?.status !== 'pending') return;
      const app = this;
      this._clientDetailRefreshTimer = window.setInterval(async function () {
        if (app.view !== 'client' || !app.selectedContact || app.selectedContact.id !== contactId) {
          app.stopClientDetailRefresh();
          return;
        }
        try {
          const detail = await TGK_API.getContact(contactId);
          app.selectedContact = detail;
          app.selectedContactAccounts = detail.accounts || [];
          app.selectedContactEnvelopes = detail.envelopes || [];
          const idx = app.contacts.findIndex(c => c.id === contactId);
          if (idx !== -1) {
            app.contacts[idx] = { ...app.contacts[idx], ...detail, accounts: undefined, envelopes: undefined };
          }
          // Stop polling once the client transitions to active
          if (detail.metadata?.status === 'active') {
            app.stopClientDetailRefresh();
          }
        } catch (e) {
          // Silently ignore refresh failures
        }
      }, CLIENT_DETAIL_REFRESH_MS);
    },

    stopClientDetailRefresh() {
      if (this._clientDetailRefreshTimer) {
        window.clearInterval(this._clientDetailRefreshTimer);
        this._clientDetailRefreshTimer = null;
      }
    },

    async deleteContact(contact, event) {
      event.stopPropagation();
      try {
        await TGK_API.deleteContact(contact.id);
        this.contacts = this.contacts.filter(c => c.id !== contact.id);
        if (this.selectedContact?.id === contact.id) {
          this.goBack();
        }
      } catch (e) {
        console.error('Failed to delete contact:', e);
      }
    },

    goBack() {
      this.stopClientDetailRefresh();
      this.setView('dashboard');
      this.selectedContact = null;
      this.selectedContactAccounts = [];
      this.selectedContactEnvelopes = [];
    },

    resetOnboardingState() {
      this.showOnboarding = false;
      this.maestroInstanceUrl = '';
      this.maestroError = null;
      this.maestroLoading = false;
      this.maestroCompleted = false;
      this.maestroNewContact = null;
      this.stopMaestroCreationPolling();
      this.clearOnboardingRedirectTimer();
      this.stopOnboardingLoading();
      this._maestroTrackingStarted = false;
      this._maestroKnownContactIds = new Set();
    },

    async openOnboarding() {
      this.resetOnboardingState();
      this.showOnboarding = true;
      this.warmOnboarding();
      await this.loadMaestroWorkflow();
    },

    closeOnboarding() {
      this.resetOnboardingState();
    },

    clearOnboardingRedirectTimer() {
      if (this._maestroRedirectTimer) {
        window.clearTimeout(this._maestroRedirectTimer);
        this._maestroRedirectTimer = null;
      }
    },

    warmOnboarding() {
      return TGK_API.warmDocusignExperience();
    },

    async fetchMaestroContacts() {
      try {
        return await TGK_API.getContacts({ source: MAESTRO_CONTACT_SOURCE });
      } catch (e) {
        return [];
      }
    },

    async snapshotMaestroContacts() {
      const contacts = await this.fetchMaestroContacts();
      this._maestroKnownContactIds = new Set((contacts || []).map((contact) => contact.id));
    },

    async refreshContactsAfterOnboarding(targetId) {
      try {
        const contacts = await TGK_API.getContacts();
        this.contacts = contacts;
        return contacts.find((contact) => contact.id === targetId) || null;
      } catch (e) {
        return null;
      }
    },

    async handleOnboardingFrameLoad() {
      if (this._maestroTrackingStarted || this.maestroCompleted || this.maestroError) {
        return;
      }

      this._maestroTrackingStarted = true;
      await this.snapshotMaestroContacts();

      if (!this.showOnboarding || this.maestroCompleted) {
        return;
      }

      this.startMaestroCreationPolling();
    },

    findNewMaestroContact(extensionContacts) {
      const knownIds = this._maestroKnownContactIds || new Set();
      const newContacts = (extensionContacts || []).filter((contact) => !knownIds.has(contact.id));

      if (newContacts.length === 0) {
        return null;
      }

      return newContacts.reduce(function (a, b) {
        return new Date(b.created_at) > new Date(a.created_at) ? b : a;
      });
    },

    startMaestroCreationPolling() {
      this.stopMaestroCreationPolling();

      const app = this;
      const poll = async function () {
        if (!app.showOnboarding || app.maestroCompleted) {
          return;
        }

        try {
          const extensionContacts = await app.fetchMaestroContacts();
          const target = app.findNewMaestroContact(extensionContacts);

          if (target) {
            await app.completeOnboardingWithContact(target);
            return;
          }
        } catch (e) {
          console.warn('Could not poll for Maestro-created contacts:', e);
        }

        app._maestroCreationPollTimer = window.setTimeout(poll, MAESTRO_POLL_INTERVAL_MS);
      };

      this._maestroCreationPollTimer = window.setTimeout(poll, MAESTRO_POLL_INTERVAL_MS);
    },

    stopMaestroCreationPolling() {
      if (this._maestroCreationPollTimer) {
        window.clearTimeout(this._maestroCreationPollTimer);
        this._maestroCreationPollTimer = null;
      }
    },

    async completeOnboardingWithContact(target) {
      if (!target || this.maestroCompleted) {
        return;
      }

      this.stopMaestroCreationPolling();
      this.clearOnboardingRedirectTimer();
      if (this._maestroKnownContactIds) {
        this._maestroKnownContactIds.add(target.id);
      }
      const resolvedTarget = await this.refreshContactsAfterOnboarding(target.id) || target;

      const app = this;
      this._maestroRedirectTimer = window.setTimeout(function () {
        app.maestroCompleted = true;
        app.maestroNewContact = resolvedTarget;

        app._maestroRedirectTimer = window.setTimeout(function () {
          app.resetOnboardingState();
          app.viewClient(resolvedTarget);
        }, MAESTRO_SUCCESS_REDIRECT_DELAY_MS);
      }, MAESTRO_COMPLETION_SETTLE_DELAY_MS);
    },

    startOnboardingLoading() {
      this.stopOnboardingLoading();
      this.onboardingLoadingIndex = 0;
      this.onboardingLoadingTimer = window.setInterval(() => {
        this.onboardingLoadingIndex = Math.min(
          this.onboardingLoadingIndex + 1,
          this.onboardingLoadingSteps.length - 1
        );
      }, 1400);
    },

    stopOnboardingLoading() {
      if (this.onboardingLoadingTimer) {
        window.clearInterval(this.onboardingLoadingTimer);
        this.onboardingLoadingTimer = null;
      }
    },

    get onboardingLoadingSteps() {
      return [
        'Connecting to Docusign IAM',
        'Preparing account opening',
        'Launching the embedded experience'
      ];
    },

    async loadMaestroWorkflow() {
      this.stopMaestroCreationPolling();
      this.clearOnboardingRedirectTimer();
      this._maestroTrackingStarted = false;
      this._maestroKnownContactIds = new Set();
      this.maestroLoading = true;
      this.maestroError = null;
      this.maestroInstanceUrl = '';
      this.startOnboardingLoading();

      try {
        const session = await TGK_API.getSession();
        if (!session?.connected) {
          throw new Error('Connect a Docusign account before launching account opening.');
        }
        if (!session?.accountId) {
          throw new Error('Select and save a Docusign account in Settings before launching account opening.');
        }

        const result = await TGK_API.triggerMaestroWorkflow(this.maestroWorkflowId, {
          instance_name: `TGK Wealth Account Opening ${new Date().toISOString()}`,
          trigger_inputs: {}
        });

        if (!result?.instance_url) {
          throw new Error('Docusign IAM did not return a launch URL.');
        }

        this.maestroInstanceUrl = result.instance_url;
      } catch (e) {
        console.error('Failed to load Maestro workflow:', e);
        this.maestroError = e.message || 'Failed to launch account opening.';
        this.stopMaestroCreationPolling();
      } finally {
        this.maestroLoading = false;
        this.stopOnboardingLoading();
      }
    }
  };
}
