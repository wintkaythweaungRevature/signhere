/*!
 * eSignly PDF Signer v1.0.0
 * MIT License © 2026 eSignly
 *
 * Depends on (loaded automatically from CDN):
 *   - PDF.js  3.11.174  (render PDF pages)
 *   - pdf-lib 1.17.1    (embed signature into PDF)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDFSigner = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── CDN sources ─────────────────────────────────────────────── */
  var PDFJS_SRC    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var PDFLIB_SRC   = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

  var STORAGE_KEY  = 'esignly_saved_signatures';

  /* ── Helpers ─────────────────────────────────────────────────── */
  function loadScript(src, cb) {
    if (document.querySelector('script[src="' + src + '"]')) { cb(); return; }
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = function () { console.error('[PDFSigner] Failed to load:', src); };
    document.head.appendChild(s);
  }

  function loadSavedSignatures() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function dataUrlToBytes(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'esignly-toast show';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 2200);
  }

  /* ── Icons ───────────────────────────────────────────────────── */
  var ICON_PDF = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>';

  /* ── State ───────────────────────────────────────────────────── */
  var state = {
    pdfDoc: null,         // pdf.js document
    pdfBytes: null,       // original ArrayBuffer (kept for pdf-lib)
    currentPage: 1,
    totalPages: 0,
    scale: 1,             // current render scale
    placements: [],       // { page, screenX, screenY, screenW, screenH, dataUrl, renderScale }
    activeSignature: null,
    placing: false,
  };

  var dom = {};

  /* ── Build UI ────────────────────────────────────────────────── */
  function buildUI(container) {
    container.innerHTML = '';
    container.className = 'esignly-pdf-signer';

    /* Upload area */
    var uploadArea = document.createElement('div');
    uploadArea.className = 'eps-upload-area';
    uploadArea.innerHTML =
      ICON_PDF +
      '<p>Drop a PDF here or <label class="eps-file-label">browse' +
        '<input type="file" accept=".pdf" class="eps-file-input"/>' +
      '</label></p>' +
      '<span class="eps-upload-hint">Your file stays on your device — never uploaded to any server</span>';

    /* Viewer (shown after PDF loaded) */
    var viewer = document.createElement('div');
    viewer.className = 'eps-viewer';
    viewer.style.display = 'none';

    /* -- Toolbar -- */
    var toolbar = document.createElement('div');
    toolbar.className = 'eps-toolbar';
    toolbar.innerHTML =
      '<div class="eps-page-nav">' +
        '<button class="eps-btn eps-btn-ghost eps-prev" title="Previous page">&#8592;</button>' +
        '<span class="eps-page-info">Page <b class="eps-page-num">1</b> of <b class="eps-page-total">1</b></span>' +
        '<button class="eps-btn eps-btn-ghost eps-next" title="Next page">&#8594;</button>' +
      '</div>' +
      '<button class="eps-btn eps-btn-ghost eps-change-pdf">&#128196; Change PDF</button>' +
      '<button class="eps-btn eps-btn-primary eps-download" disabled>&#8595; Download Signed PDF</button>';

    /* -- Canvas + overlay -- */
    var canvasWrap = document.createElement('div');
    canvasWrap.className = 'eps-canvas-wrap';

    var canvas = document.createElement('canvas');
    canvas.className = 'eps-canvas';

    var overlay = document.createElement('div');
    overlay.className = 'eps-overlay';
    overlay.title = 'Click to place your selected signature';

    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(overlay);

    /* -- Signature selector -- */
    var sigSelector = document.createElement('div');
    sigSelector.className = 'eps-sig-selector';
    sigSelector.innerHTML =
      '<div class="eps-sig-selector-title">1. Select a saved signature &nbsp;→&nbsp; 2. Click on the PDF to place it</div>' +
      '<div class="eps-sig-list"></div>';

    viewer.appendChild(toolbar);
    viewer.appendChild(canvasWrap);
    viewer.appendChild(sigSelector);

    container.appendChild(uploadArea);
    container.appendChild(viewer);

    /* Store refs */
    dom = {
      container, uploadArea, viewer,
      canvas, overlay, canvasWrap,
      sigList: sigSelector.querySelector('.eps-sig-list'),
      prevBtn: toolbar.querySelector('.eps-prev'),
      nextBtn: toolbar.querySelector('.eps-next'),
      pageNum: toolbar.querySelector('.eps-page-num'),
      pageTotal: toolbar.querySelector('.eps-page-total'),
      downloadBtn: toolbar.querySelector('.eps-download'),
      changePdfBtn: toolbar.querySelector('.eps-change-pdf'),
      fileInput: uploadArea.querySelector('.eps-file-input'),
    };

    bindEvents();
    renderSigSelector();
  }

  /* ── Event binding ───────────────────────────────────────────── */
  function bindEvents() {
    dom.fileInput.addEventListener('change', function (e) {
      if (e.target.files[0]) loadPDF(e.target.files[0]);
    });

    dom.uploadArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      dom.uploadArea.classList.add('drag-over');
    });
    dom.uploadArea.addEventListener('dragleave', function () {
      dom.uploadArea.classList.remove('drag-over');
    });
    dom.uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      dom.uploadArea.classList.remove('drag-over');
      var f = e.dataTransfer.files[0];
      if (f && f.type === 'application/pdf') loadPDF(f);
    });

    dom.prevBtn.addEventListener('click', function () {
      if (state.currentPage > 1) { state.currentPage--; renderPage(); }
    });
    dom.nextBtn.addEventListener('click', function () {
      if (state.currentPage < state.totalPages) { state.currentPage++; renderPage(); }
    });

    dom.changePdfBtn.addEventListener('click', function () {
      state.pdfDoc = null;
      state.placements = [];
      state.placing = false;
      state.activeSignature = null;
      dom.viewer.style.display = 'none';
      dom.uploadArea.style.display = '';
      dom.fileInput.value = '';
    });

    dom.downloadBtn.addEventListener('click', downloadSignedPDF);

    /* Click on overlay → place signature */
    dom.overlay.addEventListener('click', function (e) {
      if (!state.placing || !state.activeSignature) return;
      if (e.target.classList.contains('eps-placement') ||
          e.target.classList.contains('eps-placement-delete') ||
          e.target.classList.contains('eps-resize-handle') ||
          e.target.closest('.eps-placement')) return;

      var rect = dom.overlay.getBoundingClientRect();
      placeSignature(e.clientX - rect.left, e.clientY - rect.top);
    });
  }

  /* ── Load PDF ────────────────────────────────────────────────── */
  function loadPDF(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      state.pdfBytes = e.target.result.slice(0);
      var task = pdfjsLib.getDocument({ data: e.target.result });
      task.promise.then(function (pdf) {
        state.pdfDoc = pdf;
        state.totalPages = pdf.numPages;
        state.currentPage = 1;
        state.placements = [];
        dom.uploadArea.style.display = 'none';
        dom.viewer.style.display = '';
        renderPage();
        renderSigSelector();
        updateDownloadBtn();
      }).catch(function (err) {
        alert('Could not open PDF: ' + err.message);
      });
    };
    reader.readAsArrayBuffer(file);
  }

  /* ── Render page ─────────────────────────────────────────────── */
  function renderPage() {
    state.pdfDoc.getPage(state.currentPage).then(function (page) {
      var maxW = dom.canvasWrap.clientWidth - 2;
      var baseVp = page.getViewport({ scale: 1 });
      var scale = maxW / baseVp.width;
      var vp = page.getViewport({ scale: scale });

      state.scale = scale;

      dom.canvas.width  = vp.width;
      dom.canvas.height = vp.height;
      dom.overlay.style.width  = vp.width  + 'px';
      dom.overlay.style.height = vp.height + 'px';

      var ctx = dom.canvas.getContext('2d');
      ctx.clearRect(0, 0, vp.width, vp.height);

      page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        renderPlacements();
      });

      dom.pageNum.textContent   = state.currentPage;
      dom.pageTotal.textContent = state.totalPages;
      dom.prevBtn.disabled = state.currentPage <= 1;
      dom.nextBtn.disabled = state.currentPage >= state.totalPages;
    });
  }

  /* ── Signature selector ──────────────────────────────────────── */
  function renderSigSelector() {
    if (!dom.sigList) return;
    dom.sigList.innerHTML = '';
    var saved = loadSavedSignatures();

    if (saved.length === 0) {
      dom.sigList.innerHTML =
        '<span class="eps-sig-empty">No saved signatures yet — draw one in the <b>Draw Signature</b> tab first.</span>';
      state.placing = false;
      state.activeSignature = null;
      return;
    }

    saved.forEach(function (sig) {
      var item = document.createElement('div');
      item.className = 'eps-sig-item';
      item.title = 'Select then click on the PDF to place';

      var img = document.createElement('img');
      img.src = sig.dataUrl;
      img.alt = 'Saved signature';
      item.appendChild(img);

      item.addEventListener('click', function () {
        dom.sigList.querySelectorAll('.eps-sig-item').forEach(function (el) {
          el.classList.remove('active');
        });
        item.classList.add('active');
        state.activeSignature = sig.dataUrl;
        state.placing = true;
        dom.overlay.classList.add('placing');
        showToast('Click on the PDF to place your signature');
      });

      dom.sigList.appendChild(item);
    });
  }

  /* ── Place signature ─────────────────────────────────────────── */
  function placeSignature(screenX, screenY) {
    var w = 160, h = 64;
    var p = {
      page: state.currentPage,
      screenX: screenX - w / 2,
      screenY: screenY - h / 2,
      screenW: w,
      screenH: h,
      dataUrl: state.activeSignature,
      renderScale: state.scale,
    };
    state.placements.push(p);
    renderPlacements();
    updateDownloadBtn();
  }

  /* ── Render placement elements ───────────────────────────────── */
  function renderPlacements() {
    dom.overlay.querySelectorAll('.eps-placement').forEach(function (el) { el.remove(); });

    state.placements
      .filter(function (p) { return p.page === state.currentPage; })
      .forEach(function (p) {
        var el = document.createElement('div');
        el.className = 'eps-placement';
        el.style.cssText =
          'left:' + p.screenX + 'px;top:' + p.screenY + 'px;' +
          'width:' + p.screenW + 'px;height:' + p.screenH + 'px;';

        var img = document.createElement('img');
        img.src = p.dataUrl;
        img.draggable = false;

        var delBtn = document.createElement('button');
        delBtn.className = 'eps-placement-delete';
        delBtn.textContent = '✕';
        delBtn.title = 'Remove this signature';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          state.placements.splice(state.placements.indexOf(p), 1);
          el.remove();
          updateDownloadBtn();
        });

        var resizeHandle = document.createElement('div');
        resizeHandle.className = 'eps-resize-handle';
        resizeHandle.title = 'Drag to resize';

        el.appendChild(img);
        el.appendChild(delBtn);
        el.appendChild(resizeHandle);

        makeDraggable(el, p);
        makeResizable(el, p, resizeHandle);

        dom.overlay.appendChild(el);
      });
  }

  /* ── Drag ────────────────────────────────────────────────────── */
  function makeDraggable(el, p) {
    function onDragStart(clientX, clientY) {
      var startX = clientX, startY = clientY;
      var origX = p.screenX, origY = p.screenY;

      function onMove(cx, cy) {
        p.screenX = origX + (cx - startX);
        p.screenY = origY + (cy - startY);
        el.style.left = p.screenX + 'px';
        el.style.top  = p.screenY + 'px';
      }

      function cleanup() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', cleanup);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', cleanup);
      }

      function onMouseMove(e) { onMove(e.clientX, e.clientY); }
      function onTouchMove(e) { e.preventDefault(); var t = e.touches[0]; onMove(t.clientX, t.clientY); }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', cleanup);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', cleanup);
    }

    el.addEventListener('mousedown', function (e) {
      if (e.target === el.querySelector('.eps-placement-delete') ||
          e.target === el.querySelector('.eps-resize-handle')) return;
      e.preventDefault(); e.stopPropagation();
      onDragStart(e.clientX, e.clientY);
    });

    el.addEventListener('touchstart', function (e) {
      if (e.target === el.querySelector('.eps-placement-delete') ||
          e.target === el.querySelector('.eps-resize-handle')) return;
      e.stopPropagation();
      var t = e.touches[0];
      onDragStart(t.clientX, t.clientY);
    }, { passive: true });
  }

  /* ── Resize ──────────────────────────────────────────────────── */
  function makeResizable(el, p, handle) {
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var startX = e.clientX, startY = e.clientY;
      var startW = p.screenW, startH = p.screenH;

      function onMove(e) {
        p.screenW = Math.max(60, startW + (e.clientX - startX));
        p.screenH = Math.max(24, startH + (e.clientY - startY));
        el.style.width  = p.screenW + 'px';
        el.style.height = p.screenH + 'px';
      }
      function cleanup() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', cleanup);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', cleanup);
    });
  }

  /* ── Download signed PDF ─────────────────────────────────────── */
  async function downloadSignedPDF() {
    if (!state.pdfBytes || state.placements.length === 0) return;

    dom.downloadBtn.textContent = 'Processing…';
    dom.downloadBtn.disabled = true;

    try {
      var pdfDoc = await PDFLib.PDFDocument.load(state.pdfBytes);
      var pages  = pdfDoc.getPages();

      for (var i = 0; i < state.placements.length; i++) {
        var p    = state.placements[i];
        var page = pages[p.page - 1];
        if (!page) continue;

        var pageSize = page.getSize();
        var sc       = p.renderScale;

        /* Screen coords → PDF coords
           PDF origin is bottom-left; canvas origin is top-left */
        var xPdf = p.screenX / sc;
        var wPdf = p.screenW / sc;
        var hPdf = p.screenH / sc;
        var yPdf = pageSize.height - (p.screenY / sc) - hPdf;

        var pngBytes = dataUrlToBytes(p.dataUrl);
        var pngImage = await pdfDoc.embedPng(pngBytes);

        page.drawImage(pngImage, { x: xPdf, y: yPdf, width: wPdf, height: hPdf });
      }

      var signed = await pdfDoc.save();
      var blob   = new Blob([signed], { type: 'application/pdf' });
      var url    = URL.createObjectURL(blob);
      var a      = document.createElement('a');
      a.href = url;
      a.download = 'signed_' + Date.now() + '.pdf';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      showToast('Signed PDF downloaded!');
    } catch (err) {
      alert('Error: ' + err.message);
      console.error(err);
    } finally {
      dom.downloadBtn.textContent = '↓ Download Signed PDF';
      dom.downloadBtn.disabled = state.placements.length === 0;
    }
  }

  /* ── Sync download button ────────────────────────────────────── */
  function updateDownloadBtn() {
    dom.downloadBtn.disabled = state.placements.length === 0;
  }

  /* ── Public API ──────────────────────────────────────────────── */
  return {
    /**
     * Initialize the PDF signer.
     * @param {Object} options
     * @param {string|Element} options.target  CSS selector or DOM element
     */
    init: function (options) {
      options = options || {};
      var target    = options.target || '#esignly-pdf-signer';
      var container = typeof target === 'string'
        ? document.querySelector(target)
        : target;

      if (!container) { console.warn('[PDFSigner] Target not found:', target); return; }

      loadScript(PDFJS_SRC, function () {
        if (typeof pdfjsLib !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        }
        loadScript(PDFLIB_SRC, function () {
          buildUI(container);
        });
      });
    },

    /** Call this when new signatures have been saved, to refresh the selector. */
    refreshSignatures: function () {
      renderSigSelector();
    },
  };
}));
