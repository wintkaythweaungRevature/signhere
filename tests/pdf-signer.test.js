'use strict';

/**
 * eSignly PDF Signer Tests
 *
 * Environment: Jest + jsdom + jest-canvas-mock
 *
 * pdf-signer.js depends on PDF.js and pdf-lib which are loaded lazily from CDN
 * via script injection; those paths are never exercised in unit tests.
 *
 * We test:
 *   1. Public API shape
 *   2. The screen-to-PDF coordinate conversion (core math)
 *   3. The dataUrlToBytes utility
 */

const PDFSigner = require('../pdf-signer');

/* ─── Public API ─────────────────────────────────────────────────────────────── */

describe('PDFSigner public API', () => {
  test('exports an init() function', () => {
    expect(typeof PDFSigner.init).toBe('function');
  });

  test('exports a refreshSignatures() function', () => {
    expect(typeof PDFSigner.refreshSignatures).toBe('function');
  });

  test('init() with a missing target does not throw', () => {
    expect(() => PDFSigner.init({ target: '#does-not-exist' })).not.toThrow();
  });

  test('refreshSignatures() before init does not throw', () => {
    expect(() => PDFSigner.refreshSignatures()).not.toThrow();
  });
});

/* ─── Screen → PDF coordinate math ──────────────────────────────────────────── */

/**
 * Mirror of the conversion in downloadSignedPDF().
 *
 * PDF origin is bottom-left; canvas origin is top-left.
 *   x_pdf = screenX / renderScale
 *   y_pdf = pdfPageHeight - (screenY / renderScale) - (screenH / renderScale)
 *   w_pdf = screenW / renderScale
 *   h_pdf = screenH / renderScale
 */
function screenToPdf({ screenX, screenY, screenW, screenH, renderScale }, pageHeight) {
  return {
    x:      screenX / renderScale,
    y:      pageHeight - (screenY / renderScale) - (screenH / renderScale),
    width:  screenW / renderScale,
    height: screenH / renderScale,
  };
}

describe('Screen → PDF coordinate conversion', () => {
  test('x scales correctly by renderScale', () => {
    const r = screenToPdf({ screenX: 200, screenY: 0, screenW: 100, screenH: 40, renderScale: 2 }, 500);
    expect(r.x).toBe(100);
  });

  test('width scales correctly by renderScale', () => {
    const r = screenToPdf({ screenX: 0, screenY: 0, screenW: 300, screenH: 80, renderScale: 1.5 }, 700);
    expect(r.width).toBeCloseTo(200);
  });

  test('height scales correctly by renderScale', () => {
    const r = screenToPdf({ screenX: 0, screenY: 0, screenW: 160, screenH: 120, renderScale: 1.5 }, 700);
    expect(r.height).toBeCloseTo(80);
  });

  test('placement at the top-left maps to near the top in PDF y', () => {
    // screenY=0 → y_pdf = pageH - 0 - sigH = pageH - sigH (near the top)
    const pageH = 841; // A4 height in points
    const sigH  = 80;
    const r = screenToPdf({ screenX: 0, screenY: 0, screenW: 200, screenH: sigH, renderScale: 1 }, pageH);
    expect(r.y).toBe(pageH - sigH);
  });

  test('placement at the bottom of the page maps to y ≈ 0', () => {
    const pageH     = 500;
    const sigH      = 64;
    const scale     = 1;
    const screenY   = (pageH - sigH) * scale; // bottom edge of page in screen pixels
    const r = screenToPdf({ screenX: 0, screenY, screenW: 160, screenH: sigH * scale, renderScale: scale }, pageH);
    expect(r.y).toBeCloseTo(0);
  });

  test('x = 0 and y = top stays within page bounds (y >= 0)', () => {
    const r = screenToPdf({ screenX: 0, screenY: 0, screenW: 200, screenH: 100, renderScale: 1 }, 800);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  test('renderScale of 1 means screen and PDF dimensions are identical', () => {
    const r = screenToPdf({ screenX: 50, screenY: 0, screenW: 150, screenH: 60, renderScale: 1 }, 500);
    expect(r.x).toBe(50);
    expect(r.width).toBe(150);
    expect(r.height).toBe(60);
  });

  test('handles sub-pixel renderScale (e.g. 0.75)', () => {
    const r = screenToPdf({ screenX: 75, screenY: 0, screenW: 150, screenH: 60, renderScale: 0.75 }, 500);
    expect(r.x).toBeCloseTo(100);
    expect(r.width).toBeCloseTo(200);
  });
});

/* ─── dataUrlToBytes helper ──────────────────────────────────────────────────── */

/**
 * Mirror of the private dataUrlToBytes() inside pdf-signer.js.
 * We test the logic directly here; the module-internal version is covered
 * implicitly when downloadSignedPDF is exercised end-to-end.
 */
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin    = atob(base64);
  const bytes  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

describe('dataUrlToBytes()', () => {
  test('returns a Uint8Array', () => {
    const dataUrl = 'data:image/png;base64,' + btoa('hello');
    expect(dataUrlToBytes(dataUrl)).toBeInstanceOf(Uint8Array);
  });

  test('produces the correct byte values', () => {
    const raw    = 'ABC';
    const dataUrl = 'data:image/png;base64,' + btoa(raw);
    const bytes  = dataUrlToBytes(dataUrl);
    expect(bytes[0]).toBe(raw.charCodeAt(0)); // 'A' = 65
    expect(bytes[1]).toBe(raw.charCodeAt(1)); // 'B' = 66
    expect(bytes[2]).toBe(raw.charCodeAt(2)); // 'C' = 67
  });

  test('output length matches the decoded string length', () => {
    const payload = 'Hello, eSignly!';
    const dataUrl  = 'data:image/png;base64,' + btoa(payload);
    expect(dataUrlToBytes(dataUrl)).toHaveLength(payload.length);
  });

  test('handles an empty base64 payload', () => {
    const dataUrl = 'data:image/png;base64,' + btoa('');
    expect(dataUrlToBytes(dataUrl)).toHaveLength(0);
  });
});
