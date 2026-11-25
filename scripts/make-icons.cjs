/**
 * Genera los PNG de la interfaz y el icono de la app a partir de SVG (dibujados a mano).
 * Uso: NODE_PATH=$(npm root -g) node scripts/make-icons.cjs   (necesita Playwright)
 */
const { chromium } = require('playwright');
const path = require('path');
const root = path.join(__dirname, '..');

const S = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const UI = {
  back: S('<path d="M15 5l-7 7 7 7"/>'),
  forward: S('<path d="M9 5l7 7-7 7"/>'),
  reload: S('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>'),
  stop: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  home: S('<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h4.5v-5h3v5H18V9.5"/>'),
  video: S('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="#fff"/>'),
  desktop: S('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  mobile: S('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>'),
  hide: S('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>'),
  shield: S('<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  lock: S('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  globe: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>'),
};

// Marca: escudo con botón de play (navegador para vídeo sin anuncios)
const MARK = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
<path d="M50 6 L86 20 V48 C86 72 70 88 50 95 C30 88 14 72 14 48 V20 Z" fill="url(#g)"/>
<path d="M41 33 V67 L69 50 Z" fill="#fff"/>`;
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${MARK}</svg>`;
const BG = `<defs><radialGradient id="bg" cx="0.3" cy="0.2" r="1.1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#0b0d12"/></radialGradient></defs>`;
const APP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}<rect width="512" height="512" fill="url(#bg)"/>
<g transform="translate(86 80) scale(3.4)">${MARK}</g></svg>`;
const BANNER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">${BG}<rect width="1280" height="720" fill="url(#bg)"/>
<g transform="translate(150 200) scale(3.2)">${MARK}</g>
<text x="520" y="350" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="96" font-weight="700" fill="#fff">Navegador</text>
<text x="520" y="460" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="96" font-weight="700" fill="#60a5fa">Ligero</text>
<text x="524" y="530" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="34" fill="#94a3b8">Sin anuncios · Sin pop-ups · Vídeo rápido</text></svg>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  async function render(svg, w, h, file, transparent) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml,${encodeURIComponent(svg)}" width="${w}" height="${h}">`);
    await p.screenshot({ path: path.join(root, file), omitBackground: transparent });
  }
  for (const [n, svg] of Object.entries(UI)) await render(svg, 64, 64, `src/assets/icons/${n}.png`, true);
  await render(LOGO, 192, 192, 'src/assets/logo.png', true);
  await render(APP_ICON, 512, 512, 'assets/image/app_icon.png', false);
  await render(BANNER, 1280, 720, 'assets/image/app_banner.png', false);
  await b.close();
  console.log('iconos generados');
})();
