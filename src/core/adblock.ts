/**
 * Lista compacta de dominios de anuncios, pop-unders y rastreadores.
 * Se comprueba el host y todos sus dominios padre (a.b.ads.com -> ads.com),
 * así que la búsqueda cuesta O(número de etiquetas) y no recorre la lista.
 */
export const AD_HOSTS: readonly string[] = [
  // Redes de anuncios generales
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'pagead2.googlesyndication.com', 'imasdk.googleapis.com', 'googletagservices.com',
  'amazon-adsystem.com', 'adnxs.com', 'adsrvr.org', 'criteo.com', 'criteo.net', 'taboola.com',
  'outbrain.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com',
  'smartadserver.com', 'yieldmo.com', 'sharethrough.com', 'teads.tv', 'media.net',
  'advertising.com', 'adform.net', 'serving-sys.com', 'moatads.com', '33across.com',
  'adroll.com', 'bidswitch.net', 'contextweb.com', 'indexww.com', 'lijit.com', 'sovrn.com',
  'spotxchange.com', 'spotx.tv', 'springserve.com', 'zedo.com', 'revcontent.com', 'mgid.com',
  'adblade.com', 'buysellads.com', 'carbonads.net', 'infolinks.com', 'adcash.com',
  // Anuncios de vídeo (VAST/VPAID, pre-rolls incrustados en reproductores)
  'fwmrm.net', 'freewheel.tv', 'innovid.com', 'tremorhub.com', 'tremorvideo.com', 'stickyadstv.com',
  'aniview.com', 'vidoomy.com', 'primis.tech', 'connatix.com', 'jwpsrv.com', 'vdo.ai', 'vidazoo.com',
  'adtelligent.com', 'videoadex.com', 'yuktamedia.com', 'unrulymedia.com', 'cedato.com', 'brid.tv',
  'ex.co', 'playwire.com', 'vliplatform.com', 'minutemedia-prebid.com', 'adsafeprotected.com',
  'doubleverify.com', 'imrworldwide.com', 'tribalfusion.com', 'undertone.com', 'gumgum.com',
  'kargo.com', 'triplelift.com', '3lift.com', 'seedtag.com', 'richaudience.com', 'improvedigital.com',
  'adition.com', 'smilewanted.com', 'onetag-sys.com', 'e-planning.net', 'ad.360yield.com',
  // Pop-unders / redirecciones agresivas (habituales en sitios de streaming)
  'popads.net', 'popcash.net', 'propellerads.com', 'propellerclick.com', 'onclickads.net',
  'onclkds.com', 'exoclick.com', 'exosrv.com', 'juicyads.com', 'trafficjunky.net',
  'trafficstars.com', 'tsyndicate.com', 'hilltopads.net', 'hilltopads.com', 'adsterra.com',
  'adsterratech.com', 'clickadu.com', 'clickaine.com', 'adskeeper.com', 'adskeeper.co.uk',
  'admaven.com', 'ad-maven.com', 'richpush.co', 'pushame.com', 'evadav.com', 'galaksion.com',
  'monetag.com', 'a-ads.com', 'bidvertiser.com', 'popmyads.com', 'zeropark.com',
  'adspyglass.com', 'ylliX.net', 'yllix.com', 'ero-advertising.com', 'plugrush.com',
  'realsrv.com', 'adxpansion.com', 'clickadilla.com', 'aclickads.com', 'adtng.com',
  'highperformanceformat.com', 'profitablegatecpm.com', 'profitabledisplaynetwork.com',
  'effectiveratecpm.com', 'highcpmrevenuegate.com', 'toprevenuegate.com', 'displayvertising.com',
  'dolohen.com', 'acint.net', 'pemsrv.com', 'whos.amung.us', 'syndication.realsrv.com',
  'mnaspm.com', 'dtscout.com', 'dtscdn.com', 'bvtpk.com', 'rtmark.net', 'oclasrv.com',
  'onclicka.com', 'onclickperformance.com', 'adexchangeprediction.com', 'go.oclasrv.com',
  'jads.co', 'adbetclickin.pink', 'brightadnetwork.com', 'tapioni.com', 'betteradsystem.com',
  // Redes de anuncios de webs para adultos (ExoClick, TrafficJunky, TrafficStars, JuicyAds y demás).
  // ExoClick rota dominios: además se bloquea su script (ad-provider.js) por ruta y sus etiquetas <ins data-zoneid>.
  'magsrv.com', 'exdynsrv.com', 'exoticads.com', 'trafficjunky.com', 'mybid.io', 'trafficfactory.biz',
  'traffichaus.com', 'twinred.com', 'tubecorporate.com', 'adnium.com', 'crakrevenue.com', 'mavrtracktor.com',
  'awempire.com', 'stripcash.com', 'xlivrdr.com', 'adultforce.com', 'reporo.net', 'trafficshop.com',
  'mndsrv.com', 'adsession.com', 'xxxlnk.com', 'tsyndicate.net', 'ad-delivery.net', 'adxxx.com',
  'sexad.net', 'eroadvertising.com', 'adultadworld.com', 'trafficforce.com', 'tubeadnetwork.com',
  // Rastreadores / analítica pesada
  'google-analytics.com', 'googletagmanager.com', 'scorecardresearch.com', 'quantserve.com',
  'hotjar.com', 'mixpanel.com', 'segment.io', 'branch.io', 'adjust.com', 'appsflyer.com',
  'chartbeat.com', 'newrelic.com', 'nr-data.net', 'krxd.net', 'bluekai.com', 'demdex.net',
  'everesttech.net', 'rlcdn.com', 'tapad.com', 'agkn.com', 'mathtag.com', 'turn.com',
  'exelator.com', 'crwdcntrl.net', 'adsymptotic.com', 'connect.facebook.net', 'clarity.ms',
  'yandex.ru/metrika', 'mc.yandex.ru', 'statcounter.com', 'histats.com', 'cloudflareinsights.com',
];

const HOST_SET = new Set(AD_HOSTS.filter((h) => !h.includes('/')).map((h) => h.toLowerCase()));

/** Extrae el host de una URL sin depender del objeto global URL (rápido y tolerante). */
export function getHost(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^:/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

/** true si el host o alguno de sus dominios padre está en la lista. */
export function isBlockedHost(host: string): boolean {
  let h = host.toLowerCase();
  while (h) {
    if (HOST_SET.has(h)) return true;
    const dot = h.indexOf('.');
    if (dot < 0) return false;
    h = h.slice(dot + 1);
  }
  return false;
}

/**
 * Peticiones de anuncios de vídeo por su forma, en cualquier dominio: etiquetas VAST/VMAP y Google Ad Manager.
 * (Se usa también dentro de la página: debe ser la misma expresión que AD_PATH en injected.ts.)
 */
export const AD_PATH_RE = /\/gampad\/ads|\/pagead\/(ads|adview|conversion)|[?&](vast|vmap|adtagurl|ad_tag|vpaid)=|\/vast\d?(\.xml|\.php)?([?/#]|$)|\/vmap(\.xml)?([?/#]|$)|\/api\/stats\/ads|\/get_midroll_info|\/ad-provider\.js|\/(popunder|popads)\d*\.js/i;

export function isBlockedUrl(url: string): boolean {
  const host = getHost(url);
  return host !== '' && (isBlockedHost(host) || AD_PATH_RE.test(url));
}

/** Esquemas que nunca deben abrirse desde el navegador (intents, apps externas, etc.). */
export function isDisallowedScheme(url: string): boolean {
  return /^(intent|market|itms|itms-apps|tel|sms|mailto|javascript):/i.test(url.trim());
}

/** Hosts para inyectar en la página (sólo dominios simples). */
export function hostsForInjection(): string[] {
  return Array.from(HOST_SET);
}
