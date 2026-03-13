# eSignly – eSignature Widget

> Draw, save, and embed your eSignature anywhere — on any website or mobile phone.

---

## Features

- **Canvas drawing** — smooth pen input with mouse and finger/stylus touch
- **Pen customization** — choose color (dark, purple, blue, red) and thickness
- **Undo / Clear** — undo individual strokes or wipe the canvas
- **Save locally** — signatures stored in `localStorage`, persist across sessions
- **Load saved** — click any saved signature to reload it into the canvas
- **Download PNG** — export your signature as a transparent PNG image
- **Embeddable** — drop into any website with a single `<script>` tag
- **PWA / Mobile installable** — install as a standalone app on Android & iOS

---

## Quick Start

### 1. Open directly in browser

```
index.html
```

Or serve locally:

```bash
npx serve .
# then open http://localhost:3000
```

### 2. Install on your phone (PWA)

1. Open the hosted URL in **Chrome** (Android) or **Safari** (iOS)
2. Tap the browser menu → **"Add to Home Screen"**
3. eSignly will install as a native-like app with offline support

---

## Embed on any website

Add these two lines anywhere in your HTML:

```html
<!-- 1. Target container -->
<div id="esignly-widget"></div>

<!-- 2. Styles + Script -->
<link rel="stylesheet" href="https://yourdomain.com/widget.css" />
<script src="https://yourdomain.com/widget.js"></script>

<!-- 3. Initialize -->
<script>
  ESignly.init({ target: '#esignly-widget' });
</script>
```

### Init options

| Option   | Type                  | Default              | Description                               |
|----------|-----------------------|----------------------|-------------------------------------------|
| `target` | `string` or `Element` | `'#esignly-widget'`  | CSS selector or DOM element to mount into |
| `onSave` | `function`            | `null`               | Callback called with `dataUrl` when saved |

### Example with callback

```js
ESignly.init({
  target: '#my-sign-box',
  onSave: function (dataUrl) {
    // dataUrl is a base64 PNG — send to your server:
    fetch('/api/save-signature', {
      method: 'POST',
      body: JSON.stringify({ signature: dataUrl }),
      headers: { 'Content-Type': 'application/json' },
    });
  },
});
```

---

## Project Structure

```
signhere/
├── index.html      Demo / standalone page
├── widget.js       Core widget script (embeddable, zero dependencies)
├── widget.css      Widget styles
├── manifest.json   PWA manifest
├── sw.js           Service worker (offline support)
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## Browser Support

| Browser          | Drawing | Touch | PWA Install  |
|------------------|---------|-------|--------------|
| Chrome 80+       | yes     | yes   | yes          |
| Firefox 75+      | yes     | yes   | yes          |
| Safari 14+ (iOS) | yes     | yes   | yes (A2HS)   |
| Edge 80+         | yes     | yes   | yes          |

---

## License

MIT License © 2026 Wint Kay Thwe Aung
