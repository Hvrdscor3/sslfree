import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BAR_H, C, ICON, LOGO } from '../theme';

type Props = {
  url: string;
  secure: boolean;
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
  /** al cambiar, se abre directamente el teclado para escribir (desde la portada) */
  editRequest?: number;
};

function Btn({ icon, label, onPress, disabled }: { icon: ImageSourcePropType; label?: string; onPress: () => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.btn, label ? styles.btnWide : null, focused && styles.btnFocused, disabled && styles.btnDisabled]}
    >
      <Image source={icon} style={styles.icon} />
      {label ? <Text style={styles.btnLabel}>{label}</Text> : null}
    </Pressable>
  );
}

/** Separa "dominio/ruta" para resaltar el dominio, que es lo que importa al mirar desde el sofá. */
function splitUrl(u: string): [string, string] {
  const i = u.indexOf('/');
  return i < 0 ? [u, ''] : [u.slice(0, i), u.slice(i)];
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
  useEffect(() => { if (p.editRequest) { setText(''); setEditing(true); } }, [p.editRequest]);

  const [host, rest] = splitUrl(p.url);

  return (
    <View style={styles.bar}>
      <Image source={LOGO} style={styles.logo} />
      <View style={styles.group}>
        <Btn icon={ICON.back} onPress={p.onBack} disabled={!p.canGoBack} />
        <Btn icon={ICON.forward} onPress={p.onForward} disabled={!p.canGoForward} />
        <Btn icon={p.loading ? ICON.stop : ICON.reload} onPress={p.onReload} />
        <Btn icon={ICON.home} onPress={p.onHome} />
      </View>
      {editing ? (
        <View style={[styles.address, styles.addressFocused]}>
          <Image source={ICON.search} style={styles.addrIcon} />
          <TextInput
            style={styles.input}
            value={text}
            autoFocus
            placeholder="Busca en DuckDuckGo o escribe una dirección"
            placeholderTextColor={C.dim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onBlur={stopEditing}
            onChangeText={setText}
            onSubmitEditing={() => { stopEditing(); p.onSubmit(text); }}
          />
        </View>
      ) : (
        // En el WebView de Vega, enfocar un TextInput abre el teclado: al pasar por la barra con las flechas
        // se abría solo. Por eso es un botón con la dirección y el teclado sólo aparece al pulsar OK.
        <Pressable
          ref={urlRef}
          style={[styles.address, urlFocused && styles.addressFocused]}
          onFocus={() => setUrlFocused(true)}
          onBlur={() => setUrlFocused(false)}
          onPress={() => { setText(p.url); setEditing(true); }}
        >
          <Image source={p.url ? (p.secure ? ICON.lock : ICON.globe) : ICON.search} style={[styles.addrIcon, p.url && p.secure ? styles.addrIconOk : null]} />
          <Text numberOfLines={1} style={styles.addrText}>
            {p.url ? (
              <>
                <Text style={styles.host}>{host}</Text>
                <Text style={styles.path}>{rest}</Text>
              </>
            ) : (
              <Text style={styles.placeholder}>Busca o escribe una dirección</Text>
            )}
          </Text>
        </Pressable>
      )}
      <View style={styles.shield}>
        <Image source={ICON.shield} style={styles.shieldIcon} />
        <Text style={styles.shieldText}>{p.blocked}</Text>
      </View>
      <View style={styles.group}>
        <Btn icon={ICON.video} label="Vídeo" onPress={p.onVideo} />
        <Btn icon={p.desktop ? ICON.desktop : ICON.mobile} label={p.desktop ? 'PC' : 'Móvil'} onPress={p.onToggleDesktop} />
        <Btn icon={ICON.hide} onPress={p.onHide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, backgroundColor: C.bar, borderBottomWidth: 1, borderBottomColor: C.line },
  logo: { width: 38, height: 38, marginRight: 14 },
  group: { flexDirection: 'row', alignItems: 'center' },
  btn: { height: 50, minWidth: 50, paddingHorizontal: 13, marginHorizontal: 3, borderRadius: 25, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', borderWidth: 2, borderColor: 'transparent' },
  btnWide: { paddingHorizontal: 18, backgroundColor: C.surface },
  btnFocused: { backgroundColor: C.accent, borderColor: '#93c5fd', transform: [{ scale: 1.12 }] },
  btnDisabled: { opacity: 0.3 },
  icon: { width: 24, height: 24 },
  btnLabel: { color: C.text, fontSize: 18, fontWeight: '600', marginLeft: 8 },
  address: { flex: 1, height: 52, marginHorizontal: 14, paddingHorizontal: 18, borderRadius: 26, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: 'transparent' },
  addressFocused: { borderColor: C.accent, backgroundColor: C.surfaceHi },
  addrIcon: { width: 22, height: 22, marginRight: 12, opacity: 0.7 },
  addrIconOk: { opacity: 1 },
  addrText: { flex: 1, fontSize: 20 },
  host: { color: C.text, fontWeight: '600' },
  path: { color: C.dim },
  placeholder: { color: C.dim },
  input: { flex: 1, color: C.text, fontSize: 20, padding: 0 },
  shield: { height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginRight: 10, borderRadius: 20, backgroundColor: C.okSoft },
  shieldIcon: { width: 22, height: 22, tintColor: C.ok },
  shieldText: { color: C.ok, fontSize: 18, fontWeight: '700', marginLeft: 8, minWidth: 18 },
});
