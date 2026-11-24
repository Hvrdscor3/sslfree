/**
 * Genera los ficheros de la extensión de Chrome a partir del mismo código del navegador:
 *  - extension/rules.json  reglas declarativeNetRequest con la lista de dominios de anuncios
 *  - extension/hosts.js    la lista para el service worker (cierra pestañas pop-under)
 *  - extension/inject.js   el script de bloqueo de pop-ups y anuncios (mundo MAIN de la página)
 * Uso: npm run build:extension
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AD_HOSTS, AD_PATH_RE, hostsForInjection } from '../src/core/adblock.ts';
import { buildInjectedScript } from '../src/core/injected.ts';

/** Parte una regex por sus '|' de primer nivel (fuera de paréntesis y corchetes). */
function splitAlternatives(src: string): string[] {
  const parts: string[] = [];
  let depth = 0, inClass = false, start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') inClass = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '|' && depth === 0) { parts.push(src.slice(start, i)); start = i + 1; }
  }
  parts.push(src.slice(start));
  return parts;
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const hosts = [...new Set(AD_HOSTS.map((h) => h.toLowerCase()))].sort();
const header = '/* Generado por scripts/build-extension.ts: no editar a mano. */\n';

const SUB = ['sub_frame', 'script', 'image', 'xmlhttprequest', 'media', 'ping',
  'stylesheet', 'font', 'object', 'websocket', 'webtransport', 'other'];
const rules = [{
  id: 1,
  priority: 1,
  action: { type: 'block' },
  condition: {
    requestDomains: hosts, // incluye los subdominios
    resourceTypes: ['main_frame', ...SUB],
  },
}, ...splitAlternatives(AD_PATH_RE.source).map((regexFilter, i) => ({
  // anuncios de vídeo por la forma de la URL (VAST/VMAP, Ad Manager...) en cualquier dominio.
  // Una regla por alternativa: Chrome descarta regexFilter que compilan a más de 2 KB.
  id: 2 + i,
  priority: 1,
  action: { type: 'block' },
  condition: { regexFilter, isUrlFilterCaseSensitive: false, resourceTypes: SUB },
}))];

writeFileSync(join(out, 'rules.json'), JSON.stringify(rules, null, 2) + '\n');
writeFileSync(join(out, 'hosts.js'), header + `export const AD_HOSTS = ${JSON.stringify(hosts)};\n`);
writeFileSync(join(out, 'inject.js'), header + buildInjectedScript(hostsForInjection(), AD_PATH_RE.source, false) + '\n');
console.log(`extension/: ${hosts.length} dominios, rules.json, hosts.js, inject.js`);
