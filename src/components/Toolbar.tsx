import React, { useState } from 'react';
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

  return (
    <View style={styles.bar}>
      <Btn label="◀" onPress={p.onBack} disabled={!p.canGoBack} />
      <Btn label="▶" onPress={p.onForward} disabled={!p.canGoForward} />
      <Btn label={p.loading ? '✕' : '⟳'} onPress={p.onReload} />
      <Btn label="⌂" onPress={p.onHome} />
      <TextInput
        style={[styles.input, editing && styles.inputFocused]}
        value={editing ? text : p.url}
        placeholder="Buscar o escribir dirección"
        placeholderTextColor="#777"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onFocus={() => { setEditing(true); setText(p.url); }}
        onBlur={() => setEditing(false)}
        onChangeText={setText}
        onSubmitEditing={() => { setEditing(false); p.onSubmit(text); }}
      />
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
  shield: { color: '#4ade80', fontSize: 18, marginHorizontal: 10 },
});
