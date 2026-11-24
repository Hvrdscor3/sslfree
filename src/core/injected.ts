/**
 * Script que se inyecta en cada página. Es un string ES5 autocontenido para que
 * Babel/Metro no lo transforme. Es idempotente: si se inyecta dos veces
 * (antes de cargar el contenido y al terminar), la segunda no hace nada.
 *
 * Qué hace:
 *  1. Anula window.open y los enlaces target=_blank (adiós pop-ups y pop-unders).
 *  2. Bloquea peticiones (fetch, XHR, sendBeacon, <script>, <iframe>, <img>) a dominios de anuncios.
 *  3. Oculta contenedores de anuncios con CSS y elimina capas invisibles "atrapa-clics".
 *  4. Bloquea diálogos alert/confirm/prompt y "onbeforeunload" usados para retener al usuario.
 *  5. Controles de vídeo con el mando: OK = play/pausa, ←/→ = ±10 s, ↑/↓ = volumen.
 *  6. Expone window.__lb.video() para poner a pantalla completa el vídeo principal.
 */
export function buildInjectedScript(hosts: readonly string[]): string {
  return `(function(){
if (window.__lb) { return; }
var HOSTS = {};
${JSON.stringify(hosts)}.forEach(function(h){ HOSTS[h] = 1; });
var blockedCount = 0, statT = 0;
function bump(){ blockedCount++; if (!statT) { statT = setTimeout(function(){ statT = 0; post("stats", blockedCount); }, 1500); } }
function post(type, data){
  var msg = JSON.stringify({type:type, data:data});
  try { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(msg); return; } } catch(e){}
  /* Fuera del WebView (extensión de Chrome): evento que recoge el script de contenido aislado */
  try { window.dispatchEvent(new CustomEvent('__lb_msg', { detail: msg })); } catch(e){}
}
function hostOf(u){
  if (!u) return '';
  var m = /^(?:[a-z][a-z0-9+.-]*:)?\\/\\/(?:[^@\\/?#]*@)?([^:\\/?#]+)/i.exec(String(u));
  return m ? m[1].toLowerCase() : '';
}
function blocked(u){
  var h = hostOf(u);
  while (h) {
    if (HOSTS[h]) { bump(); return true; }
    var i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
  return false;
}
var lb = window.__lb = { blocked: function(){ return blockedCount; } };

/* 1. Pop-ups */
var fakeWin = { closed: true, close: function(){}, focus: function(){}, blur: function(){}, postMessage: function(){},
  document: { write: function(){}, open: function(){}, close: function(){} }, location: { href: '' } };
try {
  Object.defineProperty(window, 'open', { value: function(u){ bump(); post('popup', String(u || '')); return fakeWin; }, writable: false, configurable: false });
} catch(e) { window.open = function(){ bump(); return fakeWin; }; }
window.alert = function(){}; window.confirm = function(){ return false; }; window.prompt = function(){ return null; };
try { Object.defineProperty(window, 'onbeforeunload', { get: function(){ return null; }, set: function(){}, configurable: false }); } catch(e) {}
var origAEL = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, fn, opts){
  if (type === 'beforeunload' || type === 'unload') return;
  return origAEL.call(this, type, fn, opts);
};

/* 2. Red */
if (window.fetch) {
  var of = window.fetch;
  window.fetch = function(input, init){
    var u = typeof input === 'string' ? input : (input && input.url);
    if (blocked(u)) return Promise.reject(new TypeError('blocked'));
    return of.apply(this, arguments);
  };
}
var xo = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(m, u){
  if (blocked(u)) { this.__lbBlocked = true; }
  return xo.apply(this, arguments);
};
var xs = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(){ if (this.__lbBlocked) { try { this.abort(); } catch(e){} return; } return xs.apply(this, arguments); };
if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function(u, d){ return blocked(u) ? true : sb(u, d); }; }

function guardSrc(proto, attr){
  var d = proto && Object.getOwnPropertyDescriptor(proto, attr);
  if (!d || !d.set) return;
  Object.defineProperty(proto, attr, { configurable: true, enumerable: d.enumerable, get: d.get,
    set: function(v){ if (blocked(v)) { return; } d.set.call(this, v); } });
}
guardSrc(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src');
guardSrc(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src');
guardSrc(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
var osa = Element.prototype.setAttribute;
Element.prototype.setAttribute = function(n, v){
  if ((n === 'src' || n === 'href') && /^(SCRIPT|IFRAME|IMG|LINK)$/.test(this.tagName) && blocked(v)) return;
  return osa.call(this, n, v);
};

/* 3. Limpieza del DOM */
var CSS = 'ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[class*="adsbygoogle"],' +
  '[id^="taboola"],[class^="taboola"],.OUTBRAIN,[data-ad],[data-ad-slot],[data-adunit],' +
  'iframe[src*="ads"],iframe[id*="google_ads"],.ad-banner,.ad-container,.ad-wrapper,.ad-slot,' +
  '.advertisement,#ad-banner,.sponsored,.popup-overlay,.modal-ad,[class*="popunder"]' +
  '{display:none!important;visibility:hidden!important}';
function addStyle(){
  if (document.getElementById('__lb_css')) return;
  var s = document.createElement('style'); s.id = '__lb_css'; s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}
function clean(node){
  if (!node || node.nodeType !== 1) return;
  var t = node.tagName;
  if ((t === 'SCRIPT' || t === 'IFRAME' || t === 'IMG') && blocked(node.getAttribute('src'))) { node.remove(); return; }
  if (t === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('target', '_self');
  if (node.querySelectorAll && node.firstElementChild) {
    var list = node.querySelectorAll('script[src],iframe[src],img[src],a[target="_blank"]');
    for (var i = 0; i < list.length; i++) clean(list[i]);
  }
}
var pending = [];
var scheduled = false;
function flush(){ scheduled = false; var p = pending; pending = []; for (var i = 0; i < p.length; i++) clean(p[i]); }
new MutationObserver(function(muts){
  for (var i = 0; i < muts.length; i++) {
    var a = muts[i].addedNodes;
    for (var j = 0; j < a.length; j++) {
      var n = a[j];
      if (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'IFRAME')) clean(n); /* inmediato */
      else pending.push(n);
    }
  }
  if (pending.length && !scheduled) { scheduled = true; setTimeout(flush, 50); }
}).observe(document, { childList: true, subtree: true });

/* Capas transparentes a pantalla completa que secuestran el primer clic */
function isTrap(el){
  if (!el || el === document.body || el === document.documentElement) return false;
  if (el.tagName === 'VIDEO' || (el.closest && el.closest('video'))) return false;
  var cs = getComputedStyle(el);
  if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
  var r = el.getBoundingClientRect();
  var big = r.width * r.height > window.innerWidth * window.innerHeight * 0.5;
  var invisible = parseFloat(cs.opacity) < 0.1 || (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && !el.textContent.trim() && !el.querySelector('img,video,canvas'));
  return big && invisible && (parseInt(cs.zIndex, 10) || 0) > 100;
}
document.addEventListener('click', function(e){
  var el = e.target;
  for (var k = 0; el && k < 4; k++, el = el.parentElement) {
    if (isTrap(el)) { e.preventDefault(); e.stopImmediatePropagation(); el.remove(); bump(); return; }
  }
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (a) {
    if (blocked(a.href)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (a.target && a.target !== '_self') a.target = '_self';
  }
}, true);

/* 5. Vídeo con el mando */
function mainVideo(){
  var vs = document.querySelectorAll('video'), best = null, area = 0;
  for (var i = 0; i < vs.length; i++) { var r = vs[i].getBoundingClientRect(); var a = r.width * r.height; if (a > area) { area = a; best = vs[i]; } }
  return best;
}
function fsEl(){ return document.fullscreenElement || document.webkitFullscreenElement; }
lb.video = function(){
  var v = mainVideo();
  if (!v) { post('toast', 'No hay vídeo en esta página'); return; }
  try { (v.requestFullscreen || v.webkitRequestFullscreen || v.webkitEnterFullscreen).call(v); } catch(e){}
  try { v.play(); } catch(e){}
  v.focus && v.focus();
};
document.addEventListener('keydown', function(e){
  var f = fsEl(); if (!f) return;
  var v = f.tagName === 'VIDEO' ? f : f.querySelector('video'); if (!v) return;
  var k = e.key, used = true;
  if (k === 'Enter' || k === ' ' || k === 'MediaPlayPause') { v.paused ? v.play() : v.pause(); }
  else if (k === 'ArrowRight' || k === 'MediaFastForward') { v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 10); }
  else if (k === 'ArrowLeft' || k === 'MediaRewind') { v.currentTime = Math.max(0, v.currentTime - 10); }
  else if (k === 'ArrowUp') { v.volume = Math.min(1, v.volume + 0.1); }
  else if (k === 'ArrowDown') { v.volume = Math.max(0, v.volume - 0.1); }
  else used = false;
  if (used) { e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('fullscreenchange', function(){ post('fullscreen', !!fsEl()); });

/* Navegación dentro de la página (SPA): avisa a la app para actualizar la barra */
['pushState', 'replaceState'].forEach(function(m){
  var o = history[m];
  history[m] = function(){ var r = o.apply(this, arguments); post('nav', location.href); return r; };
});
window.addEventListener('popstate', function(){ post('nav', location.href); });

/* Arranque */
if (document.head) addStyle(); else document.addEventListener('DOMContentLoaded', addStyle);
document.addEventListener('DOMContentLoaded', function(){
  clean(document.documentElement);
  post('ready', { videos: document.querySelectorAll('video').length });
});
if (document.readyState !== 'loading') { addStyle(); clean(document.documentElement); post('ready', { videos: document.querySelectorAll('video').length }); }
})(); true;`;
}

/** JS que se ejecuta al pulsar "Vídeo" en la barra. */
export const RELOAD_JS = 'location.reload(); true;';

export const FULLSCREEN_VIDEO_JS = 'window.__lb && window.__lb.video(); true;';
