import { sectors, type Point } from './campaign';

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
  mode: PlayMode;
  checkpoint: Point | null;
  flags: Record<string, boolean>;
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
  version: 1, chapter: 0, mode, checkpoint: null, flags: {}, attempts: {}, notes: [],
  voice: null, completed: false,
});

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

export function loadProgress(): Progress | null {
  const value = read(SAVE_KEY);
  if (!record(value) || value.version !== 1 || typeof value.chapter !== 'number' ||
      !Number.isInteger(value.chapter) || !sectors[value.chapter] ||
      (value.mode !== 'solo' && value.mode !== 'teacher') || typeof value.completed !== 'boolean') return null;

  const clean = blankProgress(value.mode);
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
    clean.flags = Object.fromEntries(Object.entries(value.flags).flatMap(([key, flag]) => flag === true ? [[key, true] as const] : []));
  }
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

export const saveProgress = (progress: Progress): boolean => write(SAVE_KEY, progress);
export function loadSettings(): Settings {
  const value = read(SETTINGS_KEY);
  return {
    sound: !record(value) || value.sound !== false,
    reduced: record(value) ? value.reduced === true : matchMedia('(prefers-reduced-motion: reduce)').matches,
    story: record(value) && value.story === true,
  };
}
export const saveSettings = (settings: Settings): boolean => write(SETTINGS_KEY, settings);
