/**
 * Stock Ticker Component
 * Pulls delayed quotes through the backend proxy, with graceful fallback data.
 */
function stockTicker() {
  const refreshMs = 5 * 60 * 1000;
  const flashMs = 600;
  const storageKey = 'tgk_stock_ticker_cache_v1';
  let cache = null;
  let cacheAt = 0;
  const symbols = [
    { sym: 'SPY', feed: 'spy.us', base: 655.42 },
    { sym: 'QQQ', feed: 'qqq.us', base: 588.03 },
    { sym: 'DIA', feed: 'dia.us', base: 461.97 },
    { sym: 'IWM', feed: 'iwm.us', base: 247.44 },
    { sym: 'AAPL', feed: 'aapl.us', base: 251.49 },
    { sym: 'MSFT', feed: 'msft.us', base: 383.21 },
    { sym: 'NVDA', feed: 'nvda.us', base: 118.42 },
    { sym: 'GOOGL', feed: 'googl.us', base: 302.20 },
    { sym: 'AMZN', feed: 'amzn.us', base: 210.25 },
    { sym: 'TSLA', feed: 'tsla.us', base: 248.71 }
  ];

  function defaultPrices() {
    return symbols.map(symbol => ({
      sym: symbol.sym,
      price: symbol.base,
      change: 0,
      flash: ''
    }));
  }

  function loadStoredCache() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!stored || !Array.isArray(stored.prices) || !Number.isFinite(stored.at)) {
        return null;
      }
      return stored;
    } catch {
      return null;
    }
  }

  function saveStoredCache(prices, at) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ prices, at }));
    } catch {}
  }

  function parseQuotes(csv) {
    const lines = String(csv || '')
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const quotes = new Map();
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 7 || parts[0].includes('N/D')) {
        continue;
      }

      const open = Number.parseFloat(parts[3]);
      const close = Number.parseFloat(parts[6]);
      if (!Number.isFinite(close)) {
        continue;
      }

      const change = Number.isFinite(open) && open > 0
        ? ((close - open) / open) * 100
        : 0;
      const sym = parts[0].replace(/\.us$/i, '').toUpperCase();

      quotes.set(sym, { sym, price: close, change, flash: '' });
    }

    return quotes;
  }

  return {
    prices: defaultPrices(),
    refreshTimer: null,
    flashTimer: null,

    async init() {
      const stored = loadStoredCache();
      if (stored) {
        cache = stored.prices;
        cacheAt = stored.at;
      }

      if (cache && Date.now() - cacheAt < refreshMs) {
        this.prices = cache.map(item => ({ ...item, flash: '' }));
      }

      // Keep first paint fast, then refresh asynchronously.
      setTimeout(() => {
        if (!cache || Date.now() - cacheAt >= refreshMs) {
          this.refresh();
        }
      }, 0);

      this.refreshTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          this.refresh();
        }
      }, refreshMs);
    },

    async refresh() {
      try {
        const previousPrices = Object.fromEntries(this.prices.map(price => [price.sym, price.price]));
        const existingPrices = new Map(this.prices.map(price => [price.sym, price]));
        const quoteMap = await this.fetchQuotes();

        this.prices = symbols.map(symbol => {
          const fallback = existingPrices.get(symbol.sym) || {
            sym: symbol.sym,
            price: symbol.base,
            change: 0,
            flash: ''
          };
          const quote = quoteMap.get(symbol.sym);
          const next = quote || fallback;
          const previous = previousPrices[symbol.sym];
          const flash = Number.isFinite(previous) && previous !== next.price
            ? (next.price > previous ? 'flash-green' : 'flash-red')
            : '';

          return { ...next, flash };
        });

        cache = this.prices.map(price => ({ ...price, flash: '' }));
        cacheAt = Date.now();
        saveStoredCache(cache, cacheAt);

        if (this.flashTimer) {
          clearTimeout(this.flashTimer);
        }

        this.flashTimer = setTimeout(() => {
          this.prices = this.prices.map(price => ({ ...price, flash: '' }));
        }, flashMs);
      } catch (error) {
        console.error('Failed to refresh stock ticker:', error);
      }
    },

    async fetchQuotes() {
      try {
        const csv = await TGK_API.proxyText({
          method: 'GET',
          url: `https://stooq.com/q/l/?s=${symbols.map(symbol => symbol.feed).join('+')}&i=d`,
          authMode: 'none'
        });
        return parseQuotes(csv);
      } catch (error) {
        console.error('Failed to load stock ticker quotes:', error);
        return new Map();
      }
    },

    fmt(n) { return Number(n).toFixed(2); },

    fmtChange(n) {
      return `${n >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(n).toFixed(2)}%`;
    }
  };
}
