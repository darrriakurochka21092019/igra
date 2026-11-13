import { TILE, type Point, type Rect, type Sector } from './campaign';

export const inside = (x: number, y: number, [left, top, width, height]: Rect): boolean =>
  x >= left && x < left + width && y >= top && y < top + height;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function floorGrid(sector: Sector): number[][] {
  return Array.from({ length: sector.height }, (_, y) => Array.from({ length: sector.width }, (_, x) => {
    const room = sector.rooms.findIndex(room => inside(x + .5, y + .5, room.area));
    return room >= 0 ? room + 1 : sector.corridors.some(area => inside(x + .5, y + .5, area)) ? 0 : -1;
  }));
}

export class Geometry {
  readonly grid: number[][];

  constructor(readonly sector: Sector, private flags: Record<string, boolean>) {
    this.grid = floorGrid(sector);
  }

  blocked(x: number, y: number, radius = 0): boolean {
    const corners = radius
      ? [[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius]]
      : [[x, y]];
    return corners.some(([cx, cy]) => {
      const tx = cx / TILE;
      const ty = cy / TILE;
      const floor = this.grid[Math.floor(ty)]?.[Math.floor(tx)];
      if (floor === undefined || floor < 0) return true;
      return this.sector.props.some(prop => inside(tx, ty, prop.area)) ||
        this.sector.gates.some(gate => !this.flags[gate.opensWith] && inside(tx, ty, gate.area));
    });
  }

  clear(a: Point, b: Point, radius = 0): boolean {
    const steps = Math.ceil(distance(a, b) / 9);
    for (let i = 1; i < steps; i++) {
      const progress = i / steps;
      if (this.blocked(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress, radius)) return false;
    }
    return true;
  }

  route(from: Point, to: Point): Point[] {
    const width = this.sector.width * 2;
    const height = this.sector.height * 2;
    const step = TILE / 2;
    const index = (p: Point) => Math.floor(p.y / step) * width + Math.floor(p.x / step);
    const center = (i: number) => ({ x: (i % width + .5) * step, y: (Math.floor(i / width) + .5) * step });
    const start = index(from);
    const end = index(to);
    if (start < 0 || end < 0 || start >= width * height || end >= width * height) return [];
    const back = new Int32Array(width * height).fill(-1);
    const queue = new Int32Array(width * height);
    queue[0] = start;
    back[start] = start;
    let count = 1;
    for (let head = 0; head < count && back[end] < 0; head++) {
      const id = queue[head];
      const x = id % width;
      for (const next of [x > 0 ? id - 1 : -1, x + 1 < width ? id + 1 : -1, id - width, id + width]) {
        if (next < 0 || next >= back.length || back[next] >= 0) continue;
        const point = center(next);
        if (this.blocked(point.x, point.y, 8)) continue;
        back[next] = id;
        queue[count++] = next;
      }
    }
    if (back[end] < 0) return [];
    const points = [to];
    for (let current = end; current !== start; current = back[current]) points.push(center(current));
    return points.reverse();
  }

  move(point: Point, dx: number, dy: number, radius: number): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 7));
    for (let i = 0; i < steps; i++) {
      if (!this.blocked(point.x + dx / steps, point.y, radius)) point.x += dx / steps;
      if (!this.blocked(point.x, point.y + dy / steps, radius)) point.y += dy / steps;
    }
  }
}
