# SVG to 3D Converter

Link to view: https://gamerdubz.github.io/svg-to-3d-converter/

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Privacy and Security

- All SVG parsing and 3D generation runs in the browser.
- No analytics, trackers, cookies, or external API calls are used.
- The bundled text font is local, so text generation does not call a third-party CDN.
- The app uses a restrictive Content Security Policy and disables unnecessary browser permissions in `index.html`.

## GitHub Pages

This project includes a `vite.config.js` with `base: './'` so the built site can be hosted on GitHub Pages.

Typical deploy flow:

```bash
npm install
npm run build
```

Then publish the contents of `dist/` with GitHub Pages.
