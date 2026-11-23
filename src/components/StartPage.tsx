import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export const BOOKMARKS: { title: string; url: string }[] = [
  { title: 'YouTube', url: 'https://m.youtube.com' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com/html/' },
  { title: 'Wikipedia', url: 'https://es.m.wikipedia.org' },
  { title: 'Vimeo', url: 'https://vimeo.com' },
  { title: 'Archive.org', url: 'https://archive.org/details/movies' },
  { title: 'Google', url: 'https://www.google.com' },
];

function Tile({ title, onPress, first }: { title: string; onPress: () => void; first: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      hasTVPreferredFocus={first}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.tile, focused && styles.tileFocused]}
    >
      <Text style={styles.letter}>{title[0]}</Text>
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

export default function StartPage({ onOpen }: { onOpen: (url: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>Navegador ligero</Text>
      <Text style={styles.sub}>Sin pop-ups ni anuncios · ⏪ o ↑ arriba del todo: barra de direcciones</Text>
      <View style={styles.grid}>
        {BOOKMARKS.map((b, i) => (
          <Tile key={b.url} title={b.title} first={i === 0} onPress={() => onOpen(b.url)} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 48, alignItems: 'center' },
  h1: { color: '#fff', fontSize: 40, fontWeight: '600' },
  sub: { color: '#9aa0aa', fontSize: 20, marginTop: 8, marginBottom: 36 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1200 },
  tile: { width: 220, height: 160, margin: 14, borderRadius: 16, backgroundColor: '#1e2128', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  tileFocused: { borderColor: '#3b82f6', backgroundColor: '#263043', transform: [{ scale: 1.06 }] },
  letter: { color: '#3b82f6', fontSize: 56, fontWeight: '700' },
  title: { color: '#fff', fontSize: 22, marginTop: 6 },
});
