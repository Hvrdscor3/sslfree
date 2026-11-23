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
 *  7. Cursor virtual: flechas = mover puntero, OK = clic, bordes = desplazar. window.__lb.cursor() lo activa/desactiva.
 */
export function buildInjectedScript(hosts: readonly string[]): string {
  return `(function(){
if (window.__lb) { return; }
var HOSTS = {};
${JSON.stringify(hosts)}.forEach(function(h){ HOSTS[h] = 1; });
var blockedCount = 0, statT = 0;
function bump(){ blockedCount++; if (!statT) { statT = setTimeout(function(){ statT = 0; post("stats", blockedCount); }, 1500); } }
function post(type, data){
  try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:type, data:data})); } catch(e){}
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

/* 7. Cursor virtual: las flechas mueven un puntero (con aceleración) y OK hace clic donde está.
   En los bordes desplaza la página; arriba del todo deja salir el foco hacia la barra de la app. */
var cur = { on: true, x: -1, y: -1, el: null, ring: null, ringFor: null, ringT: 0, hover: null, dir: '', vx: 0, vy: 0, start: 0, lastKey: 0, prev: 0, raf: 0, ox: 0, oy: 0, fix: true, pq: 0, rr: 0 };
/* Se cuelga de <html>, no de <body>: si la web pone transform/filter/contain en <body>,
   position:fixed deja de ser relativo a la pantalla. Además se mide y se compensa (cur.ox/oy)
   por si también <html> lo rompe. */
/* En la app el cursor y el recuadro los dibuja React Native por ENCIMA del WebView (los campos de
   texto del WebView de Vega se pintan en una capa propia que taparía cualquier elemento de la página).
   Aquí se mantienen invisibles (opacity 0) para medir posiciones, y se envían a la app con post('cur'). */
function NATIVE(){ return !!window.ReactNativeWebView; }
/* Tamaño VISIBLE del viewport. En el WebView de Vega innerWidth/innerHeight incluyen lo que
   desborda la página (p. ej. 2876x1427 con una pantalla de 1920x952), así que no sirven. */
function VW(){ var v = window.visualViewport; return (v && v.width) || document.documentElement.clientWidth || window.innerWidth; }
function VH(){ var v = window.visualViewport; return (v && v.height) || document.documentElement.clientHeight || window.innerHeight; }
function curPost(){
  if (!NATIVE() || cur.pq) return;
  cur.pq = 1;
  requestAnimationFrame(function(){
    cur.pq = 0;
    var vis = cur.on && !fsEl() && cur.x >= 0 ? 1 : 0;
    /* en proporción del viewport (0..1): la app lo multiplica por su tamaño real, sin depender de la densidad */
    var W = VW() || 1, H = VH() || 1, q = function(v, d){ return Math.round(v / d * 10000) / 10000; };
    var rr = cur.rr ? [q(cur.rr[0], W), q(cur.rr[1], H), q(cur.rr[2], W), q(cur.rr[3], H)] : 0;
    post('cur', [q(cur.x, W), q(cur.y, H), vis, rr]);
  });
}
function curEl(){
  if (cur.el && cur.el.isConnected) return cur.el;
  var root = document.documentElement; if (!root) return null;
  cur.ox = 0; cur.oy = 0; cur.fix = true;
  var d = document.createElement('div'); d.id = '__lb_cursor';
  d.setAttribute('style', 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-4px 0 0 -4px;z-index:2147483647;' +
    'pointer-events:none;transition:none;will-change:transform;display:none');
  d.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 3l16 9-7 2 4 8-3 1.5-4-8-6 5z" ' +
    'fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  root.appendChild(d); cur.el = d; return d;
}
function curDraw(){
  var d = curEl(); if (!d) return;
  if (cur.x < 0) { cur.x = VW() / 2; cur.y = VH() / 2; }
  d.style.display = cur.on && !fsEl() ? 'block' : 'none';
  d.style.transform = 'translate3d(' + (cur.x - cur.ox).toFixed(1) + 'px,' + (cur.y - cur.oy).toFixed(1) + 'px,0)';
  if (cur.fix && d.style.display === 'block') {
    /* comprobar que el puntero está donde debe en la pantalla (margin -4px) y corregir el desfase */
    cur.fix = false;
    var r = d.getBoundingClientRect();
    var ex = r.left + 4 - cur.x, ey = r.top + 4 - cur.y;
    if (Math.abs(ex) > 1 || Math.abs(ey) > 1) {
      cur.ox += ex; cur.oy += ey;
      d.style.transform = 'translate3d(' + (cur.x - cur.ox).toFixed(1) + 'px,' + (cur.y - cur.oy).toFixed(1) + 'px,0)';
    }
  }
}
/* curDraw y curRing avisan a la app */
/* window.ReactNativeWebView puede aparecer después de inyectar el script: la opacidad se decide en cada dibujo */
var _curDraw = curDraw; curDraw = function(){
  _curDraw();
  var o = NATIVE() ? '0' : '1';
  if (cur.el && cur.el.style.opacity !== o && !cur.flash) cur.el.style.opacity = o;
  if (cur.ring && cur.ring.style.opacity !== o) cur.ring.style.opacity = o;
  curPost();
};
/* si el desfase depende del scroll (fixed roto), se vuelve a medir al desplazar */
window.addEventListener('scroll', function(){ if (cur.el) { cur.fix = true; curDraw(); cur.ringFor = null; curRing(); } }, { passive: true, capture: true });
function curTarget(){ return document.elementFromPoint(cur.x, cur.y); }
function mouse(type, el, extra){
  var o = { bubbles: true, cancelable: true, view: window, clientX: cur.x, clientY: cur.y, button: 0 };
  for (var k in extra) o[k] = extra[k];
  try { el.dispatchEvent(type.indexOf('pointer') === 0 && window.PointerEvent ? new PointerEvent(type, o) : new MouseEvent(type, o)); } catch(e){}
}
/* Recuadro azul alrededor del elemento pulsable bajo el cursor (se ve aunque algo tape la flecha) */
var CLICKABLE = 'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[onclick],[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
function curRing(){
  var t = curTarget(), c = t && t.closest ? t.closest(CLICKABLE) : null;
  if (c === cur.ringFor) return;
  cur.ringFor = c;
  var g = cur.ring;
  if (!g || !g.isConnected) {
    g = cur.ring = document.createElement('div'); g.id = '__lb_ring';
    g.setAttribute('style', 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;border:3px solid #3b82f6;' +
      'border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 14px rgba(59,130,246,.8);display:none;box-sizing:border-box');
    document.documentElement.appendChild(g);
  }
  cur.rr = 0;
  if (!c || !cur.on || fsEl()) { g.style.display = 'none'; curPost(); return; }
  var r = c.getBoundingClientRect();
  if (r.width * r.height > VW() * VH() * 0.4) { g.style.display = 'none'; curPost(); return; }
  cur.rr = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  curPost();
  g.style.display = 'block';
  g.style.width = (r.width + 8) + 'px'; g.style.height = (r.height + 8) + 'px';
  g.style.transform = 'translate(' + (r.left - 4 - cur.ox) + 'px,' + (r.top - 4 - cur.oy) + 'px)';
}
function curHover(){
  curRing();
  var t = curTarget(); if (!t) return;
  if (t !== cur.hover) {
    if (cur.hover) { mouse('mouseout', cur.hover, { relatedTarget: t }); mouse('mouseleave', cur.hover, { bubbles: false }); }
    mouse('mouseover', t, { relatedTarget: cur.hover }); mouse('mouseenter', t, { bubbles: false });
    cur.hover = t;
  }
  mouse('pointermove', t); mouse('mousemove', t);
}
function scrollable(el, dx, dy){
  for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    var cs = getComputedStyle(el);
    if (dy && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
      if ((dy < 0 && el.scrollTop > 0) || (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return el;
    }
    if (dx && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth) {
      if ((dx < 0 && el.scrollLeft > 0) || (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)) return el;
    }
  }
  return null;
}
function curScroll(dx, dy){
  var box = scrollable(curTarget(), dx, dy);
  var before = box ? box.scrollTop + box.scrollLeft : window.scrollY + window.scrollX;
  /* instant: si la web usa scroll-behavior:smooth, cada fotograma encadenaría animaciones */
  var o = { left: dx, top: dy, behavior: 'instant' };
  try { if (box) box.scrollBy(o); else window.scrollBy(o); } catch(e) { if (box) box.scrollBy(dx, dy); else window.scrollBy(dx, dy); }
  var after = box ? box.scrollTop + box.scrollLeft : window.scrollY + window.scrollX;
  return after !== before;
}
function curClick(){
  var t = curTarget(); if (!t) return;
  mouse('pointerdown', t); mouse('mousedown', t);
  var f = t.closest ? t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],iframe') : null;
  if (f) { try { f.focus(); } catch(e){} } else if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
  mouse('pointerup', t); mouse('mouseup', t);
  if (typeof t.click === 'function') t.click(); else mouse('click', t);
  var d = curEl(); if (d && !NATIVE()) { cur.flash = 1; d.style.opacity = '0.4'; setTimeout(function(){ cur.flash = 0; d.style.opacity = '1'; }, 120); }
  if (NATIVE()) post('click', 1);
}
function editing(){
  var a = document.activeElement; if (!a) return false;
  return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable;
}
var DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
lb.cursor = function(on){ cur.on = on === undefined ? !cur.on : !!on; curDraw(); post('toast', cur.on ? 'Cursor activado' : 'Cursor desactivado'); };
document.addEventListener('keydown', function(e){
  if (!cur.on || fsEl() || e.defaultPrevented) return;
  var k = e.key, dir = DIRS[k];
  if (!dir && k !== 'Enter') return;
  if (k === 'Enter') {
    if (editing()) return; /* deja que el teclado en pantalla confirme el texto */
    e.preventDefault(); e.stopPropagation(); curClick(); return;
  }
  if (editing()) { document.activeElement.blur(); }
  if (cur.x < 0) curDraw();
  /* arriba del todo y sin nada que desplazar: deja que el foco salga a la barra */
  if (k === 'ArrowUp' && cur.y <= 3 && !scrollable(curTarget(), 0, -1) && window.scrollY <= 0) { curStop(); return; }
  e.preventDefault(); e.stopPropagation();
  var now = Date.now();
  cur.lastKey = now;
  if (cur.dir !== k) {
    cur.dir = k; cur.vx = dir[0]; cur.vy = dir[1]; cur.start = now;
  }
  if (!cur.raf) { cur.prev = 0; cur.raf = requestAnimationFrame(curTick); }
}, true);
document.addEventListener('keyup', function(e){ if (DIRS[e.key] && e.key === cur.dir) curStop(); }, true);
/* Mueve el cursor n píxeles en la dirección actual; en el borde desplaza la página. */
function curStep(n){
  var W = VW(), H = VH(), M = 2;
  var nx = cur.x + cur.vx * n, ny = cur.y + cur.vy * n;
  if (nx < M || nx > W - M || ny < M || ny > H - M) curScroll(cur.vx * n * 1.5, cur.vy * n * 1.5);
  cur.x = Math.max(M, Math.min(W - M, nx)); cur.y = Math.max(M, Math.min(H - M, ny));
  curDraw();
}
/* Movimiento continuo mientras se mantiene la flecha, sin saltos: arranca a 160 px/s
   (un toque de ~200 ms avanza unos 35 px, preciso) y acelera de forma progresiva hasta 1600 px/s.
   El mando repite keydown cada ~200 ms y envía keyup al soltar. */
function curTick(t){
  cur.raf = 0;
  if (!cur.dir) return;
  var now = Date.now();
  /* si el mando deja de repetir (sin keyup), se para solo */
  if (now - cur.lastKey > 350) { curStop(); return; }
  var dt = cur.prev ? Math.min(t - cur.prev, 50) : 16; cur.prev = t;
  var held = (now - cur.start) / 1000;
  var v = Math.min(1600, 160 + 1300 * held * held);
  curStep(v * dt / 1000);
  if (t - (cur.ringT || 0) > 90) { cur.ringT = t; curRing(); }
  cur.raf = requestAnimationFrame(curTick);
}
function curStop(){
  if (cur.raf) { cancelAnimationFrame(cur.raf); cur.raf = 0; }
  if (cur.dir) { cur.dir = ''; curHover(); }
}

window.addEventListener('resize', function(){ if (cur.x >= 0) { cur.x = Math.min(cur.x, VW() - 2); cur.y = Math.min(cur.y, VH() - 2); curDraw(); } });
document.addEventListener('fullscreenchange', curDraw);

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
  curDraw();
  post('ready', { videos: document.querySelectorAll('video').length });
});
if (document.readyState !== 'loading') { addStyle(); clean(document.documentElement); curDraw(); post('ready', { videos: document.querySelectorAll('video').length }); }
})(); true;`;
}

/** JS que se ejecuta al pulsar "Vídeo" en la barra. */
export const RELOAD_JS = 'location.reload(); true;';

export const FULLSCREEN_VIDEO_JS = 'window.__lb && window.__lb.video(); true;';
