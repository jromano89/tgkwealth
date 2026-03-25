/**
 * Shared utility functions and Alpine.js data helpers for TGK frontends.
 */

// Format cents to display value (e.g. 472000000 → "$4.72M")
function fmtMoney(cents) {
  if (cents == null) return '$0';
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1e9) return '$' + (dollars / 1e9).toFixed(2) + 'B';
  if (Math.abs(dollars) >= 1e6) return '$' + (dollars / 1e6).toFixed(2) + 'M';
  if (Math.abs(dollars) >= 1e3) return '$' + (dollars / 1e3).toFixed(0) + 'K';
  return '$' + dollars.toFixed(2);
}

// Format percentage
function fmtPct(n) {
  if (n == null) return '0%';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(1) + '%';
}

// Status badge classes
function statusClasses(status) {
  const map = {
    active: 'bg-green-100 text-green-700',
    review: 'bg-amber-100 text-amber-700',
    pending: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    sent: 'bg-blue-100 text-blue-700',
    created: 'bg-gray-100 text-gray-600',
    declined: 'bg-red-100 text-red-700',
    voided: 'bg-gray-100 text-gray-500'
  };
  return map[(status || '').toLowerCase()] || 'bg-gray-100 text-gray-600';
}

// Activity type dot color
function activityDotColor(type) {
  const map = {
    call: 'bg-blue-500',
    document: 'bg-amber-500',
    meeting: 'bg-green-500',
    alert: 'bg-red-500',
    trade: 'bg-purple-500',
    note: 'bg-gray-400'
  };
  return map[type] || 'bg-gray-400';
}

// Generate initials from a name
function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// SVG sparkline points for a positive/negative trend (for <polyline>)
function sparklinePath(positive) {
  if (positive) {
    return '0,20 10,18 20,15 30,16 40,12 50,10 60,8 70,6 80,4';
  }
  return '0,4 10,6 20,8 30,7 40,12 50,14 60,16 70,18 80,20';
}
