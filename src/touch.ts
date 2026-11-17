import { screenToImage, type View, type XY } from './domain';
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// One gesture produces at most one tap. A pinch or cancelled gesture never produces a tap.
export class TouchGesture {
  readonly points = new Map<number, XY>();
  private origin: XY | null = null;
  private previous: XY | null = null;
  private pinch: { center: XY; distance: number } | null = null;
  private dragged = false;
  private multiple = false;
  private cancelled = false;
  begin(id: number, pos: XY) {
    if (this.points.size === 0) {
      this.origin = pos;
      this.previous = pos;
      this.dragged = false;
      this.multiple = false;
      this.cancelled = false;
      this.pinch = null;
    }
    this.points.set(id, pos);
    if (this.points.size > 1) {
      this.multiple = true;
      const [a, b] = [...this.points.values()];
      this.pinch = { center: middle(a, b), distance: distance(a, b) };
    }
  }
  move(id: number, pos: XY, view: View): View {
    if (!this.points.has(id)) return view;
    this.points.set(id, pos);
    if (this.points.size > 1) {
      const [a, b] = [...this.points.values()];
      const next = { center: middle(a, b), distance: distance(a, b) };
      const prior = this.pinch;
      this.pinch = next;
      if (!prior || prior.distance < 1 || next.distance < 1) return view;
      const anchor = screenToImage(prior.center, view),
        scale = Math.max(0.01, Math.min(30, (view.scale * next.distance) / prior.distance));
      return { scale, x: next.center.x - anchor.x * scale, y: next.center.y - anchor.y * scale };
    }
    const wasDragged = this.dragged;
    if (this.origin && distance(this.origin, pos) > 8) this.dragged = true;
    const from = wasDragged || this.multiple ? this.previous : this.origin;
    this.previous = pos;
    if (!from || (!this.dragged && !this.multiple)) return view;
    return { ...view, x: view.x + pos.x - from.x, y: view.y + pos.y - from.y };
  }
  end(id: number, pos: XY): XY | null {
    if (!this.points.has(id)) return null;
    if (this.origin && distance(this.origin, pos) > 8) this.dragged = true;
    this.points.delete(id);
    const tap =
      this.points.size === 0 && !this.multiple && !this.dragged && !this.cancelled ? pos : null;
    this.pinch = null;
    if (this.points.size === 1) this.previous = [...this.points.values()][0];
    return tap;
  }
  cancel(id?: number) {
    this.cancelled = true;
    if (id === undefined) this.points.clear();
    else this.points.delete(id);
    this.pinch = null;
  }
}
