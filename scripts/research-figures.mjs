import { mkdirSync, writeFileSync } from 'node:fs';

const W = 320;
const H = 240;
const RED = '#750014';
const GRAY = '#9a9ca1';
const INK = '#26272b';
const MUTED = '#595b61';
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

const f = n => Math.round(n * 10) / 10;
const path = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
const dots = (points, fill, r = 2.6) => points.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="1"/>`).join('');
const text = (x, y, s, { fill = MUTED, anchor = 'start', size = 12, weight = 400 } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${s}</text>`;
const svg = (title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img"><title>${title}</title>${body}</svg>\n`;

function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function ode() {
  const center = [160, 118];
  const r0 = 22;
  const step = 0.3;
  const growth = Math.sqrt(1 + step * step);
  const angle = Math.atan(step);
  const n = 30;
  const iterates = Array.from({ length: n }, (_, k) => [center[0] + r0 * growth ** k * Math.cos(k * angle), center[1] - r0 * growth ** k * Math.sin(k * angle)]);
  const flow = Array.from({ length: (n - 1) * 8 + 1 }, (_, j) => {
    const t = j / 8;
    return [center[0] + r0 * growth ** t * Math.cos(t * angle), center[1] - r0 * growth ** t * Math.sin(t * angle)];
  });
  return svg('Gradient descent-ascent iterates spiral outward while the classical ODE predicts a closed orbit',
    `<circle cx="${center[0]}" cy="${center[1]}" r="${r0}" fill="none" stroke="${GRAY}" stroke-width="1.5" stroke-dasharray="4 3"/>` +
    `<path d="${path(flow)}" fill="none" stroke="${RED}" stroke-width="1.2" opacity=".55"/>` + dots(iterates, RED, 2.6) +
    `<circle cx="${center[0]}" cy="${center[1]}" r="3.5" fill="${INK}"/>` +
    `<path d="M${center[0] + 3} ${center[1] + 3} L262 206" stroke="${GRAY}" stroke-width="1"/>` +
    text(300, 220, 'saddle point', { fill: INK, anchor: 'end', size: 11 }) +
    text(20, 22, 'discrete iterates', { fill: RED, weight: 600 }) +
    text(20, 37, 'and high-resolution ODE', { fill: RED, size: 11 }) +
    `<path d="M${center[0] - 16} ${center[1] + 15} L70 206" stroke="${GRAY}" stroke-width="1"/>` +
    text(20, 220, 'low-resolution ODE', { fill: MUTED, size: 11 }));
}

function dual() {
  const rand = random(7);
  const T = 260;
  const rho = 0.3;
  const eta = 0.035;
  let mu = 0.05;
  const prices = [];
  for (let t = 0; t < T; t++) {
    prices.push(mu);
    const value = rand();
    mu = Math.max(0, mu + eta * ((value > mu ? 1 : 0) - rho));
  }
  const x0 = 40, x1 = 300, y0 = 196, y1 = 30, top = 1;
  const px = t => x0 + (x1 - x0) * t / (T - 1);
  const py = m => y0 - (y0 - y1) * m / top;
  const target = 1 - rho;
  return svg('Shadow price learned by dual mirror descent settling near its optimal value',
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${MUTED}" stroke-width="1"/><line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1 - 6}" stroke="${MUTED}" stroke-width="1"/>` +
    `<line x1="${x0}" y1="${f(py(target))}" x2="${x1}" y2="${f(py(target))}" stroke="${GRAY}" stroke-width="1.5" stroke-dasharray="4 3"/>` +
    text(x1, py(target) + 18, 'optimal shadow price', { anchor: 'end', size: 11 }) +
    `<path d="${path(prices.map((m, t) => [px(t), py(m)]))}" fill="none" stroke="${RED}" stroke-width="2" stroke-linejoin="round"/>` +
    text(px(150), py(0.42), 'learned price', { fill: RED, weight: 600 }) +
    text(x1, y0 + 20, 'requests over time →', { anchor: 'end', size: 11 }) +
    `<text transform="translate(${x0 - 14} ${y0}) rotate(-90)" fill="${MUTED}" font-size="11">shadow price →</text>`);
}

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
for (const [name, make] of [['ode', ode], ['dual-price', dual], ['property-tax', tax]]) {
  writeFileSync(new URL(`${name}.svg`, out), make());
}
