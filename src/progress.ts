import { ECHO_LIMIT, ECHO_PAD_RADIUS, TILE, sectors, toPoint, type EchoSample, type Point } from './campaign';
import { terminals, type TerminalVersions } from './learning';

const SAVE_KEY = 'station-zero-v1';
const SETTINGS_KEY = 'station-zero-settings-v1';

export const MAX_HEALTH = 5;
export type PlayMode = 'solo' | 'teacher';
export interface Attempt {
  count: number;
  errors: number;
  hints: number;
  passed: boolean;
  reviewed: boolean;
}
export interface Progress {
  version: 1;
  chapter: number;
  lesson: boolean;
  mode: PlayMode;
  checkpoint: Point | null;
  echoTrace: EchoSample[] | null;
  flags: Record<string, boolean>;
  terminalVersions: TerminalVersions;
  attempts: Record<string, Attempt>;
  notes: string[];
  voice: 'self' | 'teacher' | null;
  completed: boolean;
}
export interface Settings {
  sound: boolean;
  reduced: boolean;
  story: boolean;
}

export const blankProgress = (mode: PlayMode): Progress => ({
  version: 1, chapter: 0, lesson: false, mode, checkpoint: null, echoTrace: null, flags: {},
  terminalVersions: {}, attempts: {}, notes: [], voice: null, completed: false,
});

export function blankLesson(chapter: number, mode: PlayMode): Progress {
  const progress = blankProgress(mode);
  progress.chapter = chapter;
  progress.lesson = true;
  if (chapter > 0) progress.flags = { kit: true, byte: true };
  return progress;
}

const progressKey = (lessonChapter?: number) => lessonChapter === undefined ? SAVE_KEY : `station-zero-lesson-${lessonChapter}-v1`;

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function loadEchoTrace(value: unknown): EchoSample[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 360) return null;
  const archive = sectors[1];
  const pad = archive.objects.find(object => object.id === 'pad-a');
  if (!pad) return null;
  const goal = toPoint(pad.at);
  const samples: EchoSample[] = [];
  let previous = -1;
  for (const sample of value) {
    if (!record(sample)) return null;
    const { x, y, at, face, frame } = sample;
    if (typeof x !== 'number' || !(x >= 0 && x < archive.width * TILE) ||
        typeof y !== 'number' || !(y >= 0 && y < archive.height * TILE) ||
        typeof at !== 'number' || !(at > previous && at <= ECHO_LIMIT + 40) ||
        typeof face !== 'number' || !Number.isFinite(face) || Math.abs(face) > Math.PI ||
        typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0 || frame > 3) return null;
    previous = at;
    samples.push({ x, y, at, face, frame });
  }
  const last = samples[samples.length - 1];
  return samples[0].at === 0 && Math.hypot(last.x - goal.x, last.y - goal.y) < ECHO_PAD_RADIUS ? samples : null;
}

export function loadProgress(lessonChapter?: number): Progress | null {
  const value = read(progressKey(lessonChapter));
  if (!record(value) || value.version !== 1 || typeof value.chapter !== 'number' ||
      !Number.isInteger(value.chapter) || !sectors[value.chapter] ||
      (value.mode !== 'solo' && value.mode !== 'teacher') || typeof value.completed !== 'boolean' ||
      (lessonChapter === undefined ? value.lesson === true : value.lesson !== true || value.chapter !== lessonChapter)) return null;

  const clean = lessonChapter === undefined ? blankProgress(value.mode) : blankLesson(lessonChapter, value.mode);
  clean.chapter = value.chapter;
  clean.completed = value.completed;
  if (value.voice === 'self' || value.voice === 'teacher') clean.voice = value.voice;
  if (record(value.checkpoint)) {
    const { x, y } = value.checkpoint;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      clean.checkpoint = { x, y };
    }
  }
  if (record(value.flags)) {
    Object.assign(clean.flags, Object.fromEntries(Object.entries(value.flags)
      .filter(([key, flag]) => flag === true && /^[a-z][a-z0-9-]*$/iu.test(key) && !Object.hasOwn(Object.prototype, key))));
  }
  const terminalVersions = record(value.terminalVersions) ? value.terminalVersions : undefined;
  const originalTerminals = Array.isArray(value.originalTerminals) ? value.originalTerminals : undefined;
  for (const [id, terminal] of Object.entries(terminals)) {
    if (clean.lesson && terminal.chapter !== clean.chapter) continue;
    if (!clean.completed && terminal.chapter >= clean.chapter && !clean.flags[id]) continue;
    if (!terminalVersions) {
      clean.terminalVersions[id] = !originalTerminals || originalTerminals.includes(id) ? 1 : 2;
      continue;
    }
    const version = terminalVersions[id];
    if (version === 1 || version === 2) clean.terminalVersions[id] = version;
  }
  if (clean.chapter === 1 && !clean.flags.echoSolved) clean.echoTrace = loadEchoTrace(value.echoTrace);
  if (Array.isArray(value.notes)) clean.notes = value.notes.filter((note): note is string => typeof note === 'string');
  if (record(value.attempts)) {
    for (const [id, a] of Object.entries(value.attempts)) {
      if (!/^C\d\d-\d\d$/u.test(id) || !record(a)) continue;
      const { count, errors, hints, passed, reviewed } = a;
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0 &&
          typeof errors === 'number' && Number.isInteger(errors) && errors >= 0 && errors <= count &&
          typeof hints === 'number' && Number.isInteger(hints) && hints >= 0 && hints <= 2 &&
          typeof passed === 'boolean' && typeof reviewed === 'boolean') {
        clean.attempts[id] = { count, errors, hints, passed, reviewed };
      }
    }
  }
  return clean;
}

export const saveProgress = (progress: Progress): boolean => write(progressKey(progress.lesson ? progress.chapter : undefined), progress);
export function loadSettings(): Settings {
  const value = read(SETTINGS_KEY);
  return {
    sound: !record(value) || value.sound !== false,
    reduced: record(value) ? value.reduced === true : matchMedia('(prefers-reduced-motion: reduce)').matches,
    story: record(value) && value.story === true,
  };
}
export const saveSettings = (settings: Settings): boolean => write(SETTINGS_KEY, settings);
