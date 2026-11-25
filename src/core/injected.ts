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
 *  8. YouTube: pide la mejor calidad disponible hasta 1080p.
 */
export function buildInjectedScript(hosts: readonly string[], adPathSource = '', tv = true): string {
  return `(function(){
if (window.__lb) { return; }
/* tv=false (extensión de Chrome): sin cursor virtual, sin robar el foco a los marcos y sin forzar calidad en YouTube */
var TV = ${tv ? 'true' : 'false'};
var HOSTS = {};
${JSON.stringify(hosts)}.forEach(function(h){ HOSTS[h] = 1; });
/* peticiones de anuncios de vídeo por su forma (VAST/VMAP, Ad Manager), en cualquier dominio */
var AD_PATH = ${adPathSource ? `new RegExp(${JSON.stringify(adPathSource)}, 'i')` : 'null'};
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
    if (i < 0) break;
    h = h.slice(i + 1);
  }
  if (AD_PATH && u && AD_PATH.test(String(u))) { bump(); return true; }
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

/* 2. Red (en la extensión lo hace Chrome con declarativeNetRequest: no hace falta tocar la página) */
if (TV) {
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
/* Bloqueado: se responde como un error de red. Abortar sin eventos dejaba a los reproductores esperando
   al anuncio hasta su tiempo límite (la página tardaba mucho en empezar el vídeo). */
XMLHttpRequest.prototype.send = function(){
  if (!this.__lbBlocked) return xs.apply(this, arguments);
  var x = this;
  setTimeout(function(){
    try { Object.defineProperty(x, 'readyState', { value: 4, configurable: true }); Object.defineProperty(x, 'status', { value: 0, configurable: true }); } catch(e){}
    ['readystatechange', 'error', 'loadend'].forEach(function(t){ try { x.dispatchEvent(new (t === 'readystatechange' ? Event : ProgressEvent)(t)); } catch(e){} });
  }, 0);
};
if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function(u, d){ return blocked(u) ? true : sb(u, d); }; }

/* Un <script>/<iframe>/<img> bloqueado avisa con 'error' al momento, como si fallara la red: los reproductores
   que esperan al SDK de anuncios (onload/onerror) pasan directamente al vídeo en vez de esperar su tiempo límite. */
function failSoon(el){ setTimeout(function(){ try { el.dispatchEvent(new Event('error')); } catch(e){} }, 0); }
function guardSrc(proto, attr){
  var d = proto && Object.getOwnPropertyDescriptor(proto, attr);
  if (!d || !d.set) return;
  Object.defineProperty(proto, attr, { configurable: true, enumerable: d.enumerable, get: d.get,
    set: function(v){ if (blocked(v)) { failSoon(this); return; } d.set.call(this, v); } });
}
guardSrc(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src');
guardSrc(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src');
guardSrc(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
var osa = Element.prototype.setAttribute;
Element.prototype.setAttribute = function(n, v){
  if ((n === 'src' || n === 'href') && /^(SCRIPT|IFRAME|IMG|LINK)$/.test(this.tagName) && blocked(v)) { failSoon(this); return; }
  return osa.call(this, n, v);
};
}

/* 9. Anuncios de YouTube (se pone aquí para que JSON.parse se intercepte antes de que cargue la web):
   a) se borran los datos de anuncios de las respuestas del reproductor (adPlacements, playerAds, adSlots);
   b) si aun así empieza un anuncio, se silencia, se salta al final y se pulsa "Saltar". */
var IS_YT = /(^|\\.)youtube(-nocookie)?\\.com$/.test(location.hostname);
var YT_CSS = 'ytm-promoted-sparkles-web-renderer,ytm-promoted-video-renderer,ytm-companion-ad-renderer,ytm-companion-slot,' +
  'ad-slot-renderer,ytm-ad-slot-renderer,ytd-ad-slot-renderer,ytd-promoted-sparkles-web-renderer,ytd-display-ad-renderer,' +
  'ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,ytm-statement-banner-renderer,' +
  'ytd-merch-shelf-renderer,ytm-merch-shelf-renderer,ytm-paid-content-overlay-renderer,panel-ad-header-image-lockup-view-model,' +
  '#player-ads,#masthead-ad,.ytp-ad-overlay-container,.ytp-ad-text-overlay,.ytp-ad-image-overlay,';
/* (sin :has(): si el WebView no lo soporta invalidaría toda la regla CSS) */
var AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
function ytPrune(o){
  if (!o || typeof o !== 'object') return o;
  var ts = [o, o.playerResponse, o.response && o.response.playerResponse], hit = 0;
  if (Array.isArray(o)) for (var j = 0; j < o.length && j < 8; j++) ts.push(o[j], o[j] && o[j].playerResponse);
  for (var i = 0; i < ts.length; i++) {
    var t = ts[i];
    if (t && typeof t === 'object') for (var k = 0; k < AD_KEYS.length; k++) if (AD_KEYS[k] in t) { delete t[AD_KEYS[k]]; hit++; }
  }
  if (hit) bump();
  return o;
}
if (IS_YT) {
  var oParse = JSON.parse;
  JSON.parse = function(){ return ytPrune(oParse.apply(this, arguments)); };
  if (window.Response && Response.prototype.json) {
    var oJson = Response.prototype.json;
    Response.prototype.json = function(){ return oJson.call(this).then(ytPrune); };
  }
  ['ytInitialPlayerResponse', 'ytInitialData'].forEach(function(n){
    var val = window[n] ? ytPrune(window[n]) : undefined;
    try { Object.defineProperty(window, n, { configurable: true, get: function(){ return val; }, set: function(v){ val = ytPrune(v); } }); } catch(e){}
  });
}

/* 10. Saltador universal de anuncios de vídeo. Reconoce el estado "anuncio" de los reproductores más usados
   (YouTube, Google IMA, Video.js, JW Player, Bitmovin, Flowplayer, Clappr, Brightcove...) y, mientras dura:
   pulsa "Saltar", silencia el vídeo del anuncio y lo lleva al final. Sólo trabaja si la página tiene vídeos. */
var AD_STATE = '.html5-video-player.ad-showing,.html5-video-player.ad-interrupting,.vjs-ad-playing,.vjs-ad-loading,' +
  '.jw-flag-ads,.jw-flag-ads-vpaid,.bmpui-ui-skin-ads,.bmpui-player-state-ad,.fp-is-ad,.is-ad-playing,.ad-playing,' +
  '[data-ad-playing="true"],.bc-player-ad-playing';
/* (sin .vjs-ad-loading ni .vjs-ad-content-resuming: ahí el <video> es el CONTENIDO esperando a un anuncio
   que ya hemos bloqueado; adelantarlo cortaba la reproducción nada más darle a play) */
var AD_LAYER = '.ima-ad-container,.videoAdUi,[id^="ima-ad"],.jw-plugin-vast,.vjs-ima,.ad-container video,.preroll-container,' +
  '[class*="preroll"],[id*="preroll"],[class*="vast-player"],[class*="vpaid"]';
var SKIP_BTN = '.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-container button,' +
  '.videoAdUiSkipButton,.videoAdUiSkipContainer button,.jw-skip,.jw-skip-icon,.vjs-ad-skip,.ima-skip-button,.bmpui-ui-skip,' +
  '[class*="skip-ad"],[class*="skipAd"],[class*="ad-skip"],[class*="adSkip"],[class*="skip_ad"],[class*="SkipAd"],' +
  /* sólo botones que hablan de anuncios: un "Saltar intro" no debe pulsarse solo */
  '[aria-label*="kip ad"],[aria-label*="kip Ad"],[aria-label*="altar anuncio"],[aria-label*="mitir anuncio"]';
var mutedByUs = [];
function visibleEl(el){ var r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; }
/* sure: sólo en YouTube (.ad-showing) se sabe seguro que el <video> es el anuncio. En el resto, un vídeo
   sólo se trata como anuncio si dura poco (los anuncios duran segundos; una película o un capítulo, no). */
var AD_MAX = 90;
function fastForwardAd(v, sure){
  if (!v || v.__lbContent) return false;
  if (!sure && !(isFinite(v.duration) && v.duration > 0 && v.duration <= AD_MAX)) return false;
  if (!v.muted) { v.muted = true; mutedByUs.push(v); }
  try { v.playbackRate = 16; } catch(e){}
  if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.3) { try { v.currentTime = v.duration - 0.1; } catch(e){} bump(); }
  return true;
}
function skipAds(){
  if (!document.getElementsByTagName('video').length) return;
  var acted = false, i, j, list;
  /* reproductores en estado "anuncio": el propio vídeo del reproductor es el anuncio */
  list = document.querySelectorAll(AD_STATE);
  for (i = 0; i < list.length; i++) {
    var yt = /(^|\\s)(ad-showing|ad-interrupting)(\\s|$)/.test(list[i].className);
    var vs = list[i].querySelectorAll('video');
    for (j = 0; j < vs.length; j++) if (fastForwardAd(vs[j], yt)) acted = true;
  }
  /* capas de anuncio (IMA, VAST...) con su propio <video> encima del contenido */
  list = document.querySelectorAll(AD_LAYER);
  for (i = 0; i < list.length; i++) {
    var el = list[i];
    /* una capa de anuncio tiene su propio <video> encima del contenido: si en la página hay otro vídeo
       (el contenido), el de la capa es el anuncio; si es el único, podría ser el contenido mal detectado */
    var total = document.getElementsByTagName('video').length;
    if (el.tagName === 'VIDEO') { if (visibleEl(el) && fastForwardAd(el, total > 1)) acted = true; continue; }
    if (!visibleEl(el)) continue;
    var av = el.querySelectorAll('video');
    for (j = 0; j < av.length; j++) if (fastForwardAd(av[j], total > av.length)) acted = true;
  }
  /* botones "Saltar anuncio" visibles en cualquier sitio */
  list = document.querySelectorAll(SKIP_BTN);
  for (i = 0; i < list.length; i++) if (visibleEl(list[i])) { try { list[i].click(); } catch(e){} acted = true; }
  /* fin del anuncio: devolver el sonido sólo a los vídeos que silenciamos nosotros */
  if (!acted && mutedByUs.length) {
    for (i = 0; i < mutedByUs.length; i++) { try { mutedByUs[i].muted = false; mutedByUs[i].playbackRate = 1; } catch(e){} }
    mutedByUs = [];
  }
}
lb.skipAds = skipAds;
setInterval(skipAds, 300);

/* 3. Limpieza del DOM */
var CSS = 'ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[class*="adsbygoogle"],' +
  '[id^="taboola"],[class^="taboola"],.OUTBRAIN,[data-ad],[data-ad-slot],[data-adunit],' +
  'iframe[id*="google_ads"],.ad-banner,.ad-container,.ad-wrapper,.ad-slot,' +
  '.advertisement,#ad-banner,.sponsored,.popup-overlay,.modal-ad,[class*="popunder"],' +
  /* anuncios incrustados habituales (GPT de Google, AMP, Taboola/Outbrain, bloques marcados como publicidad) */
  'amp-ad,amp-embed,amp-sticky-ad,[id*="google_ads_iframe"],[data-google-query-id],iframe[src*="doubleclick.net"],' +
  'iframe[src*="googlesyndication"],iframe[src*="amazon-adsystem"],.adsbox,.adslot,.ad-slot,.ad-unit,.ad_unit,.ads-container,' +
  '.ad-placeholder,.advert,.advertising,.adsbygoogle,[aria-label="Advertisement"],[aria-label="Publicidad"],[aria-label="Anuncio"],' +
  '.trc_rbox_container,.ob-widget,.ob-smartfeed-wrapper,[data-testid="ad"],[data-ad-unit],[data-ad-container],' +
  /* webs para adultos: zonas de ExoClick (<ins data-zoneid>), TrafficStars, JuicyAds y marcos de sus servidores */
  'ins[data-zoneid],ins[class^="eas"],[id^="ts_ad"],[class^="ts_ad"],iframe[src*="magsrv"],iframe[src*="exoclick"],' +
  'iframe[src*="exosrv"],iframe[src*="juicyads"],iframe[src*="jads.co"],iframe[src*="trafficjunky"],iframe[src*="tsyndicate"],' +
  /* anuncios servidos por la propia web: contenedores con nombres de zona de anuncio (adframe, adnative, adzone...) */
  '[id*="adframe"],[id^="adnative"],[class^="adnative"],[class*=" adnative"],[id^="adzone"],[class^="adzone"],[id^="ad-zone"],' +
  '[id^="ad_zone"],[class*="ad-zone"],[id^="adbox"],[class^="adbox"],[class^="adstext"],[id^="ad-native"],[class*="ad-native"],' +
  '[id^="banner-ad"],[class*="banner-ad"],[id^="ad-banner"],[class*="ad-banner"],[id^="ads-"],[class^="ads-"],' +
  '[id$="-adv"],[id*="-adv-"],[class*="-adv-box"],[id^="adPlayer"],[class*="inplayer-iframe"],[id^="promosid"],' +
  'iframe.dotcontainer,[id^="epad-"],' +
  (IS_YT ? YT_CSS : '') + '#__lb_none' +
  '{display:none!important;visibility:hidden!important}';
function addStyle(){
  if (document.getElementById('__lb_css')) return;
  var s = document.createElement('style'); s.id = '__lb_css'; s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}
function clean(node){
  if (!node || node.nodeType !== 1) return;
  var t = node.tagName;
  if ((t === 'SCRIPT' || t === 'IFRAME' || t === 'IMG') && blocked(node.getAttribute('src'))) { node.remove(); failSoon(node); return; }
  if (t === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('target', '_self');
  if (node.querySelectorAll && node.firstElementChild) {
    var list = node.querySelectorAll('script[src],iframe[src],img[src],a[target="_blank"]');
    for (var i = 0; i < list.length; i++) clean(list[i]);
  }
}
var pending = [];
var scheduled = false;
function flush(){ scheduled = false; var p = pending; pending = []; for (var i = 0; i < p.length; i++) clean(p[i]); }
if (TV) new MutationObserver(function(muts){
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
  /* capas de control de un reproductor (el clic en play cae en ellas): tienen el vídeo al lado o dentro */
  if (el.querySelector('video,iframe')) return false;
  var par = el.parentElement;
  if (par && par !== document.body && par !== document.documentElement && par.querySelector('video')) return false;
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
function fsEl(){ return document.fullscreenElement || document.webkitFullscreenElement || (lb.fs && lb.fs.box); }
/* Pantalla completa PROPIA (botón "Vídeo"): el reproductor se amplía con estilos a toda la pantalla. La del sistema
   (requestFullscreen) rompía el reproductor de YouTube en el WebView de Vega ("Se produjo un error"). */
var FS_STYLE = 'position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;' +
  'width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;' +
  'z-index:2147483645!important;background:#000!important;transform:none!important';
lb.video = function(){
  if (lb.fs) { lb.exitVideo(); return; }
  var v = mainVideo();
  if (!v) { post('toast', 'No hay vídeo en esta página'); return; }
  var box = (v.closest && v.closest('.html5-video-player,#movie_player,.video-js,.jwplayer,.plyr,.fp-player,.bitmovinplayer-container')) || v;
  lb.fs = { box: box, v: v, boxStyle: box.getAttribute('style'), vStyle: v.getAttribute('style') };
  box.setAttribute('style', (lb.fs.boxStyle || '') + ';' + FS_STYLE);
  if (box !== v) v.setAttribute('style', (lb.fs.vStyle || '') + ';width:100%!important;height:100%!important;left:0!important;top:0!important;object-fit:contain!important');
  try { window.dispatchEvent(new Event('resize')); } catch(e){}
  try { var pr = v.play(); if (pr && pr.catch) pr.catch(function(){}); } catch(e){}
  post('fullscreen', true);
  curDraw();
};
lb.exitVideo = function(){
  var f = lb.fs; if (!f) return;
  lb.fs = null;
  if (f.boxStyle === null) f.box.removeAttribute('style'); else f.box.setAttribute('style', f.boxStyle);
  if (f.box !== f.v) { if (f.vStyle === null) f.v.removeAttribute('style'); else f.v.setAttribute('style', f.vStyle); }
  try { window.dispatchEvent(new Event('resize')); } catch(e){}
  post('fullscreen', false);
  curDraw();
};
window.addEventListener('keydown', function(e){
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
var cur = { on: TV, x: -1, y: -1, el: null, ring: null, ringFor: null, ringT: 0, hover: null, dir: '', vx: 0, vy: 0, start: 0, lastKey: 0, prev: 0, raf: 0, ox: 0, oy: 0, fix: true, pq: 0, rr: 0, scrollQ: 0 };
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
    var vis = cur.on && !cur.sleep && !fsEl() && cur.x >= 0 ? 1 : 0;
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
  /* Sin innerHTML: webs con Trusted Types (YouTube) lanzan una excepción y el cursor no arrancaba */
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
  svg.setAttribute('width', '26'); svg.setAttribute('height', '26'); svg.setAttribute('viewBox', '0 0 26 26');
  svg.setAttribute('style', 'pointer-events:none;display:block');
  path.setAttribute('d', 'M4 3l16 9-7 2 4 8-3 1.5-4-8-6 5z'); path.setAttribute('fill', '#fff');
  path.setAttribute('stroke', '#000'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path); d.appendChild(svg);
  root.appendChild(d); cur.el = d; return d;
}
function curDraw(){
  if (!TV) return;
  var d = curEl(); if (!d) return;
  if (cur.x < 0) { cur.x = VW() / 2; cur.y = VH() / 2; }
  d.style.display = cur.on && !cur.sleep && !fsEl() ? 'block' : 'none';
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
  /* Con la app dibujando el cursor, el de la página se oculta del todo: en el WebView de Vega un elemento
     transparente con pointer-events:none seguía interceptando elementFromPoint y tapaba los enlaces. */
  if (NATIVE() && cur.el) cur.el.style.display = 'none';
  curPost();
};
/* si el desfase depende del scroll (fixed roto), se vuelve a medir al desplazar */
window.addEventListener('scroll', function(){
  if (!cur.el || cur.sleep || cur.scrollQ) return;
  cur.scrollQ = 1;
  requestAnimationFrame(function(){ cur.scrollQ = 0; cur.fix = true; curDraw(); cur.ringFor = null; curRing(); });
}, { passive: true, capture: true });
/* El cursor vive en coordenadas de la parte VISIBLE (visualViewport); elementFromPoint y los eventos de ratón
   usan las del viewport de diseño: si la página tiene zoom o está desplazada, se suma ese desfase. */
function VX(){ var v = window.visualViewport; return v ? v.offsetLeft : 0; }
function VY(){ var v = window.visualViewport; return v ? v.offsetTop : 0; }
function curTarget(){ return document.elementFromPoint(cur.x + VX(), cur.y + VY()); }
function mouse(type, el, extra){
  var o = { bubbles: true, cancelable: true, view: window, clientX: cur.x + VX(), clientY: cur.y + VY(), button: 0 };
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
  if (!c || !cur.on || cur.sleep || fsEl()) { g.style.display = 'none'; curPost(); return; }
  var r = c.getBoundingClientRect();
  if (r.width * r.height > VW() * VH() * 0.4) { g.style.display = 'none'; curPost(); return; }
  cur.rr = [Math.round(r.left - VX()), Math.round(r.top - VY()), Math.round(r.width), Math.round(r.height)];
  curPost();
  g.style.display = NATIVE() ? 'none' : 'block';
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
/* OK sobre un marco (iframe): si es de la misma web se pulsa el elemento de dentro; si es de otra web
   (p. ej. un reproductor incrustado) y es grande, se abre a pantalla completa en el navegador, porque
   desde fuera no se puede pulsar dentro y darle el foco dejaría el mando "atrapado" en el marco. */
function clickInFrame(fr){
  var r = fr.getBoundingClientRect(), doc = null;
  try { doc = fr.contentDocument; } catch(e){}
  if (doc && doc.elementFromPoint) {
    var x = cur.x + VX() - r.left, y = cur.y + VY() - r.top, el = doc.elementFromPoint(x, y);
    if (el) {
      var o = { bubbles: true, cancelable: true, view: fr.contentWindow, clientX: x, clientY: y, button: 0 };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function(tp){ try { el.dispatchEvent(new MouseEvent(tp, o)); } catch(e){} });
      if (typeof el.click === 'function') el.click();
      return true;
    }
  }
  var src = fr.src || '';
  if (/^https?:/i.test(src) && r.width >= 200 && r.height >= 120 && !blocked(src)) {
    post('toast', 'Abriendo el contenido incrustado…');
    location.href = src;
    return true;
  }
  return false;
}
function curClick(){
  var t = curTarget(); if (!t) return;
  if (t.tagName === 'IFRAME' || t.tagName === 'FRAME') { clickInFrame(t); if (NATIVE()) post('click', 1); return; }
  mouse('pointerdown', t); mouse('mousedown', t);
  var f = t.closest ? t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]') : null;
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
/* Si el foco del teclado acaba dentro de un marco (reproductores incrustados, autofocus...), las teclas del mando
   ya no llegan a esta página y el cursor "desaparece": se recupera el foco. */
function frameFocusGuard(){
  var a = document.activeElement;
  if (a && (a.tagName === 'IFRAME' || a.tagName === 'FRAME')) { try { a.blur(); } catch(e){} try { window.focus(); } catch(e){} }
}
if (TV) {
  window.addEventListener('blur', function(){ setTimeout(frameFocusGuard, 0); });
  setInterval(frameFocusGuard, 1000);
}
/* Se oculta tras 2,5 s sin usar el mando: así no queda nada dibujado encima de un vídeo
   (una capa encima obliga a componer el vídeo y en el Firestick se pierden fotogramas). */
function curWake(){
  if (!TV) return;
  if (cur.sleep) { cur.sleep = 0; curDraw(); cur.ringFor = null; curRing(); }
  clearTimeout(cur.idleT);
  cur.idleT = setTimeout(function(){ if (cur.dir) { curWake(); return; } cur.sleep = 1; curPost(); }, 2500);
}
lb.cursor = function(on){ cur.on = on === undefined ? !cur.on : !!on; curDraw(); post('toast', cur.on ? 'Cursor activado' : 'Cursor desactivado'); };
window.addEventListener('keydown', function(e){
  /* atajo: botón ⏪ del mando (fuera de la pantalla completa) = ir a la barra de dirección */
  if (TV && (e.key === 'MediaRewind' || e.keyCode === 227) && !fsEl()) { e.preventDefault(); e.stopPropagation(); curStop(); post('focusbar', 1); return; }
  if (!cur.on || fsEl()) return;
  var k = e.key, dir = DIRS[k];
  if (!dir && k !== 'Enter') return;
  curWake();
  if (k === 'Enter') {
    /* Sólo se deja pasar el Enter (p. ej. "Ir" del teclado en pantalla) si el cursor está sobre el MISMO campo
       que se está editando. Muchas webs (DuckDuckGo) enfocan su buscador al cargar: si no, OK nunca haría clic. */
    var a = document.activeElement, t = curTarget();
    if (editing() && t && (t === a || a.contains(t))) return;
    e.preventDefault(); e.stopPropagation(); curClick(); return;
  }
  if (editing()) { document.activeElement.blur(); }
  if (cur.x < 0) curDraw();
  /* arriba del todo y sin nada que desplazar: la APP lleva el foco a la barra (dejar que el WebView lo pasara
     solo no funcionaba en muchas webs, que se quedan las flechas) */
  if (k === 'ArrowUp' && cur.y <= 3 && !scrollable(curTarget(), 0, -1) && window.scrollY <= 0) {
    curStop(); e.preventDefault(); e.stopPropagation(); post('focusbar', 1); return;
  }
  e.preventDefault(); e.stopPropagation();
  var now = Date.now();
  cur.lastKey = now;
  if (cur.dir !== k) {
    cur.dir = k; cur.vx = dir[0]; cur.vy = dir[1]; cur.start = now;
  }
  if (!cur.raf) { cur.prev = 0; cur.raf = requestAnimationFrame(curTick); }
}, true);
window.addEventListener('keyup', function(e){ if (DIRS[e.key] && e.key === cur.dir) curStop(); }, true);
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

/* 8. YouTube: pide la mejor calidad disponible hasta 1080p (por defecto la web móvil elige 360p) */
var YT_MAX = ['hd1080', 'hd720', 'large', 'medium'];
function ytQuality(){
  var p = document.getElementById('movie_player');
  if (!p || typeof p.getAvailableQualityLevels !== 'function') return;
  var lv = p.getAvailableQualityLevels() || [], want = '';
  for (var i = 0; i < YT_MAX.length; i++) if (lv.indexOf(YT_MAX[i]) >= 0) { want = YT_MAX[i]; break; }
  if (!want || p.getPlaybackQuality() === want) return;
  try { if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(want, want); if (p.setPlaybackQuality) p.setPlaybackQuality(want); } catch(e){}
}
if (TV && /(^|\\.)youtube\\.com$/.test(location.hostname)) setInterval(ytQuality, 2000);

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
  curDraw(); curWake();
  post('ready', { videos: document.querySelectorAll('video').length });
});
if (document.readyState !== 'loading') { addStyle(); clean(document.documentElement); curDraw(); curWake(); post('ready', { videos: document.querySelectorAll('video').length }); }
})(); true;`;
}

/** JS que se ejecuta al pulsar "Vídeo" en la barra. */
export const RELOAD_JS = 'location.reload(); true;';

export const FULLSCREEN_VIDEO_JS = 'window.__lb && window.__lb.video(); true;';
