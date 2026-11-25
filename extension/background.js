import { AD_HOSTS } from './hosts.js';

const HOSTS = new Set(AD_HOSTS);
const ALLOW_RULE_BASE = 1000;

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}
function isBlocked(url) {
  let h = hostOf(url);
  while (h) {
    if (HOSTS.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
  return false;
}

async function getAllow() {
  const { allow = [] } = await chrome.storage.local.get('allow');
  return allow;
}

/* Sitios desactivados: regla que permite todo y scripts que no se inyectan allí. */
async function apply() {
  const allow = await getAllow();
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: allow.map((site, i) => ({
      id: ALLOW_RULE_BASE + i,
      priority: 10,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [site], resourceTypes: ['main_frame', 'sub_frame'] },
    })),
  });

  const exclude = allow.flatMap((s) => [`*://${s}/*`, `*://*.${s}/*`]);
  const base = { matches: ['<all_urls>'], allFrames: true, matchOriginAsFallback: true, runAt: 'document_start' };
  const scripts = [
    { ...base, id: 'inject', js: ['inject.js'], world: 'MAIN' },
    { ...base, id: 'relay', js: ['relay.js'], world: 'ISOLATED' },
  ].map((s) => (exclude.length ? { ...s, excludeMatches: exclude } : s));
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  await chrome.scripting.registerContentScripts(scripts);
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  await chrome.action.setBadgeBackgroundColor({ color: '#15803d' });
  await apply();
});
chrome.runtime.onStartup.addListener(apply);

/* Contador del icono: lo que bloquea la red (automático) + lo que bloquea el script de la página. */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'blocked' && sender.tab?.id >= 0) {
    // sólo suma al contador; con tope para que una página no pueda inflarlo
    chrome.declarativeNetRequest.setExtensionActionOptions({
      tabUpdate: { tabId: sender.tab.id, increment: Math.min(50, Math.max(1, msg.delta | 0)) },
    }).catch(() => {});
    return;
  }
  // Activar/desactivar sitios: sólo desde el menú del icono (popup.html), nunca desde una página
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (typeof msg?.site !== 'string' || !/^[a-z0-9.-]{1,253}$/.test(msg.site)) return;
  if (msg?.type === 'getSite') {
    getAllow().then((allow) => reply({ site: msg.site, enabled: !allow.includes(msg.site) }));
    return true;
  }
  if (msg?.type === 'setSite') {
    getAllow().then(async (allow) => {
      const next = allow.filter((s) => s !== msg.site);
      if (!msg.enabled) next.push(msg.site);
      await chrome.storage.local.set({ allow: next });
      await apply();
      reply({ ok: true });
    });
    return true;
  }
});

/* Pop-unders: pestañas nuevas abiertas por una página hacia un dominio de anuncios se cierran. */
const newTabs = new Map(); // tabId -> momento de creación
chrome.webNavigation.onCreatedNavigationTarget.addListener(({ tabId, url, sourceTabId }) => {
  if (isBlocked(url)) { closeAdTab(tabId, sourceTabId); return; }
  newTabs.set(tabId, Date.now());
});
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0 || !newTabs.has(tabId)) return;
  if (Date.now() - newTabs.get(tabId) > 5000 || !/^https?:/.test(url)) { if (/^https?:/.test(url)) newTabs.delete(tabId); return; }
  newTabs.delete(tabId);
  if (isBlocked(url)) closeAdTab(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => newTabs.delete(tabId));

async function closeAdTab(tabId, sourceTabId) {
  try { await chrome.tabs.remove(tabId); } catch {}
  if (sourceTabId >= 0) {
    chrome.declarativeNetRequest.setExtensionActionOptions({ tabUpdate: { tabId: sourceTabId, increment: 1 } }).catch(() => {});
  }
}

