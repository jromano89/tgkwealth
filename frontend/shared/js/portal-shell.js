(function () {
  function resolvePartialBase(element) {
    const base = String(
      element?.dataset?.partialBase
      || element?.closest?.('[data-partial-base]')?.dataset?.partialBase
      || document.baseURI
    ).trim();

    return base || document.baseURI;
  }

  async function loadPartialInto(slot) {
    const partialPath = String(slot.dataset.partial || '').trim();
    if (!partialPath) {
      return;
    }

    const partialUrl = new URL(partialPath, resolvePartialBase(slot));
    const response = await fetch(partialUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Failed to load ${partialPath}: ${response.status}`);
    }

    const markup = await response.text();
    slot.dataset.partialBase = partialUrl.href;
    mountSharedTemplate(slot, String(markup || ''));
    await hydratePartialSlots(slot);
  }

  async function hydratePartialSlots(root) {
    const slots = [...root.querySelectorAll('[data-partial]')];

    for (const slot of slots) {
      try {
        await loadPartialInto(slot);
        slot.removeAttribute('data-partial');
      } catch (error) {
        console.error('Failed to load partial:', error);
        slot.innerHTML = `
          <div class="tgk-surface-panel tgk-banner tgk-banner--danger">
            <div>
              <div class="tgk-banner__label">Shared Partial</div>
              <div class="tgk-banner__title">Unable to load shared view content</div>
              <p class="tgk-banner__meta">Refresh the page or verify the partial was deployed with the frontend.</p>
            </div>
          </div>
        `;
      }
    }
  }

  async function loadPortalLayout(root) {
    const layoutPath = root.dataset.layout || 'layout.html';
    const layoutUrl = new URL(layoutPath, window.location.href);
    const response = await fetch(layoutUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Failed to load ${layoutPath}: ${response.status}`);
    }

    const markup = await response.text();
    root.dataset.partialBase = layoutUrl.href;
    mountSharedTemplate(root, String(markup || ''));
    await hydratePartialSlots(root);
  }

  function renderLayoutError(root) {
    root.innerHTML = `
      <div class="tgk-screen-state">
        <div class="tgk-surface-panel tgk-surface-panel--md tgk-screen-state__card">
          <div class="tgk-screen-state__title">Unable to load the portal layout</div>
          <p class="tgk-screen-state__copy">Refresh the page or check that the static frontend files were deployed together.</p>
        </div>
      </div>
    `;
  }

  async function bootPortalLayout() {
    const root = document.getElementById('tgk-portal-root');
    if (!root) {
      return;
    }

    try {
      await loadPortalLayout(root);
    } catch (error) {
      console.error('Failed to load portal layout:', error);
      renderLayoutError(root);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPortalLayout, { once: true });
    return;
  }

  void bootPortalLayout();
})();
