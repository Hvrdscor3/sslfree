// Prueba el script inyectado en Chromium real: pop-ups, scripts/iframes de anuncios,
// capas invisibles atrapa-clics, enlaces _blank y controles de vídeo con el mando.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const out = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
  `import { buildInjectedScript } from './src/core/injected.ts';
   import { AD_PATH_RE, hostsForInjection } from './src/core/adblock.ts';
   process.stdout.write(buildInjectedScript(hostsForInjection(), AD_PATH_RE.source));`], { encoding: 'utf8' });
if (out.status !== 0) { console.error(out.stderr); process.exit(1); }
const SCRIPT = out.stdout;

const page_html = `<!doctype html><html><head>
<script src="https://pagead2.googlesyndication.com/ad.js"></script></head><body>
<a id="ext" href="/other" target="_blank">enlace</a>
<ins class="adsbygoogle" style="display:block;width:300px;height:250px">ad</ins>
<div id="gpt" data-google-query-id="abc" style="height:90px">gpt</div><amp-ad id="amp" style="display:block">amp</amp-ad>
<div id="tb" class="trc_rbox_container">taboola</div>
<ins id="exo" class="eas6a97888e2" data-zoneid="1234567" style="display:block">exo</ins><div id="tsad" style="height:90px" class="ts_ad_native">ts</div><div id="ariaad" aria-label="Publicidad">pub</div>
<div id="real" class="header-load-more">contenido real</div>
<video id="v" width="640" height="360" muted src="/v.mp4"></video>
<div id="trap" style="position:fixed;inset:0;z-index:9999;opacity:0" onclick="window.__trapped=1"></div>
<script>
  window.openResult = window.open('https://popads.net/x');
  var s = document.createElement('script'); s.src = 'https://cdn.popcash.net/pop.js'; document.body.appendChild(s);
  var f = document.createElement('iframe'); f.setAttribute('src', 'https://ads.exoclick.com/frame'); document.body.appendChild(f);
  window.fetchBlocked = null;
  fetch('https://www.google-analytics.com/collect').then(function(){ window.fetchBlocked = false; }, function(){ window.fetchBlocked = true; });
  window.alert('molesto');
</script></body></html>`;

const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(page_html); });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext();
const externalRequests = [];
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (!u.startsWith(base)) { externalRequests.push(u); return route.abort(); }
  return route.continue();
});
const popups = [];

const page = await ctx.newPage();
ctx.on('page', (p) => popups.push(p));
const messages = [];
await page.exposeFunction('__rnPost', (m) => messages.push(JSON.parse(m)));
await page.addInitScript(`window.ReactNativeWebView = { postMessage: function(m){ window.__rnPost(m); } };`);
await page.addInitScript(SCRIPT);
page.on('dialog', (d) => { externalRequests.push('DIALOG:' + d.message()); d.dismiss(); });
await page.goto(base + '/');
await page.waitForTimeout(300);

const r = await page.evaluate(() => ({
  openResultClosed: window.openResult && window.openResult.closed,
  popScript: !!document.querySelector('script[src*="popcash"]'),
  adIframe: !!document.querySelector('iframe[src*="exoclick"]'),
  insHidden: getComputedStyle(document.querySelector('ins.adsbygoogle')).display === 'none',
  embedsHidden: ['gpt', 'amp', 'tb', 'ariaad', 'exo', 'tsad'].every((id) => getComputedStyle(document.getElementById(id)).display === 'none'),
  realShown: getComputedStyle(document.getElementById('real')).display !== 'none',
  linkTarget: document.getElementById('ext').getAttribute('target'),
  fetchBlocked: window.fetchBlocked,
  blocked: window.__lb.blocked(),
}));
await page.evaluate(() => history.pushState({}, '', '/seccion'));
await page.mouse.click(300, 300);
const trap = await page.evaluate(() => ({ trapped: !!window.__trapped, trapGone: !document.getElementById('trap') }));

// Idempotencia: inyectar dos veces no debe romper nada
await page.evaluate(SCRIPT);

let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); if (!ok) fails++; };
check('window.open devuelve ventana falsa', r.openResultClosed === true);
check('no se abrió ninguna ventana nueva', popups.length === 0);
check('script de pop-under eliminado', !r.popScript);
check('iframe de anuncios eliminado', !r.adIframe);
check('contenedor adsbygoogle oculto', r.insHidden);
check('anuncios incrustados (GPT, AMP, Taboola, "Publicidad", ExoClick, TrafficStars) ocultos', r.embedsHidden);
check('el contenido normal no se oculta', r.realShown);
check('enlace _blank convertido a _self', r.linkTarget === '_self');
check('fetch a rastreador bloqueado', r.fetchBlocked === true);
check('alert() silenciado', !externalRequests.some((u) => u.startsWith('DIALOG')));
check('capa invisible atrapa-clics eliminada sin disparar', !trap.trapped && trap.trapGone);
check('ninguna petición salió a dominios de anuncios',
  !externalRequests.some((u) => /popcash|exoclick|google-analytics|popads/.test(u)));
check('contador de bloqueos > 0', r.blocked > 0);
await page.waitForTimeout(1700);
check('navegación SPA notificada a la app', messages.some((m) => m.type === 'nav' && m.data.endsWith('/seccion')));
check('mensajes enviados a la app (stats/ready)', messages.some((m) => m.type === 'stats') && messages.some((m) => m.type === 'ready'));

// Cursor virtual: flechas mueven el puntero, OK hace clic, abajo en el borde desplaza
const cp = await ctx.newPage();
cp.on('dialog', (d) => d.dismiss());
await cp.setViewportSize({ width: 800, height: 600 });
await cp.route(base + '/cursor', (route) => route.fulfill({ contentType: 'text/html', body:
  `<!doctype html><body style="margin:0"><button id="b" style="position:absolute;left:400px;top:200px;width:200px;height:120px"
   onclick="window.__clicked=(window.__clicked||0)+1">btn</button><input id="i" style="position:absolute;left:100px;top:450px">
   <div style="height:3000px"></div></body>` }));
await cp.addInitScript(SCRIPT);
await cp.goto(base + '/cursor');
await cp.waitForTimeout(100);
const c0 = await cp.evaluate(() => { const r = document.getElementById('__lb_cursor').getBoundingClientRect(); return { shown: getComputedStyle(document.getElementById('__lb_cursor')).display, x: r.x + 4, y: r.y + 4 }; });
// Toques como los del mando (~120 ms pulsado) hasta llegar al objetivo, midiendo la posición
const curPos = () => cp.evaluate(() => { const r = document.getElementById('__lb_cursor').getBoundingClientRect(); return { x: r.x + 4, y: r.y + 4 }; });
const tap = async (key) => { await cp.keyboard.down(key); await cp.waitForTimeout(120); await cp.keyboard.up(key); await cp.waitForTimeout(30); };
const moveTo = async (tx, ty) => {
  for (let i = 0; i < 60; i++) {
    const p = await curPos();
    if (Math.abs(p.x - tx) > 12) await tap(p.x < tx ? 'ArrowRight' : 'ArrowLeft');
    else if (Math.abs(p.y - ty) > 6) await tap(p.y < ty ? 'ArrowDown' : 'ArrowUp');
    else return p;
  }
  return curPos();
};
const tapMoved = await (async () => { const a = await curPos(); await tap('ArrowRight'); const b = await curPos(); return b.x - a.x; })();
check('cursor: un toque corto mueve poco (5-40 px)', tapMoved >= 5 && tapMoved <= 40);
await moveTo(500, 260); // dentro del botón (400..600, 200..320)
await cp.evaluate(() => document.getElementById('i').focus()); // como DuckDuckGo: un campo con foco
const ring = await cp.evaluate(() => { const g = document.getElementById('__lb_ring'); if (!g) return null; const r = g.getBoundingClientRect(); return { d: getComputedStyle(g).display, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; });
check('cursor: recuadro azul alrededor del botón bajo el puntero', !!ring && ring.d === 'block' && Math.abs(ring.x - 396) <= 2 && Math.abs(ring.y - 196) <= 2 && Math.abs(ring.w - 208) <= 2);
await cp.keyboard.press('Enter');
const c1 = await cp.evaluate(() => ({ clicked: window.__clicked || 0 }));
await moveTo(150, 460);  // dentro del input (100..~270, 450..~471)
await cp.keyboard.press('Enter');
const c2 = await cp.evaluate(() => ({ focused: document.activeElement && document.activeElement.id }));
// Mantener pulsado (el mando repite keydown cada ~150 ms): movimiento continuo hasta el borde y desplazamiento
const curY = () => cp.evaluate(() => document.getElementById('__lb_cursor').getBoundingClientRect().y);
for (let i = 0; i < 12; i++) { await cp.keyboard.down('ArrowDown'); await cp.waitForTimeout(150); }
await cp.keyboard.up('ArrowDown');
const c3 = await cp.evaluate(() => ({ scrollY: window.scrollY }));
const y0 = await curY();
for (let i = 0; i < 4; i++) { await cp.keyboard.down('ArrowUp'); await cp.waitForTimeout(200); }
await cp.keyboard.up('ArrowUp');
const ya = await curY();
await cp.waitForTimeout(400);
const yb = await curY();
check('cursor: mantener pulsado 0,8 s avanza más de 200 px', y0 - ya > 200);
check('cursor: al soltar la flecha se detiene', ya === yb);
check('cursor visible al cargar, en el centro', c0.shown === 'block' && Math.abs(c0.x - 400) < 3 && Math.abs(c0.y - 300) < 3);
check('cursor: OK hace clic en el botón bajo el puntero (aunque otro campo tenga el foco)', c1.clicked === 1);
check('cursor: OK sobre un input le da el foco', c2.focused === 'i');
check('cursor: en el borde inferior desplaza la página', c3.scrollY > 0);

// Dentro de la app (window.ReactNativeWebView): el cursor lo dibuja React Native; el de la página no debe
// existir visualmente ni tapar enlaces, y la posición se envía en proporción del viewport
const nv = await ctx.newPage();
await nv.setViewportSize({ width: 800, height: 600 });
const navMsgs = [];
await nv.exposeFunction('__rnPost2', (m) => navMsgs.push(JSON.parse(m)));
await nv.addInitScript(`window.ReactNativeWebView = { postMessage: function(m){ window.__rnPost2(m); } };`);
await nv.route(base + '/native', (route) => route.fulfill({ contentType: 'text/html', body:
  `<!doctype html><body style="margin:0"><a id="l" href="#hit" style="position:absolute;left:380px;top:290px;font-size:14px">enlace de texto pequeño</a></body>` }));
await nv.addInitScript(SCRIPT);
await nv.goto(base + '/native');
await nv.waitForTimeout(150);
await nv.keyboard.press('Enter'); // el cursor empieza en el centro (400,300), encima del enlace
await nv.waitForTimeout(100);
const n1 = await nv.evaluate(() => ({ hash: location.hash, disp: getComputedStyle(document.getElementById('__lb_cursor')).display }));
const lastCur = navMsgs.filter((m) => m.type === 'cur').pop();
check('app: el cursor de la página está oculto (lo dibuja la app)', n1.disp === 'none');
check('app: OK sobre un enlace de texto lo abre', n1.hash === '#hit');
check('app: posición enviada en proporción (0,5 ; 0,5)', !!lastCur && Math.abs(lastCur.data[0] - 0.5) < 0.01 && Math.abs(lastCur.data[1] - 0.5) < 0.01);

// Anuncios de YouTube: se simula www.youtube.com (la ruta intercepta el dominio, no sale a internet)
const yt = await ctx.newPage();
yt.on('dialog', (d) => d.dismiss());
await yt.route('https://www.youtube.com/**', (route) => {
  const u = route.request().url();
  if (u.endsWith('/player')) return route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ videoDetails: { videoId: 'x' }, adPlacements: [{ a: 1 }], playerAds: [{ b: 1 }], adSlots: [1] }) });
  return route.fulfill({ contentType: 'text/html', body: `<!doctype html><body>
    <script>var ytInitialPlayerResponse = { videoDetails: { videoId: 'x' }, adPlacements: [1], playerAds: [2] };</script>
    <div id="movie_player" class="html5-video-player ad-showing"><video id="v" muted></video>
      <button class="ytp-ad-skip-button-modern" onclick="window.__skipped=1">Saltar</button></div>
    <ytm-promoted-sparkles-web-renderer id="promo">promo</ytm-promoted-sparkles-web-renderer>
    <div id="ok">contenido</div></body>` });
});
await yt.addInitScript(SCRIPT);
await yt.goto('https://www.youtube.com/watch?v=x');
await yt.waitForTimeout(400);
const ytr = await yt.evaluate(async () => {
  const parsed = JSON.parse(JSON.stringify({ playerResponse: { adPlacements: [1], videoDetails: {} } }));
  const fetched = await fetch('/youtubei/v1/player').then((r) => r.json());
  return {
    initial: 'adPlacements' in window.ytInitialPlayerResponse || 'playerAds' in window.ytInitialPlayerResponse,
    initialKept: !!window.ytInitialPlayerResponse.videoDetails,
    parsed: 'adPlacements' in parsed.playerResponse,
    fetched: 'adPlacements' in fetched || 'playerAds' in fetched || 'adSlots' in fetched, fetchedKept: !!fetched.videoDetails,
    skipped: !!window.__skipped,
    promoHidden: getComputedStyle(document.getElementById('promo')).display === 'none',
    okShown: getComputedStyle(document.getElementById('ok')).display !== 'none',
  };
});
check('YouTube: anuncios quitados de ytInitialPlayerResponse (y el vídeo se conserva)', !ytr.initial && ytr.initialKept);
check('YouTube: anuncios quitados de JSON.parse', !ytr.parsed);
check('YouTube: anuncios quitados de fetch().json() del reproductor', !ytr.fetched && ytr.fetchedKept);
check('YouTube: si sale un anuncio se pulsa "Saltar"', ytr.skipped);
check('YouTube: promociones del feed ocultas sin tocar el resto', ytr.promoHidden && ytr.okShown);

// Marcos (iframes): el mando no debe quedar "atrapado" dentro y el cursor debe seguir funcionando
const frm = await ctx.newPage();
frm.on('dialog', (d) => d.dismiss());
await frm.setViewportSize({ width: 800, height: 600 });
await frm.route(base + '/frames', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0">
  <iframe id="same" style="position:absolute;left:300px;top:250px;width:200px;height:100px;border:0"
    srcdoc="<body style='margin:0'><button id='b' style='width:200px;height:100px' onclick='parent.__inner=1'>dentro</button></body>"></iframe>
  <iframe id="embed" src="https://player.example-embed.com/v/1" style="position:absolute;left:0;top:0;width:280px;height:200px;border:0"></iframe>
  </body>` }));
await frm.route('https://player.example-embed.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<body>reproductor</body>' }));
await frm.addInitScript(SCRIPT);
await frm.goto(base + '/frames');
await frm.waitForTimeout(300);
await frm.keyboard.press('Enter'); // el cursor empieza en (400,300): encima del iframe de la misma web
await frm.waitForTimeout(100);
const f1 = await frm.evaluate(() => ({ inner: !!window.__inner, active: document.activeElement && document.activeElement.tagName }));
check('marco de la misma web: OK pulsa el botón de dentro', f1.inner);
check('marco: el foco del mando no se queda dentro del iframe', f1.active !== 'IFRAME');
// una web que mete el foco en un marco: se recupera y las flechas siguen moviendo el cursor
await frm.evaluate(() => document.getElementById('same').focus());
await frm.waitForTimeout(1200);
const f2 = await frm.evaluate(() => document.activeElement && document.activeElement.tagName);
check('marco: si una web le da el foco a un iframe, se recupera', f2 !== 'IFRAME');
// reproductor incrustado de otra web: OK lo abre en el navegador (desde fuera no se puede pulsar dentro)
for (let i = 0; i < 6; i++) { await frm.keyboard.down('ArrowLeft'); await frm.waitForTimeout(200); }
await frm.keyboard.up('ArrowLeft');
for (let i = 0; i < 5; i++) { await frm.keyboard.down('ArrowUp'); await frm.waitForTimeout(200); }
await frm.keyboard.up('ArrowUp');
await frm.keyboard.press('Enter');
await frm.waitForTimeout(500);
check('reproductor incrustado de otra web: OK lo abre', frm.url().startsWith('https://player.example-embed.com/'));

// Pantalla completa propia (botón "Vídeo"): amplía el reproductor, oculta el cursor y Atrás (exitVideo) lo restaura
const pf = await ctx.newPage();
const pfMsgs = [];
await pf.exposeFunction('__rnPost3', (m) => pfMsgs.push(JSON.parse(m)));
await pf.addInitScript(`window.ReactNativeWebView = { postMessage: function(m){ window.__rnPost3(m); } };`);
await pf.setViewportSize({ width: 800, height: 600 });
await pf.route(base + '/pfs', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0">
  <div class="video-js" id="box" style="width:320px;height:180px;margin:50px"><video id="v" style="width:320px;height:180px"></video></div></body>` }));
await pf.addInitScript(SCRIPT);
await pf.goto(base + '/pfs');
await pf.evaluate(() => window.__lb.video());
await pf.waitForTimeout(100);
const pf1 = await pf.evaluate(() => { const r = document.getElementById('box').getBoundingClientRect(); return { w: r.width, h: r.height }; });
const lastCur1 = pfMsgs.filter((m) => m.type === 'cur').pop();
await pf.evaluate(() => window.__lb.exitVideo());
await pf.waitForTimeout(100);
const pf2 = await pf.evaluate(() => { const b = document.getElementById('box'); const r = b.getBoundingClientRect(); return { w: r.width, style: b.getAttribute('style') }; });
check('pantalla completa propia: el reproductor ocupa toda la pantalla', pf1.w === 800 && pf1.h === 600);
check('pantalla completa propia: avisa a la app y oculta el cursor', pfMsgs.some((m) => m.type === 'fullscreen' && m.data === true) && lastCur1 && lastCur1.data[2] === 0);
check('pantalla completa propia: al salir se restaura el reproductor', pf2.w === 320 && pf2.style === 'width:320px;height:180px;margin:50px' && pfMsgs.some((m) => m.type === 'fullscreen' && m.data === false));

// Como la extensión: SDK de anuncios sustituido, motor dentro de los marcos propios, Video.js sin esperas y precarga
const sb = await ctx.newPage();
await sb.setViewportSize({ width: 800, height: 600 });
await sb.route(base + '/stubs', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><head>
  <script>window.googletag = { cmd: [] }; googletag.cmd.push(function(){ window.__gpt = 1; });</script>
  <script src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>
  <script src="https://imasdk.googleapis.com/js/sdkloader/ima3.js"></script>
  <script>window.__imaReady = !!(window.google && google.ima);</script></head><body style="margin:0">
  <div class="video-js vjs-ad-loading" style="width:640px;height:360px"><video id="v" preload="none" style="width:640px;height:360px"></video></div>
  <iframe id="fr" srcdoc="<script>window.r = window.open('https://popads.net/x'); parent.__frOpen = r && r.closed === true;</script>"></iframe>
  <script>
    window.__ad = null;
    if (window.google && google.ima) { var l = new google.ima.AdsLoader(new google.ima.AdDisplayContainer());
      l.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, function(e){ window.__ad = e.getError().getErrorCode(); });
      l.requestAds(new google.ima.AdsRequest()); }
    var s = document.createElement('script'); s.onload = function(){ window.__dyn = 'load'; }; s.onerror = function(){ window.__dyn = 'error'; };
    s.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'; document.body.appendChild(s);
    window.__trig = []; var box = document.querySelector('.video-js');
    window.videojs = { getPlayers: function(){ return { a: { hasClass: function(c){ return box.classList.contains(c); }, trigger: function(t){ window.__trig.push(t); box.classList.remove('vjs-ad-loading'); }, preload: function(x){ if (x) window.__pre = x; return 'none'; } } }; } };
  </script></body>` }));
await sb.addInitScript(SCRIPT);
await sb.goto(base + '/stubs');
await sb.waitForTimeout(900);
const sr = await sb.evaluate(() => { const w = document.getElementById('fr').contentWindow; return { ima: window.__imaReady, ad: window.__ad, dyn: window.__dyn, gpt: window.__gpt, trig: window.__trig, pre: document.getElementById('v').preload, vpre: window.__pre, frame: !!w.__lb, cur: !!w.document.getElementById('__lb_cursor'), open: w.open('https://popads.net/y').closed }; });
check('SDK de IMA sustituido: existe y contesta "sin anuncios" al momento', sr.ima === true && sr.ad === 1009);
check('SDK de IMA pedido por código: se da por cargado (no se espera)', sr.dyn === 'load');
check('GPT sustituido: la cola googletag.cmd se ejecuta', sr.gpt === 1);
check('Video.js esperando anuncio: se cancela la espera', sr.trig.join() === 'adscanceled');
check('precarga del vídeo principal', sr.pre === 'auto' && sr.vpre === 'auto');
check('marco propio: el motor actúa dentro y sin cursor duplicado', sr.frame && sr.open === true && !sr.cur);

// Saltador universal: un reproductor cualquiera con anuncio de Google IMA encima del contenido
const ima = await ctx.newPage();
ima.on('dialog', (d) => d.dismiss());
await ima.route(base + '/ima', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body>
  <div id="player" style="position:relative;width:640px;height:360px">
    <video id="content" style="width:640px;height:360px"></video>
    <div class="ima-ad-container" style="position:absolute;inset:0"><video id="adv" style="width:640px;height:360px"></video>
      <button class="videoAdUiSkipButton" onclick="window.__imaSkip=1">Skip Ad</button></div>
  </div>
  <button id="intro" class="skip-intro" aria-label="Skip intro" onclick="window.__intro=1">Saltar intro</button>
  <script>
    window.__vast = null;
    fetch('https://cdn.example-player.com/ads/vast.xml?cb=1').then(function(){ window.__vast = 'ok'; }, function(){ window.__vast = 'blocked'; });
  </script></body>` }));
// el dominio del VAST responde de verdad: si llega 'blocked' es porque lo frenó el script, no la red
await ima.route('https://cdn.example-player.com/**', (route) => route.fulfill({ contentType: 'text/xml', body: '<VAST/>' }));
await ima.addInitScript(SCRIPT);
await ima.goto(base + '/ima');
await ima.waitForTimeout(700);
const im = await ima.evaluate(() => {
  const a = document.getElementById('adv'), c = document.getElementById('content');
  return { skip: !!window.__imaSkip, adMuted: a.muted, adRate: a.playbackRate, contentMuted: c.muted, intro: !!window.__intro, vast: window.__vast };
});
check('universal: anuncio IMA encima del vídeo → "Skip Ad" pulsado, anuncio silenciado y acelerado', im.skip && im.adMuted && im.adRate === 16);
check('universal: el vídeo del contenido no se toca', !im.contentMuted);
check('universal: "Saltar intro" (no es anuncio) no se pulsa', !im.intro);
check('universal: petición VAST de cualquier dominio bloqueada', im.vast === 'blocked');

// Reproductor esperando un anuncio que hemos bloqueado: el CONTENIDO no se puede adelantar ni silenciar
const wt = await ctx.newPage();
wt.on('dialog', (d) => d.dismiss());
await wt.route(base + '/wait', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body>
  <div class="video-js vjs-ad-loading" style="position:relative;width:640px;height:360px"><video id="film" style="width:640px;height:360px"></video>
    <div id="playlayer" style="position:absolute;inset:0;z-index:200" onclick="window.__playClick=1"></div></div>
  <div class="video-js vjs-ad-playing"><video id="longc" style="width:320px;height:180px"></video></div>
  <div class="video-js vjs-ad-playing"><video id="shortad" style="width:320px;height:180px"></video></div>
  <script>
    function fake(id, dur){ var v = document.getElementById(id), t = 5;
      Object.defineProperty(v, 'duration', { get: function(){ return dur; } });
      Object.defineProperty(v, 'currentTime', { get: function(){ return t; }, set: function(x){ t = x; } }); }
    fake('film', 5400); fake('longc', 2700); fake('shortad', 15);
    window.__sdk = null; var s0 = Date.now();
    var sdk = document.createElement('script'); sdk.onload = sdk.onerror = function(){ window.__sdk = Date.now() - s0; };
    sdk.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'; document.head.appendChild(sdk);
    window.__xhr = null; var t0 = Date.now();
    var x = new XMLHttpRequest(); x.open('GET', 'https://imasdk.googleapis.com/js/sdkloader/ima3.js');
    x.onerror = function(){ window.__xhr = { state: x.readyState, ms: Date.now() - t0 }; }; x.send();
  </script></body>` }));
await wt.setViewportSize({ width: 800, height: 600 });
await wt.addInitScript(SCRIPT);
await wt.goto(base + '/wait');
await wt.waitForTimeout(800);
await wt.mouse.click(300, 150);
const w = await wt.evaluate(() => { const g = (id) => document.getElementById(id);
  return { film: g('film').currentTime, filmMuted: g('film').muted, filmRate: g('film').playbackRate,
    longc: g('longc').currentTime, ad: g('shortad').currentTime, adMuted: g('shortad').muted,
    play: !!window.__playClick, layer: !!g('playlayer'), xhr: window.__xhr, sdk: window.__sdk }; });
check('esperando anuncio (vjs-ad-loading): la película no se adelanta ni se silencia', w.film === 5 && !w.filmMuted && w.filmRate === 1);
check('estado "anuncio" con un vídeo largo: no se toca (es contenido)', w.longc === 5);
check('estado "anuncio" con un vídeo corto: se salta', w.ad > 14 && w.adMuted);
check('la capa de play del reproductor recibe el clic (no es una trampa)', w.play && w.layer);
check('<script> del SDK de anuncios bloqueado responde al momento', w.sdk !== null && w.sdk < 200);
check('XHR bloqueado falla enseguida con error (el reproductor no se queda esperando)', !!w.xhr && w.xhr.state === 4 && w.xhr.ms < 200);

// Webs con Trusted Types (como YouTube): innerHTML lanza excepción; el cursor debe funcionar igual
const tt = await ctx.newPage();
await tt.setViewportSize({ width: 800, height: 600 });
await tt.route(base + '/tt', (route) => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "require-trusted-types-for 'script'" },
  body: `<!doctype html><body style="margin:0"><div style="height:2000px"></div></body>` }));
await tt.addInitScript(SCRIPT);
await tt.goto(base + '/tt');
await tt.keyboard.down('ArrowRight'); await tt.waitForTimeout(150); await tt.keyboard.up('ArrowRight');
const ttc = await tt.evaluate(() => { const c = document.getElementById('__lb_cursor'); return c ? c.getBoundingClientRect().x + 4 : -1; });
check('cursor funciona en webs con Trusted Types (YouTube)', ttc > 405);

// Ir a la barra de dirección desde la página: ⏪ en cualquier momento, o ↑ con el cursor arriba del todo
await nv.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaRewind', bubbles: true })));
await nv.waitForTimeout(50);
const fb1 = navMsgs.filter((m) => m.type === 'focusbar').length;
for (let i = 0; i < 6; i++) { await nv.keyboard.down('ArrowUp'); await nv.waitForTimeout(200); }
await nv.keyboard.up('ArrowUp');
await nv.keyboard.press('ArrowUp');
await nv.waitForTimeout(50);
const fb2 = navMsgs.filter((m) => m.type === 'focusbar').length;
check('barra: el botón ⏪ lleva a la barra de dirección', fb1 === 1);
check('barra: ↑ con el cursor arriba del todo lleva a la barra (lo hace la app, no el WebView)', fb2 >= 2);

// Tras 2,5 s sin teclas el cursor se oculta (nada dibujado encima del vídeo) y vuelve con una flecha
await nv.waitForTimeout(2700);
const slept = navMsgs.filter((m) => m.type === 'cur').pop();
await nv.keyboard.press('ArrowLeft'); await nv.waitForTimeout(100);
const woke = navMsgs.filter((m) => m.type === 'cur').pop();
check('cursor: se oculta solo tras 2,5 s sin usar el mando', !!slept && slept.data[2] === 0);
check('cursor: reaparece al pulsar una flecha', !!woke && woke.data[2] === 1);

// Webs que rompen position:fixed (transform en <html>/<body>, como html.duckduckgo.com): el cursor debe seguir en pantalla
const fx = await ctx.newPage();
await fx.setViewportSize({ width: 800, height: 600 });
await fx.route(base + '/fixed', (route) => route.fulfill({ contentType: 'text/html', body:
  `<!doctype html><html style="transform:translateZ(0)"><body style="margin:0;transform:translateZ(0);filter:contrast(1)">
   <div style="height:5000px"></div></body></html>` }));
await fx.addInitScript(SCRIPT);
await fx.goto(base + '/fixed');
await fx.evaluate(() => window.scrollTo(0, 2000));
await fx.waitForTimeout(100);
await fx.keyboard.down('ArrowRight'); await fx.waitForTimeout(150); await fx.keyboard.up('ArrowRight');
await fx.waitForTimeout(50);
const fr = await fx.evaluate(() => { const r = document.getElementById('__lb_cursor').getBoundingClientRect(); return { x: r.x + 4, y: r.y + 4 }; });
check('cursor visible aunque la web rompa position:fixed (página desplazada)', fr.y > 250 && fr.y < 350 && fr.x > 400 && fr.x < 480);

// Camino de respaldo: inyección tardía (onLoadEnd -> injectJavaScript)
const late = await ctx.newPage();
late.on('dialog', (d) => d.dismiss());
await late.goto(base + '/');
await late.evaluate(SCRIPT);
const l = await late.evaluate(() => {
  const w = window.open('https://example.org');
  const a = document.createElement('a'); a.href = '/x'; a.target = '_blank'; document.body.appendChild(a);
  const i = document.createElement('iframe'); i.src = 'https://adnxs.com/x'; document.body.appendChild(i);
  return new Promise((res) => setTimeout(() => res({
    fake: w && w.closed === true, target: a.getAttribute('target'), iframeSrc: i.getAttribute('src'),
    css: !!document.getElementById('__lb_css'),
  }), 120));
});
check('inyección tardía: window.open bloqueado', l.fake);
check('inyección tardía: _blank nuevo convertido', l.target === '_self');
check('inyección tardía: src de anuncio ignorado', !l.iframeSrc);
check('inyección tardía: CSS de limpieza aplicado', l.css);

await browser.close();
server.close();
console.log(fails ? `\n${fails} fallo(s)` : '\nTodo OK');
process.exit(fails ? 1 : 0);
