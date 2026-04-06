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
          <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Unable to load shared view content.
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
      <div class="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div class="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div class="text-sm font-semibold text-red-600">Unable to load the portal layout</div>
          <p class="mt-2 text-sm text-gray-600">Refresh the page or check that the static frontend files were deployed together.</p>
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
