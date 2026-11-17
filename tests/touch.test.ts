import { it, expect } from 'vitest';
import { TouchGesture } from '../src/touch';
import { screenToImage } from '../src/domain';
it('treats a stationary single pointer as exactly one tap', () => {
  const g = new TouchGesture();
  g.begin(1, { x: 100, y: 200 });
  const v = { x: 20, y: 30, scale: 0.5 };
  expect(g.move(1, { x: 103, y: 202 }, v)).toBe(v);
  expect(g.end(1, { x: 103, y: 202 })).toEqual({ x: 103, y: 202 });
  expect(g.end(1, { x: 103, y: 202 })).toBeNull();
});
it('pans after a movement threshold and never adds a point at the end of a drag', () => {
  const g = new TouchGesture();
  g.begin(1, { x: 100, y: 100 });
  let v = { x: 20, y: 30, scale: 2 };
  v = g.move(1, { x: 104, y: 103 }, v);
  expect(v).toEqual({ x: 20, y: 30, scale: 2 });
  v = g.move(1, { x: 130, y: 120 }, v);
  expect(v).toEqual({ x: 50, y: 50, scale: 2 });
  v = g.move(1, { x: 160, y: 140 }, v);
  expect(v).toEqual({ x: 80, y: 70, scale: 2 });
  expect(g.end(1, { x: 160, y: 140 })).toBeNull();
});
it('pinches around the original-image midpoint while translating and produces no taps', () => {
  const g = new TouchGesture();
  let v = { x: 10, y: 20, scale: 0.5 };
  g.begin(1, { x: 100, y: 100 });
  g.begin(2, { x: 200, y: 100 });
  const original = screenToImage({ x: 150, y: 100 }, v);
  v = g.move(1, { x: 70, y: 140 }, v);
  v = g.move(2, { x: 270, y: 140 }, v);
  expect(v.scale).toBeCloseTo(1);
  expect(screenToImage({ x: 170, y: 140 }, v)).toEqual(original);
  expect(g.end(1, { x: 70, y: 140 })).toBeNull();
  expect(g.end(2, { x: 270, y: 140 })).toBeNull();
});
it('does not add a point when one finger remains after a pinch', () => {
  const g = new TouchGesture();
  g.begin(1, { x: 100, y: 100 });
  g.begin(2, { x: 200, y: 100 });
  g.end(2, { x: 200, y: 100 });
  const v = g.move(1, { x: 120, y: 130 }, { x: 0, y: 0, scale: 1 });
  expect(v).toEqual({ x: 20, y: 30, scale: 1 });
  expect(g.end(1, { x: 120, y: 130 })).toBeNull();
  g.begin(3, { x: 30, y: 40 });
  expect(g.end(3, { x: 30, y: 40 })).toEqual({ x: 30, y: 40 });
});
it('cancellation and capture loss cannot become taps, including the remaining pointer', () => {
  const g = new TouchGesture();
  g.begin(1, { x: 50, y: 50 });
  g.begin(2, { x: 100, y: 100 });
  g.cancel(2);
  expect(g.end(1, { x: 50, y: 50 })).toBeNull();
  g.begin(3, { x: 50, y: 50 });
  g.cancel();
  expect(g.end(3, { x: 50, y: 50 })).toBeNull();
});
it('keeps transforms finite for coincident fingers and clamps extreme zoom', () => {
  const g = new TouchGesture();
  g.begin(1, { x: 50, y: 50 });
  g.begin(2, { x: 50, y: 50 });
  let v = { x: 0, y: 0, scale: 1 };
  v = g.move(2, { x: 51, y: 50 }, v);
  v = g.move(2, { x: 10000, y: 50 }, v);
  expect(v.scale).toBe(30);
  expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
});
