import { mkdirSync, writeFileSync } from 'node:fs';

const W = 320;
const H = 240;
const RED = '#750014';
const GRAY = '#9a9ca1';
const MUTED = '#595b61';
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

const f = n => Math.round(n * 10) / 10;
const path = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
const dots = (points, fill, r = 2.6) => points.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="1"/>`).join('');
const text = (x, y, s, { fill = MUTED, anchor = 'start', size = 12, weight = 400 } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${s}</text>`;
const svg = (title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img"><title>${title}</title>${body}</svg>\n`;

function tax() {
  const x0 = 40, x1 = 300, y0 = 190, y1 = 30;
  const n = 10;
  const px = i => x0 + 14 + (x1 - x0 - 28) * i / (n - 1);
  const py = r => y0 - (y0 - y1) * (r - 0.7) / 0.6;
  const standard = Array.from({ length: n }, (_, i) => 1.24 - 0.44 * (i / (n - 1)) ** 0.8 + (i % 2 ? 0.012 : -0.01));
  const fair = Array.from({ length: n }, (_, i) => 1.0 + [0.03, -0.02, 0.02, -0.01, 0.015, -0.02, 0.01, -0.015, 0.02, -0.01][i]);
  const a = standard.map((r, i) => [px(i), py(r)]);
  const b = fair.map((r, i) => [px(i), py(r)]);
  return svg('Assessment ratio by home value: a standard model is regressive, a regressivity-penalized model is flat',
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${MUTED}" stroke-width="1"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1 - 6}" stroke="${MUTED}" stroke-width="1"/>` +
    `<path d="${path(a)}" fill="none" stroke="${GRAY}" stroke-width="2"/>` + dots(a, GRAY, 3.5) +
    `<path d="${path(b)}" fill="none" stroke="${RED}" stroke-width="2"/>` + dots(b, RED, 3.5) +
    text(a[1][0] + 4, a[1][1] - 12, 'standard model', { fill: MUTED, weight: 600 }) +
    text(x1 - 2, b[n - 1][1] - 16, 'with regressivity penalty', { fill: RED, anchor: 'end', weight: 600 }) +
    text(x0, y0 + 20, 'lower-valued', { size: 11 }) +
    text(x1, y0 + 20, 'higher-valued homes', { anchor: 'end', size: 11 }) +
    `<text transform="translate(${x0 - 14} ${y0}) rotate(-90)" fill="${MUTED}" font-size="11">assessed ÷ sale price →</text>`);
}

const out = new URL('../public/images/research/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('property-tax.svg', out), tax());
