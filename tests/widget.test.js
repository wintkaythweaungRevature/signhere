'use strict';

/**
 * eSignly Widget Tests
 *
 * Environment: Jest + jsdom + jest-canvas-mock
 *
 * The widget uses a UMD pattern so requiring it in Node returns the ESignly
 * object directly (the `module.exports` branch of the UMD wrapper).
 */

const ESignly = require('../widget');

/* ─── helpers ──────────────────────────────────────────────────────────────── */

/** Reset DOM and localStorage before every test */
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="esignly-widget"></div>';
});

/** Fire a mousedown on the canvas to start a stroke (makes isEmpty = false) */
function startStroke(canvas, x = 10, y = 10) {
  canvas.dispatchEvent(
    new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }),
  );
}

/* ─── Initialisation ────────────────────────────────────────────────────────── */

describe('ESignly.init()', () => {
  test('returns null when the target element is not found', () => {
    expect(ESignly.init({ target: '#does-not-exist' })).toBeNull();
  });

  test('returns a widget instance when given a valid CSS selector', () => {
    const inst = ESignly.init({ target: '#esignly-widget' });
    expect(inst).not.toBeNull();
  });

  test('returns a widget instance when given a DOM element directly', () => {
    const el = document.querySelector('#esignly-widget');
    const inst = ESignly.init({ target: el });
    expect(inst).not.toBeNull();
  });

  test('uses "#esignly-widget" as the default target', () => {
    // Default target must already exist in the DOM (set in beforeEach)
    expect(() => ESignly.init()).not.toThrow();
  });

  test('accepts an onSave callback without throwing', () => {
    const onSave = jest.fn();
    expect(() => ESignly.init({ target: '#esignly-widget', onSave })).not.toThrow();
  });
});

/* ─── DOM structure ─────────────────────────────────────────────────────────── */

describe('Mounted widget DOM structure', () => {
  beforeEach(() => ESignly.init({ target: '#esignly-widget' }));

  test('mounts the .esignly-widget container', () => {
    expect(document.querySelector('.esignly-widget')).not.toBeNull();
  });

  test('renders a <canvas> element', () => {
    expect(document.querySelector('.esignly-canvas')).not.toBeNull();
  });

  test('renders exactly 4 pen-colour swatches', () => {
    expect(document.querySelectorAll('.esignly-color-swatch')).toHaveLength(4);
  });

  test('renders a pen-thickness range input', () => {
    const slider = document.querySelector('.esignly-thickness');
    expect(slider).not.toBeNull();
    expect(slider.type).toBe('range');
  });

  test('renders the toolbar', () => {
    expect(document.querySelector('.esignly-toolbar')).not.toBeNull();
  });

  test('renders the saved-signatures panel', () => {
    expect(document.querySelector('.esignly-saved-panel')).not.toBeNull();
  });

  test('shows an empty-state message when no signatures are stored', () => {
    expect(document.querySelector('.esignly-saved-empty')).not.toBeNull();
  });

  test('instance exposes a getDataUrl() method', () => {
    const inst = ESignly.init({ target: '#esignly-widget' });
    expect(typeof inst.getDataUrl).toBe('function');
  });

  test('instance exposes a canvas property', () => {
    const inst = ESignly.init({ target: '#esignly-widget' });
    expect(inst.canvas instanceof HTMLCanvasElement).toBe(true);
  });
});

/* ─── Initial button states ─────────────────────────────────────────────────── */

describe('Button states on an empty canvas', () => {
  beforeEach(() => ESignly.init({ target: '#esignly-widget' }));

  test('Undo button is disabled', () => {
    expect(document.querySelector('[title="Undo last stroke"]').disabled).toBe(true);
  });

  test('Clear button is disabled', () => {
    expect(document.querySelector('[title="Clear signature"]').disabled).toBe(true);
  });

  test('Download button is disabled', () => {
    expect(document.querySelector('[title="Download as PNG"]').disabled).toBe(true);
  });

  test('Save button is disabled', () => {
    expect(document.querySelector('[title="Save signature"]').disabled).toBe(true);
  });
});

/* ─── Drawing ────────────────────────────────────────────────────────────────── */

describe('After a drawing stroke begins', () => {
  let canvas;

  beforeEach(() => {
    ESignly.init({ target: '#esignly-widget' });
    canvas = document.querySelector('.esignly-canvas');
    startStroke(canvas);
  });

  test('Undo button becomes enabled', () => {
    expect(document.querySelector('[title="Undo last stroke"]').disabled).toBe(false);
  });

  test('Clear button becomes enabled', () => {
    expect(document.querySelector('[title="Clear signature"]').disabled).toBe(false);
  });

  test('Save button becomes enabled', () => {
    expect(document.querySelector('[title="Save signature"]').disabled).toBe(false);
  });

  test('Download button becomes enabled', () => {
    expect(document.querySelector('[title="Download as PNG"]').disabled).toBe(false);
  });
});

/* ─── Undo / Clear ───────────────────────────────────────────────────────────── */

describe('Undo', () => {
  let canvas;

  beforeEach(() => {
    ESignly.init({ target: '#esignly-widget' });
    canvas = document.querySelector('.esignly-canvas');
  });

  test('undoing the only stroke disables the Undo button again', () => {
    startStroke(canvas);
    document.querySelector('[title="Undo last stroke"]').click();
    expect(document.querySelector('[title="Undo last stroke"]').disabled).toBe(true);
  });

  test('undoing the only stroke disables the Save button again', () => {
    startStroke(canvas);
    document.querySelector('[title="Undo last stroke"]').click();
    expect(document.querySelector('[title="Save signature"]').disabled).toBe(true);
  });
});

describe('Clear', () => {
  let canvas;

  beforeEach(() => {
    ESignly.init({ target: '#esignly-widget' });
    canvas = document.querySelector('.esignly-canvas');
    startStroke(canvas);
  });

  test('Clear button resets all action buttons to disabled', () => {
    document.querySelector('[title="Clear signature"]').click();
    expect(document.querySelector('[title="Clear signature"]').disabled).toBe(true);
    expect(document.querySelector('[title="Undo last stroke"]').disabled).toBe(true);
    expect(document.querySelector('[title="Save signature"]').disabled).toBe(true);
  });
});

/* ─── Save & persist ─────────────────────────────────────────────────────────── */

describe('Saving a signature', () => {
  let canvas;

  beforeEach(() => {
    ESignly.init({ target: '#esignly-widget' });
    canvas = document.querySelector('.esignly-canvas');
    startStroke(canvas);
    document.querySelector('[title="Save signature"]').click();
  });

  test('stores one entry in localStorage under esignly_saved_signatures', () => {
    const stored = JSON.parse(localStorage.getItem('esignly_saved_signatures') || '[]');
    expect(stored).toHaveLength(1);
  });

  test('stored entry has id and dataUrl fields', () => {
    const stored = JSON.parse(localStorage.getItem('esignly_saved_signatures'));
    expect(stored[0]).toHaveProperty('id');
    expect(stored[0]).toHaveProperty('dataUrl');
  });

  test('saved item appears in the saved-signatures list', () => {
    expect(document.querySelector('.esignly-saved-item')).not.toBeNull();
  });

  test('the empty-state message is no longer shown', () => {
    expect(document.querySelector('.esignly-saved-empty')).toBeNull();
  });

  test('fires the onSave callback with a string dataUrl', () => {
    document.body.innerHTML = '<div id="w2"></div>';
    const onSave = jest.fn();
    ESignly.init({ target: '#w2', onSave });
    const c = document.querySelector('.esignly-canvas');
    startStroke(c);
    document.querySelector('[title="Save signature"]').click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(typeof onSave.mock.calls[0][0]).toBe('string');
  });
});

/* ─── Delete saved signature ─────────────────────────────────────────────────── */

describe('Deleting a saved signature', () => {
  let canvas;

  beforeEach(() => {
    ESignly.init({ target: '#esignly-widget' });
    canvas = document.querySelector('.esignly-canvas');
    startStroke(canvas);
    document.querySelector('[title="Save signature"]').click();
  });

  test('removes the entry from localStorage', () => {
    document.querySelector('.esignly-saved-delete').click();
    const stored = JSON.parse(localStorage.getItem('esignly_saved_signatures') || '[]');
    expect(stored).toHaveLength(0);
  });

  test('removes the item from the DOM', () => {
    document.querySelector('.esignly-saved-delete').click();
    expect(document.querySelector('.esignly-saved-item')).toBeNull();
  });

  test('brings back the empty-state message', () => {
    document.querySelector('.esignly-saved-delete').click();
    expect(document.querySelector('.esignly-saved-empty')).not.toBeNull();
  });
});

/* ─── Session persistence ─────────────────────────────────────────────────────── */

describe('Pre-existing localStorage data', () => {
  test('signatures saved in a previous session are shown on mount', () => {
    localStorage.setItem(
      'esignly_saved_signatures',
      JSON.stringify([{ id: 1, dataUrl: 'data:image/png;base64,abc' }]),
    );
    ESignly.init({ target: '#esignly-widget' });
    expect(document.querySelector('.esignly-saved-item')).not.toBeNull();
  });

  test('empty-state message is hidden when signatures exist', () => {
    localStorage.setItem(
      'esignly_saved_signatures',
      JSON.stringify([{ id: 1, dataUrl: 'data:image/png;base64,abc' }]),
    );
    ESignly.init({ target: '#esignly-widget' });
    expect(document.querySelector('.esignly-saved-empty')).toBeNull();
  });

  test('caps stored signatures at 20 after adding a new one', () => {
    // Pre-fill with 20 signatures
    const existing = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      dataUrl: 'data:image/png;base64,abc',
    }));
    localStorage.setItem('esignly_saved_signatures', JSON.stringify(existing));

    ESignly.init({ target: '#esignly-widget' });
    const canvas = document.querySelector('.esignly-canvas');
    startStroke(canvas);
    document.querySelector('[title="Save signature"]').click();

    const stored = JSON.parse(localStorage.getItem('esignly_saved_signatures') || '[]');
    expect(stored).toHaveLength(20);
  });

  test('corrupted localStorage is handled gracefully', () => {
    localStorage.setItem('esignly_saved_signatures', 'not valid json{{');
    expect(() => ESignly.init({ target: '#esignly-widget' })).not.toThrow();
  });
});

/* ─── Pen controls ───────────────────────────────────────────────────────────── */

describe('Pen controls', () => {
  beforeEach(() => ESignly.init({ target: '#esignly-widget' }));

  test('first colour swatch is active by default', () => {
    const first = document.querySelector('.esignly-color-swatch');
    expect(first.classList.contains('active')).toBe(true);
  });

  test('clicking another swatch marks it active and deactivates others', () => {
    const swatches = document.querySelectorAll('.esignly-color-swatch');
    swatches[2].click();
    expect(swatches[2].classList.contains('active')).toBe(true);
    expect(swatches[0].classList.contains('active')).toBe(false);
  });

  test('thickness slider initial value is 2.5', () => {
    const slider = document.querySelector('.esignly-thickness');
    expect(parseFloat(slider.value)).toBe(2.5);
  });

  test('each swatch has an aria-label', () => {
    const swatches = document.querySelectorAll('.esignly-color-swatch');
    swatches.forEach(sw => {
      expect(sw.getAttribute('aria-label')).toMatch(/pen color/i);
    });
  });
});
