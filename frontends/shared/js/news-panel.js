/**
 * Market News Panel Component
 * Pulls live market headlines through the backend proxy.
 */
function newsPanel() {
  const refreshMs = 15 * 60 * 1000;
  const categories = ['all', 'MACRO', 'MARKETS', 'POLICY'];
  let cache = null;
  let cacheAt = 0;

  function textOf(node, selector) {
    return node.querySelector(selector)?.textContent?.trim() || '';
  }

  function decodeHtml(html) {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function categorize(title, source) {
    const haystack = `${title} ${source}`.toLowerCase();

    if (/(sec |regulation|regulator|\brule\b|fiduciary|compliance|doj|dol\b|legislation|policy|policymaker)/.test(haystack)) return 'POLICY';
    if (/(fed\b|inflation|economy|economic|consumer|jobs\b|gdp|recession|tariff|war\b|iran)/.test(haystack)) return 'MACRO';
    if (/(bond|treasury|yield|muni|fixed income|stock|dow|s&p|nasdaq|earnings|equity|wall street|market|gold|oil\b|energy|commodity|commodities|crude|natural gas|brent)/.test(haystack)) return 'MARKETS';
    return 'MARKETS';
  }

  function impactLevel(title, category) {
    const haystack = `${title} ${category}`.toLowerCase();
    if (/(breaking|live update|surge|plunge|selloff|war|fed|inflation|tariff|oil)/.test(haystack)) return 'high';
    if (/(earnings|stocks|dow|s&p|nasdaq|bond|treasury|gold|market)/.test(haystack)) return 'medium';
    return 'low';
  }

  function badgeFor(title, category) {
    const haystack = title.toLowerCase();
    if (/(breaking|live update)/.test(haystack)) {
      return { label: 'Breaking', color: 'bg-red-100 text-red-700' };
    }
    if (/earnings/.test(haystack)) {
      return { label: 'Earnings', color: 'bg-blue-100 text-blue-700' };
    }
    if (category === 'POLICY') {
      return { label: 'Compliance', color: 'bg-amber-100 text-amber-700' };
    }
    if (/(alert|warning|surge|plunge|selloff)/.test(haystack)) {
      return { label: 'Alert', color: 'bg-purple-100 text-purple-700' };
    }
    return null;
  }

  function formatRelativeTime(pubDate) {
    if (!pubDate || Number.isNaN(pubDate.getTime())) return 'Latest';

    const diffMs = Date.now() - pubDate.getTime();
    if (diffMs < 0) return 'Latest';

    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function buildSummary(title, source, description) {
    let summary = decodeHtml(description);
    if (source && summary.endsWith(source)) {
      summary = summary.slice(0, -source.length).trim();
    }
    if (summary === title || !summary) {
      return source ? `Source: ${source}.` : 'Latest market coverage.';
    }
    return summary.length > 160 ? `${summary.slice(0, 157).trim()}...` : summary;
  }

  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) {
      return [];
    }

    return Array.from(doc.querySelectorAll('item'))
      .slice(0, 10)
      .map(item => {
        const source = textOf(item, 'source');
        const rawTitle = textOf(item, 'title');
        const title = source && rawTitle.endsWith(` - ${source}`)
          ? rawTitle.slice(0, -(` - ${source}`).length).trim()
          : rawTitle;
        const category = categorize(title, source);
        const badge = badgeFor(title, category);

        return {
          category,
          badge: badge?.label,
          badgeColor: badge?.color,
          time: formatRelativeTime(new Date(textOf(item, 'pubDate'))),
          title,
          summary: buildSummary(title, source, textOf(item, 'description')),
          source,
          impact: impactLevel(title, category),
          link: textOf(item, 'link')
        };
      })
      .filter(item => item.title);
  }

  return {
    open: false,
    search: '',
    activeCategory: 'all',
    categories,
    items: [],
    loaded: false,
    loading: false,
    error: null,

    async init() {
      if (cache && Date.now() - cacheAt < refreshMs) {
        this.items = cache;
        this.loaded = true;
      }
    },

    async toggleOpen() {
      this.open = !this.open;
      if (!this.open) {
        return;
      }

      if (!this.loaded || Date.now() - cacheAt >= refreshMs) {
        await this.refresh();
      }
    },

    async refresh() {
      this.loading = true;
      this.error = null;

      try {
        const xml = await TGK_API.proxyText({
          method: 'GET',
          url: 'https://news.google.com/rss/search?q=markets&hl=en-US&gl=US&ceid=US:en',
          authMode: 'none'
        });
        const items = parseFeed(xml);
        if (items.length > 0) {
          this.items = items;
          cache = items;
          cacheAt = Date.now();
          this.loaded = true;
        } else {
          this.items = [];
          this.error = 'Failed to load live market news.';
        }
      } catch (error) {
        this.items = [];
        this.error = 'Failed to load live market news.';
        console.error('Failed to refresh market news:', error);
      } finally {
        this.loading = false;
      }
    },

    get filteredItems() {
      return this.items.filter(item => {
        const matchesCategory = this.activeCategory === 'all' || item.category === this.activeCategory;
        const haystack = `${item.title} ${item.summary} ${item.source || ''}`.toLowerCase();
        const matchesSearch = !this.search || haystack.includes(this.search.toLowerCase());
        return matchesCategory && matchesSearch;
      });
    },

    impactColor(level) {
      return { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-green-500' }[level] || 'bg-gray-400';
    }
  };
}
