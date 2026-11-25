import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, ICON, LOGO } from '../theme';

// Medidas en dp: la pantalla de la TV son 960x540.
export const BOOKMARKS: { title: string; url: string; host: string; color: string }[] = [
  { title: 'YouTube', url: 'https://m.youtube.com', host: 'youtube.com', color: '#ff0033' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com/html/', host: 'duckduckgo.com', color: '#de5833' },
  { title: 'Wikipedia', url: 'https://es.m.wikipedia.org', host: 'wikipedia.org', color: '#5b6573' },
  { title: 'Vimeo', url: 'https://vimeo.com', host: 'vimeo.com', color: '#17a9d6' },
  { title: 'Archive.org', url: 'https://archive.org/details/movies', host: 'archive.org', color: '#a0784a' },
  { title: 'Google', url: 'https://www.google.com', host: 'google.com', color: '#4285f4' },
];

export type Recent = { url: string; host: string };
type Props = {
  onOpen: (url: string) => void;
  blocked: number;
  recents: Recent[];
  onClearRecents: () => void;
  desktop: boolean;
  onToggleDesktop: () => void;
};

function Focusable({ style, focusedStyle, onPress, children, preferred, innerRef }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable ref={innerRef} hasTVPreferredFocus={preferred} onPress={onPress}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[style, focused && focusedStyle]}>
      {children}
    </Pressable>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <View style={styles.hint}>
      <Text style={styles.key}>{k}</Text>
      <Text style={styles.hintText}>{label}</Text>
    </View>
  );
}

function useClock() {
  const fmt = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 15000); return () => clearInterval(id); }, []);
  return t;
}

/** Color estable por dominio para los sitios recientes. */
function colorOf(host: string): string {
  const colors = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e'];
  let n = 0;
  for (let i = 0; i < host.length; i++) n = (n * 31 + host.charCodeAt(i)) % 997;
  return colors[n % colors.length];
}

export default function StartPage({ onOpen, blocked, recents, onClearRecents, desktop, onToggleDesktop }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const clock = useClock();
  const searchRef = useRef<any>(null);
  // Al cerrarse el teclado desaparece el TextInput que tenía el foco: se devuelve al buscador.
  const stop = () => {
    setEditing(false);
    setTimeout(() => { const r = searchRef.current; try { if (r?.requestTVFocus) r.requestTVFocus(); else r?.focus?.(); } catch {} }, 60);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.logo} />
        <Text style={styles.h1}>Navegador Ligero</Text>
        <View style={styles.stat}>
          <Image source={ICON.shield} style={styles.statIcon} />
          <Text style={styles.statText}>{blocked === 1 ? '1 bloqueado' : `${blocked} bloqueados`}</Text>
        </View>
        <Text style={styles.clock}>{clock}</Text>
      </View>

      {editing ? (
        <View style={[styles.search, styles.searchFocused]}>
          <Image source={ICON.search} style={styles.searchIcon} />
          <TextInput style={styles.input} value={text} autoFocus placeholder="Busca o escribe una dirección" placeholderTextColor={C.dim}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go"
            onBlur={stop} onChangeText={setText}
            onSubmitEditing={() => { const v = text.trim(); if (v) onOpen(v); else stop(); }} />
        </View>
      ) : (
        <Focusable innerRef={searchRef} preferred style={styles.search} focusedStyle={styles.searchFocused} onPress={() => { setText(''); setEditing(true); }}>
          <Image source={ICON.search} style={styles.searchIcon} />
          <Text style={styles.searchText}>Busca o escribe una dirección</Text>
        </Focusable>
      )}

      <Text style={styles.section}>Favoritos</Text>
      <View style={styles.row}>
        {BOOKMARKS.map((b) => (
          <Focusable key={b.url} style={styles.tile} focusedStyle={styles.tileFocused} onPress={() => onOpen(b.url)}>
            <View style={[styles.badge, { backgroundColor: b.color }]}><Text style={styles.badgeText}>{b.title[0]}</Text></View>
            <Text numberOfLines={1} style={styles.tileTitle}>{b.title}</Text>
          </Focusable>
        ))}
      </View>

      {recents.length > 0 && (
        <>
          <Text style={styles.section}>Recientes</Text>
          <View style={styles.row}>
            {recents.slice(0, 5).map((r) => (
              <Focusable key={r.url} style={styles.chip} focusedStyle={styles.chipFocused} onPress={() => onOpen(r.url)}>
                <View style={[styles.dot, { backgroundColor: colorOf(r.host) }]}><Text style={styles.dotText}>{(r.host[0] || '?').toUpperCase()}</Text></View>
                <Text numberOfLines={1} style={styles.chipText}>{r.host}</Text>
              </Focusable>
            ))}
            <Focusable style={[styles.chip, styles.clear]} focusedStyle={styles.chipFocused} onPress={onClearRecents}>
              <Text style={styles.clearText}>Borrar</Text>
            </Focusable>
          </View>
        </>
      )}

      <View style={styles.footer}>
        <Key k="◀◀" label="Barra de dirección" />
        <Key k="OK" label="Clic" />
        <Key k="Atrás" label="Volver" />
        <Focusable style={styles.mode} focusedStyle={styles.modeFocused} onPress={onToggleDesktop}>
          <Image source={desktop ? ICON.desktop : ICON.mobile} style={styles.modeIcon} />
          <Text style={styles.modeText}>{desktop ? 'Webs de PC' : 'Webs de móvil'}</Text>
        </Focusable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: 48, paddingTop: 26, paddingBottom: 22 },
  header: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 34, height: 34, marginRight: 12 },
  h1: { flex: 1, color: C.text, fontSize: 22, fontWeight: '700' },
  stat: { flexDirection: 'row', alignItems: 'center', height: 26, paddingHorizontal: 11, borderRadius: 13, backgroundColor: C.okSoft, marginRight: 18 },
  statIcon: { width: 14, height: 14, tintColor: C.ok, marginRight: 6 },
  statText: { color: C.ok, fontSize: 12, fontWeight: '600' },
  clock: { color: C.text, fontSize: 22, fontWeight: '300' },
  search: { height: 52, marginTop: 30, paddingHorizontal: 20, borderRadius: 26, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: C.line },
  searchFocused: { borderColor: C.accent, backgroundColor: C.surfaceHi },
  searchIcon: { width: 20, height: 20, marginRight: 14, opacity: 0.8 },
  searchText: { color: C.muted, fontSize: 17 },
  input: { flex: 1, color: C.text, fontSize: 17, padding: 0 },
  section: { color: C.muted, fontSize: 13, fontWeight: '600', marginTop: 28, marginBottom: 10 },
  row: { flexDirection: 'row', marginHorizontal: -6 },
  tile: { width: 132, height: 104, marginHorizontal: 6, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  tileFocused: { borderColor: '#fff', backgroundColor: C.surfaceHi, transform: [{ scale: 1.07 }] },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 21, fontWeight: '700' },
  tileTitle: { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 9, maxWidth: 120 },
  chip: { width: 132, height: 42, marginHorizontal: 6, paddingHorizontal: 9, borderRadius: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: 'transparent' },
  chipFocused: { borderColor: '#fff', backgroundColor: C.surfaceHi, transform: [{ scale: 1.05 }] },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  clear: { width: 72, justifyContent: 'center', backgroundColor: 'transparent', borderColor: C.line },
  clearText: { color: C.muted, fontSize: 12 },
  chipText: { flex: 1, color: C.text, fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 'auto', paddingTop: 22 },
  hint: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  key: { color: C.text, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  hintText: { color: C.muted, fontSize: 12, marginLeft: 7 },
  mode: { marginLeft: 'auto', height: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: 'transparent' },
  modeFocused: { borderColor: '#fff', backgroundColor: C.surfaceHi },
  modeIcon: { width: 16, height: 16, marginRight: 8 },
  modeText: { color: C.text, fontSize: 12, fontWeight: '600' },
});
