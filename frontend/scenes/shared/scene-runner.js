(function () {
  const BASE_EMBED_CSS = `
    .tgk-stock-ticker { display: none !important; }
    body { background: #f4f6f9 !important; }
  `.trim();

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.status}`);
    }
    return response.json();
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load partial: ${response.status}`);
    }
    return response.text();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeScenes(manifest) {
    const scenes = Array.isArray(manifest?.scenes) ? manifest.scenes : [];
    return scenes
      .filter((scene) => scene && typeof scene === 'object')
      .map((scene, index) => ({
        id: String(scene.id || `scene-${index + 1}`),
        number: index + 1,
        label: String(scene.label || `Scene ${index + 1}`),
        caption: String(scene.caption || ''),
        surface: String(scene.surface || ''),
        partial: String(scene.partial || ''),
        embed: scene.embed && typeof scene.embed === 'object' ? { ...scene.embed } : null,
        vignette: scene.vignette && typeof scene.vignette === 'object' ? { ...scene.vignette } : null
      }));
  }

  function getSceneType(scene) {
    if (scene.partial) {
      return 'partial';
    }
    if (scene.embed) {
      return 'embed';
    }
    return 'unknown';
  }

  function getInitialSceneId(scenes) {
    const url = new URL(window.location.href);
    const requestedId = String(url.searchParams.get('scene') || '').trim();
    return scenes.some((scene) => scene.id === requestedId) ? requestedId : scenes[0]?.id;
  }

  function updateSceneUrl(sceneId) {
    const url = new URL(window.location.href);
    url.searchParams.set('scene', sceneId);
    window.history.replaceState({}, '', url);
  }

  function setSceneSurface(container, surface) {
    if (!container) {
      return;
    }
    container.dataset.sceneSurface = String(surface || '').trim().toLowerCase() === 'launcher'
      ? 'launcher'
      : 'default';
  }

  function renderSceneIcon(iconName) {
    const icon = String(iconName || '').trim().toLowerCase();
    const icons = {
      alert: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5 4.5 18h15L12 4.5Z"></path>
          <path d="M12 9v4.5"></path>
          <circle cx="12" cy="16.25" r="0.75" fill="currentColor" stroke="none"></circle>
        </svg>
      `,
      advisor: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.25"></circle>
          <path d="M5.5 18c1.5-3.2 3.9-4.8 6.5-4.8s5 1.6 6.5 4.8"></path>
        </svg>
      `,
      document: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 3.75h5.25L18 8.5V19a1.75 1.75 0 0 1-1.75 1.75h-8.5A1.75 1.75 0 0 1 6 19V5.5A1.75 1.75 0 0 1 7.75 3.75Z"></path>
          <path d="M13 3.75V8.5h4.75"></path>
          <path d="M9 12.25h6"></path>
          <path d="M9 15.25h4.25"></path>
        </svg>
      `,
      queue: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="4.25" rx="1.5"></rect>
          <rect x="4" y="11" width="16" height="4.25" rx="1.5"></rect>
          <rect x="4" y="17" width="10.5" height="3.25" rx="1.5"></rect>
        </svg>
      `,
      results: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5 14 8.7l4.6.65-3.35 3.25.8 4.65L12 15l-4.05 2.25.8-4.65L5.4 9.35 10 8.7 12 4.5Z"></path>
        </svg>
      `
    };

    const markup = icons[icon];
    if (!markup) {
      return iconName ? escapeHtml(iconName) : '';
    }

    return `<span class="scene-ref__icon-glyph">${markup}</span>`;
  }

  function getLinkedSceneId(href) {
    try {
      const url = new URL(String(href || ''), window.location.href);
      return String(url.searchParams.get('scene') || '').trim();
    } catch {
      return '';
    }
  }

  function buildShell(backHref, scenes) {
    return `
      <div class="scene-demo">
        <div class="scene-browser">
          <nav class="scene-storybar" aria-label="Scenes">
            <a class="scene-storybar__back" href="${escapeHtml(backHref || '/')}" aria-label="Back">&larr;</a>
            ${scenes.map((scene) => `
              <button
                class="scene-storybar__step"
                type="button"
                data-scene-jump="${escapeHtml(scene.id)}">
                <div class="scene-storybar__num">Scene ${scene.number}</div>
                <div class="scene-storybar__title">${escapeHtml(scene.label)}</div>
                <div class="scene-storybar__caption">${escapeHtml(scene.caption)}</div>
              </button>
            `).join('')}
          </nav>

          <section class="scene-browser__body" data-scene-body>
            <div data-scene-vignette></div>
            <div class="scene-demo__stage" data-scene-stage></div>
          </section>
        </div>
      </div>
    `;
  }

  function renderVignette(container, vignette) {
    if (!container) {
      return;
    }

    if (!vignette?.title && !vignette?.body) {
      container.innerHTML = '';
      return;
    }

    const linkedSceneId = getLinkedSceneId(vignette.action?.href);
    const actionMarkup = vignette.action?.label
      ? `<a
          class="scene-ref__narrative-action"
          href="${escapeHtml(vignette.action.href || '#')}"
          ${linkedSceneId ? `data-scene-link="${escapeHtml(linkedSceneId)}"` : ''}>${escapeHtml(vignette.action.label)}</a>`
      : '';
    const iconMarkup = vignette.icon
      ? `<div class="scene-ref__narrative-icon">${renderSceneIcon(vignette.icon)}</div>`
      : '';

    container.innerHTML = `
      <div class="scene-ref__narrative">
        ${iconMarkup}
        <div class="scene-ref__narrative-body">
          <div class="scene-ref__narrative-title">${escapeHtml(vignette.title || '')}</div>
          <div class="scene-ref__narrative-text">${escapeHtml(vignette.body || '')}</div>
        </div>
        ${actionMarkup}
      </div>
    `;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitForCondition(callback, { timeoutMs = 8000, intervalMs = 100 } = {}) {
    const startedAt = Date.now();

    while ((Date.now() - startedAt) <= timeoutMs) {
      const result = callback();
      if (result) {
        return result;
      }
      await sleep(intervalMs);
    }

    throw new Error('Timed out waiting for embed condition');
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findElementByText(doc, selector, text) {
    const targetText = normalizeText(text);
    const candidates = [...doc.querySelectorAll(selector || 'button, a, [role="button"]')];

    return candidates.find((element) => normalizeText(element.textContent) === targetText)
      || candidates.find((element) => normalizeText(element.textContent).includes(targetText))
      || null;
  }

  async function runEmbedActions(frame, actions = []) {
    if (!actions.length) {
      return;
    }

    const doc = await waitForCondition(() => frame.contentDocument?.body ? frame.contentDocument : null);

    for (const action of actions) {
      if (String(action?.type || '').trim().toLowerCase() !== 'clicktext') {
        continue;
      }

      const element = await waitForCondition(() => findElementByText(
        doc,
        String(action.selector || 'button, a, [role="button"]').trim(),
        action.text
      ), {
        timeoutMs: Number(action.timeoutMs || 8000)
      });

      element.click();
      await sleep(Number(action.afterMs || 250));
    }
  }

  function injectEmbedCss(frame, cssText) {
    const doc = frame.contentDocument;
    if (!doc || !cssText) {
      return;
    }

    let style = doc.getElementById('tgk-scene-embed-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'tgk-scene-embed-style';
      doc.head.appendChild(style);
    }
    style.textContent = cssText;
  }

  async function createRecipientViewUrl(recipientView = {}, sceneId) {
    const api = window.TGK_API;
    const config = window.TGK_CONFIG;
    const envelopeId = String(recipientView.envelopeId || '').trim();
    const recipient = recipientView.recipient && typeof recipientView.recipient === 'object'
      ? recipientView.recipient
      : {};
    const recipientName = String(recipient.userName || recipient.name || '').trim();
    const recipientEmail = String(recipient.email || '').trim();
    const clientUserId = String(recipient.clientUserId || '').trim();

    if (!api?.proxyDocusign || !api?.buildDocusignUrl || !config?.docusignEsignBaseUrl) {
      throw new Error('Docusign scene configuration is unavailable.');
    }
    if (!envelopeId || !clientUserId) {
      throw new Error('Recipient view scenes require an envelopeId and clientUserId.');
    }

    const returnUrl = new URL(String(recipientView.returnUrl || window.location.href), window.location.href);
    if (!recipientView.returnUrl) {
      returnUrl.searchParams.set('scene', String(recipientView.returnScene || sceneId));
    }

    const payload = {
      returnUrl: returnUrl.toString(),
      authenticationMethod: 'none',
      clientUserId
    };

    if (recipient.userId) {
      payload.userId = String(recipient.userId).trim();
    } else {
      if (!recipientName || !recipientEmail) {
        throw new Error('Recipient view scenes require recipient name and email when userId is not provided.');
      }
      payload.userName = recipientName;
      payload.email = recipientEmail;
    }

    const targetUrl = api.buildDocusignUrl(
      `/v2.1/accounts/{accountId}/envelopes/${encodeURIComponent(envelopeId)}/views/recipient`,
      { baseUrl: config.docusignEsignBaseUrl }
    );
    const response = await api.proxyDocusign({
      method: 'POST',
      url: targetUrl,
      body: payload
    });
    const viewUrl = String(response?.url || response?.viewUrl || '').trim();

    if (!viewUrl) {
      throw new Error('Docusign recipient view response did not include a signing URL.');
    }

    return viewUrl;
  }

  function buildDeviceLoadingMarkup(recipientView = {}) {
    const recipient = recipientView.recipient && typeof recipientView.recipient === 'object'
      ? recipientView.recipient
      : {};
    const recipientName = escapeHtml(String(recipient.name || recipient.userName || 'Signer').trim() || 'Signer');

    return `
      <div class="scene-device__loading">
        <div class="scene-device__loading-card">
          <div class="scene-device__mail-header">
            <div class="scene-device__mail-avatar">D</div>
            <div class="scene-device__mail-meta">
              <div class="scene-device__mail-from">Docusign</div>
              <div class="scene-device__mail-address">secure@docusign.net</div>
            </div>
            <div class="scene-device__mail-time">now</div>
          </div>
          <div class="scene-device__mail-subject">Review and sign your onboarding package</div>
          <div class="scene-device__mail-preview">
            Hi ${recipientName}, your account opening package is ready to review securely.
          </div>
          <div class="scene-device__mail-cta">
            <span class="scene-device__mail-cta-label">Opening secure signing session</span>
            <span class="scene-device__mail-dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
          <div class="scene-device__loading-progress" aria-hidden="true"><span></span></div>
          <div class="scene-device__loading-status" data-scene-embed-status>Generating signing session</div>
        </div>
      </div>
    `;
  }

  function buildDeviceInteractionMaskMarkup(interactionMask = {}) {
    if (String(interactionMask.kind || '').trim().toLowerCase() !== 'finishzones') {
      return '';
    }

    const label = escapeHtml(String(interactionMask.label || 'Finish disabled in demo').trim() || 'Finish disabled in demo');

    return `
      <div class="scene-device__interaction-mask" aria-hidden="true">
        <div
          class="scene-device__interaction-hotspot scene-device__interaction-hotspot--header"
          title="${label}"></div>
        <div
          class="scene-device__interaction-hotspot scene-device__interaction-hotspot--footer"
          title="${label}"></div>
      </div>
    `;
  }

  async function renderEmbedScene(container, scene, manifestUrl) {
    const embed = scene.embed || {};
    const recipientView = embed.recipientView && typeof embed.recipientView === 'object'
      ? { ...embed.recipientView }
      : null;
    const device = embed.device && typeof embed.device === 'object' ? { ...embed.device } : null;
    const title = String(embed.title || scene.label || 'Embedded scene');
    const height = Math.max(Number(embed.height || 920), 320);
    const interactive = Boolean(embed.interactive);
    const isTablet = Boolean(device);
    const deviceScrollHeight = Math.max(Number(device?.scrollHeight || 0), height);
    const usesExternalDeviceScroll = isTablet && !interactive && deviceScrollHeight > height;
    const frameHeight = usesExternalDeviceScroll ? `${deviceScrollHeight}px` : '100%';
    const viewportClass = usesExternalDeviceScroll
      ? 'scene-device__viewport'
      : 'scene-device__viewport scene-device__viewport--interactive';

    if (isTablet) {
      container.innerHTML = `
        <div class="scene-ref__embed scene-ref__embed--device" style="--scene-frame-height:${height}px;">
          <div class="scene-device">
            <div class="scene-device__camera-dot" aria-hidden="true"></div>
            <div class="scene-device__screen">
              <div class="${viewportClass}">
                <div class="scene-ref__frame-wrap scene-ref__frame-wrap--device" style="height:${frameHeight};">
                  <iframe
                    class="scene-ref__frame scene-ref__frame--device"
                    title="${escapeHtml(title)}"
                    loading="eager"
                    referrerpolicy="no-referrer"
                    allowfullscreen
                  style="height:${frameHeight};${interactive ? 'pointer-events:auto;' : ''}"></iframe>
                </div>
              </div>
              ${buildDeviceLoadingMarkup(recipientView)}
              ${buildDeviceInteractionMaskMarkup(embed.interactionMask)}
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="scene-ref__embed" style="--scene-frame-height:${height}px;">
          <div class="scene-ref__frame-wrap">
            <iframe
              class="scene-ref__frame"
              title="${escapeHtml(title)}"
              loading="eager"
              referrerpolicy="no-referrer"
              allowfullscreen
              style="${interactive ? 'pointer-events:auto;' : ''}"></iframe>
          </div>
          <div class="scene-ref__embed-status" data-scene-embed-status>Loading live frontend</div>
        </div>
      `;
    }

    const shell = container.querySelector('.scene-ref__embed');
    const frame = container.querySelector('.scene-ref__frame');
    const status = container.querySelector('[data-scene-embed-status]');

    const loaded = new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.addEventListener('error', reject, { once: true });
    });

    try {
      if (recipientView) {
        if (status) {
          status.textContent = 'Creating signing session';
        }
        frame.src = await createRecipientViewUrl(recipientView, scene.id);
      } else {
        frame.src = new URL(String(embed.src || ''), manifestUrl).href;
      }

      await loaded;

      if (!recipientView) {
        injectEmbedCss(frame, BASE_EMBED_CSS);
        if (status) {
          status.textContent = 'Configuring scene view';
        }
        await runEmbedActions(frame, Array.isArray(embed.actions) ? embed.actions : []);
      }

      if (status) {
        status.textContent = recipientView ? 'Signing experience ready' : 'Live frontend ready';
      }

      shell?.classList.add('is-ready');

      if (status) {
        window.setTimeout(() => {
          status.hidden = true;
        }, 300);
      }
    } catch (error) {
      console.error('Failed to prepare embed scene:', error);
      if (status) {
        status.textContent = recipientView
          ? 'Unable to create signing session'
          : 'Scene loaded with limited automation';
        status.hidden = false;
      }
    }
  }

  async function renderScene(container, scene, manifestUrl) {
    const type = getSceneType(scene);

    if (type === 'partial') {
      container.innerHTML = await fetchText(new URL(scene.partial, manifestUrl).href);
      return;
    }

    if (type === 'embed') {
      await renderEmbedScene(container, scene, manifestUrl);
      return;
    }

    container.innerHTML = '<div class="scene-demo__empty">Unsupported scene configuration.</div>';
  }

  function bindControls(root, state) {
    root.querySelectorAll('[data-scene-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        state.setScene(String(button.dataset.sceneJump || ''));
      });
    });

    root.addEventListener('click', (event) => {
      const link = event.target.closest('[data-scene-link]');
      if (!link) {
        return;
      }

      const sceneId = String(link.dataset.sceneLink || '').trim();
      if (!sceneId) {
        return;
      }

      event.preventDefault();
      state.setScene(sceneId);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        state.step(-1);
      }
      if (event.key === 'ArrowRight') {
        state.step(1);
      }
    });
  }

  async function bootSceneDemo(root) {
    const manifestUrl = new URL(root.dataset.manifest || './manifest.json', window.location.href);
    const manifest = await fetchJson(manifestUrl.href);
    const scenes = normalizeScenes(manifest);

    if (!scenes.length) {
      root.innerHTML = '<div class="scene-demo__empty">No scenes found in manifest.</div>';
      return;
    }

    document.body.classList.add('scene-body--reference');
    root.innerHTML = buildShell(manifest.backHref || '/', scenes);

    const stage = root.querySelector('[data-scene-stage]');
    const vignette = root.querySelector('[data-scene-vignette]');
    const sceneBody = root.querySelector('[data-scene-body]');
    const jumpButtons = [...root.querySelectorAll('[data-scene-jump]')];

    const state = {
      currentId: getInitialSceneId(scenes),

      findIndex() {
        const index = scenes.findIndex((scene) => scene.id === this.currentId);
        return index >= 0 ? index : 0;
      },

      async render() {
        const index = this.findIndex();
        const scene = scenes[index];

        updateSceneUrl(scene.id);
        setSceneSurface(sceneBody, scene.surface);
        renderVignette(vignette, scene.vignette);

        jumpButtons.forEach((button, buttonIndex) => {
          button.classList.toggle('is-active', button.dataset.sceneJump === scene.id);
          button.classList.toggle('is-done', buttonIndex < index);
        });

        await renderScene(stage, scene, manifestUrl);
      },

      setScene(sceneId) {
        if (!scenes.some((scene) => scene.id === sceneId)) {
          return;
        }
        this.currentId = sceneId;
        void this.render();
      },

      step(delta) {
        const index = this.findIndex();
        const nextIndex = Math.max(0, Math.min(index + delta, scenes.length - 1));
        this.currentId = scenes[nextIndex].id;
        void this.render();
      }
    };

    bindControls(root, state);
    await state.render();
  }

  async function bootAllSceneDemos() {
    const roots = [...document.querySelectorAll('[data-scene-demo]')];
    await Promise.all(roots.map(async (root) => {
      try {
        await bootSceneDemo(root);
      } catch (error) {
        console.error(error);
        root.innerHTML = '<div class="scene-demo__empty">Unable to load the scene demo.</div>';
      }
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootAllSceneDemos();
    }, { once: true });
  } else {
    void bootAllSceneDemos();
  }
})();
