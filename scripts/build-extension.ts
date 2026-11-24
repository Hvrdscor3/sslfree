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
import { AD_HOSTS, hostsForInjection } from '../src/core/adblock.ts';
import { buildInjectedScript } from '../src/core/injected.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const hosts = [...new Set(AD_HOSTS.map((h) => h.toLowerCase()))].sort();
const header = '/* Generado por scripts/build-extension.ts: no editar a mano. */\n';

const rules = [{
  id: 1,
  priority: 1,
  action: { type: 'block' },
  condition: {
    requestDomains: hosts, // incluye los subdominios
    resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'xmlhttprequest', 'media', 'ping',
      'stylesheet', 'font', 'object', 'websocket', 'webtransport', 'other'],
  },
}];

writeFileSync(join(out, 'rules.json'), JSON.stringify(rules, null, 2) + '\n');
writeFileSync(join(out, 'hosts.js'), header + `export const AD_HOSTS = ${JSON.stringify(hosts)};\n`);
writeFileSync(join(out, 'inject.js'), header + buildInjectedScript(hostsForInjection()) + '\n');
console.log(`extension/: ${hosts.length} dominios, rules.json, hosts.js, inject.js`);
