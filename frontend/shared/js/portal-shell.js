(function () {
  async function loadPortalLayout(root) {
    const layoutPath = root.dataset.layout || 'layout.html';
    const response = await fetch(layoutPath, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Failed to load ${layoutPath}: ${response.status}`);
    }

    const markup = await response.text();
    mountSharedTemplate(root, String(markup || ''));
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
