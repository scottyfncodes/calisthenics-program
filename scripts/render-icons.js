// Renders icons/icon.svg to the PNG sizes the page and manifest reference.
// Run after editing the SVG: node scripts/render-icons.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('icons/icon.svg', 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, pad] of [['icon-512.png',512,0],['icon-192.png',192,0],['apple-touch-icon.png',180,0],['icon-maskable-512.png',512,0.1]]) {
    await p.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - 2*pad));
    await p.setContent(`<body style="margin:0;background:#182420;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
    await p.screenshot({ path: 'icons/' + name, omitBackground: false });
  }
  await b.close();
})();
