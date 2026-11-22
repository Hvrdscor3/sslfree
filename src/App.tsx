import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from '@amazon-devices/webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent, WebViewMethods } from '@amazon-devices/webview/dist/types/WebViewTypes';

import Toolbar from './components/Toolbar';
import StartPage from './components/StartPage';
import { hostsForInjection, isBlockedUrl, isDisallowedScheme } from './core/adblock';
import { buildInjectedScript, FULLSCREEN_VIDEO_JS, RELOAD_JS } from './core/injected';
import { displayUrl, normalizeInput } from './core/url';

// Un móvil recibe páginas más ligeras (menos JS, vídeos adaptados): mejor rendimiento en el Firestick.
const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Se construye una sola vez: es la pieza que bloquea pop-ups y anuncios dentro de la página.
const INJECTED = buildInjectedScript(hostsForInjection());


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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const open = useCallback((input: string) => {
    const next = normalizeInput(input);
    if (!next) return;
    if (isBlockedUrl(next)) { showToast('Dirección bloqueada (anuncios)'); return; }
    if (next === url) { web.current?.injectJavaScript(RELOAD_JS); return; }
    setUrl(next);
    setCurrent(next);
  }, [url, showToast]);

  const goHome = useCallback(() => {
    setUrl(''); setCurrent(''); setCanGoBack(false); setCanGoForward(false); setBarVisible(true);
  }, []);

  // Botón "Atrás" del mando
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
    syncNav(e.nativeEvent);
    let msg: { type: string; data: any };
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (msg.type) {
      case 'stats': setBlocked(pageBlocked.current + Number(msg.data || 0)); break;
      case 'toast': showToast(String(msg.data)); break;
      case 'fullscreen': setBarVisible(!msg.data); break;
    }
  }, [showToast, syncNav]);

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
        onLoadStart={(e) => { setLoading(true); pageBlocked.current = 0; syncNav(e.nativeEvent); }}
        onLoad={(e) => { setLoading(false); syncNav(e.nativeEvent); inject(); }}
        onMessage={onMessage}
        onError={(e) => { setLoading(false); syncNav(e.nativeEvent); showToast('No se pudo cargar la página'); }}
        onCloseWindow={goHome}
      />
    );
  }, [url, desktop, onShouldStart, inject, onMessage, showToast, syncNav, goHome]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {barVisible && (
        <Toolbar
          url={displayUrl(current)}
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
        />
      )}
      <View style={styles.content}>{webView ?? <StartPage onOpen={open} />}</View>
      {loading && <View style={[styles.progress, { top: barVisible ? 64 : 0 }]} />}
      {!!toast && <Text style={styles.toast}>{toast}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e0f13' },
  content: { flex: 1 },
  web: { flex: 1, backgroundColor: '#000' },
  progress: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#3b82f6' },
  toast: { position: 'absolute', bottom: 48, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 20 },
});
