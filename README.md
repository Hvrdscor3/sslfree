# Navegador Ligero para Fire TV (Vega OS)

Un navegador mínimo para Firestick con Vega OS, pensado para ir rápido en el dispositivo:

- **Sin pop-ups**: `window.open`, enlaces `target="_blank"`, `alert/confirm/prompt` y los avisos de "¿seguro que quieres salir?" quedan anulados. Todo se abre en una única ventana.
- **Sin anuncios**: bloquea navegación y peticiones (`fetch`, XHR, `sendBeacon`, `<script>`, `<iframe>`, `<img>`) a unos 150 dominios de anuncios, pop-unders y rastreadores. Además oculta los contenedores de anuncios habituales y elimina las capas transparentes que "roban" el primer clic.
- **Vídeo**: reproducción automática permitida, controles multimedia del sistema activados y botón **▣ Vídeo** que pone a pantalla completa el vídeo principal. En pantalla completa: OK = play/pausa, ←/→ = ±10 s, ↑/↓ = volumen.
- **Rendimiento**: un único WebView, sin pestañas, cookies de terceros desactivadas, agente de usuario móvil por defecto (las webs envían páginas más ligeras; botón **Móvil/PC** para cambiar), y un script de bloqueo pequeño que procesa los cambios del DOM por lotes.

## Uso con el mando

| Tecla | Acción |
| --- | --- |
| ↑ desde la página | Ir a la barra (atrás, adelante, recargar, inicio, dirección, vídeo, modo PC, ocultar barra) |
| OK en la dirección | Escribir una URL o una búsqueda (DuckDuckGo) |
| Atrás | Muestra la barra si está oculta → página anterior → portada → salir |
| ⛶ | Oculta la barra para usar toda la pantalla |

## Estructura

```
index.js                 registro de la app
manifest.toml            manifiesto de Vega OS
src/App.tsx              pantalla principal y WebView
src/components/          barra de herramientas y portada con favoritos
src/core/adblock.ts      lista de dominios y comprobación de URLs
src/core/injected.ts     script que se inyecta en cada página (pop-ups, anuncios, vídeo)
src/core/url.ts          convierte el texto escrito en URL o búsqueda
tests/                   pruebas
```

## Compilar e instalar en el Firestick

Necesitas el **Vega SDK** instalado en tu ordenador (Amazon Developer → Vega OS → Install the SDK) y un Fire TV con Vega OS en modo desarrollador.

1. Genera un proyecto base con la herramienta del SDK para que tenga la configuración exacta de tu versión (Metro, Babel, etc.):
   ```bash
   vega project generate   # elige la plantilla "hello world", nombre: NavegadorLigero
   ```
2. Copia en ese proyecto `src/`, `index.js` y `app.json` de este repositorio, y añade la dependencia del WebView:
   ```bash
   npm install @amazon-devices/webview@~4.0.5
   ```
3. En el `manifest.toml` generado, mantén los valores de `[components]` que creó la plantilla (en especial `runtime-module`) y cambia `title`, `id` y el `id` del componente por los de este repositorio si quieres. El `id` del componente debe coincidir con `name` en `app.json`.
4. Compila e instala:
   ```bash
   npm run build:debug
   vega device list                      # comprueba que el Firestick aparece
   vega run-app <ruta al .vpkg> com.sslfree.browser.main
   ```
   Los nombres exactos de los comandos pueden variar entre versiones del SDK; usa `vega --help` si alguno no existe.

## Pruebas

```bash
npm test               # lógica de URLs y lista de bloqueo (Node 22+)
npm run test:browser   # prueba el script de bloqueo en Chromium real (necesita Playwright)
```

## Limitaciones

- El WebView de Vega no expone un filtro de peticiones a nivel de red; el bloqueo de recursos se hace con el script inyectado, así que un `<script>` de anuncios escrito directamente en el HTML puede descargarse antes de que el script lo elimine. Los pop-ups, las redirecciones a dominios de anuncios y las peticiones dinámicas sí se bloquean siempre.
- Las webs que detectan bloqueadores pueden negarse a mostrar contenido.
- La lista de dominios está en `src/core/adblock.ts`; añade los que veas en tus webs.
