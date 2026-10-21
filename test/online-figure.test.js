import { createFakeBrowser } from './helpers/fake-browser.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { initializeOnlineFigure } from '../src/lib/research/online-figure.ts';
import { onlineChart } from '../src/lib/research/online-layout.ts';

const data = JSON.parse(
  fs.readFileSync(
    new URL('../data/research/online-allocation.json', import.meta.url),
  ),
);

function setup(missingPart) {
  const markup = fs.readFileSync(
    new URL('../src/components/OnlineDiagram.astro', import.meta.url),
    'utf8',
  );
  const elements = new Map(
    [...markup.matchAll(/data-part="([\w-]+)"/g)].map(([, part]) => [
      part,
      {
        dataset: { part },
        attributes: {},
        textContent: '',
        setAttribute(name, value) {
          assert.ok(!/NaN|Infinity/.test(value), `${part}: ${value}`);
          this.attributes[name] = value;
        },
      },
    ]),
  );
  elements.delete(missingPart);
  const {
    browser,
    frames,
    events,
    motion,
    document,
    tick: advance,
  } = createFakeBrowser();
  initializeOnlineFigure(
    {
      querySelector: (selector) => {
        const name = selector.match(/^\[data-part="(.+)"\]$/)?.[1];
        return elements.get(name) ?? null;
      },
    },
    data,
    browser,
  );
  function tick(time, wallClock = false) {
    // Stage tests use logical time; wall-clock tests verify playback speed.
    advance(wallClock ? time : time / 0.8);
  }
  return { elements, events, frames, motion, document, tick };
}

test('online playback stops when hidden, offscreen, or reduced', () => {
  const { events, frames, motion, document, tick, elements } = setup();
  assert.equal(frames.size, 0);
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(1500);
  const value = elements.get('opportunity-value').textContent;
  document.hidden = true;
  events.hidden();
  assert.equal(frames.size, 0);
  document.hidden = false;
  events.hidden();
  assert.equal(frames.size, 1);
  events.visible([{ isIntersecting: false }]);
  assert.equal(frames.size, 0);
  motion.matches = true;
  events.motion();
  assert.equal(frames.size, 0);
  assert.equal(
    Number(elements.get('dmd-point').attributes.cx),
    54 + (34 / 35) * 254,
  );
  assert.equal(elements.get('to-bid').attributes.opacity, '0');
  events.visible([{ isIntersecting: true }]);
  assert.equal(frames.size, 0);
  motion.matches = false;
  events.motion();
  assert.equal(frames.size, 1);
  tick(12000);
  assert.equal(elements.get('opportunity-value').textContent, value);
});

test('last auction stays visible through the final hold', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  // Auctions 24–34 complete, then hold for one wall-clock second.
  for (const time of [37.21, 37.29, 37.99]) {
    tick(time * 1000);
    assert.equal(elements.get('opportunity-value').attributes.opacity, '1');
    assert.equal(
      Number(elements.get('dmd-point').attributes.cx),
      54 + (34 / 35) * 254,
    );
  }
});

test('a full cycle returns to the first displayed auction', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  const firstPath = elements.get('dmd-curve').attributes.d;
  // Eleven rounds, 0.8 logical seconds of hold and 0.64 of fade.
  tick(38730);
  // Floating-point modulo can append a zero-length segment at loop start.
  assert.ok(elements.get('dmd-curve').attributes.d.startsWith(firstPath));
  assert.ok(
    Math.abs(
      Number(elements.get('dmd-point').attributes.cx) - (54 + (23 / 35) * 254),
    ) < 1e-9,
  );
  assert.equal(
    elements.get('opportunity-value').textContent,
    data.rounds[23].v.toFixed(2),
  );
});

test('auction data respects budgets and net-utility updates', () => {
  let payment = 0;
  let totalValue = 0;
  let fixedPayment = 0;
  let fixedValue = 0;
  let previousState;
  assert.equal(data.rounds.length, data.T);
  for (const round of data.rounds) {
    if (previousState) {
      assert.deepEqual(round.before, previousState);
    }
    previousState = round.after;
    assert.equal(
      round.bid,
      Math.min(round.v / (1 + round.before.mu), round.before.remaining),
    );
    assert.equal(round.win, round.bid >= round.price);
    assert.equal(round.payment, round.win ? round.price : 0);
    assert.equal(
      round.fixedWin,
      Math.min(round.v, round.before.fixedRemaining) >= round.price,
    );
    assert.equal(round.after.remaining, round.before.remaining - round.payment);
    assert.equal(
      round.after.fixedRemaining,
      round.before.fixedRemaining - (round.fixedWin ? round.price : 0),
    );
    fixedValue += round.fixedWin ? round.v - round.price : 0;
    assert.equal(round.after.fixedValue, fixedValue);
    payment += round.payment;
    totalValue += round.win ? round.v - round.price : 0;
    fixedPayment += round.fixedWin ? round.price : 0;
    assert.ok(payment <= data.budget);
    assert.ok(fixedPayment <= data.budget);
    assert.equal(round.after.value, totalValue);
    const consumption = round.payment;
    assert.equal(
      round.after.mu,
      Math.max(
        0,
        round.before.mu + data.eta * (consumption - data.budget / data.T),
      ),
    );
  }
});

test('arrival advances the chart before utility is revealed', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  // Second displayed auction is a win: arrival completes before outcome begins.
  tick(3390);
  const beforeY = elements.get('dmd-point').attributes.cy;
  tick(3990);
  const arrivalX = elements.get('dmd-point').attributes.cx;
  assert.equal(Number(arrivalX), 54 + (25 / 35) * 254);
  assert.equal(elements.get('dmd-point').attributes.cy, beforeY);
  tick(5100);
  assert.equal(elements.get('dmd-point').attributes.cx, arrivalX);
  assert.ok(Number(elements.get('dmd-point').attributes.cy) < Number(beforeY));
});

test('lost auctions stay horizontal and show zero payment', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  const lossIndex = data.rounds.slice(23, 34).findIndex((round) => !round.win);
  assert.ok(lossIndex >= 0);
  const lossStart = lossIndex * 3390;
  tick(lossStart);
  const beforeY = elements.get('dmd-point').attributes.cy;
  tick(lossStart + 2200);
  assert.equal(elements.get('dmd-point').attributes.cy, beforeY);
  assert.equal(elements.get('payment-value').textContent, '0.00');
  assert.equal(elements.get('result').textContent, 'Not won · +0 utility');
});

test('bid dial resets before revealing the next bid', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  const angle = () => {
    const rotation = elements.get('formed-bid').attributes.transform;
    assert.match(rotation ?? '', /^rotate\([\d.]+\)$/);
    return Number(rotation.slice(7, -1));
  };
  const rounds = data.rounds.slice(23, 34);
  for (const [index, round] of rounds.entries()) {
    assert.ok(round.bid >= 0 && round.bid <= 1);
    const start = index * 3390;
    tick(start + 1);
    assert.equal(elements.get('bid-group').attributes.opacity, '1');
    const startingAngle = angle();
    if (index > 0) {
      const previous = rounds[index - 1];
      assert.ok(Math.abs(startingAngle - (180 + 180 * previous.bid)) < 0.01);
      assert.equal(
        elements.get('bid-value').textContent,
        previous.bid.toFixed(2),
      );
      assert.equal(elements.get('bid-value').attributes.opacity, '1');
      tick(start + 180);
      assert.ok(
        angle() > 180 && angle() < startingAngle,
        'visible return, not a hidden snap',
      );
      assert.equal(elements.get('bid-group').attributes.opacity, '1');
      assert.equal(
        elements.get('bid-value').textContent,
        previous.bid.toFixed(2),
      );
    }
    tick(start + 400);
    assert.equal(angle(), 180, 'reach zero before forming the next bid');
    tick(start + 690);
    const actualAngle = 180 + 180 * round.bid;
    assert.ok(angle() > 180 && angle() < actualAngle);
    assert.equal(elements.get('bid-value').textContent, round.bid.toFixed(2));
    for (const offset of [910, 1710, 2370, 3130, 3380]) {
      tick(start + offset);
      assert.ok(Math.abs(angle() - actualAngle) < 1e-9);
      assert.equal(elements.get('bid-group').attributes.opacity, '1');
      assert.equal(elements.get('bid-value').attributes.opacity, '1');
      assert.equal(elements.get('bid-value').textContent, round.bid.toFixed(2));
    }
  }
});

test('payment precedes mu updates for wins and losses', () => {
  for (const win of [true, false]) {
    const { events, tick, elements } = setup();
    const index = data.rounds
      .slice(23, 34)
      .findIndex((round) => round.win === win);
    const round = data.rounds[index + 23];
    const start = index * 3390;
    events.visible([{ isIntersecting: true }]);
    tick(0);
    tick(start + 2190);
    assert.equal(
      elements.get('payment-value').textContent,
      round.payment.toFixed(2),
    );
    assert.equal(elements.get('payment-value').attributes.opacity, '1');
    assert.equal(
      elements.get('shadow-price').textContent,
      round.before.mu.toFixed(2),
    );
    tick(start + 2600);
    assert.equal(
      elements.get('shadow-price').textContent,
      round.after.mu.toFixed(2),
    );
  }
});

test('reduced motion shows the exact final bid without rotating', () => {
  const { events, elements, motion, frames } = setup();
  motion.matches = true;
  events.motion();
  const actualBid = data.rounds[33].bid;
  assert.equal(
    elements.get('formed-bid').attributes.transform,
    `rotate(${180 + 180 * actualBid})`,
  );
  assert.equal(elements.get('bid-value')?.textContent, actualBid.toFixed(2));
  assert.equal(elements.get('bid-group').attributes.opacity, '1');
  assert.equal(frames.size, 0);
});

test('auction reveals bid, price, outcome and payment in order', () => {
  const { events, tick, elements } = setup();
  const attr = (part, name) => Number(elements.get(part).attributes[name]);
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(1140);
  assert.equal(attr('bid', 'width'), data.rounds[23].bid * 188);
  assert.ok(attr('price-marker', 'opacity') < 1e-9);
  assert.ok(attr('outcome', 'opacity') < 1e-9);
  tick(1290);
  assert.equal(attr('price-marker', 'opacity'), 1);
  assert.ok(attr('outcome', 'opacity') < 1e-9);
  assert.equal(attr('payment-value', 'opacity'), 0);
  for (let i = 0; i < 11; i++) {
    tick(i * 3390 + 2190);
    const round = data.rounds[23 + i];
    assert.ok(round.price >= 0 && round.price <= 1);
    assert.ok(round.bid >= 0 && round.bid <= 1);
    assert.equal(attr('price-marker', 'x1'), 414 + round.price * 188);
    assert.equal(attr('bid', 'width'), round.bid * 188);
    assert.equal(attr('spend-bar', 'width'), round.payment * 188);
    assert.equal(
      elements.get('payment-value').textContent,
      (round.win ? round.price : 0).toFixed(2),
    );
    assert.equal(round.bid >= round.price, round.win);
  }
});

test('flow segments arrive before fading and clear the connectors', () => {
  const cues = [
    ['to-input', 210, 300, 40, 120],
    ['to-auction', 900, 240, 40, 120],
    ['to-spend', 1710, 270, 40, 120],
    ['to-bid', 0, 550, 80, 180],
  ];
  for (const [part, start, duration, hold, fade] of cues) {
    const { events, tick, elements, motion } = setup();
    const get = (name, attr) => Number(elements.get(name).attributes[attr]);
    const head = () =>
      Number(elements.get(part).attributes['stroke-dasharray'].split(' ')[0]) -
      get(part, 'stroke-dashoffset');
    events.visible([{ isIntersecting: true }]);
    tick(0);
    tick(Math.max(0, start - 1));
    assert.equal(get(part, 'opacity'), 0);
    assert.equal(get(`${part}-tail`, 'opacity'), 0);
    tick(start + duration / 1.2 / 2);
    assert.ok(Math.abs(head() - 0.5) < 1e-9);
    assert.ok(get(part, 'opacity') > get(`${part}-tail`, 'opacity'));
    assert.ok(get(`${part}-tail`, 'opacity') > 0);
    tick(start + duration / 1.2);
    assert.ok(Math.abs(head() - 1) < 1e-9);
    const arrivalOpacity = get(part, 'opacity');
    if (part === 'to-bid') {
      assert.equal(get('next-bid-highlight', 'opacity'), 1);
    }
    tick(start + duration + hold / 2);
    assert.equal(get(part, 'opacity'), arrivalOpacity);
    tick(start + duration + hold + fade / 2);
    assert.ok(get(part, 'opacity') < arrivalOpacity);
    tick(start + duration + hold + fade + 1);
    assert.equal(get(part, 'opacity'), 0);
    assert.equal(get(`${part}-tail`, 'opacity'), 0);
    if (part === 'to-bid') {
      assert.equal(get('next-bid-highlight', 'opacity'), 0);
    }
    motion.matches = true;
    events.motion();
    for (const [name] of cues) {
      assert.equal(get(name, 'opacity'), 0);
      assert.equal(get(`${name}-tail`, 'opacity'), 0);
    }
  }
});

test('auction and payment wait for the corresponding transfer', () => {
  const { events, tick, elements } = setup();
  const opacity = (name) => Number(elements.get(name).attributes.opacity);
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(900);
  assert.ok(opacity('price-marker') < 1e-9);
  assert.equal(elements.get('bid').attributes.width, '0');
  tick(1140);
  assert.ok(opacity('price-marker') < 1e-9);
  tick(1710);
  assert.equal(opacity('outcome'), 1);
  assert.ok(opacity('payment-value') < 1e-9);
  tick(1980);
  assert.ok(opacity('payment-value') < 1e-9);
  tick(2190);
  assert.equal(opacity('payment-value'), 1);
  assert.equal(
    elements.get('shadow-price').textContent,
    data.rounds[23].before.mu.toFixed(2),
  );
});

test('final hold retains results but clears every flow segment', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(37300);
  assert.equal(elements.get('outcome').attributes.opacity, '1');
  for (const name of ['to-input', 'to-auction', 'to-spend', 'to-bid']) {
    assert.equal(elements.get(name).attributes.opacity, '0');
    assert.equal(elements.get(`${name}-tail`).attributes.opacity, '0');
  }
});

test('shadow-price reels settle all digits before the return', () => {
  const { events, tick, elements, motion } = setup();
  const digits = () =>
    [0, 1, 2]
      .map((i) => elements.get(`shadow-digit-${i}-front`).textContent)
      .join('');
  events.visible([{ isIntersecting: true }]);
  tick(0);
  for (const [index, round] of data.rounds.slice(23, 34).entries()) {
    assert.ok(round.before.mu >= 0 && round.before.mu < 10);
    assert.ok(round.after.mu >= 0 && round.after.mu < 10);
    const start = index * 3390;
    tick(start + 2190);
    assert.equal(digits(), round.before.mu.toFixed(2).replace('.', ''));
    tick(start + 2260);
    for (const col of [0, 1, 2]) {
      assert.notEqual(
        elements.get(`shadow-digit-${col}`).attributes.transform,
        'translate(0 0)',
      );
    }
    assert.equal(
      elements.get('shadow-price').textContent,
      round.before.mu.toFixed(2),
    );
    tick(start + 2450);
    assert.equal(digits(), round.after.mu.toFixed(2).replace('.', ''));
    assert.equal(
      elements.get('shadow-price').textContent,
      round.after.mu.toFixed(2),
    );
    for (const col of [0, 1, 2]) {
      assert.equal(
        elements.get(`shadow-digit-${col}`).attributes.transform,
        'translate(0 0)',
      );
    }
    assert.equal(elements.get('to-bid').attributes.opacity, '0');
  }
  motion.matches = true;
  events.motion();
  assert.equal(digits(), data.rounds[33].after.mu.toFixed(2).replace('.', ''));
});

test('slower playback keeps bid and feedback synchronized', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0, true);
  tick(600, true);
  assert.equal(elements.get('formed-bid').attributes.transform, 'rotate(180)');
  tick(1130, true);
  assert.equal(
    elements.get('formed-bid').attributes.transform,
    `rotate(${180 + 180 * data.rounds[23].bid})`,
  );
  assert.equal(elements.get('price-marker').attributes.opacity, '0');
  tick(3060, true);
  assert.equal(
    elements.get('shadow-price').textContent,
    data.rounds[23].after.mu.toFixed(2),
  );
  assert.equal(elements.get('to-bid').attributes.opacity, '0');
});

test('missing SVG parts report the component contract error', () => {
  assert.throws(
    () => setup('dmd-curve'),
    /OnlineFigure is missing data-part="dmd-curve"/,
  );
});

test('loop stops at the last gain and keeps the axes and data', () => {
  const { events, tick, elements } = setup();
  const lastGain = data.rounds.findLastIndex(
    (r) =>
      r.after.value > r.before.value ||
      r.after.fixedValue > r.before.fixedValue,
  );
  assert.equal(lastGain, 33);
  assert.equal(data.rounds.length, 48);
  events.visible([{ isIntersecting: true }]);
  tick(0);
  tick(37290);
  assert.equal(
    elements.get('opportunity-value').textContent,
    data.rounds[lastGain].v.toFixed(2),
  );
  const plot = onlineChart(data);
  assert.equal(plot.maxAuction, 35);
  assert.equal(plot.maxUtility, 35);
  assert.deepEqual(plot.auctionTicks, [0, 10, 20, 30]);
  assert.deepEqual(plot.utilityTicks, [0, 10, 20, 30]);
  const finalPoint = elements.get('dmd-point').attributes.cy;
  tick(38090);
  assert.equal(elements.get('dmd-point').attributes.cy, finalPoint);
  tick(38410);
  const fade = Number(elements.get('chart-motion').attributes.opacity);
  assert.ok(fade > 0 && fade < 1);
  tick(38740);
  assert.equal(
    elements.get('opportunity-value').textContent,
    data.rounds[23].v.toFixed(2),
  );
});

test('impression and stored shadow price arrive before bidding', () => {
  const { events, tick, elements } = setup();
  events.visible([{ isIntersecting: true }]);
  tick(0);
  for (const start of [0, 3390, 6780]) {
    tick(start + 460);
    for (const name of ['to-input', 'to-bid']) {
      assert.ok(Number(elements.get(name).attributes.opacity) > 0.9);
    }
    assert.equal(
      elements.get('shadow-price').textContent,
      data.rounds[23 + start / 3390].before.mu.toFixed(2),
    );
  }
});
