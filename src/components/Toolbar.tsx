import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  blocked: number;
  desktop: boolean;
  onSubmit: (text: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onVideo: () => void;
  onToggleDesktop: () => void;
  onHide: () => void;
  /** al cambiar, el foco del mando va a la barra de dirección */
  focusRequest?: number;
};

function Btn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.btn, focused && styles.btnFocused, disabled && styles.btnDisabled]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export default function Toolbar(p: Props) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [urlFocused, setUrlFocused] = useState(false);
  // Al cerrar el teclado el TextInput (que tenía el foco) desaparece; sin esto el foco se perdía y el mando dejaba
  // de responder. Se devuelve al botón de la dirección.
  const urlRef = useRef<any>(null);
  const focusUrl = () => setTimeout(() => {
    const r = urlRef.current;
    try { if (r?.requestTVFocus) r.requestTVFocus(); else r?.focus?.(); } catch {}
  }, 60);
  const stopEditing = () => { setEditing(false); focusUrl(); };
  // La página pide ir a la barra (↑ arriba del todo o botón ⏪): el foco pasa a la dirección
  useEffect(() => { if (p.focusRequest) focusUrl(); }, [p.focusRequest]);

  return (
    <View style={styles.bar}>
      <Btn label="◀" onPress={p.onBack} disabled={!p.canGoBack} />
      <Btn label="▶" onPress={p.onForward} disabled={!p.canGoForward} />
      <Btn label={p.loading ? '✕' : '⟳'} onPress={p.onReload} />
      <Btn label="⌂" onPress={p.onHome} />
      {editing ? (
        <TextInput
          style={[styles.input, styles.inputFocused]}
          value={text}
          autoFocus
          placeholder="Buscar o escribir dirección"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onBlur={stopEditing}
          onChangeText={setText}
          onSubmitEditing={() => { stopEditing(); p.onSubmit(text); }}
        />
      ) : (
        // En el WebView de Vega, enfocar un TextInput abre el teclado: al pasar por la barra con las flechas
        // se abría solo. Ahora es un botón con la dirección y el teclado sólo aparece al pulsar OK.
        <Pressable
          ref={urlRef}
          style={[styles.input, styles.inputBtn, urlFocused && styles.inputFocused]}
          onFocus={() => setUrlFocused(true)}
          onBlur={() => setUrlFocused(false)}
          onPress={() => { setText(p.url); setEditing(true); }}
        >
          <Text numberOfLines={1} style={[styles.inputText, !p.url && styles.placeholder]}>{p.url || 'Buscar o escribir dirección'}</Text>
        </Pressable>
      )}
      <Text style={styles.shield}>🛡 {p.blocked}</Text>
      <Btn label="▣ Vídeo" onPress={p.onVideo} />
      <Btn label={p.desktop ? 'PC' : 'Móvil'} onPress={p.onToggleDesktop} />
      <Btn label="⛶" onPress={p.onHide} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#15171c' },
  btn: { height: 44, minWidth: 52, paddingHorizontal: 12, marginRight: 8, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#23262e' },
  btnFocused: { backgroundColor: '#3b82f6', transform: [{ scale: 1.08 }] },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: '#fff', fontSize: 20 },
  input: { flex: 1, height: 44, marginHorizontal: 8, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#23262e', color: '#fff', fontSize: 20, borderWidth: 2, borderColor: 'transparent' },
  inputFocused: { borderColor: '#3b82f6' },
  inputBtn: { justifyContent: 'center' },
  inputText: { color: '#fff', fontSize: 20 },
  placeholder: { color: '#777' },
  shield: { color: '#4ade80', fontSize: 18, marginHorizontal: 10 },
});
