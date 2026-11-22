export const SEARCH_URL = 'https://duckduckgo.com/html/?q=';

/**
 * Convierte lo que escribe el usuario en una URL navegable:
 *  - "ejemplo.com" -> "https://ejemplo.com"
 *  - "http://..." / "https://..." se respetan
 *  - "localhost:8080" o una IP -> http://
 *  - cualquier otra cosa -> búsqueda (DuckDuckGo HTML, muy ligera)
 */
export function normalizeInput(raw: string): string {
  const input = raw.trim();
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  if (/^about:blank$/i.test(input)) return input;

  const hasSpace = /\s/.test(input);
  const isLocal = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(input);
  if (!hasSpace && isLocal) return `http://${input}`;

  const looksLikeDomain = /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(input);
  if (!hasSpace && looksLikeDomain) return `https://${input}`;

  return SEARCH_URL + encodeURIComponent(input);
}

/** Texto corto para mostrar en la barra (sin esquema ni "www."). */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}
