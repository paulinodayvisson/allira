// ============================================================
// PWA REGISTER — Allira
// Inclua este script no final do <body> do seu index.html
// ============================================================

(function () {
  'use strict';

  // ── Registro do Service Worker ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/app/' })
        .then((registration) => {
          console.log('[PWA] Service Worker registrado. Scope:', registration.scope);

          // Verifica atualizações a cada 60 minutos
          setInterval(() => registration.update(), 60 * 60 * 1000);

          // Notifica o usuário quando há nova versão disponível
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                showUpdateBanner();
              }
            });
          });
        })
        .catch((err) => {
          console.error('[PWA] Falha ao registrar Service Worker:', err);
        });

      // Recarrega automaticamente após SW atualizado
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    });
  }

  // ── Banner de atualização disponível ──
  function showUpdateBanner() {
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.innerHTML = `
      <span>🔄 Nova versão disponível!</span>
      <button id="pwa-update-btn">Atualizar agora</button>
      <button id="pwa-update-close">✕</button>
    `;
    Object.assign(banner.style, {
      position: 'fixed', bottom: '1rem', left: '50%',
      transform: 'translateX(-50%)',
      background: '#1a1a2e', color: '#e8e8f0',
      border: '1px solid #3a2a5e',
      borderRadius: '10px', padding: '0.75rem 1.25rem',
      display: 'flex', alignItems: 'center', gap: '1rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      zIndex: '9999', fontSize: '0.9rem', whiteSpace: 'nowrap'
    });

    document.body.appendChild(banner);

    document.getElementById('pwa-update-btn').addEventListener('click', () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
    });

    document.getElementById('pwa-update-close').addEventListener('click', () => {
      banner.remove();
    });
  }

  // ── Prompt de instalação (Android/Chrome) ──
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Exibe botão customizado de instalação se existir no DOM
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
      installBtn.style.display = 'flex';
      installBtn.addEventListener('click', triggerInstall);
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App instalado com sucesso!');
    deferredPrompt = null;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'none';
  });

  // Expõe função de instalação globalmente
  window.pwaInstall = triggerInstall;

  async function triggerInstall() {
    if (!deferredPrompt) {
      console.warn('[PWA] Prompt de instalação não disponível.');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Escolha do usuário:', outcome);
    deferredPrompt = null;
  }

  // ── Detecta modo standalone ──
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    document.documentElement.classList.add('pwa-standalone');
  }
})();
