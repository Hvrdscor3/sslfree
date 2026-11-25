import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';

function Action({ label, onPress, main }: { label: string; onPress: () => void; main?: boolean }) {
  const [f, setF] = useState(false);
  return (
    <Pressable hasTVPreferredFocus={main} onPress={onPress} onFocus={() => setF(true)} onBlur={() => setF(false)} style={[styles.btn, f && styles.btnF]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

/** Los errores de red más comunes, en cristiano. */
function explain(e: string): string {
  if (/NAME_NOT_RESOLVED/.test(e)) return 'Esa dirección no existe. Revisa que esté bien escrita.';
  if (/INTERNET_DISCONNECTED|NETWORK_CHANGED/.test(e)) return 'La tele no tiene conexión a internet.';
  if (/TIMED_OUT/.test(e)) return 'La página tarda demasiado en responder.';
  if (/CONNECTION_(REFUSED|RESET|CLOSED)/.test(e)) return 'La página ha rechazado la conexión.';
  if (/CERT|SSL/.test(e)) return 'La conexión segura de la página no es válida.';
  return e;
}

/** Página que no carga: se explica en la pantalla y se puede reintentar (antes sólo salía un aviso de 2 segundos). */
export default function ErrorPage({ url, detail, onRetry, onHome }: { url: string; detail: string; onRetry: () => void; onHome: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>No se pudo abrir la página</Text>
      <Text numberOfLines={1} style={styles.url}>{url}</Text>
      <Text numberOfLines={2} style={styles.detail}>{explain(detail)}</Text>
      <View style={styles.row}>
        <Action main label="Reintentar" onPress={onRetry} />
        <Action label="Ir al inicio" onPress={onHome} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, paddingHorizontal: 80 },
  title: { color: C.text, fontSize: 24, fontWeight: '700' },
  url: { color: C.accent, fontSize: 15, marginTop: 10 },
  detail: { color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  row: { flexDirection: 'row', marginTop: 26 },
  btn: { height: 40, paddingHorizontal: 24, marginHorizontal: 7, borderRadius: 20, justifyContent: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: 'transparent' },
  btnF: { backgroundColor: C.accent, borderColor: '#93c5fd' },
  btnText: { color: C.text, fontSize: 14, fontWeight: '600' },
});
