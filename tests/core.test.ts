import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHost, isBlockedUrl, isDisallowedScheme } from '../src/core/adblock.ts';
import { normalizeInput, displayUrl, SEARCH_URL } from '../src/core/url.ts';

test('getHost', () => {
  assert.equal(getHost('https://user@Sub.Example.com:8080/a?b#c'), 'sub.example.com');
  assert.equal(getHost('no es url'), '');
});

test('bloquea dominios de anuncios y sus subdominios', () => {
  assert.ok(isBlockedUrl('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));
  assert.ok(isBlockedUrl('https://x.y.popads.net/pop.js'));
  assert.ok(isBlockedUrl('http://securepubads.g.doubleclick.net/tag'));
  assert.ok(!isBlockedUrl('https://www.youtube.com/watch?v=1'));
  assert.ok(!isBlockedUrl('https://notdoubleclick.net/'));
  assert.ok(!isBlockedUrl('https://www.google.com/'));
});

test('anuncios de vídeo por la forma de la URL, en cualquier dominio', () => {
  assert.ok(isBlockedUrl('https://cdn.player.example/ads/vast.xml?cb=1'));
  assert.ok(isBlockedUrl('https://x.example/serve?vast=https%3A%2F%2Fa'));
  assert.ok(isBlockedUrl('https://pubads.example/gampad/ads?iu=/1/x'));
  assert.ok(!isBlockedUrl('https://example.com/vastness/canvas.html'));
  assert.ok(!isBlockedUrl('https://example.com/blog/advertising-history'));
});

test('redes de anuncios de webs para adultos (y el script de ExoClick aunque cambie de dominio)', () => {
  for (const u of ['https://s.magsrv.com/splash.php', 'https://a.exdynsrv.com/x', 'https://ads.trafficjunky.net/ads',
    'https://cdn.tsyndicate.com/sdk/v1/p.js', 'https://poweredby.jads.co/js/jads.js', 'https://www.mybid.io/x',
    'https://go.mavrtracktor.com/?x', 'https://a.realsrv.com/ad-provider.js']) assert.ok(isBlockedUrl(u), u);
  assert.ok(isBlockedUrl('https://dominio-nuevo-rotado.example/ad-provider.js'));
  assert.ok(isBlockedUrl('https://web.example/js/popunder2.js'));
  assert.ok(!isBlockedUrl('https://web.example/js/provider.js'));
});

test('esquemas que abren otras apps', () => {
  assert.ok(isDisallowedScheme('intent://scan#Intent;end'));
  assert.ok(isDisallowedScheme(' market://details?id=x'));
  assert.ok(!isDisallowedScheme('https://example.com'));
});

test('normalizeInput', () => {
  assert.equal(normalizeInput('example.com'), 'https://example.com');
  assert.equal(normalizeInput('http://a.b/c'), 'http://a.b/c');
  assert.equal(normalizeInput('192.168.1.5:8080/x'), 'http://192.168.1.5:8080/x');
  assert.equal(normalizeInput('localhost'), 'http://localhost');
  assert.equal(normalizeInput('películas gratis'), SEARCH_URL + encodeURIComponent('películas gratis'));
  assert.equal(normalizeInput('   '), '');
});

test('displayUrl', () => {
  assert.equal(displayUrl('https://www.example.com/'), 'example.com');
});
