// Prueba el script inyectado en Chromium real: pop-ups, scripts/iframes de anuncios,
// capas invisibles atrapa-clics, enlaces _blank y controles de vídeo con el mando.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const out = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
  `import { buildInjectedScript } from './src/core/injected.ts';
   import { hostsForInjection } from './src/core/adblock.ts';
   process.stdout.write(buildInjectedScript(hostsForInjection()));`], { encoding: 'utf8' });
if (out.status !== 0) { console.error(out.stderr); process.exit(1); }
const SCRIPT = out.stdout;

const page_html = `<!doctype html><html><head>
<script src="https://pagead2.googlesyndication.com/ad.js"></script></head><body>
<a id="ext" href="/other" target="_blank">enlace</a>
<ins class="adsbygoogle" style="display:block;width:300px;height:250px">ad</ins>
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
check('cursor: OK hace clic en el botón bajo el puntero', c1.clicked === 1);
check('cursor: OK sobre un input le da el foco', c2.focused === 'i');
check('cursor: en el borde inferior desplaza la página', c3.scrollY > 0);

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
