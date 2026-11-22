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
