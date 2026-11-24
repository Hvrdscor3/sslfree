/**
 * Carga la extensión en Chromium y comprueba el bloqueo real.
 * Los dominios de anuncios se redirigen al servidor local (--host-resolver-rules),
 * así que sin la extensión todas las peticiones llegarían.
 * Uso: npm run build:extension && npm run test:extension   (necesita Playwright)
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const ext = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const hits = [];
const PAGE = `<!doctype html><html><head><title>t</title>
<script src="http://doubleclick.net:PORT/ad.js"></script></head><body>
<p id="ok">contenido</p>
<div class="adsbygoogle" id="adbox">anuncio</div>
<img id="pix" src="http://ads.criteo.com:PORT/pixel.gif">
<a id="blank" href="/other" target="_blank">enlace</a>
<button id="pop" onclick="window.__w = window.open('http://popads.net:PORT/pop')">pop</button>
<script>
  window.__fetch = fetch('http://taboola.com:PORT/data').then(()=> 'ok', ()=> 'blocked');
  window.__alert = (alert('x'), 'done');
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  hits.push(req.headers.host.split(':')[0] + req.url);
  res.setHeader('content-type', req.url.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(req.url === '/' ? PAGE.replaceAll('PORT', port) : req.url.endsWith('.js') ? 'window.__adRan = 1' : 'x');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ext-')), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`,
    '--host-resolver-rules=MAP * 127.0.0.1'],
});
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
// espera a que onInstalled registre los scripts de contenido
for (let i = 0; i < 50; i++) {
  const n = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts().then((s) => s.length));
  if (n === 2) break;
  await new Promise((r) => setTimeout(r, 100));
}

let fails = 0;
const check = (name, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + name); if (!cond) fails++; };

await sw.evaluate(() => { globalThis.__deltas = 0;
  chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'blocked') globalThis.__deltas += m.delta; }); });
const page = await ctx.newPage();
await page.goto(`http://site.test:${port}/`);
await page.waitForTimeout(500);

check('script de anuncio no se ejecuta', !(await page.evaluate(() => window.__adRan)));
check('ninguna petición llega a dominios de anuncios',
  !hits.some((h) => /doubleclick|criteo|taboola|popads/.test(h)));
check('fetch a anuncio bloqueado', (await page.evaluate(() => window.__fetch)) === 'blocked');
check('alert silenciado', (await page.evaluate(() => window.__alert)) === 'done');
check('contenedor de anuncio oculto',
  (await page.evaluate(() => getComputedStyle(document.getElementById('adbox')).display)) === 'none');
check('contenido normal visible', await page.isVisible('#ok'));
check('target=_blank pasa a _self',
  (await page.evaluate(() => document.getElementById('blank').target)) === '_self');

const pagesBefore = ctx.pages().length;
await page.click('#pop');
await page.waitForTimeout(500);
check('window.open no abre pestaña', ctx.pages().length === pagesBefore);
check('window.open devuelve ventana cerrada', await page.evaluate(() => window.__w && window.__w.closed));

// Pop-under que esquiva el script (enlace nativo con target _blank creado tarde): la pestaña se cierra
await page.evaluate((p) => {
  const a = document.createElement('a'); a.href = `http://popads.net:${p}/under`; a.target = '_blank'; a.id = 'late';
  document.body.appendChild(a);
}, port);
await page.evaluate(() => HTMLElement.prototype.click.call(document.getElementById('late'))).catch(() => {});
await page.waitForTimeout(800);
check('pestaña pop-under cerrada o no abierta', ctx.pages().length === pagesBefore);

// Contador del icono: el script de la página informa de lo que bloquea
await page.waitForTimeout(1800);
const deltas = await sw.evaluate(() => globalThis.__deltas);
check(`el script suma bloqueos al contador del icono (${deltas})`, deltas > 0);

// Desactivar en el sitio desde el popup: todo vuelve a cargar
const page2 = await ctx.newPage();
// usa el flujo real del popup
const popup = await ctx.newPage();
const id = sw.url().split('/')[2];
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'setSite', site: 'site.test', enabled: false }));
await popup.waitForTimeout(300);
check('popup informa sitio desactivado',
  (await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'getSite', site: 'site.test' }))).enabled === false);
await page2.goto(`http://site.test:${port}/`);
await page2.waitForTimeout(500);
check('sitio desactivado: el anuncio se carga', await page2.evaluate(() => window.__adRan === 1));
check('sitio desactivado: sin script inyectado', await page2.evaluate(() => !window.__lb));

await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'setSite', site: 'site.test', enabled: true }));
await popup.waitForTimeout(300);
await page2.reload(); await page2.waitForTimeout(500);
check('reactivado: anuncio bloqueado otra vez', await page2.evaluate(() => !window.__adRan && !!window.__lb));

await ctx.close(); server.close();
console.log(fails ? `\n${fails} fallos` : '\nTodo OK');
process.exit(fails ? 1 : 0);
