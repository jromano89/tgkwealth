const MAESTRO_POLL_INTERVAL_MS = 1500;
const MAESTRO_COMPLETION_SETTLE_DELAY_MS = 400;
const MAESTRO_SUCCESS_REDIRECT_DELAY_MS = 2000;
const CLIENT_DETAIL_REFRESH_MS = 5000;

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

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateText(text, limit = 140) {
  const normalized = cleanText(text);
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;
  return normalized.slice(0, limit - 1).trimEnd() + '…';
}

function normalizeSearchText(value) {
  return cleanText(value).toLowerCase();
}

function formatEnumLabel(value) {
  const normalized = cleanText(value);
  if (!normalized) return '';

  return normalized
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of');
}

function formatCompactCurrency(amount, currencyCode = 'USD') {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '';

  const currency = cleanText(currencyCode).toUpperCase() || 'USD';
  const absValue = Math.abs(numeric);

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: absValue >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: absValue >= 1000 ? 1 : 0
    }).format(numeric);
  } catch (error) {
    return `${currency} ${numeric.toLocaleString()}`;
  }
}

function formatDurationLabel(duration) {
  const normalized = cleanText(duration);
  if (!normalized) return '';

  const match = normalized.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/i);
  if (!match) return normalized;

  const [, years, months, weeks, days] = match;
  const parts = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}m`);
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  return parts.join(' ') || normalized;
}

function getAgreementPartyNames(agreement) {
  const parties = Array.isArray(agreement?.parties) ? agreement.parties : [];
  const names = [];
  const seen = new Set();

  parties.forEach((party) => {
    const name = cleanText(party?.name_in_agreement) || cleanText(party?.preferred_name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });

  return names;
}

function selectAgreementMilestone(provisions) {
  const candidates = [
    { label: 'Notice window', date: provisions?.renewal_notice_date },
    { label: 'Expiration', date: provisions?.expiration_date },
    { label: 'Effective date', date: provisions?.effective_date }
  ]
    .map((item) => ({
      ...item,
      delta: daysUntil(item.date)
    }))
    .filter((item) => item.delta != null);

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    const leftRank = left.delta < 0 ? 0 : 1;
    const rightRank = right.delta < 0 ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Math.abs(left.delta) - Math.abs(right.delta);
  });

  return candidates[0];
}

function countCustomAgreementFields(agreement) {
  return [
    agreement?.custom_provisions,
    agreement?.additional_user_defined_data,
    agreement?.additional_custom_clm_data,
    agreement?.additional_custom_esign_data
  ].reduce((sum, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return sum;
    return sum + Object.keys(value).length;
  }, 0);
}

function buildAgreementSummary(rawAgreement, options) {
  const suppliedSummary = cleanText(rawAgreement?.summary);
  if (suppliedSummary) return suppliedSummary;

  const {
    typeLabel,
    sourceLabel,
    milestone,
    reviewPending,
    valueLabel
  } = options;

  if (milestone?.label === 'Notice window') {
    return valueLabel
      ? `${typeLabel} has a renewal notice date on ${formatDisplayDate(milestone.date)} and ${valueLabel} in extracted value.`
      : `${typeLabel} has a renewal notice date on ${formatDisplayDate(milestone.date)}.`;
  }

  if (milestone?.label === 'Expiration') {
    return valueLabel
      ? `${typeLabel} expires on ${formatDisplayDate(milestone.date)} with ${valueLabel} in extracted value.`
      : `${typeLabel} expires on ${formatDisplayDate(milestone.date)}.`;
  }

  if (reviewPending) {
    return valueLabel
      ? `${typeLabel} has ${valueLabel} in extracted value, but the review workflow is not complete yet.`
      : `${typeLabel} has extracted agreement data, but the review workflow is not complete yet.`;
  }

  if (valueLabel) {
    return `${typeLabel} includes extracted economic terms, including ${valueLabel} in agreement value.`;
  }

  return sourceLabel ? `${typeLabel} is on file from ${sourceLabel}.` : `${typeLabel} is on file.`;
}

function buildAgreementSignal(rawAgreement, index) {
  const provisions = rawAgreement?.provisions || {};
  const partyNames = getAgreementPartyNames(rawAgreement);
  const primaryParty = partyNames[0] || 'Unknown party';
  const partyLabel = partyNames.length > 1 ? `${primaryParty} +${partyNames.length - 1}` : primaryParty;
  const title = cleanText(rawAgreement?.title)
    || cleanText(rawAgreement?.file_name)
    || formatEnumLabel(rawAgreement?.type)
    || `Agreement ${index + 1}`;
  const typeLabel = formatEnumLabel(rawAgreement?.type) || 'Agreement';
  const categoryLabel = formatEnumLabel(rawAgreement?.category) || 'Agreement';
  const sourceLabel = cleanText(rawAgreement?.source_name) || 'Imported agreement';
  const statusLabel = formatEnumLabel(rawAgreement?.status) || 'Unknown';
  const reviewStatusLabel = formatEnumLabel(rawAgreement?.review_status) || 'Not reviewed';
  const reviewPending = !!cleanText(rawAgreement?.review_status) && !/complete/i.test(rawAgreement.review_status);
  const milestone = selectAgreementMilestone(provisions);
  const noticeDays = daysUntil(provisions?.renewal_notice_date);
  const expirationDays = daysUntil(provisions?.expiration_date);
  const totalAgreementValue = Number(provisions?.total_agreement_value);
  const annualAgreementValue = Number(provisions?.annual_agreement_value);
  const hasTotalValue = Number.isFinite(totalAgreementValue);
  const hasAnnualValue = Number.isFinite(annualAgreementValue);
  const extractedValue = hasTotalValue ? totalAgreementValue : (hasAnnualValue ? annualAgreementValue : null);
  const extractedValueCurrency = cleanText(provisions?.total_agreement_value_currency_code)
    || cleanText(provisions?.annual_agreement_value_currency_code)
    || 'USD';
  const valueLabel = extractedValue == null ? '' : formatCompactCurrency(extractedValue, extractedValueCurrency);
  const priceCapValue = Number(provisions?.price_cap_percent_increase);
  const liabilityCapFixedAmount = Number(provisions?.liability_cap_fixed_amount);
  const liabilityCapMultiplier = Number(provisions?.liability_cap_multiplier);
  const hasTransferLimits = /CONSENT|CONDITION|RESTRICTION/.test(
    `${cleanText(provisions?.assignment_type)} ${cleanText(provisions?.assignment_change_of_control)}`.toUpperCase()
  );
  const hasPricingSignal = Number.isFinite(priceCapValue) && priceCapValue > 0;
  const hasLiabilitySignal = Number.isFinite(liabilityCapFixedAmount) || Number.isFinite(liabilityCapMultiplier);
  const highValue = extractedValue != null && extractedValue >= 1000000;
  const linkedRecordCount = Array.isArray(rawAgreement?.linked_data) ? rawAgreement.linked_data.length : 0;
  const customFieldCount = countCustomAgreementFields(rawAgreement);

  let signalLabel = 'On file';
  let tone = 'blue';
  let score = 12;

  if (noticeDays != null && noticeDays <= 30) {
    signalLabel = 'Notice window';
    tone = 'red';
    score += 140 - Math.max(noticeDays, -30);
  } else if (noticeDays != null && noticeDays <= 90) {
    signalLabel = 'Renewal watch';
    tone = 'amber';
    score += 105 - Math.max(noticeDays, 0);
  } else if (expirationDays != null && expirationDays <= 30) {
    signalLabel = 'Expires soon';
    tone = 'red';
    score += 120 - Math.max(expirationDays, -30);
  } else if (expirationDays != null && expirationDays <= 120) {
    signalLabel = 'Expiry watch';
    tone = 'amber';
    score += 80 - Math.max(expirationDays, 0);
  } else if (reviewPending) {
    signalLabel = 'Needs review';
    tone = 'sky';
    score += 70;
  } else if (hasTransferLimits) {
    signalLabel = 'Transfer limits';
    tone = 'violet';
    score += 55;
  } else if (highValue) {
    signalLabel = 'High value';
    tone = 'emerald';
    score += 50;
  } else if (hasPricingSignal) {
    signalLabel = 'Pricing term';
    tone = 'blue';
    score += 38;
  } else if (hasLiabilitySignal) {
    signalLabel = 'Liability cap';
    tone = 'blue';
    score += 34;
  }

  if (reviewPending) score += 28;
  if (hasTransferLimits) score += 14;
  if (highValue) score += 20;
  if (hasPricingSignal) score += 8;
  if (hasLiabilitySignal) score += 6;

  const tags = [
    formatEnumLabel(provisions?.renewal_type),
    Number.isFinite(priceCapValue) && priceCapValue > 0 ? `${priceCapValue}% price cap` : '',
    formatEnumLabel(provisions?.assignment_type),
    formatEnumLabel(provisions?.nda_type),
    formatEnumLabel(provisions?.jurisdiction)
  ].filter(Boolean).slice(0, 3);
  const fileName = cleanText(rawAgreement?.file_name);
  const searchText = normalizeSearchText([
    title,
    partyLabel,
    typeLabel,
    statusLabel,
    fileName,
    signalLabel,
    ...tags
  ].filter(Boolean).join(' '));

  const summary = buildAgreementSummary(rawAgreement, {
    typeLabel,
    sourceLabel,
    milestone,
    reviewPending,
    valueLabel
  });

  return {
    id: rawAgreement?.id || `agreement-${index}`,
    title,
    typeLabel,
    categoryLabel,
    statusLabel,
    reviewStatusLabel,
    reviewPending,
    partyNames,
    primaryParty,
    partyLabel,
    signalLabel,
    tone,
    score,
    summary,
    summaryShort: truncateText(summary, 150),
    tags,
    searchText,
    sourceLabel,
    sourceId: cleanText(rawAgreement?.source_id),
    documentHref: rawAgreement?._links?.document?.href || '',
    fileName,
    languagesLabel: Array.isArray(rawAgreement?.languages) && rawAgreement.languages.length > 0
      ? rawAgreement.languages.join(', ')
      : 'Not specified',
    linkedRecordCount,
    customFieldCount,
    extractedValue,
    extractedValueCurrency,
    valueLabel: valueLabel || 'Not extracted',
    annualValueLabel: hasAnnualValue ? formatCompactCurrency(annualAgreementValue, extractedValueCurrency) : 'Not extracted',
    totalValueLabel: hasTotalValue ? formatCompactCurrency(totalAgreementValue, extractedValueCurrency) : 'Not extracted',
    effectiveDate: provisions?.effective_date || '',
    effectiveDateLabel: formatDisplayDate(provisions?.effective_date),
    executionDate: provisions?.execution_date || '',
    executionDateLabel: formatDisplayDate(provisions?.execution_date),
    expirationDate: provisions?.expiration_date || '',
    expirationDateLabel: formatDisplayDate(provisions?.expiration_date),
    renewalNoticeDate: provisions?.renewal_notice_date || '',
    renewalNoticeDateLabel: formatDisplayDate(provisions?.renewal_notice_date),
    renewalTypeLabel: formatEnumLabel(provisions?.renewal_type) || 'Not extracted',
    renewalNoticePeriodLabel: formatDurationLabel(provisions?.renewal_notice_period) || 'Not extracted',
    autoRenewalTermLabel: formatDurationLabel(provisions?.auto_renewal_term_length) || 'Not extracted',
    termLengthLabel: formatDurationLabel(provisions?.term_length) || 'Not extracted',
    assignmentLabel: formatEnumLabel(provisions?.assignment_type) || 'Not extracted',
    changeOfControlLabel: formatEnumLabel(provisions?.assignment_change_of_control) || 'Not extracted',
    terminationRightsLabel: formatEnumLabel(provisions?.assignment_termination_rights) || 'Not extracted',
    governingLawLabel: formatEnumLabel(provisions?.governing_law) || 'Not extracted',
    jurisdictionLabel: formatEnumLabel(provisions?.jurisdiction) || 'Not extracted',
    ndaTypeLabel: formatEnumLabel(provisions?.nda_type) || 'Not extracted',
    paymentTermsLabel: formatEnumLabel(provisions?.payment_terms_due_date) || 'Not extracted',
    lateFeeLabel: provisions?.can_charge_late_payment_fees
      ? `${Number.isFinite(Number(provisions?.late_payment_fee_percent)) ? provisions.late_payment_fee_percent : 0}% late fee`
      : 'No late fee extracted',
    priceCapLabel: Number.isFinite(priceCapValue) ? `${priceCapValue}% price cap` : 'Not extracted',
    liabilityCapLabel: Number.isFinite(liabilityCapFixedAmount)
      ? formatCompactCurrency(liabilityCapFixedAmount, provisions?.liability_cap_currency_code || extractedValueCurrency)
      : (Number.isFinite(liabilityCapMultiplier) ? `${liabilityCapMultiplier}x multiplier` : 'Not extracted'),
    liabilityDurationLabel: formatDurationLabel(provisions?.liability_cap_duration) || 'Not extracted',
    terminationForCauseLabel: formatDurationLabel(provisions?.termination_period_for_cause) || 'Not extracted',
    terminationForConvenienceLabel: formatDurationLabel(provisions?.termination_period_for_convenience) || 'Not extracted',
    nextActionLabel: milestone?.label || (reviewPending ? 'Review pending' : 'No upcoming milestone'),
    nextActionDate: milestone?.date || '',
    nextActionDateLabel: milestone?.date
      ? formatDisplayDate(milestone.date, { month: 'short', day: 'numeric' })
      : 'No date',
    nextActionRelativeLabel: milestone?.date
      ? formatDeadlineLabel(milestone.date)
      : (reviewPending ? 'Review pending' : 'On file'),
    nextActionDelta: milestone?.delta ?? null
  };
}

function advisorApp() {
  return {
    ...createBrandingState(),
    ...createEnvelopeModalHelpers(),
    view: 'dashboard',
    currentUser: null,
    customers: [],
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
    agreementSignalsLoading: false,
    agreementSignalsLoaded: false,
    agreementSignalsError: '',
    navigatorAgreementsResponse: null,
    navigatorAgreementsRaw: [],
    agreementSignalItems: [],
    selectedAgreementSignalId: null,
    agreementSearchQuery: '',
    agreementFilter: 'all',
    _maestroCreationPollTimer: null,
    _maestroRedirectTimer: null,
    _maestroTrackingStarted: false,
    _maestroKnownContactIds: new Set(),

    async init() {
      this.initializeBrandingState();
      try {
        const employees = await TGK_API.getEmployees();
        this.currentUser = employees[0] || null;
        this.customers = await TGK_API.getCustomers();
        this.setView('dashboard');
      } catch (e) {
        console.error('Failed to load customers:', e);
      }
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    setView(nextView) {
      const allowedViews = new Set(['dashboard', 'documents', 'settings', 'client']);
      const resolvedView = allowedViews.has(nextView) ? nextView : 'dashboard';
      this.view = resolvedView;
      if (resolvedView === 'documents') {
        this.loadAgreementSignals();
      }
    },

    get filteredCustomers() {
      if (!this.searchQuery.trim()) return this.customers;
      const q = this.searchQuery.toLowerCase();
      return this.customers.filter(c =>
        `${c.first_name} ${c.last_name} ${c.email} ${c.metadata?.role || ''} ${c.metadata?.riskProfile || ''}`.toLowerCase().includes(q)
      );
    },

    get totalAum() {
      return this.customers.reduce((sum, c) => sum + (c.metadata?.value || 0), 0);
    },

    get totalNetWorth() {
      return this.customers.reduce((sum, c) => sum + (c.metadata?.netWorth || 0), 0);
    },

    get pendingReviews() {
      return this.customers.filter(c => c.metadata?.status === 'review').length;
    },

    get complianceAlerts() {
      return this.customers.filter(c => c.tags?.includes('review-needed')).length;
    },

    get allAgreementSignals() {
      return this.agreementSignalItems;
    },

    get agreementSignals() {
      const query = normalizeSearchText(this.agreementSearchQuery);

      return this.allAgreementSignals.filter((item) => {
        if (!this.matchesAgreementFilter(item, this.agreementFilter)) return false;
        if (!query) return true;
        return item.searchText.includes(query);
      });
    },

    get agreementSummaryCards() {
      const signals = this.allAgreementSignals;
      const actionNow = signals.filter((item) => this.isActionAgreement(item)).length;
      const renewalWatch = signals.filter((item) => this.isRenewalAgreement(item)).length;
      const highValue = signals.filter((item) => this.isHighValueAgreement(item)).length;
      const extractedValues = signals.filter((item) => item.extractedValue != null);
      const trackedValue = extractedValues.reduce((sum, item) => sum + item.extractedValue, 0);
      const trackedValueCurrency = extractedValues[0]?.extractedValueCurrency || 'USD';

      return [
        {
          label: 'Action now',
          value: String(actionNow),
          detail: 'Notice or expiration inside 45 days',
          tone: actionNow > 0 ? 'red' : 'blue'
        },
        {
          label: 'Renewal watch',
          value: String(renewalWatch),
          detail: 'Agreements with extracted renewal terms',
          tone: renewalWatch > 0 ? 'amber' : 'blue'
        },
        {
          label: 'High value',
          value: String(highValue),
          detail: 'At or above $1M in extracted value',
          tone: highValue > 0 ? 'emerald' : 'blue'
        },
        {
          label: 'Tracked value',
          value: trackedValue > 0 ? formatCompactCurrency(trackedValue, trackedValueCurrency) : '—',
          detail: `${extractedValues.length} agreements with extracted economics`,
          tone: 'emerald'
        }
      ];
    },

    get selectedAgreementSignal() {
      return this.allAgreementSignals.find((item) => item.id === this.selectedAgreementSignalId)
        || this.agreementSignals[0]
        || this.allAgreementSignals[0]
        || null;
    },

    get agreementFilterOptions() {
      const signals = this.allAgreementSignals;
      return [
        { id: 'all', label: 'All', count: signals.length },
        { id: 'action', label: 'Action now', count: signals.filter((item) => this.isActionAgreement(item)).length },
        { id: 'renewal', label: 'Renewals', count: signals.filter((item) => this.isRenewalAgreement(item)).length },
        { id: 'expiring', label: 'Expiring', count: signals.filter((item) => this.isExpiringAgreement(item)).length },
        { id: 'high-value', label: 'High value', count: signals.filter((item) => this.isHighValueAgreement(item)).length }
      ];
    },

    get agreementVisibleLabel() {
      const total = this.allAgreementSignals.length;
      const visible = this.agreementSignals.length;
      if (this.agreementHasActiveFilters) return `${visible} of ${total} shown`;
      return `${visible} agreements`;
    },

    get agreementHasActiveFilters() {
      return this.agreementFilter !== 'all' || cleanText(this.agreementSearchQuery).length > 0;
    },

    isActionAgreement(item) {
      return item.nextActionDelta != null && item.nextActionDelta <= 45;
    },

    isRenewalAgreement(item) {
      return !!item.renewalNoticeDate || item.renewalTypeLabel !== 'Not extracted';
    },

    isExpiringAgreement(item) {
      return !!item.expirationDate;
    },

    isHighValueAgreement(item) {
      return item.extractedValue != null && item.extractedValue >= 1000000;
    },

    matchesAgreementFilter(item, filterId) {
      switch (filterId) {
        case 'action':
          return this.isActionAgreement(item);
        case 'renewal':
          return this.isRenewalAgreement(item);
        case 'expiring':
          return this.isExpiringAgreement(item);
        case 'high-value':
          return this.isHighValueAgreement(item);
        default:
          return true;
      }
    },

    get agreementConnectionRequired() {
      return /connect|account/i.test(this.agreementSignalsError || '');
    },

    agreementMetricBorderClasses(tone) {
      const tones = {
        amber: 'tgk-tone-border--amber',
        red: 'tgk-tone-border--red',
        blue: 'tgk-tone-border--blue',
        sky: 'tgk-tone-border--sky',
        violet: 'tgk-tone-border--violet',
        emerald: 'tgk-tone-border--emerald'
      };
      return tones[tone] || 'tgk-tone-border--neutral';
    },

    agreementPillClasses(tone) {
      const tones = {
        amber: 'tgk-tone-pill--amber',
        red: 'tgk-tone-pill--red',
        blue: 'tgk-tone-pill--blue',
        sky: 'tgk-tone-pill--sky',
        violet: 'tgk-tone-pill--violet',
        emerald: 'tgk-tone-pill--emerald'
      };
      return tones[tone] || 'tgk-tone-pill--neutral';
    },

    agreementTextClasses(tone) {
      const tones = {
        amber: 'tgk-tone-text--amber',
        red: 'tgk-tone-text--red',
        blue: 'tgk-tone-text--blue',
        sky: 'tgk-tone-text--sky',
        violet: 'tgk-tone-text--violet',
        emerald: 'tgk-tone-text--emerald'
      };
      return tones[tone] || 'tgk-tone-text--neutral';
    },

    agreementSurfaceClasses(tone) {
      const tones = {
        amber: 'tgk-tone-surface--amber',
        red: 'tgk-tone-surface--red',
        blue: 'tgk-tone-surface--blue',
        sky: 'tgk-tone-surface--sky',
        violet: 'tgk-tone-surface--violet',
        emerald: 'tgk-tone-surface--emerald'
      };
      return tones[tone] || 'tgk-tone-surface--neutral';
    },

    async loadAgreementSignals(options = {}) {
      const force = !!options.force;
      if (this.agreementSignalsLoading) return;
      if (this.agreementSignalsLoaded && !force) return;

      this.agreementSignalsLoading = true;
      this.agreementSignalsError = '';

      const previousResponse = this.navigatorAgreementsResponse;
      const previousRaw = this.navigatorAgreementsRaw;
      const previousItems = this.agreementSignalItems;

      try {
        const response = await TGK_API.listNavigatorAgreements();
        this.navigatorAgreementsResponse = response || null;
        this.navigatorAgreementsRaw = Array.isArray(response?.data) ? response.data : [];
        this.rebuildAgreementSignalItems();
        this.agreementSignalsLoaded = true;

        this.syncAgreementSelection();
      } catch (e) {
        this.navigatorAgreementsResponse = previousResponse;
        this.navigatorAgreementsRaw = previousRaw;
        this.agreementSignalItems = previousItems;
        this.agreementSignalsLoaded = (previousRaw || []).length > 0;
        this.agreementSignalsError = e.message || 'Unable to load agreement signals.';
        if (!this.agreementSignalsLoaded) {
          this.selectedAgreementSignalId = null;
        }
      } finally {
        this.agreementSignalsLoading = false;
      }
    },

    rebuildAgreementSignalItems() {
      this.agreementSignalItems = (this.navigatorAgreementsRaw || [])
        .map((agreement, index) => buildAgreementSignal(agreement, index))
        .sort((left, right) => {
          const leftHasMilestone = left.nextActionDelta != null;
          const rightHasMilestone = right.nextActionDelta != null;

          if (leftHasMilestone && rightHasMilestone && left.nextActionDelta !== right.nextActionDelta) {
            return left.nextActionDelta - right.nextActionDelta;
          }

          if (leftHasMilestone !== rightHasMilestone) {
            return leftHasMilestone ? -1 : 1;
          }

          if (left.score !== right.score) {
            return right.score - left.score;
          }

          return left.title.localeCompare(right.title);
        });
    },

    syncAgreementSelection() {
      const existingSelection = this.agreementSignals.find((item) => item.id === this.selectedAgreementSignalId);
      this.selectedAgreementSignalId = existingSelection?.id || this.agreementSignals[0]?.id || null;
    },

    selectAgreementSignal(signalId) {
      this.selectedAgreementSignalId = signalId;
    },

    setAgreementFilter(filterId) {
      this.agreementFilter = filterId;
      this.syncAgreementSelection();
    },

    clearAgreementFilters() {
      this.agreementSearchQuery = '';
      this.agreementFilter = 'all';
      this.syncAgreementSelection();
    },

    async viewClient(contact) {
      this.selectedContact = contact;
      try {
        const detail = await TGK_API.getCustomer(contact.id);
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
      if (this.selectedContact?.metadata?.status !== 'pending') return;
      const app = this;
      this._clientDetailRefreshTimer = window.setInterval(async function () {
        if (app.view !== 'client' || !app.selectedContact || app.selectedContact.id !== contactId) {
          app.stopClientDetailRefresh();
          return;
        }
        try {
          const detail = await TGK_API.getCustomer(contactId);
          app.selectedContact = detail;
          app.selectedContactAccounts = detail.accounts || [];
          app.selectedContactEnvelopes = detail.envelopes || [];
          const idx = app.customers.findIndex(c => c.id === contactId);
          if (idx !== -1) {
            app.customers[idx] = { ...app.customers[idx], ...detail, accounts: undefined, envelopes: undefined };
          }
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

    async deleteCustomer(contact, event) {
      event.stopPropagation();
      try {
        await TGK_API.deleteCustomer(contact.id);
        this.customers = this.customers.filter(c => c.id !== contact.id);
        if (this.selectedContact?.id === contact.id) {
          this.goBack();
        }
      } catch (e) {
        console.error('Failed to delete customer:', e);
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

    async fetchMaestroCustomers() {
      try {
        return await TGK_API.getCustomers();
      } catch (e) {
        return [];
      }
    },

    async snapshotMaestroCustomers() {
      const customers = await this.fetchMaestroCustomers();
      this._maestroKnownContactIds = new Set((customers || []).map((customer) => customer.id));
    },

    async refreshContactsAfterOnboarding(targetId) {
      try {
        const customers = await TGK_API.getCustomers();
        this.customers = customers;
        return customers.find((customer) => customer.id === targetId) || null;
      } catch (e) {
        return null;
      }
    },

    async handleOnboardingFrameLoad() {
      if (this._maestroTrackingStarted || this.maestroCompleted || this.maestroError) {
        return;
      }
      this._maestroTrackingStarted = true;
      await this.snapshotMaestroCustomers();
      if (!this.showOnboarding || this.maestroCompleted) {
        return;
      }
      this.startMaestroCreationPolling();
    },

    findNewMaestroCustomer(extensionCustomers) {
      const knownIds = this._maestroKnownContactIds || new Set();
      const newCustomers = (extensionCustomers || []).filter((customer) => !knownIds.has(customer.id));
      if (newCustomers.length === 0) return null;
      return newCustomers.reduce(function (a, b) {
        return new Date(b.created_at) > new Date(a.created_at) ? b : a;
      });
    },

    startMaestroCreationPolling() {
      this.stopMaestroCreationPolling();
      const app = this;
      const poll = async function () {
        if (!app.showOnboarding || app.maestroCompleted) return;
        try {
          const extensionCustomers = await app.fetchMaestroCustomers();
          const target = app.findNewMaestroCustomer(extensionCustomers);
          if (target) {
            await app.completeOnboardingWithContact(target);
            return;
          }
        } catch (e) {
          console.warn('Could not poll for Maestro-created customers:', e);
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
      if (!target || this.maestroCompleted) return;
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
