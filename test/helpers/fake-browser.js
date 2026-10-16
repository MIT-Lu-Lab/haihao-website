import assert from 'node:assert/strict';

/** Browser scheduling only; each figure supplies its own DOM/canvas stubs. */
export function createFakeBrowser() {
  const frames = new Map();
  const observers = [];
  const resizeObservers = [];
  const motionListeners = new Set();
  const visibilityListeners = new Set();
  let nextId = 0;
  const motion = {
    matches: false,
    addEventListener: (_, callback) => motionListeners.add(callback),
    removeEventListener: (_, callback) => motionListeners.delete(callback),
  };
  const document = {
    hidden: false,
    addEventListener: (_, callback) => visibilityListeners.add(callback),
    removeEventListener: (_, callback) => visibilityListeners.delete(callback),
  };
  const browser = {
    document,
    matchMedia: () => motion,
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.active = true;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.active = false;
      }
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.active = true;
        resizeObservers.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.active = false;
      }
    },
    requestAnimationFrame(callback) {
      frames.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const events = {
    visible(entries) {
      for (const observer of observers) {
        if (observer.active) {
          observer.callback(entries);
        }
      }
    },
    motion() {
      for (const callback of motionListeners) {
        callback();
      }
    },
    hidden() {
      for (const callback of visibilityListeners) {
        callback();
      }
    },
    resize() {
      for (const observer of resizeObservers) {
        if (observer.active) {
          observer.callback();
        }
      }
    },
  };
  function tick(timestamp) {
    assert.equal(frames.size, 1, 'exactly one pending animation frame');
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(timestamp);
  }
  return {
    browser,
    frames,
    events,
    motion,
    document,
    tick,
    observers,
    resizeObservers,
    motionListeners,
    visibilityListeners,
  };
}
