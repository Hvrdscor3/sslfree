import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, LayoutChangeEvent, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useTVEventHandler } from '@amazon-devices/react-native-kepler';
import { WebView } from '@amazon-devices/webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent, WebViewMethods } from '@amazon-devices/webview/dist/types/WebViewTypes';

import ErrorPage from './components/ErrorPage';
import Toolbar from './components/Toolbar';
import StartPage, { Recent } from './components/StartPage';
import { AD_PATH_RE, hostsForInjection, isBlockedUrl, isDisallowedScheme } from './core/adblock';
import { buildInjectedScript, FULLSCREEN_VIDEO_JS, RELOAD_JS } from './core/injected';
import { displayUrl, normalizeInput } from './core/url';
import { BAR_H, C } from './theme';

// Un móvil recibe páginas más ligeras (menos JS, vídeos adaptados): mejor rendimiento en el Firestick.
const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const CURSOR_IMG = require('./assets/cursor.png');
const TV_KEYS: Record<string, string> = {
  select: 'Enter', enter: 'Enter', playpause: 'MediaPlayPause', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  rewind: 'MediaRewind', skip_backward: 'MediaRewind', forward: 'MediaFastForward', skip_forward: 'MediaFastForward',
};
const EXIT_FULLSCREEN_JS =
  '(function(){var d=document;try{window.__lb&&window.__lb.exitVideo&&window.__lb.exitVideo()}catch(e){}' +
  'try{if(d.fullscreenElement||d.webkitFullscreenElement)(d.exitFullscreen||d.webkitExitFullscreen).call(d)}catch(e){}})(); true;';

// Se construye una sola vez: es la pieza que bloquea pop-ups y anuncios dentro de la página.
const INJECTED = buildInjectedScript(hostsForInjection(), AD_PATH_RE.source);


export default function App() {
  const web = useRef<WebViewMethods>(null);
  const [url, setUrl] = useState('');         // URL que se carga (cambia sólo al navegar desde la barra)
  const [current, setCurrent] = useState(''); // URL que se muestra (sigue a la página)
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(0);
  const [barVisible, setBarVisible] = useState(true);
  const [desktop, setDesktop] = useState(false);
  const [toast, setToast] = useState('');
  const pageBlocked = useRef(0);
  const pageFullscreen = useRef(false);
  const [focusBar, setFocusBar] = useState(0); // cada incremento lleva el foco del mando a la barra de dirección
  // Total de la sesión (para la portada): se suma lo nuevo de cada página
  const [sessionBlocked, setSessionBlocked] = useState(0);
  const lastStats = useRef(0);
  const [recents, setRecents] = useState<Recent[]>([]); // últimos sitios abiertos (de esta sesión)
  const [failed, setFailed] = useState('');             // dirección que no se pudo cargar
  const toastTimer = useRef<any>(null);

  // Barra de progreso: un tramo que recorre la pantalla mientras carga
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading) { prog.stopAnimation(); return; }
    prog.setValue(0);
    const anim = Animated.loop(Animated.timing(prog, { toValue: 1, duration: 1100, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [loading, prog]);

  // Cursor virtual dibujado por encima del WebView. La página manda su posición (px CSS) con post('cur');
  // se convierte a unidades de React Native con el ancho real del WebView. Animated.Value evita re-renders.
  const webSize = useRef({ w: 0, h: 0 });
  const cx = useRef(new Animated.Value(-100)).current;
  const cy = useRef(new Animated.Value(-100)).current;
  const cOpacity = useRef(new Animated.Value(0)).current;
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  const rw = useRef(new Animated.Value(0)).current;
  const rh = useRef(new Animated.Value(0)).current;
  const rOpacity = useRef(new Animated.Value(0)).current;
  // La página envía posiciones en proporción de su viewport (0..1); aquí se multiplican por el tamaño del WebView.
  const onCursor = useCallback((d: [number, number, number, 0 | [number, number, number, number]]) => {
    const [x, y, visible, ring] = d;
    const { w, h } = webSize.current;
    cx.setValue(x * w); cy.setValue(y * h); cOpacity.setValue(visible ? 1 : 0);
    if (visible && ring) {
      rx.setValue(ring[0] * w - 5); ry.setValue(ring[1] * h - 5); rw.setValue(ring[2] * w + 10); rh.setValue(ring[3] * h + 10);
      rOpacity.setValue(1);
    } else rOpacity.setValue(0);
  }, [cx, cy, cOpacity, rx, ry, rw, rh, rOpacity]);
  const flashClick = useCallback(() => {
    cOpacity.setValue(0.35);
    setTimeout(() => cOpacity.setValue(1), 120);
  }, [cOpacity]);
  const hideCursor = useCallback(() => { cOpacity.setValue(0); rOpacity.setValue(0); }, [cOpacity, rOpacity]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current); // un aviso nuevo no debe borrarse con el reloj del anterior
    toastTimer.current = setTimeout(() => setToast(''), msg.length > 40 ? 4500 : 2200);
  }, []);

  const open = useCallback((input: string) => {
    const next = normalizeInput(input);
    if (!next) return;
    if (isBlockedUrl(next)) { showToast('Dirección bloqueada (anuncios)'); return; }
    if (next === url) { web.current?.injectJavaScript(RELOAD_JS); return; }
    setFailed('');
    const host = displayUrl(next).split('/')[0];
    setRecents((r) => [{ url: next, host }, ...r.filter((x) => x.host !== host)].slice(0, 6));
    setUrl(next);
    setCurrent(next);
  }, [url, showToast]);

  const goHome = useCallback(() => {
    setFailed(''); setLoading(false); hideCursor(); setBlocked(0);
    setUrl(''); setCurrent(''); setCanGoBack(false); setCanGoForward(false); setBarVisible(true);
  }, [hideCursor]);

  // Pantalla completa abierta desde la barra: al ocultarse la barra el foco no está en la página y las teclas no le llegan.
  // Se las pasa la app (si también le llegan por su cuenta, la página descarta la repetida).
  useTVEventHandler((ev: { eventType: string; eventKeyAction?: number }) => {
    if (!pageFullscreen.current || ev.eventKeyAction === 1) return;
    const key = TV_KEYS[ev.eventType];
    if (key) web.current?.injectJavaScript(`window.__lb&&window.__lb.fsKey&&window.__lb.fsKey('${key}'); true;`);
  });

  // Botón "Atrás" del mando
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Vídeo a pantalla completa (ahí el cursor se oculta y las flechas son avance/volumen): Atrás sale de ella
      if (pageFullscreen.current) { pageFullscreen.current = false; web.current?.injectJavaScript(EXIT_FULLSCREEN_JS); setBarVisible(true); return true; }
      if (!barVisible) { setBarVisible(true); return true; }
      if (url && canGoBack) { web.current?.goBack(); return true; }
      if (url) { goHome(); return true; }
      return false; // en la portada: salir de la app
    });
    return () => sub.remove();
  }, [barVisible, url, canGoBack, goHome]);

  // Bloqueo de navegación: dominios de anuncios y esquemas que abren otras apps.
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    if (isDisallowedScheme(req.url) || isBlockedUrl(req.url)) {
      pageBlocked.current += 1;
      setBlocked((b) => b + 1);
      setSessionBlocked((b) => b + 1);
      return false;
    }
    return true;
  }, []);

  const inject = useCallback(() => web.current?.injectJavaScript(INJECTED), []);

  // El WebView de Vega informa del estado de navegación en los eventos de carga y de mensaje.
  const syncNav = useCallback((ev: { url?: string; canGoBack?: boolean; canGoForward?: boolean }) => {
    if (ev.url && ev.url !== 'about:blank') setCurrent(ev.url);
    if (typeof ev.canGoBack === 'boolean') setCanGoBack(ev.canGoBack);
    if (typeof ev.canGoForward === 'boolean') setCanGoForward(ev.canGoForward);
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type: string; data: any };
    try { msg = JSON.parse(e.nativeEvent.data); } catch { syncNav(e.nativeEvent); return; }
    if (msg.type === 'cur') { onCursor(msg.data); return; } // llega en cada fotograma: camino rápido
    if (msg.type === 'click') { flashClick(); return; }
    syncNav(e.nativeEvent);
    switch (msg.type) {
      case 'stats': {
        const n = Number(msg.data || 0);
        const extra = n - lastStats.current; // fuera del setState: se ejecuta después y la referencia ya habría cambiado
        if (extra > 0) { lastStats.current = n; setSessionBlocked((b) => b + extra); }
        setBlocked(pageBlocked.current + n);
        break;
      }
      case 'toast': showToast(String(msg.data)); break;
      case 'focusbar': setBarVisible(true); setFocusBar((n) => n + 1); break;
      case 'fullscreen':
        pageFullscreen.current = !!msg.data; setBarVisible(!msg.data);
        if (msg.data) showToast('Pantalla completa · ←/→ ±10 s · OK pausa · Atrás: salir y volver al cursor');
        break;
    }
  }, [showToast, syncNav, onCursor, flashClick]);

  const webView = useMemo(() => {
    if (!url) return null;
    return (
      <WebView
        ref={web}
        key={desktop ? 'pc' : 'mobile'}
        source={{ uri: url }}
        style={styles.web}
        hasTVPreferredFocus
        userAgent={desktop ? UA_DESKTOP : UA_MOBILE}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        mediaPlaybackRequiresUserAction={false}
        allowsDefaultMediaControl
        injectedJavaScriptBeforeContentLoaded={INJECTED}
        onShouldStartLoadWithRequest={onShouldStart}
        onLoadStart={(e) => { hideCursor(); setFailed(''); setLoading(true); pageBlocked.current = 0; lastStats.current = 0; syncNav(e.nativeEvent); }}
        onLoad={(e) => { setLoading(false); syncNav(e.nativeEvent); inject(); }}
        onMessage={onMessage}
        onError={(e) => {
          setLoading(false); syncNav(e.nativeEvent);
          // navegación cancelada (Parar, otra dirección) o bloqueada por nosotros: no es un error de la página
          const why = String(e.nativeEvent.description || '');
          if (e.nativeEvent.code !== -3 && !/ABORT|BLOCKED/i.test(why)) {
            setFailed(why || 'Error de conexión');
            setRecents((r) => r.filter((x) => x.url !== url));
          }
        }}
        onCloseWindow={goHome}
      />
    );
  }, [url, desktop, onShouldStart, inject, onMessage, showToast, syncNav, goHome, hideCursor]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {barVisible && !!url && (
        <Toolbar
          url={displayUrl(current)}
          secure={current.startsWith('https:')}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          loading={loading}
          blocked={blocked}
          desktop={desktop}
          onSubmit={open}
          onBack={() => web.current?.goBack()}
          onForward={() => web.current?.goForward()}
          onReload={() => (loading ? web.current?.stopLoading() : web.current?.injectJavaScript(RELOAD_JS))}
          onHome={goHome}
          onVideo={() => web.current?.injectJavaScript(FULLSCREEN_VIDEO_JS)}
          onToggleDesktop={() => setDesktop((d) => !d)}
          onHide={() => url && setBarVisible(false)}
          focusRequest={focusBar}
        />
      )}
      <View style={styles.content} onLayout={(e: LayoutChangeEvent) => { webSize.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}>
        {webView ?? <StartPage onOpen={open} blocked={sessionBlocked} recents={recents} onClearRecents={() => setRecents([])} desktop={desktop} onToggleDesktop={() => setDesktop((d) => !d)} />}
        {webView && (
          <>
            <Animated.View pointerEvents="none" style={[styles.ring, { opacity: rOpacity, width: rw, height: rh, transform: [{ translateX: rx }, { translateY: ry }] }]} />
            <Animated.Image source={CURSOR_IMG} style={[styles.cursor, { opacity: cOpacity, transform: [{ translateX: cx }, { translateY: cy }] }]} />
          </>
        )}
        {!!url && !!failed && <ErrorPage url={displayUrl(current)} detail={failed} onRetry={() => { setFailed(''); web.current?.injectJavaScript(RELOAD_JS); }} onHome={goHome} />}
      </View>
      {loading && !!url && (
        <View pointerEvents="none" style={[styles.progress, { top: barVisible ? BAR_H - 2 : 0 }]}>
          <Animated.View style={[styles.progressRun, { transform: [{ translateX: prog.interpolate({ inputRange: [0, 1], outputRange: [-240, 960] }) }] }]} />
        </View>
      )}
      {!!toast && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <Text style={styles.toast}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
  web: { flex: 1, backgroundColor: '#000' },
  // cursor.png (44x60 px) tiene la punta en (2,2): se desplaza 1 unidad para que la punta caiga en la posición exacta
  cursor: { position: 'absolute', left: -1, top: -1, width: 22, height: 30 },
  ring: { position: 'absolute', left: 0, top: 0, borderWidth: 2, borderColor: '#3b82f6', borderRadius: 8, backgroundColor: 'rgba(59,130,246,0.12)' },
  progress: { position: 'absolute', left: 0, right: 0, height: 2, overflow: 'hidden', backgroundColor: 'rgba(59,130,246,0.2)' },
  progressRun: { width: 240, height: 2, backgroundColor: C.accent },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center' },
  toast: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(17,20,26,0.94)', borderWidth: 1, borderColor: C.line, color: C.text, fontSize: 13, overflow: 'hidden' },
});
