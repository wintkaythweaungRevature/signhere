'use strict';

/**
 * Service Worker Tests
 *
 * Service workers cannot run directly in Jest (no browser SW scope), so we
 * test the source code as a text file — verifying that the expected event
 * handlers and cache assets are present.
 */

const fs   = require('fs');
const path = require('path');

const swSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

/* ─── Cache config ───────────────────────────────────────────────────────────── */

describe('Service worker cache configuration', () => {
  test('defines a CACHE_NAME string', () => {
    expect(swSource).toMatch(/var CACHE_NAME\s*=\s*['"][^'"]+['"]/);
  });

  test('CACHE_NAME starts with "esignly-"', () => {
    const match = swSource.match(/var CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/^esignly-/);
  });

  test('pre-caches /index.html', () => {
    expect(swSource).toContain("'/index.html'");
  });

  test('pre-caches /widget.js', () => {
    expect(swSource).toContain("'/widget.js'");
  });

  test('pre-caches /widget.css', () => {
    expect(swSource).toContain("'/widget.css'");
  });

  test('pre-caches /pdf-signer.js', () => {
    expect(swSource).toContain("'/pdf-signer.js'");
  });

  test('pre-caches /manifest.json', () => {
    expect(swSource).toContain("'/manifest.json'");
  });

  test('pre-caches /icons/icon-192.png', () => {
    expect(swSource).toContain("'/icons/icon-192.png'");
  });

  test('pre-caches /icons/icon-512.png', () => {
    expect(swSource).toContain("'/icons/icon-512.png'");
  });
});

/* ─── Event handlers ─────────────────────────────────────────────────────────── */

describe('Service worker event handlers', () => {
  test('registers an install handler', () => {
    expect(swSource).toContain("addEventListener('install'");
  });

  test('install handler calls skipWaiting', () => {
    expect(swSource).toContain('self.skipWaiting()');
  });

  test('registers an activate handler', () => {
    expect(swSource).toContain("addEventListener('activate'");
  });

  test('activate handler deletes stale caches', () => {
    expect(swSource).toContain('caches.delete');
  });

  test('activate handler calls clients.claim', () => {
    expect(swSource).toContain('self.clients.claim()');
  });

  test('registers a fetch handler', () => {
    expect(swSource).toContain("addEventListener('fetch'");
  });
});

/* ─── Fetch strategy ─────────────────────────────────────────────────────────── */

describe('Fetch caching strategy', () => {
  test('uses cache-first by checking caches.match before network', () => {
    expect(swSource).toContain('caches.match');
  });

  test('falls back to network when cache misses', () => {
    expect(swSource).toContain('fetch(e.request)');
  });

  test('only handles GET requests (skips others)', () => {
    expect(swSource).toContain("e.request.method !== 'GET'");
  });

  test('only handles same-origin requests', () => {
    expect(swSource).toContain('location.origin');
  });
});
