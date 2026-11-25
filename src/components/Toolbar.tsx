import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BAR_H, C, ICON } from '../theme';

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
};

/** Botón redondo; al enfocarlo enseña su nombre debajo (en la TV no hay "pasar el ratón"). */
function Btn({ icon, name, label, onPress, disabled }: { icon: ImageSourcePropType; name: string; label?: string; onPress: () => void; disabled?: boolean }) {
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
      {focused && !label ? <View style={styles.tipWrap}><Text numberOfLines={1} style={styles.tip}>{name}</Text></View> : null}
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

  const [host, rest] = splitUrl(p.url);

  return (
    <View style={styles.bar}>
      <Btn icon={ICON.back} name="Atrás" onPress={p.onBack} disabled={!p.canGoBack} />
      <Btn icon={ICON.forward} name="Adelante" onPress={p.onForward} disabled={!p.canGoForward} />
      <Btn icon={p.loading ? ICON.stop : ICON.reload} name={p.loading ? 'Parar' : 'Recargar'} onPress={p.onReload} />
      <Btn icon={ICON.home} name="Inicio" onPress={p.onHome} />
      {editing ? (
        <View style={[styles.address, styles.addressFocused]}>
          <Image source={ICON.search} style={styles.addrIcon} />
          <TextInput
            style={styles.input}
            value={text}
            autoFocus
            placeholder="Busca o escribe una dirección"
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
          onPress={() => { setText(''); setEditing(true); }}
        >
          <Image source={p.secure ? ICON.lock : ICON.globe} style={styles.addrIcon} />
          <Text numberOfLines={1} style={styles.addrText}>
            <Text style={styles.host}>{host}</Text>
            <Text style={styles.path}>{rest}</Text>
          </Text>
          <Image source={ICON.shield} style={styles.shieldIcon} />
          <Text style={styles.shieldText}>{p.blocked}</Text>
        </Pressable>
      )}
      <Btn icon={ICON.video} name="Vídeo" label="Vídeo" onPress={p.onVideo} />
      <Btn icon={p.desktop ? ICON.desktop : ICON.mobile} name={p.desktop ? 'Web de PC' : 'Web de móvil'} onPress={p.onToggleDesktop} />
      <Btn icon={ICON.hide} name="Ocultar barra" onPress={p.onHide} />
    </View>
  );
}

// Medidas en dp (pantalla de 960x540)
const styles = StyleSheet.create({
  bar: { height: BAR_H, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: C.bar },
  btn: { height: 34, minWidth: 34, marginHorizontal: 2, borderRadius: 17, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  btnWide: { paddingHorizontal: 13, backgroundColor: C.surface },
  btnFocused: { backgroundColor: C.accent },
  btnDisabled: { opacity: 0.28 },
  icon: { width: 17, height: 17 },
  btnLabel: { color: C.text, fontSize: 13, fontWeight: '600', marginLeft: 7 },
  tipWrap: { position: 'absolute', top: 38, left: -43, width: 120, alignItems: 'center' },
  tip: { color: '#fff', fontSize: 11, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: C.accent, overflow: 'hidden' },
  address: { flex: 1, height: 34, marginHorizontal: 10, paddingHorizontal: 13, borderRadius: 17, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: 'transparent' },
  addressFocused: { borderColor: C.accent, backgroundColor: C.surfaceHi },
  addrIcon: { width: 14, height: 14, marginRight: 9, opacity: 0.75 },
  addrText: { flex: 1, fontSize: 14 },
  host: { color: C.text, fontWeight: '600' },
  path: { color: C.dim },
  input: { flex: 1, color: C.text, fontSize: 14, padding: 0 },
  shieldIcon: { width: 14, height: 14, tintColor: C.ok, marginLeft: 10 },
  shieldText: { color: C.ok, fontSize: 12, fontWeight: '700', marginLeft: 5 },
});
