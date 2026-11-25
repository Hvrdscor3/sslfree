# Navegador Ligero para Fire TV (Vega OS)

Un navegador mínimo para Firestick con Vega OS, pensado para ir rápido en el dispositivo:

- **Sin pop-ups**: `window.open`, enlaces `target="_blank"`, `alert/confirm/prompt` y los avisos de "¿seguro que quieres salir?" quedan anulados. Todo se abre en una única ventana.
- **Sin anuncios**: bloquea navegación y peticiones (`fetch`, XHR, `sendBeacon`, `<script>`, `<iframe>`, `<img>`) a unos 150 dominios de anuncios, pop-unders y rastreadores. Además oculta los contenedores de anuncios habituales y elimina las capas transparentes que "roban" el primer clic.
- **Vídeo**: reproducción automática permitida, controles multimedia del sistema activados y botón **▣ Vídeo** que pone a pantalla completa el vídeo principal. En pantalla completa: OK = play/pausa, ←/→ = ±10 s, ↑/↓ = volumen.
- **Rendimiento**: un único WebView, sin pestañas, cookies de terceros desactivadas, agente de usuario móvil por defecto (las webs envían páginas más ligeras; botón **Móvil/PC** para cambiar), y un script de bloqueo pequeño que procesa los cambios del DOM por lotes.

## Interfaz e icono

- Portada con buscador grande, favoritos con su color, reloj, atajos del mando y lo bloqueado en la sesión.
- Barra con iconos dibujados (no dependen de las fuentes de la TV), dirección con el dominio resaltado y candado en HTTPS, contador de bloqueos y barra de carga animada.
- Icono de la app: `assets/image/app_icon.png` (512×512), declarado en `manifest.toml` con `icon = "@image/app_icon.png"`. También hay un banner de 1280×720 (`assets/image/app_banner.png`), el tamaño que pide la tienda de Fire TV.
- Los iconos se regeneran con `NODE_PATH=$(npm root -g) node scripts/make-icons.cjs`.

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
extension/               extensión de Chrome con el mismo motor
scripts/                 genera los ficheros de la extensión
tests/                   pruebas
```

## Compilar e instalar en el Firestick

Necesitas el **Vega SDK** instalado en tu ordenador (Amazon Developer → Vega OS → Install the SDK) y un Fire TV con Vega OS en modo desarrollador.

El repositorio ya trae la configuración generada por el SDK 2.0.15159 (plantilla `vegaWebview`): `manifest.toml` con los servicios del WebView, `babel.config.js`, `metro.config.js` y `package-lock.json`. Compilado y probado con Node 22.

En Windows el SDK funciona dentro de WSL2 (Ubuntu 22.04, con la virtualización SVM/VT-x activada en la BIOS). El instalador no admite root, así que usa un usuario normal. Si `vega devmode login` falla al guardar el token (`/run/user/1000/bus`), instala `gnome-keyring dbus-x11` y ejecútalo dentro de `dbus-run-session`.

```bash
npm install
npm run build:debug                    # genera build/armv7-debug/navegador-ligero_armv7.vpkg (Fire TV Stick)
vega devmode login                     # una vez, con tu cuenta de Amazon Developer
vega devmode enable-device --code <código que muestra la tele>
vega device list                       # comprueba que el Firestick aparece
vega device install-app --packagePath build/armv7-debug/navegador-ligero_armv7.vpkg
vega device launch-app --appName com.sslfree.browser.main
```

## Extensión para Chrome (Ad Block Ligero)

La carpeta `extension/` es una extensión de Chrome (Manifest V3) con el mismo motor que el navegador:

- **Red**: los mismos dominios de `src/core/adblock.ts` se bloquean con `declarativeNetRequest`, así que el navegador corta las peticiones antes de que salgan, también las del HTML inicial.
- **Página**: el mismo script de `src/core/injected.ts` se ejecuta en cada página y marco al empezar a cargar: anula `window.open`, `target="_blank"`, `alert/confirm/prompt` y los avisos al salir, oculta contenedores de anuncios y quita las capas transparentes que roban clics.
- **Pop-unders**: si una página consigue abrir una pestaña hacia un dominio de anuncios, se cierra al instante.
- **Icono**: muestra cuántas cosas se han bloqueado en la pestaña. Al pulsarlo puedes desactivar el bloqueo en el sitio actual o poner el vídeo principal a pantalla completa.

Instalar:

1. Abre `chrome://extensions` y activa **Modo de desarrollador** (arriba a la derecha).
2. Pulsa **Cargar descomprimida** y elige la carpeta `extension/`.

Si cambias la lista de dominios o el script, regenera los ficheros con `npm run build:extension` y pulsa ↻ en la tarjeta de la extensión.

En escritorio el bloqueo de pop-ups es estricto: los inicios de sesión que abren ventana (por ejemplo "Acceder con Google") y los avisos de "cambios sin guardar" no funcionan. Desactiva la extensión en ese sitio desde su icono.

## Pruebas

```bash
npm test               # lógica de URLs y lista de bloqueo (Node 22+)
npm run test:browser   # prueba el script de bloqueo en Chromium real (necesita Playwright)
npm run test:extension # carga la extensión en Chromium y prueba el bloqueo completo
```

## Limitaciones

- El WebView de Vega no expone un filtro de peticiones a nivel de red; el bloqueo de recursos se hace con el script inyectado, así que un `<script>` de anuncios escrito directamente en el HTML puede descargarse antes de que el script lo elimine. Los pop-ups, las redirecciones a dominios de anuncios y las peticiones dinámicas sí se bloquean siempre.
- Las webs que detectan bloqueadores pueden negarse a mostrar contenido.
- La lista de dominios está en `src/core/adblock.ts`; añade los que veas en tus webs.
