import Phaser from 'phaser';
import { TILE, type Point, type Prop, type Sector } from './campaign';

const colors: Record<string, [string, string, string, string]> = {
  metro: ['#25373b', '#2b4042', '#2e4447', '#18292d'],
  work: ['#292e34', '#343b3e', '#3c4344', '#1b2428'],
  lab: ['#263a40', '#324b50', '#385259', '#1b3035'],
  archive: ['#2e3035', '#383940', '#404149', '#23252d'],
  tunnel: ['#202d37', '#2c3b47', '#344452', '#14232d'],
  exit: ['#33443e', '#3c5149', '#4b6154', '#20332e'],
};
const lamps = ['#79d5bf', '#f1ba79', '#82d2d5'];

function hash(x: number, y: number): number {
  return ((Math.imul(x + 17, 1597334677) ^ Math.imul(y + 41, 3812015801)) >>> 0) / 4294967296;
}

function box(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, color);
  light.addColorStop(1, '#0000');
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function decorateFloor(ctx: CanvasRenderingContext2D, x: number, y: number, surface: string): void {
  const px = x * TILE;
  const py = y * TILE;
  const pattern = hash(x, y);
  const palette = colors[surface];
  box(ctx, palette[3], px, py, TILE, TILE);
  box(ctx, palette[pattern > .69 ? 1 : 0], px + 1, py + 1, 30, 30);
  box(ctx, palette[1], px + 1, py + 1, 30, 1);
  if (surface === 'metro' || surface === 'lab' || surface === 'exit') {
    box(ctx, palette[3], px + 15, py + 1, 1, 30);
    box(ctx, palette[3], px + 1, py + 15, 30, 1);
    if (pattern > .6) box(ctx, palette[2], px + 16, py + 16, 15, 15);
  }
  if (surface === 'work' || surface === 'tunnel' || surface === 'archive') {
    box(ctx, palette[2], px + 3, py + 4, 2, 2);
    box(ctx, palette[3], px + 27, py + 25, 2, 2);
    if (pattern > .8) for (let i = 0; i < 4; i++) box(ctx, palette[3], px + 8 + i * 4, py + 12, 2, 9);
  }
  for (let i = 0; i < 6; i++) {
    const xx = Math.floor(hash(x + i * 11, y + 5) * 28) + 2;
    const yy = Math.floor(hash(x + 8, y + i * 19) * 28) + 2;
    box(ctx, i % 2 ? '#07131b25' : '#a1c6bf16', px + xx, py + yy, i % 3 + 1, 1);
  }
}

function pipe(ctx: CanvasRenderingContext2D, nodes: [number, number][], color: string): void {
  for (const [index, [x, y]] of nodes.entries()) {
    if (index === 0) continue;
    const [a, b] = nodes[index - 1];
    const left = Math.min(a, x) * TILE;
    const top = Math.min(b, y) * TILE;
    const width = Math.max(5, Math.abs(a - x) * TILE + 5);
    const height = Math.max(5, Math.abs(b - y) * TILE + 5);
    box(ctx, '#0b151f', left - 2, top - 2, width + 4, height + 4);
    box(ctx, color, left, top, width, height);
    if (width > height) {
      for (let j = left + 10; j < left + width - 4; j += 27) box(ctx, '#69777a', j, top - 2, 3, 9);
    } else {
      for (let j = top + 10; j < top + height - 4; j += 27) box(ctx, '#69777a', left - 2, j, 9, 3);
    }
  }
}

export function stationTexture(scene: Phaser.Scene, sector: Sector, grid: number[][], index: number): string {
  const key = `sector-${index}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, sector.width * TILE, sector.height * TILE);
  if (!texture) throw new Error('Не удалось подготовить карту станции.');
  const ctx = texture.getContext();
  const height = sector.height * TILE;
  const width = sector.width * TILE;
  box(ctx, '#0d161f', 0, 0, width, height);
  for (let y = 0; y < sector.height; y++) {
    for (let x = 0; x < sector.width; x++) {
      const value = grid[y][x];
      if (value < 0) {
        if (hash(x, y) > .73) box(ctx, '#101d26', x * TILE + 3, y * TILE + 5, 15, 2);
        continue;
      }
      decorateFloor(ctx, x, y, value ? sector.rooms[value - 1].surface : 'tunnel');
      const xx = x * TILE;
      const yy = y * TILE;
      const edge = (a: number, b: number) => (grid[b]?.[a] ?? -1) < 0;
      if (edge(x, y - 1)) {
        box(ctx, '#102028', xx, yy - 13, 32, 20);
        box(ctx, '#344b50', xx, yy - 12, 31, 10);
        box(ctx, '#53696a', xx + 1, yy - 11, 30, 2);
        box(ctx, '#1d3034', xx, yy - 2, 32, 4);
        box(ctx, '#0713195a', xx, yy + 2, 32, 7);
      }
      if (edge(x - 1, y)) {
        box(ctx, '#132630', xx - 7, yy, 8, 32);
        box(ctx, '#3b5357', xx - 5, yy, 3, 31);
        box(ctx, '#0a181d55', xx, yy, 7, 32);
      }
      if (edge(x + 1, y)) {
        box(ctx, '#101f29', xx + 31, yy, 9, 32);
        box(ctx, '#526a6c', xx + 32, yy, 2, 31);
      }
      if (edge(x, y + 1)) {
        box(ctx, '#567073', xx, yy + 31, 31, 2);
        box(ctx, '#2b4249', xx, yy + 33, 32, 7);
        box(ctx, '#101c25', xx, yy + 40, 32, 4);
      }
    }
  }

  for (const [x, y, w, h] of sector.tracks ?? []) {
    const left = x * TILE;
    const top = y * TILE;
    const length = w * TILE;
    box(ctx, '#121e25', left, top + 7, length, h * TILE - 9);
    for (let j = left + 8; j < left + length - 5; j += 20) {
      box(ctx, '#314047', j, top + 12, 7, 76);
      box(ctx, '#1f2d35', j, top + 17, 5, 68);
      box(ctx, '#9c9368', j, top - 2, 10, 3);
    }
    for (const rail of [27, 65]) {
      box(ctx, '#455762', left, top + rail, length, 4);
      box(ctx, '#778688', left, top + rail, length, 1);
    }
  }

  if (index === 0) {
    pipe(ctx, [[7.5, 24], [7.5, 28], [28.7, 28], [28.7, 17], [30, 17], [30, 6]], '#8e7847');
    pipe(ctx, [[32, 9.5], [55, 9.5]], '#557c80');
    pipe(ctx, [[56.7, 10], [56.7, 13], [50.4, 13], [50.4, 16.5], [44.6, 16.5], [44.6, 26.5], [57.5, 26.5]], '#4e7f80');
  } else if (index === 1) {
    pipe(ctx, [[28, 23.7], [31, 23.7], [31, 19.3]], '#436a70');
    pipe(ctx, [[36.3, 23.7], [41, 23.7], [41, 19.3]], '#436a70');
  } else {
    pipe(ctx, [[37, 8.7], [37, 19.7], [49.6, 19.7], [49.6, 25], [56, 25]], '#655154');
    pipe(ctx, [[39.4, 39.7], [39.4, 33.4], [50.4, 33.4], [50.4, 27.1], [56, 27.1]], '#68564d');
  }

  for (const [roomIndex, room] of sector.rooms.entries()) {
    const [x, y, w, h] = room.area;
    const left = (x + 1.15) * TILE;
    const top = (y + .76) * TILE;
    const accent = lamps[(index + roomIndex) % lamps.length];
    glow(ctx, left + 7, top + 15, 120, `${accent}23`);
    box(ctx, '#13242b', left - 5, top - 14, Math.min((w - 1.5) * TILE, 22 + room.name.length * 8), 23);
    box(ctx, '#486265', left - 5, top - 15, Math.min((w - 1.5) * TILE, 22 + room.name.length * 8), 2);
    box(ctx, accent, left - 1, top + 7, 19, 2);
    ctx.fillStyle = '#c5d6d5';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(room.name.toUpperCase(), left, top + 2, (w - 1.5) * TILE - 10);
    for (let j = 0; j < Math.floor(w / 6); j++) {
      const lampX = (x + 3.2 + j * 5.5) * TILE;
      const lampY = (y + h - .75) * TILE;
      glow(ctx, lampX, lampY - 2, 103, `${accent}29`);
      box(ctx, '#182a31', lampX - 10, lampY - 2, 20, 7);
      box(ctx, accent, lampX - 7, lampY, 14, 3);
    }
  }
  for (const [x, y, w, h] of sector.corridors) {
    if (w > h + 2) {
      for (let tx = x + 2; tx < x + w - 1; tx += 3) {
        box(ctx, '#a9ad7844', tx * TILE + 4, (y + h / 2) * TILE, 14, 2);
        box(ctx, '#a9ad7844', tx * TILE + 16, (y + h / 2) * TILE - 2, 2, 6);
      }
    }
  }
  texture.refresh();
  return key;
}

export function propTexture(scene: Phaser.Scene, prop: Prop, i: number, sector: number): { key: string; position: Point } {
  const key = `prop-${sector}-${i}`;
  const [x, y, w, h] = prop.area.map(value => Math.round(value * TILE));
  const vertical = prop.type === 'train' ? 36 : prop.type === 'column' ? 26 : prop.type === 'rack' ? 20 : 12;
  const padding = 11;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, w + padding, h + vertical + padding);
    if (!texture) throw new Error('Не удалось подготовить декорации.');
    const ctx = texture.getContext();
    box(ctx, '#050d16aa', 5, vertical + 8, w + 3, h);
    box(ctx, '#111e27', 0, 5, w, h + vertical - 5);
    const top = prop.type === 'train' ? '#345765' : prop.type === 'crate' ? '#635a45' : '#3e585f';
    box(ctx, '#20323c', 2, 5, w - 4, h + vertical - 7);
    box(ctx, top, 3, 2, w - 6, Math.max(8, h - 1));
    box(ctx, '#647e7d', 3, 2, w - 6, 2);
    box(ctx, '#15262c', 3, h - 2, w - 6, 3);
    switch (prop.type) {
      case 'train':
        box(ctx, '#58676b', 3, h + 8, w - 6, 3);
        box(ctx, '#183542', 3, h + 17, w - 6, 15);
        box(ctx, '#7c7460', 3, h + 27, w - 6, 3);
        for (let j = 14; j < w - 35; j += 45) {
          box(ctx, '#122732', j, 7, 28, 13);
          box(ctx, '#506e75', j + 2, 8, 24, 2);
          box(ctx, '#152934', j + 3, h + 5, 23, 13);
          box(ctx, j % 3 ? '#294850' : '#719585', j + 6, h + 7, 17, 7);
          box(ctx, '#92a7a643', j + 7, h + 7, 12, 2);
        }
        break;
      case 'column':
        for (let j = 5; j < h + vertical - 3; j += 9) box(ctx, '#2e444c', 3, j, w - 6, 2);
        box(ctx, '#708280', 4, 4, 3, h + vertical - 11);
        box(ctx, '#bba46c', w - 8, h + vertical - 12, 4, 5);
        break;
      case 'rack':
        for (let j = 9; j < h + vertical - 6; j += 12) {
          box(ctx, '#10212c', 4, j, w - 8, 7);
          box(ctx, '#567077', 5, j + 6, w - 10, 2);
          box(ctx, '#e3bb72', w - 12, j + 2, 3, 2);
        }
        break;
      case 'tank':
        box(ctx, '#1e4c53', 6, 6, w - 12, h + 1);
        box(ctx, '#56877d', 10, 7, w - 21, 3);
        box(ctx, '#37777a', 8, h - 4, w - 16, 5);
        for (let j = 0; j < 5; j++) box(ctx, '#91c6b85a', 10 + j * 6, 15 + (j % 3) * 5, 2, 3);
        break;
      case 'crate':
        for (let j = 6; j < w - 4; j += 9) box(ctx, '#403f35', j, 5, 2, Math.max(5, h - 6));
        box(ctx, '#aa9566', 3, h + 3, w - 6, 3);
        box(ctx, '#2b3332', 6, h + 6, w - 12, 4);
        break;
      case 'console':
        box(ctx, '#102c36', 7, 5, w - 15, Math.max(6, h - 8));
        box(ctx, '#579382', 9, 7, Math.min(w - 18, 17), 3);
        box(ctx, '#7d9da19c', 10, 11, Math.max(3, w - 26), 2);
        break;
    }
    for (let j = 0; j < Math.min(45, w / 2); j++) {
      const px = Math.floor(hash(j, i + 1) * (w - 4)) + 2;
      const py = Math.floor(hash(i + 19, j) * (h + vertical - 5)) + 2;
      box(ctx, j % 2 ? '#a4b9b034' : '#0710194c', px, py, 2 + (j % 3), 1);
    }
    texture.refresh();
  }
  return { key, position: { x, y: y - vertical } };
}

export type Character = 'mira' | 'danya' | 'byte' | 'drone';
const faces = ['right', 'down', 'left', 'up'];
export function characterTexture(scene: Phaser.Scene, character: Character, angle: number, frame: number): string {
  const face = faces[(Math.round(angle / (Math.PI / 2)) + 4) % 4];
  const key = `${character}-${face}-${frame}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 26, 31);
  if (!texture) throw new Error('Не удалось подготовить персонажа.');
  const ctx = texture.getContext();
  const draw = (color: string, x: number, y: number, w: number, h: number) => box(ctx, color, x, y, w, h);
  const stride = frame === 0 ? 0 : frame === 2 ? 0 : frame === 1 ? 2 : -2;
  if (character === 'byte' || character === 'drone') {
    const drone = character === 'drone';
    const shell = drone ? '#8d6b60' : '#86a7a0';
    const glint = drone ? '#f6ad7a' : '#95efe0';
    const dy = frame % 2;
    draw('#061019', 3, 11 + dy, 20, 13);
    draw('#273c48', 4, 11 + dy, 18, 10);
    draw(shell, 6, 10 + dy, 14, 9);
    draw('#425763', 7, 8 + dy, 12, 4);
    draw('#152832', 9, 11 + dy, 10, 5);
    draw(glint, face === 'left' ? 8 : face === 'right' ? 15 : 12, 12 + dy, 5, 3);
    draw('#dcf2e8', face === 'left' ? 8 : face === 'right' ? 15 : 12, 12 + dy, 2, 1);
    draw('#5a7477', 4, 20, 4, 5);
    draw('#5a7477', 18, 20, 4, 5);
    draw('#101d26', 2, 24, 6, 3);
    draw('#101d26', 18, 24, 6, 3);
    if (drone) {
      draw(shell, 1, 14 + dy, 6, 2);
      draw(shell, 19, 14 + dy, 6, 2);
      draw(glint, 0, 15 + dy, 3, 1);
      draw(glint, 23, 15 + dy, 3, 1);
    }
  } else {
    const other = character === 'danya';
    const coat = other ? '#456e76' : '#517c91';
    const trim = other ? '#a1bec0' : '#f0a168';
    const dy = frame === 0 ? 0 : frame % 2;
    draw('#0b1421', 6, 11 + dy, 14, 13);
    draw('#1d3345', 8, 12 + dy, 11, 11);
    draw(coat, 8, 12 + dy, 10, 7);
    draw('#6c939c', 8, 12 + dy, 10, 2);
    draw('#1a2935', 8, 21 - stride / 2, 4, 7);
    draw('#213543', 15, 21 + stride / 2, 4, 7);
    draw('#51616b', 8, 25 - stride / 2, 4, 2);
    draw('#51616b', 15, 25 + stride / 2, 4, 2);
    draw('#091521', 7, 27 - stride / 2, 6, 3);
    draw('#091521', 14, 27 + stride / 2, 6, 3);
    draw('#172936', 7, 3 + dy, 13, 10);
    draw(other ? '#4e7785' : '#513c37', 8, 3 + dy, 11, 7);
    draw(other ? '#8cabb0' : '#815846', 9, 3 + dy, 9, 2);
    if (face !== 'up') {
      const offset = face === 'left' ? -1 : face === 'right' ? 2 : 0;
      draw('#c78f71', 9 + offset, 7 + dy, 8, 5);
      draw('#e5b292', 10 + offset, 7 + dy, 6, 3);
      draw('#27303c', 11 + offset, 8 + dy, 1, 1);
      if (face === 'down') draw('#27303c', 15, 8 + dy, 1, 1);
    }
    if (face === 'up' || face === 'left') {
      draw('#273f43', 8, 13 + dy, 9, 8);
      draw('#61726b', 9, 13 + dy, 7, 3);
    }
    draw(trim, face === 'left' ? 9 : 16, 13 + dy, 2, 8);
    draw(coat, 5, 14 + dy, 3, 6);
    draw(coat, 18, 14 + dy, 3, 6);
    draw('#dbac8c', face === 'left' ? 5 : 19, 19 + dy, 2, 2);
    if (!other) draw('#e9c686', face === 'left' ? 3 : 21, 18 + dy, 3, 2);
  }
  texture.refresh();
  return key;
}
