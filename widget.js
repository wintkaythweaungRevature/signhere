/*!
 * eSignly eSignature Widget v1.0.0
 * MIT License © 2026 eSignly
 * https://github.com/wintkaythweaungRevature/signhere
 *
 * Usage:
 *   ESignly.init({ target: '#my-container' });
 *   ESignly.init({ target: '#my-container', onSave: (dataUrl) => console.log(dataUrl) });
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ESignly = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ────────────────────────────────────────
     Constants
  ──────────────────────────────────────── */
  var STORAGE_KEY = 'esignly_saved_signatures';
  var CANVAS_HEIGHT = 220;
  var PEN_COLORS = [
    { color: '#1e293b', label: 'Dark' },
    { color: '#6c63ff', label: 'Purple' },
    { color: '#2563eb', label: 'Blue' },
    { color: '#ef4444', label: 'Red' },
  ];

  /* ────────────────────────────────────────
     SVG Icons (inline, no external deps)
  ──────────────────────────────────────── */
  var ICONS = {
    undo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13A9 9 0 1 0 6 6.3L3 13"/></svg>',
    clear: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
    save: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    pen: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  };

  /* ────────────────────────────────────────
     Storage helpers
  ──────────────────────────────────────── */
  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function persistSaved(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) { /* storage full – ignore */ }
  }

  /* ────────────────────────────────────────
     Toast helper
  ──────────────────────────────────────── */
  var _toastEl = null;
  var _toastTimer = null;

  function showToast(msg) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.className = 'esignly-toast';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      _toastEl.classList.remove('show');
    }, 2200);
  }

  /* ────────────────────────────────────────
     Widget factory
  ──────────────────────────────────────── */
  function createWidget(options) {
    options = options || {};
    var onSave = typeof options.onSave === 'function' ? options.onSave : null;
    var penColor = PEN_COLORS[0].color;
    var penThickness = 2.5;
    var drawing = false;
    var lastX = 0, lastY = 0;
    var strokes = [];        // array of ImageData snapshots for undo
    var isEmpty = true;

    /* ---- Build DOM ---- */
    var widget = document.createElement('div');
    widget.className = 'esignly-widget';

    /* Header */
    var header = document.createElement('div');
    header.className = 'esignly-widget-header';

    var title = document.createElement('span');
    title.className = 'esignly-widget-title';
    title.textContent = 'Your Signature';

    var penControls = document.createElement('div');
    penControls.className = 'esignly-pen-controls';

    var penLabel = document.createElement('span');
    penLabel.className = 'esignly-pen-label';
    penLabel.textContent = 'Pen:';
    penControls.appendChild(penLabel);

    var swatches = [];
    PEN_COLORS.forEach(function (pc, i) {
      var sw = document.createElement('button');
      sw.className = 'esignly-color-swatch' + (i === 0 ? ' active' : '');
      sw.style.background = pc.color;
      sw.title = pc.label;
      sw.setAttribute('aria-label', 'Pen color: ' + pc.label);
      sw.addEventListener('click', function () {
        penColor = pc.color;
        swatches.forEach(function (s) { s.classList.remove('active'); });
        sw.classList.add('active');
      });
      swatches.push(sw);
      penControls.appendChild(sw);
    });

    var thickSlider = document.createElement('input');
    thickSlider.type = 'range';
    thickSlider.min = '1';
    thickSlider.max = '8';
    thickSlider.step = '0.5';
    thickSlider.value = String(penThickness);
    thickSlider.className = 'esignly-thickness';
    thickSlider.title = 'Pen thickness';
    thickSlider.setAttribute('aria-label', 'Pen thickness');
    thickSlider.addEventListener('input', function () {
      penThickness = parseFloat(thickSlider.value);
    });
    penControls.appendChild(thickSlider);

    header.appendChild(title);
    header.appendChild(penControls);

    /* Canvas */
    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'esignly-canvas-wrap';

    var canvas = document.createElement('canvas');
    canvas.className = 'esignly-canvas';
    canvas.setAttribute('aria-label', 'Signature drawing area');
    canvas.setAttribute('role', 'img');

    var placeholder = document.createElement('div');
    placeholder.className = 'esignly-placeholder';
    placeholder.innerHTML = ICONS.pen + '<p>Draw your signature here</p>';

    var signLine = document.createElement('div');
    signLine.className = 'esignly-canvas-line';

    var signLineLabel = document.createElement('div');
    signLineLabel.className = 'esignly-canvas-line-label';
    signLineLabel.textContent = 'Sign here';

    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(placeholder);
    canvasWrap.appendChild(signLine);
    canvasWrap.appendChild(signLineLabel);

    /* Toolbar */
    var toolbar = document.createElement('div');
    toolbar.className = 'esignly-toolbar';

    var btnUndo = mkBtn('ghost', ICONS.undo + 'Undo', 'Undo last stroke');
    var btnClear = mkBtn('danger', ICONS.clear + 'Clear', 'Clear signature');
    var btnDownload = mkBtn('ghost', ICONS.download + 'Download', 'Download as PNG');
    var btnSave = mkBtn('primary', ICONS.save + 'Save Signature', 'Save signature');

    toolbar.appendChild(btnUndo);
    toolbar.appendChild(btnClear);
    toolbar.appendChild(btnDownload);
    toolbar.appendChild(btnSave);

    /* Saved panel */
    var savedPanel = document.createElement('div');
    savedPanel.className = 'esignly-saved-panel';

    var savedTitle = document.createElement('div');
    savedTitle.className = 'esignly-saved-title';
    savedTitle.textContent = 'Saved Signatures';

    var savedList = document.createElement('div');
    savedList.className = 'esignly-saved-list';

    savedPanel.appendChild(savedTitle);
    savedPanel.appendChild(savedList);

    /* Assemble */
    widget.appendChild(header);
    widget.appendChild(canvasWrap);
    widget.appendChild(toolbar);
    widget.appendChild(savedPanel);

    /* ---- Canvas setup ---- */
    var ctx;

    function initCanvas() {
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var w = rect.width || canvasWrap.clientWidth || 600;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(CANVAS_HEIGHT * dpr);
      canvas.style.height = CANVAS_HEIGHT + 'px';
      ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokes = [];
      isEmpty = true;
      syncButtons();
    }

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var src = e.touches ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (canvas.width / rect.width / (window.devicePixelRatio || 1)),
        y: (src.clientY - rect.top) * (canvas.height / rect.height / (window.devicePixelRatio || 1)),
      };
    }

    function saveStroke() {
      var dpr = window.devicePixelRatio || 1;
      strokes.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (strokes.length > 50) strokes.shift(); // cap memory
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      var pos = getPos(e);
      lastX = pos.x; lastY = pos.y;
      saveStroke();
      // Draw a dot for taps/clicks
      ctx.beginPath();
      ctx.arc(lastX, lastY, penThickness / 2, 0, Math.PI * 2);
      ctx.fillStyle = penColor;
      ctx.fill();
      isEmpty = false;
      placeholder.style.opacity = '0';
      syncButtons();
    }

    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      var pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penThickness;
      ctx.stroke();
      lastX = pos.x; lastY = pos.y;
    }

    function endDraw(e) {
      if (!drawing) return;
      drawing = false;
    }

    /* Mouse */
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);

    /* Touch */
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', endDraw);
    canvas.addEventListener('touchcancel', endDraw);

    /* ---- Buttons ---- */
    function syncButtons() {
      btnUndo.disabled = strokes.length === 0;
      btnClear.disabled = isEmpty;
      btnDownload.disabled = isEmpty;
      btnSave.disabled = isEmpty;
    }

    btnUndo.addEventListener('click', function () {
      if (strokes.length === 0) return;
      var prev = strokes.pop();
      ctx.putImageData(prev, 0, 0);
      if (strokes.length === 0) {
        isEmpty = true;
        placeholder.style.opacity = '1';
      }
      syncButtons();
    });

    btnClear.addEventListener('click', function () {
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      strokes = [];
      isEmpty = true;
      placeholder.style.opacity = '1';
      syncButtons();
    });

    btnDownload.addEventListener('click', function () {
      var link = document.createElement('a');
      link.download = 'signature_' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    btnSave.addEventListener('click', function () {
      if (isEmpty) return;
      var dataUrl = canvas.toDataURL('image/png');
      var saved = loadSaved();
      saved.unshift({ id: Date.now(), dataUrl: dataUrl });
      if (saved.length > 20) saved = saved.slice(0, 20); // keep last 20
      persistSaved(saved);
      renderSaved();
      showToast('Signature saved!');
      if (onSave) onSave(dataUrl);
    });

    /* ---- Saved Signatures ---- */
    function renderSaved() {
      savedList.innerHTML = '';
      var saved = loadSaved();
      if (saved.length === 0) {
        var empty = document.createElement('span');
        empty.className = 'esignly-saved-empty';
        empty.textContent = 'No saved signatures yet.';
        savedList.appendChild(empty);
        return;
      }
      saved.forEach(function (sig) {
        var item = document.createElement('div');
        item.className = 'esignly-saved-item';
        item.title = 'Click to load';

        var img = document.createElement('img');
        img.src = sig.dataUrl;
        img.alt = 'Saved signature';

        var delBtn = document.createElement('button');
        delBtn.className = 'esignly-saved-delete';
        delBtn.textContent = '✕';
        delBtn.title = 'Delete';
        delBtn.setAttribute('aria-label', 'Delete saved signature');
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var list = loadSaved().filter(function (s) { return s.id !== sig.id; });
          persistSaved(list);
          renderSaved();
          showToast('Signature deleted');
        });

        item.appendChild(img);
        item.appendChild(delBtn);

        // Click to load into canvas
        item.addEventListener('click', function () {
          var image = new Image();
          image.onload = function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
            strokes = [];
            isEmpty = false;
            placeholder.style.opacity = '0';
            syncButtons();
          };
          image.src = sig.dataUrl;
          showToast('Signature loaded');
        });

        savedList.appendChild(item);
      });
    }

    /* ---- Resize observer ---- */
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        // Capture current content before resize
        var snapshot = isEmpty ? null : canvas.toDataURL('image/png');
        initCanvas();
        if (snapshot) {
          var img = new Image();
          img.onload = function () {
            ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
            isEmpty = false;
            placeholder.style.opacity = '0';
            syncButtons();
          };
          img.src = snapshot;
        }
      });
      ro.observe(canvasWrap);
    }

    /* ---- Initial render ---- */
    // Must be in DOM first so getBoundingClientRect works
    function mount(container) {
      container.appendChild(widget);
      initCanvas();
      renderSaved();
      syncButtons();
    }

    return { mount: mount, canvas: canvas, getDataUrl: function () { return canvas.toDataURL('image/png'); } };
  }

  /* ────────────────────────────────────────
     Helper: make a button
  ──────────────────────────────────────── */
  function mkBtn(variant, html, title) {
    var btn = document.createElement('button');
    btn.className = 'esignly-btn esignly-btn-' + variant;
    btn.innerHTML = html;
    btn.title = title;
    btn.disabled = true;
    return btn;
  }

  /* ────────────────────────────────────────
     Public API
  ──────────────────────────────────────── */
  return {
    /**
     * Initialize the widget.
     * @param {Object} options
     * @param {string|Element} options.target  - CSS selector or DOM element
     * @param {Function}       options.onSave  - callback(dataUrl) when saved
     */
    init: function (options) {
      options = options || {};
      var target = options.target || '#esignly-widget';
      var container = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (!container) {
        console.warn('[eSignly] Target not found:', target);
        return null;
      }

      var instance = createWidget(options);
      instance.mount(container);
      return instance;
    },
  };
}));
