import Phaser from 'phaser';
import { characterTexture, propTexture, stationTexture, type Character } from './art';
import { HEIGHT, TILE, WIDTH, sectors, toPoint, type Point, type Sector, type StationObject } from './campaign';
import { distance, Geometry, inside } from './geometry';
import { MAX_HEALTH, type Progress, type Settings } from './progress';

interface WorldHooks {
  ready(): void;
  interact(object: StationObject): void;
  event(id: string): void;
  notice(text: string): void;
  sound(cue: 'shot' | 'hit' | 'alert' | 'action' | 'door' | 'echo'): void;
  status(value: WorldStatus): void;
}

export interface WorldStatus {
  health: number;
  dash: number;
  nearest?: StationObject;
  target?: { object: StationObject; direction: number; distance: number };
  echo?: { label: string; ratio: number };
  room: string;
}

interface Actor extends Point {
  image: Phaser.GameObjects.Image;
  face: number;
  type: Character;
  frame: number;
}

interface Enemy extends Actor {
  id: string;
  start: Point;
  path: Point[];
  step: number;
  health: number;
  shotAt: number;
  seenUntil: number;
  lastSeen: Point;
  stunUntil: number;
  down: boolean;
}
interface Shot extends Point {
  dx: number;
  dy: number;
  ttl: number;
  hostile: boolean;
}
interface Spark extends Point { dx: number; dy: number; ttl: number; duration: number; color: number }
interface Emitter { object: StationObject; point: Point; phaseOffset: number; health: number; shotAt: number }
interface TracePoint extends Point { at: number; face: number; frame: number }
type EchoState =
  | { phase: 'record'; started: number; samples: TracePoint[] }
  | { phase: 'ready'; samples: TracePoint[] }
  | { phase: 'play'; started: number; samples: TracePoint[]; cursor: number; onA: boolean; overlap: number };

const moveKeys = ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aimAngle = (a: Point, b: Point): number => Math.atan2(b.y - a.y, b.x - a.x);
const RECORD_TIME = 11000;
const INTERACTION_RANGE = 48;
const COLORS = { teal: 0x7ce2cf, mint: 0xb8f3de, gold: 0xf2b472, danger: 0xf48373, dark: 0x182a34 };

export class StationWorld extends Phaser.Scene {
  private sector!: Sector;
  private geometry!: Geometry;
  private state!: Progress;
  private settings!: Settings;
  private player!: Actor;
  private byte?: Actor;
  private danya?: Actor;
  private ghost?: Actor;
  private staticArt!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private enemies: Enemy[] = [];
  private emitters: Emitter[] = [];
  private bullets: Shot[] = [];
  private sparks: Spark[] = [];
  private keys = new Set<string>();
  private targets: string[] = [];
  private health = MAX_HEALTH;
  private clock = 0;
  private lastHud = -1;
  private statusKey = '';
  private shotAt = 0;
  private dashAt = 0;
  private dashUntil = 0;
  private dashDirection = 0;
  private invulnerableUntil = 0;
  private paused = true;
  private loaded = false;
  private echo?: EchoState;
  private controlPoint = { x: 0, y: 0 };
  private routeKey = '';
  private guide?: Point;

  constructor(private hooks: WorldHooks) {
    super('station');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d161f');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.loaded || this.paused || !pointer.leftButtonDown()) return;
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.fire(aimAngle(this.player, p));
    });
    this.hooks.ready();
  }

  loadSector(state: Progress, settings: Settings): void {
    this.loaded = false;
    this.children.removeAll(true);
    this.state = state;
    this.sector = sectors[state.chapter];
    this.settings = settings;
    this.geometry = new Geometry(this.sector, state.flags);
    this.clock = 0;
    this.lastHud = -1;
    this.statusKey = '';
    this.bullets = [];
    this.sparks = [];
    this.echo = undefined;
    this.shotAt = 0;
    this.dashAt = 0;
    this.dashUntil = 0;
    this.invulnerableUntil = 0;
    this.health = MAX_HEALTH;
    this.targets = [];
    this.routeKey = '';
    this.guide = undefined;
    this.keys.clear();
    const { width, height } = this.sector;
    this.add.image(0, 0, stationTexture(this, this.sector, this.geometry.grid, state.chapter)).setOrigin(0).setDepth(-20);
    this.sector.props.forEach((prop, i) => {
      const { key, position } = propTexture(this, prop, i, state.chapter);
      this.add.image(position.x, position.y, key).setOrigin(0).setDepth((prop.area[1] + prop.area[3]) * TILE);
    });
    this.staticArt = this.add.graphics().setDepth(-2);
    this.effects = this.add.graphics().setDepth(3000);

    const spawn = toPoint(this.sector.spawn);
    this.controlPoint = state.checkpoint && !this.geometry.blocked(state.checkpoint.x, state.checkpoint.y, 7)
      ? { ...state.checkpoint } : spawn;
    this.player = this.actor('mira', this.controlPoint);
    this.byte = undefined;
    this.danya = undefined;
    this.ghost = undefined;
    this.syncCompanions();
    this.enemies = this.sector.patrols.map(patrol => {
      const start = toPoint(patrol.at);
      const enemy: Enemy = {
        ...this.actor('drone', start), id: patrol.id, start, path: patrol.path.map(toPoint), step: 0,
        health: 3, shotAt: 0, seenUntil: 0, lastSeen: start, stunUntil: 0, down: !!state.flags[patrol.id],
      };
      enemy.image.setVisible(!enemy.down);
      return enemy;
    });
    this.emitters = this.sector.objects.filter(object => object.kind === 'emitter').map((object, i) => ({
      object, point: toPoint(object.at), phaseOffset: i * 1300, health: 3, shotAt: 0,
    }));
    const camera = this.cameras.main;
    camera.setBounds(0, 0, width * TILE, height * TILE);
    camera.centerOn(this.player.x, this.player.y);
    camera.startFollow(this.player.image, true, .12, .12);
    this.loaded = true;
    this.drawFixtures();
    this.publishStatus();
  }

  setSettings(settings: Settings): void { this.settings = settings; }
  setPaused(paused: boolean): void { this.paused = paused; this.keys.clear(); }
  setTargets(ids: string[]): void {
    this.targets = ids;
    this.routeKey = '';
    this.lastHud = -1;
    if (this.loaded) {
      this.syncCompanions();
      this.publishStatus();
    }
  }
  getTargets(): string[] { return this.targetPoints(); }
  getPosition(): Point { return { x: this.player.x, y: this.player.y }; }

  setCheckpoint(): Point {
    this.controlPoint = this.getPosition();
    return { ...this.controlPoint };
  }

  hold(code: string, active: boolean): void {
    if (active && !this.paused) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearControls(): void { this.keys.clear(); }

  tap(code: string): void {
    if (this.paused || !this.loaded) return;
    if (code === 'KeyE') {
      const object = this.nearest();
      if (object) this.hooks.interact(object);
    }
    if (code === 'KeyF') this.fire(this.player.face);
    if (code === 'Space' && this.clock >= this.dashAt) {
      const { x, y } = this.direction();
      this.dashDirection = x || y ? Math.atan2(y, x) : this.player.face;
      this.dashUntil = this.clock + 240;
      this.dashAt = this.clock + 1350;
      this.hooks.sound('action');
    }
    if (code === 'KeyR' && this.echo && !this.state.flags.echoSolved) {
      this.clearEcho();
      this.hooks.notice('Запись очищена. У стойки можно начать заново.');
    }
  }

  useEcho(): void {
    if (this.state.flags.echoSolved) return;
    if (this.echo?.phase === 'ready') {
      this.echo = { phase: 'play', started: this.clock, samples: this.echo.samples, cursor: 0, onA: false, overlap: 0 };
      this.ghost = this.actor('mira', this.player);
      this.ghost.image.setAlpha(.48);
      this.hooks.sound('echo');
      this.hooks.notice('Эхо пошло к площадке А. Встань на площадку Б.');
      return;
    }
    if (this.echo) return;
    this.echo = { phase: 'record', started: this.clock, samples: [] };
    this.hooks.sound('echo');
    this.hooks.notice('Запись началась. Дойди до площадки А и стой на ней до конца записи.');
  }

  private clearEcho(): void {
    this.echo = undefined;
    this.ghost?.image.destroy();
    this.ghost = undefined;
  }

  private actor(type: Character, point: Point): Actor {
    const image = this.add.image(point.x, point.y, characterTexture(this, type, 0, 0)).setOrigin(.5, .95).setScale(type === 'drone' ? 1.47 : 1.39);
    image.setDepth(point.y);
    return { x: point.x, y: point.y, image, face: 0, type, frame: 0 };
  }

  private syncCompanions(): void {
    if (this.state.flags.byte && !this.byte) {
      this.byte = this.actor('byte', { x: this.player.x + 25, y: this.player.y + 12 });
    }
    if (this.state.chapter === 2 && this.state.flags.danya && !this.danya) {
      this.danya = this.actor('danya', { x: this.player.x - 23, y: this.player.y + 12 });
    }
  }

  private syncActor(actor: Actor, moving: boolean, speed = 125): void {
    actor.frame = moving ? Math.floor(this.clock / speed) % 4 : 0;
    actor.image.setPosition(Math.round(actor.x), Math.round(actor.y));
    actor.image.setDepth(Math.round(actor.y) + 1);
    actor.image.setTexture(characterTexture(this, actor.type, actor.face, actor.frame));
  }

  private direction(): Point {
    return {
      x: Number(this.keys.has(moveKeys[2]) || this.keys.has(moveKeys[3])) - Number(this.keys.has(moveKeys[0]) || this.keys.has(moveKeys[1])),
      y: Number(this.keys.has(moveKeys[6]) || this.keys.has(moveKeys[7])) - Number(this.keys.has(moveKeys[4]) || this.keys.has(moveKeys[5])),
    };
  }

  update(_time: number, delta: number): void {
    if (!this.loaded || this.paused) return;
    const milliseconds = Math.min(delta, 40);
    const dt = milliseconds / 1000;
    this.clock += milliseconds;
    const direction = this.direction();
    const moving = !!(direction.x || direction.y);
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const dashing = this.clock < this.dashUntil;
    if (moving || dashing) {
      const angle = dashing ? this.dashDirection : Math.atan2(direction.y, direction.x);
      const speed = dashing ? 310 : sprint ? 208 : 145;
      this.player.face = angle;
      this.geometry.move(this.player, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt, 7);
    }
    if (this.keys.has('KeyF')) this.fire(this.player.face);
    this.syncActor(this.player, moving || dashing, sprint ? 79 : 119);
    this.player.image.setAlpha(this.clock < this.invulnerableUntil && !this.settings.reduced && Math.floor(this.clock / 85) % 2 ? .45 : 1);
    if (this.byte) this.follow(this.byte, this.player, 33, dt);
    if (this.danya) this.follow(this.danya, this.byte ?? this.player, 43, dt);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt, sprint && moving);
    this.updateEcho(milliseconds);
    this.updateEmitters();
    this.updateShots(dt);
    this.updateContour();
    this.drawFixtures();
    this.drawEffects(dt);
    this.publishStatus();
  }

  private follow(actor: Actor, target: Point, threshold: number, dt: number): void {
    const gap = distance(actor, target);
    if (gap > 160 && !this.geometry.clear(actor, target)) {
      const x = target.x - Math.cos(this.player.face) * threshold;
      const y = target.y - Math.sin(this.player.face) * threshold;
      actor.x = this.geometry.blocked(x, y, 7) ? target.x : x;
      actor.y = this.geometry.blocked(x, y, 7) ? target.y : y;
    }
    if (gap > threshold) {
      actor.face = aimAngle(actor, target);
      const amount = Math.min(gap - threshold, 200 * dt);
      this.geometry.move(actor, Math.cos(actor.face) * amount, Math.sin(actor.face) * amount, 7);
    }
    this.syncActor(actor, gap > threshold + 3);
  }

  private updateEnemy(enemy: Enemy, dt: number, heard: boolean): void {
    if (enemy.down) return;
    const gap = distance(enemy, this.player);
    const angle = aimAngle(enemy, this.player);
    const inCone = Math.cos(angle - enemy.face) > .53;
    const range = this.settings.story ? 152 : 204;
    const sees = gap < range && (inCone || gap < 63 || enemy.seenUntil > this.clock) && this.geometry.clear(enemy, this.player);
    const hears = heard && gap < 110 && this.geometry.clear(enemy, this.player);
    const wasAlert = this.clock < enemy.seenUntil;
    if (sees || hears) {
      enemy.lastSeen = this.getPosition();
      enemy.seenUntil = this.clock + 2400;
      if (!wasAlert) this.hooks.sound('alert');
    }
    const alerted = this.clock < enemy.seenUntil;
    const destination = alerted ? enemy.lastSeen : enemy.path[enemy.step];
    if (!alerted && distance(enemy, destination) < 13) enemy.step = (enemy.step + 1) % enemy.path.length;
    const moving = this.clock >= enemy.stunUntil && (!sees || gap > 101);
    if (moving && distance(enemy, destination) > 7) {
      enemy.face = aimAngle(enemy, destination);
      const speed = alerted ? 87 : 55;
      this.geometry.move(enemy, Math.cos(enemy.face) * speed * dt, Math.sin(enemy.face) * speed * dt, 8);
    }
    if (sees) enemy.face = angle;
    if (sees && gap < 185 && this.clock >= enemy.shotAt && this.clock >= enemy.stunUntil) {
      enemy.shotAt = this.clock + (this.settings.story ? 1630 : 1120);
      this.spawnShot(enemy, angle, true);
    }
    this.syncActor(enemy, moving);
    enemy.image.setAlpha(this.clock < enemy.stunUntil ? .65 : 1);
  }

  private fire(angle: number): void {
    if (!this.state.flags.kit || this.clock < this.shotAt || this.bullets.length >= 36) return;
    this.player.face = angle;
    this.shotAt = this.clock + 235;
    this.spawnShot(this.player, angle, false);
    this.hooks.sound('shot');
  }

  private spawnShot(origin: Point, angle: number, hostile: boolean): void {
    const speed = hostile ? (this.settings.story ? 154 : 188) : 440;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    this.bullets.push({ x: origin.x + dx * 10, y: origin.y + dy * 10, dx: dx * speed, dy: dy * speed, ttl: hostile ? 1.9 : 1.13, hostile });
    this.burst({ x: origin.x + dx * 16, y: origin.y + dy * 16 }, hostile ? COLORS.danger : COLORS.mint, 3);
  }

  private burst(point: Point, color: number, count: number): void {
    const number = this.settings.reduced ? Math.min(count, 3) : count;
    for (let i = 0; i < number; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 80;
      const duration = .22 + Math.random() * .23;
      this.sparks.push({ ...point, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, ttl: duration, duration, color });
    }
  }

  private updateShots(dt: number): void {
    const pending = this.bullets;
    this.bullets = [];
    for (const shot of pending) {
      shot.ttl -= dt;
      if (shot.ttl <= 0) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(shot.dx, shot.dy) * dt / 6));
      let consumed = false;
      for (let i = 0; i < steps && !consumed; i++) {
        shot.x += shot.dx * dt / steps;
        shot.y += shot.dy * dt / steps;
        if (this.geometry.blocked(shot.x, shot.y)) {
          this.burst(shot, shot.hostile ? COLORS.danger : COLORS.teal, 4);
          consumed = true;
        } else if (shot.hostile) {
          if (distance(shot, this.player) < 11) {
            if (this.harm()) return;
            consumed = true;
          }
        } else {
          consumed = this.hitTarget(shot);
        }
      }
      if (!consumed) this.bullets.push(shot);
    }
  }

  private hitTarget(shot: Shot): boolean {
    const enemy = this.enemies.find(item => !item.down && distance(shot, item) < 18);
    if (enemy) {
      enemy.health--;
      enemy.stunUntil = this.clock + 200;
      enemy.seenUntil = this.clock + 2450;
      enemy.lastSeen = this.getPosition();
      this.burst(shot, COLORS.gold, enemy.health ? 6 : 14);
      this.hooks.sound('hit');
      if (enemy.health <= 0) {
        enemy.down = true;
        enemy.image.setVisible(false);
        this.hooks.event(enemy.id);
        this.hooks.notice('Охранный дрон отключён.');
      }
      return true;
    }
    const emitter = this.emitters.find(item => !this.state.flags[item.object.id] && distance(shot, item.point) < 21);
    if (!emitter) return false;
    if (this.emitterOpen(emitter)) {
      emitter.health--;
      this.burst(shot, COLORS.gold, emitter.health ? 7 : 18);
      this.hooks.sound('hit');
      if (emitter.health === 0) this.hooks.event(emitter.object.id);
    } else {
      this.burst(shot, COLORS.teal, 5);
      this.hooks.notice('Щит отразил импульс. Стреляй, когда сердечник станет оранжевым.');
    }
    return true;
  }

  private harm(): boolean {
    if (this.clock < this.invulnerableUntil || this.clock < this.dashUntil) return false;
    this.health--;
    this.invulnerableUntil = this.clock + 900;
    this.burst(this.player, COLORS.danger, 10);
    this.hooks.sound('hit');
    if (!this.settings.reduced) this.cameras.main.shake(95, .003);
    if (this.health > 0) return false;

    this.health = MAX_HEALTH;
    Object.assign(this.player, this.controlPoint);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.invulnerableUntil = this.clock + 2200;
    this.bullets = [];
    this.clearEcho();
    this.enemies.forEach(enemy => {
      if (enemy.down) return;
      enemy.x = enemy.start.x;
      enemy.y = enemy.start.y;
      enemy.seenUntil = 0;
      enemy.shotAt = this.clock + 900;
      enemy.health = 3;
      enemy.step = 0;
    });
    this.emitters.forEach(emitter => { if (!this.state.flags[emitter.object.id]) emitter.health = 3; });
    this.hooks.notice('Мира вернулась к контрольной точке. Выполненные задачи сохранены.');
    return true;
  }

  private emitterOpen(emitter: Emitter): boolean {
    const duration = this.settings.story ? 1900 : 1460;
    return (this.clock + emitter.phaseOffset) % 3200 < duration;
  }

  private updateEmitters(): void {
    for (const emitter of this.emitters) {
      if (this.state.flags[emitter.object.id] || this.emitterOpen(emitter) || this.clock < emitter.shotAt) continue;
      if (distance(emitter.point, this.player) > 196 || !this.geometry.clear(emitter.point, this.player)) continue;
      emitter.shotAt = this.clock + (this.settings.story ? 1800 : 1250);
      this.spawnShot(emitter.point, aimAngle(emitter.point, this.player), true);
    }
  }

  private contourPhase(): { active: boolean; progress: number; axis: boolean; level: number } | null {
    if (this.state.chapter !== 2 || !this.state.flags.danya || this.state.flags.emittersOff) return null;
    const segment = Math.floor(this.clock / 6200);
    const phase = this.clock % 6200;
    if (phase < 3520 || phase > 5030) return null;
    return { active: phase > 4610, progress: clamp((phase - 3520) / 1090, 0, 1), axis: segment % 3 === 2, level: segment % 2 ? 28 : 22.7 };
  }

  private updateContour(): void {
    const phase = this.contourPhase();
    if (!phase?.active || !inside(this.player.x / TILE, this.player.y / TILE, [27.6, 17.5, 23.8, 17])) return;
    const lane = phase.axis ? (39.6 * TILE) : phase.level * TILE;
    if (Math.abs((phase.axis ? this.player.x : this.player.y) - lane) < (this.settings.story ? 11 : 19)) this.harm();
  }

  private updateEcho(milliseconds: number): void {
    const state = this.echo;
    if (!state || state.phase === 'ready') return;
    const elapsed = this.clock - state.started;
    const padA = this.sector.objects.find(object => object.id === 'pad-a');
    const padB = this.sector.objects.find(object => object.id === 'pad-b');
    if (!padA || !padB) return;
    const a = toPoint(padA.at);
    const b = toPoint(padB.at);
    if (state.phase === 'record') {
      if (elapsed - (state.samples.at(-1)?.at ?? -100) >= 46 || elapsed >= RECORD_TIME) {
        state.samples.push({ ...this.getPosition(), at: elapsed, face: this.player.face, frame: this.player.frame });
      }
      if (elapsed >= RECORD_TIME) {
        const recordedOnA = state.samples.filter(sample => distance(sample, a) < 24).length;
        if (recordedOnA < 25) {
          this.clearEcho();
          this.hooks.notice('Площадка А не удерживалась. Вернись к стойке и запиши путь заново.');
        } else {
          this.echo = { phase: 'ready', samples: state.samples };
          this.hooks.notice('Маршрут записан. Вернись к стойке, запусти эхо и иди на площадку Б.');
          this.hooks.sound('echo');
        }
      }
      return;
    }
    while (state.cursor < state.samples.length - 1 && state.samples[state.cursor + 1].at <= elapsed) state.cursor++;
    const from = state.samples[state.cursor];
    if (this.ghost && from) {
      const next = state.samples[state.cursor + 1] ?? from;
      const fraction = next.at === from.at ? 0 : clamp((elapsed - from.at) / (next.at - from.at), 0, 1);
      const x = from.x + (next.x - from.x) * fraction;
      const y = from.y + (next.y - from.y) * fraction;
      this.ghost.image.setPosition(x, y).setDepth(y + 2).setTexture(characterTexture(this, 'mira', from.face, from.frame));
      state.onA = distance({ x, y }, a) < 24;
      state.overlap = state.onA && distance(this.player, b) < 24 ? state.overlap + milliseconds : 0;
    }
    if (state.overlap >= 530) {
      this.clearEcho();
      this.hooks.event('echoSolved');
      this.hooks.sound('door');
      this.hooks.notice('Две площадки удерживаются. Обе двери камеры открыты.');
    } else if (elapsed >= RECORD_TIME) {
      this.ghost?.image.destroy();
      this.ghost = undefined;
      this.echo = { phase: 'ready', samples: state.samples };
      this.hooks.notice('Эхо закончилось. Запись можно запустить ещё раз со стойки.');
    }
  }

  private finished(object: StationObject): boolean {
    if (object.id === 'echo') return !!this.state.flags.echoSolved;
    if (object.kind === 'terminal') return !!this.state.flags[object.id];
    if (object.kind === 'log') return this.state.notes.includes(object.id);
    return !!this.state.flags[object.id];
  }

  private nearest(): StationObject | undefined {
    let nearest: StationObject | undefined;
    let min = INTERACTION_RANGE;
    for (const object of this.sector.objects) {
      if (object.kind === 'pad' || (this.finished(object) && object.kind !== 'log' && object.kind !== 'terminal')) continue;
      const point = toPoint(object.at);
      const gap = distance(point, this.player);
      if (gap < min && this.geometry.clear(this.player, point)) {
        min = gap;
        nearest = object;
      }
    }
    return nearest;
  }

  private targetPoints(): string[] {
    if (this.state.chapter !== 1 || !this.targets.includes('echo') || !this.echo) return this.targets;
    if (this.echo.phase === 'record') return ['pad-a'];
    if (this.echo.phase === 'play') return ['pad-b'];
    return this.targets;
  }

  private publishStatus(): void {
    if (this.clock - this.lastHud < 65 && this.lastHud >= 0) return;
    this.lastHud = this.clock;
    const target = this.sector.objects.filter(object => this.targetPoints().includes(object.id))
      .map(object => ({ object, point: toPoint(object.at) }))
      .sort((a, b) => distance(this.player, a.point) - distance(this.player, b.point))[0];
    const echo = this.echo?.phase === 'record' || this.echo?.phase === 'play'
      ? { label: this.echo.phase === 'record' ? 'Запись маршрута' : 'Воспроизведение ЭХО', ratio: clamp(1 - (this.clock - this.echo.started) / RECORD_TIME, 0, 1) }
      : undefined;
    const roomIndex = this.geometry.grid[Math.floor(this.player.y / TILE)]?.[Math.floor(this.player.x / TILE)];
    const room = roomIndex ? this.sector.rooms[roomIndex - 1]?.name ?? this.sector.location : 'Служебный переход';
    const nearby = this.nearest();
    const gap = target ? Math.round(distance(this.player, target.point) / 12) : 0;
    if (target) {
      const key = `${target.object.id}:${Math.floor(this.player.x / 16)}:${Math.floor(this.player.y / 16)}`;
      if (key !== this.routeKey) {
        this.routeKey = key;
        if (this.geometry.clear(this.player, target.point, 7)) {
          this.guide = target.point;
        } else {
          const route = this.geometry.route(this.player, target.point);
          let guide = route[0];
          for (const point of route.slice(1, 10)) {
            if (!this.geometry.clear(this.player, point, 7)) break;
            guide = point;
          }
          this.guide = guide ?? target.point;
        }
      }
    }
    const direction = target && this.guide ? aimAngle(this.player, this.guide) : 0;
    const dash = clamp(1 - (this.dashAt - this.clock) / 1350, 0, 1);
    const key = [this.health, Math.round(dash * 18), nearby?.id, target?.object.id, gap, Math.round(direction * 24), echo?.label, Math.round((echo?.ratio ?? 0) * 30), room].join('|');
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.hooks.status({
      health: this.health, dash, room, echo, nearest: nearby,
      target: target ? { object: target.object, direction, distance: gap } : undefined,
    });
  }

  private drawFixtures(): void {
    const g = this.staticArt;
    g.clear();
    if (this.state.chapter === 0 && this.state.flags.power) {
      for (const room of this.sector.rooms.slice(2)) {
        const [left, top, width, height] = room.area;
        const y = (top + height - .75) * TILE;
        for (let i = 0; i < Math.floor(width / 6); i++) {
          const x = (left + 3.2 + i * 5.5) * TILE;
          for (const radius of [43, 33, 23]) g.fillStyle(0x71e4c1, .045).fillCircle(x, y, radius);
          g.fillStyle(0xb5f4df, .9).fillRect(x - 7, y, 14, 3);
        }
      }
    }
    for (const gate of this.sector.gates) {
      const [x, y, w, h] = gate.area.map(value => value * TILE);
      const open = this.state.flags[gate.opensWith];
      g.fillStyle(0x0b1922, .97).fillRect(x - 3, y - 3, w + 6, h + 6);
      g.fillStyle(0x45636a).fillRect(x, y, w, h);
      const horizontal = w > h;
      if (open) {
        g.fillStyle(0x1b353c).fillRect(x + 2, y + 2, w - 4, h - 4);
        g.fillStyle(COLORS.teal, .46).fillRect(x + 1, y + 1, horizontal ? w - 2 : 3, horizontal ? 3 : h - 2);
      } else {
        g.fillStyle(0x253b45).fillRect(x + 3, y + 3, w - 6, h - 6);
        for (let i = 6; i < (horizontal ? w : h) - 5; i += 9) {
          g.fillStyle(0x597278).fillRect(horizontal ? x + i : x + 5, horizontal ? y + 4 : y + i, horizontal ? 2 : w - 10, horizontal ? h - 8 : 2);
        }
        g.fillStyle(COLORS.danger).fillRect(x + w / 2 - 3, y + h / 2 - 3, 6, 6);
      }
    }
    const markers = this.targetPoints();
    for (const object of this.sector.objects) {
      const at = toPoint(object.at);
      const { x, y } = at;
      const done = this.finished(object);
      const target = markers.includes(object.id);
      let color: number = done ? COLORS.teal : target ? COLORS.gold : 0x7d9c9d;
      if (object.kind === 'breaker' && !done) color = object.id === 'yellow' ? 0xffc570 : 0x73bde8;
      if ((object.kind === 'pickup' || object.kind === 'cage') && done) continue;
      if (object.kind === 'pad') {
        const active = this.state.flags.echoSolved || distance(this.player, at) < 24 ||
          (object.id === 'pad-a' && this.echo?.phase === 'play' && this.echo.onA);
        g.fillStyle(0x122c37).fillRect(x - 24, y - 24, 48, 48);
        g.lineStyle(2, active ? COLORS.teal : color, active ? .93 : .67).strokeRect(x - 22, y - 22, 44, 44);
        g.fillStyle(COLORS.teal, active ? .35 : .1).fillRect(x - 17, y - 17, 34, 34);
        const letterA = object.id === 'pad-a';
        g.lineStyle(3, active ? COLORS.mint : color, .95);
        g.beginPath();
        if (letterA) {
          g.moveTo(x - 8, y + 9); g.lineTo(x, y - 10); g.lineTo(x + 8, y + 9);
          g.moveTo(x - 5, y + 3); g.lineTo(x + 5, y + 3);
        } else {
          g.moveTo(x - 7, y + 9); g.lineTo(x - 7, y - 10); g.lineTo(x + 6, y - 10);
          g.moveTo(x - 7, y - 1); g.lineTo(x + 7, y - 1); g.lineTo(x + 7, y + 9); g.lineTo(x - 7, y + 9);
        }
        g.strokePath();
        continue;
      }
      if (object.kind === 'emitter') {
        const emitter = this.emitters.find(item => item.object.id === object.id);
        if (!emitter) continue;
        const vulnerable = !done && this.emitterOpen(emitter);
        color = done ? 0x547875 : vulnerable ? COLORS.gold : COLORS.teal;
        g.fillStyle(0x091820, .75).fillEllipse(x + 2, y + 7, 53, 38);
        g.lineStyle(2, color, .7).strokeCircle(x, y, 24);
        g.fillStyle(0x273e49).fillRect(x - 17, y - 17, 34, 33);
        g.fillStyle(color, vulnerable ? .83 : .31).fillRect(x - 9, y - 12, 18, 23);
        if (!done) for (let i = 0; i < emitter.health; i++) g.fillStyle(color).fillRect(x - 11 + i * 8, y + 27, 6, 2);
        continue;
      }
      g.fillStyle(0x0b1c25, .56).fillEllipse(x, y + 6, 39, 24);
      if (object.kind === 'exit') {
        g.lineStyle(2, color, .85).strokeRect(x - 17, y - 22, 34, 36);
        g.fillStyle(color, .22).fillRect(x - 13, y - 18, 26, 30);
        g.lineStyle(2, color, .87).beginPath().moveTo(x - 6, y - 2).lineTo(x + 7, y - 2)
          .lineTo(x + 2, y - 7).moveTo(x + 7, y - 2).lineTo(x + 2, y + 3).strokePath();
      } else if (object.kind === 'cage') {
        g.fillStyle(0x243e45).fillRect(x - 20, y - 25, 40, 34);
        g.lineStyle(2, color, .65).strokeRect(x - 20, y - 25, 40, 34);
        for (let i = -14; i < 19; i += 8) g.fillStyle(0x70888a).fillRect(x + i, y - 24, 2, 31);
        g.fillStyle(COLORS.teal).fillRect(x - 4, y - 9, 8, 4);
      } else {
        const small = object.kind === 'log';
        const w = small ? 19 : 28;
        g.fillStyle(0x40565d).fillRect(x - w / 2, y - 14, w, 21);
        g.fillStyle(0x172b36).fillRect(x - w / 2 + 2, y - 12, w - 4, 15);
        g.fillStyle(color, .85).fillRect(x - w / 2 + 4, y - 10, w - 8, 4);
        g.fillStyle(color, .4).fillRect(x - w / 2 + 4, y - 3, w - 12, 2);
        if (object.kind === 'breaker' || object.kind === 'lever') {
          g.fillStyle(color).fillRect(x + (done ? 1 : -4), y - 6, 4, 15);
          g.fillStyle(0x9cafaa).fillRect(x - 10, y + 6, 20, 3);
        }
      }
      if (target) {
        const d = this.settings.reduced ? 0 : Math.sin(this.clock / 280) * 2;
        g.fillStyle(color, .16).fillCircle(x, y - 12, 25 + d);
        g.fillStyle(color).beginPath().moveTo(x, y - 29 + d).lineTo(x + 5, y - 34 + d)
          .lineTo(x, y - 39 + d).lineTo(x - 5, y - 34 + d).closePath().fillPath();
      }
    }
  }

  private drawEffects(dt: number): void {
    const g = this.effects;
    g.clear();
    for (const actor of [this.player, this.byte, this.danya]) {
      if (!actor) continue;
      g.fillStyle(actor === this.player ? COLORS.mint : COLORS.teal, .23).fillEllipse(actor.x, actor.y + 1, actor === this.player ? 23 : 16, 7);
    }
    for (const enemy of this.enemies) {
      if (enemy.down || distance(enemy, this.player) > 350) continue;
      const range = this.settings.story ? 152 : 204;
      const spread = .72;
      const alert = this.clock < enemy.seenUntil;
      const points = [new Phaser.Math.Vector2(enemy.x, enemy.y)];
      for (let i = 0; i <= 14; i++) {
        const angle = enemy.face - spread + 2 * spread * i / 14;
        let length = 9;
        while (length < range && !this.geometry.blocked(enemy.x + Math.cos(angle) * length, enemy.y + Math.sin(angle) * length)) length += 7;
        points.push(new Phaser.Math.Vector2(enemy.x + Math.cos(angle) * length, enemy.y + Math.sin(angle) * length));
      }
      g.fillStyle(alert ? COLORS.danger : COLORS.gold, alert ? .17 : .088).fillPoints(points, true);
      g.lineStyle(1, alert ? COLORS.danger : COLORS.gold, alert ? .34 : .20).strokePoints(points, true);
      if (alert) g.fillStyle(COLORS.danger).fillRect(enemy.x - 2, enemy.y - 43, 4, 8).fillRect(enemy.x - 2, enemy.y - 33, 4, 3);
      for (let i = 0; i < enemy.health; i++) g.fillStyle(COLORS.danger, .82).fillRect(enemy.x - 10 + i * 7, enemy.y - 29, 5, 2);
    }
    for (const bullet of this.bullets) {
      const scale = bullet.hostile ? .045 : .027;
      g.lineStyle(bullet.hostile ? 2 : 3, bullet.hostile ? COLORS.danger : COLORS.teal, .86);
      g.lineBetween(bullet.x, bullet.y, bullet.x - bullet.dx * scale, bullet.y - bullet.dy * scale);
      g.fillStyle(bullet.hostile ? 0xffd0a6 : 0xd8fff1, .9).fillCircle(bullet.x, bullet.y, 2);
    }
    this.sparks = this.sparks.filter(spark => {
      spark.ttl -= dt;
      if (spark.ttl <= 0) return false;
      spark.x += spark.dx * dt;
      spark.y += spark.dy * dt;
      g.fillStyle(spark.color, spark.ttl / spark.duration).fillRect(spark.x, spark.y, 2, 2);
      return true;
    });
    const phase = this.contourPhase();
    if (phase) {
      const x = phase.axis ? 39.6 * TILE - 19 : 27.6 * TILE;
      const y = phase.axis ? 17.5 * TILE : phase.level * TILE - 19;
      const w = phase.axis ? 38 : 23.8 * TILE;
      const h = phase.axis ? 17 * TILE : 38;
      g.fillStyle(COLORS.danger, phase.active ? .47 : .1 + .08 * phase.progress).fillRect(x, y, w, h);
      g.lineStyle(phase.active ? 3 : 1, COLORS.danger, .72).strokeRect(x, y, w, h);
    }
  }
}

export const engineConfig = (scene: StationWorld): Phaser.Types.Core.GameConfig => ({
  type: Phaser.CANVAS,
  parent: 'canvas-host',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#0d161f',
  pixelArt: true,
  roundPixels: true,
  disableContextMenu: true,
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene],
});
