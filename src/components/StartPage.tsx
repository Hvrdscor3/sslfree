import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, ICON, LOGO } from '../theme';

export const BOOKMARKS: { title: string; url: string; host: string; color: string }[] = [
  { title: 'YouTube', url: 'https://m.youtube.com', host: 'youtube.com', color: '#ff0033' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com/html/', host: 'duckduckgo.com', color: '#de5833' },
  { title: 'Wikipedia', url: 'https://es.m.wikipedia.org', host: 'wikipedia.org', color: '#5b6573' },
  { title: 'Vimeo', url: 'https://vimeo.com', host: 'vimeo.com', color: '#17a9d6' },
  { title: 'Archive.org', url: 'https://archive.org/details/movies', host: 'archive.org', color: '#a0784a' },
  { title: 'Google', url: 'https://www.google.com', host: 'google.com', color: '#4285f4' },
];

function Tile({ b, onPress }: { b: (typeof BOOKMARKS)[number]; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.tile, focused && styles.tileFocused]}
    >
      <View style={[styles.badge, { backgroundColor: b.color }]}>
        <Text style={styles.badgeText}>{b.title[0]}</Text>
      </View>
      <Text style={styles.tileTitle}>{b.title}</Text>
      <Text style={styles.tileHost}>{b.host}</Text>
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

export default function StartPage({ onOpen, onSearch, blocked }: { onOpen: (url: string) => void; onSearch: () => void; blocked: number }) {
  const [searchFocused, setSearchFocused] = useState(false);
  const clock = useClock();
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.logo} />
        <View style={styles.headerText}>
          <Text style={styles.h1}>Navegador Ligero</Text>
          <Text style={styles.sub}>Sin anuncios · Sin pop-ups · Vídeo rápido</Text>
        </View>
        <Text style={styles.clock}>{clock}</Text>
      </View>

      <Pressable
        hasTVPreferredFocus
        onPress={onSearch}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        style={[styles.search, searchFocused && styles.searchFocused]}
      >
        <Image source={ICON.search} style={styles.searchIcon} />
        <Text style={styles.searchText}>Busca en DuckDuckGo o escribe una dirección</Text>
      </Pressable>

      <Text style={styles.section}>Favoritos</Text>
      <View style={styles.grid}>
        {BOOKMARKS.map((b) => <Tile key={b.url} b={b} onPress={() => onOpen(b.url)} />)}
      </View>

      <View style={styles.footer}>
        <Key k="OK" label="Clic" />
        <Key k="◀◀" label="Barra de dirección" />
        <Key k="Atrás" label="Volver" />
        <View style={styles.stat}>
          <Image source={ICON.shield} style={styles.statIcon} />
          <Text style={styles.statText}>{blocked} bloqueados en esta sesión</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 96, paddingVertical: 40, alignItems: 'center' },
  header: { width: '100%', maxWidth: 1240, flexDirection: 'row', alignItems: 'center' },
  logo: { width: 76, height: 76, marginRight: 22 },
  headerText: { flex: 1 },
  h1: { color: C.text, fontSize: 42, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 20, marginTop: 4 },
  clock: { color: C.text, fontSize: 40, fontWeight: '300' },
  search: { width: '100%', maxWidth: 1240, height: 76, marginTop: 44, paddingHorizontal: 30, borderRadius: 38, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 3, borderColor: 'transparent' },
  searchFocused: { borderColor: C.accent, backgroundColor: C.surfaceHi, transform: [{ scale: 1.02 }] },
  searchIcon: { width: 30, height: 30, marginRight: 18, opacity: 0.8 },
  searchText: { color: C.muted, fontSize: 24 },
  section: { width: '100%', maxWidth: 1240, color: C.muted, fontSize: 20, fontWeight: '600', letterSpacing: 1, marginTop: 48, marginBottom: 6 },
  grid: { width: '100%', maxWidth: 1264, flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -12 },
  tile: { width: 186, height: 184, margin: 12, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  tileFocused: { borderColor: '#fff', backgroundColor: C.surfaceHi, transform: [{ scale: 1.1 }] },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  tileTitle: { color: C.text, fontSize: 21, fontWeight: '600', marginTop: 14 },
  tileHost: { color: C.dim, fontSize: 15, marginTop: 2 },
  footer: { width: '100%', maxWidth: 1240, flexDirection: 'row', alignItems: 'center', marginTop: 44 },
  hint: { flexDirection: 'row', alignItems: 'center', marginRight: 28 },
  key: { color: C.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  hintText: { color: C.muted, fontSize: 17, marginLeft: 10 },
  stat: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  statIcon: { width: 22, height: 22, tintColor: C.ok, marginRight: 8 },
  statText: { color: C.ok, fontSize: 17 },
});
