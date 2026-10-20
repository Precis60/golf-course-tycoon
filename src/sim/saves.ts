import { buildStarterHoles, defaultSizes, sanitizeSizes } from './course';
import { landDef } from './grid';
import { normalizeHole } from './holes';
import {
  defaultSettings,
  isTile,
  type Difficulty,
  type GameState,
  type LandKey,
  type Quality,
  type SaveBundle,
  type TileKind,
} from './types';

export const SAVE_KEY = 'gct.v4';
export const LEGACY_KEY = 'golfTycoonV2';

export function emptyBundle(): SaveBundle {
  return { v: 4, settings: defaultSettings(), slots: [], autosave: null };
}

function asQuality(v: unknown): Quality {
  return v === 'battery' || v === 'ultra' || v === 'high' ? v : 'high';
}

function asDifficulty(v: unknown): Difficulty {
  return v === 'easy' || v === 'hard' || v === 'normal' ? v : 'normal';
}

/** Turn a previous single-save (`golfTycoonV2`) object into a v4 game. */
export function migrateLegacy(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.tiles)) return null;
  let tilesIn = (s.tiles as unknown[]).map((t) => (typeof t === 'string' && isTile(t) ? t : 'rough')) as TileKind[];

  let land: LandKey | null = s.land === 'standard' || s.land === 'large' || s.land === 'estate' ? s.land : null;
  if (!land) {
    if (tilesIn.length === LAND_COUNT.large) land = 'large';
    else if (tilesIn.length === LAND_COUNT.estate) land = 'estate';
    else land = 'standard';
  }
  if (!land && s.cols === 84 && s.rows === 60) land = 'large';
  if (!land && s.cols === 112 && s.rows === 80) land = 'estate';
  const def = landDef(land);
  if (tilesIn.length === 1120) {
    const nt = Array(def.cols * def.rows).fill('rough') as TileKind[];
    for (let y = 0; y < 28; y++) for (let x = 0; x < 40; x++) nt[y * def.cols + x] = tilesIn[y * 40 + x];
    tilesIn = nt;
  }
  if (tilesIn.length !== def.cols * def.rows) return null;

  const courseSize: 9 | 18 = s.courseSize === 18 || (Array.isArray(s.holes) && s.holes.length > 9) ? 18 : 9;
  const num = (k: string, fallback: number) => {
    const n = Number(s[k]);
    return Number.isFinite(n) ? n : fallback;
  };
  const state: GameState = {
    v: 4,
    name: 'Imported course',
    courseSize,
    land: def.key,
    cols: def.cols,
    rows: def.rows,
    sizes: sanitizeSizes(s.sizes),
    quality: asQuality(s.quality),
    difficulty: 'normal',
    cash: num('cash', 750000),
    week: num('week', 1),
    condition: num('condition', 82),
    reputation: num('reputation', 55),
    satisfaction: num('satisfaction', 62),
    members: num('members', 120),
    loan: num('loan', 0),
    tiles: tilesIn,
    teeMap: cleanMap(s.teeMap, def.cols * def.rows),
    greenMap: cleanMap(s.greenMap, def.cols * def.rows),
    fee: num('fee', 65),
    maint: num('maint', 18000),
    marketing: num('marketing', 6000),
    staff: num('staff', 6),
    tool: typeof s.tool === 'string' ? (s.tool as GameState['tool']) : 'holeedit',
    holeNo: num('holeNo', 1),
    focusHole: num('focusHole', 1),
    philosophy: s.philosophy === 'penal' || s.philosophy === 'heroic' ? s.philosophy : 'strategic',
    holes: [],
    club: s.club === 'iron' || s.club === 'wedge' || s.club === 'putter' ? s.club : 'driver',
    cashHist: Array.isArray(s.cashHist) ? s.cashHist.map(Number).filter((n) => Number.isFinite(n)).slice(-24) : [num('cash', 750000)],
    lastProfit: num('lastProfit', 0),
    weather: typeof s.weather === 'string' ? s.weather : 'Fine',
    seasonOver: !!s.seasonOver,
    round: { scores: Array(courseSize).fill(null), started: true },
    log: ['Imported a saved course from the previous version.'],
    playLog: 'Drag to aim, choose a club, then hold and release Swing.',
  };
  if (!state.cashHist.length) state.cashHist = [state.cash];
  if (Array.isArray(s.holes)) {
    state.holes = s.holes.slice(0, courseSize).map((h, i) => normalizeHole(h, i, state.cols, state.rows));
  } else {
    const kept = state.tiles.slice();
    buildStarterHoles(state);
    state.tiles = kept;
    state.log.push('Older save had no hole routes. A starter routing was added on top of your painted land.');
  }
  const round = s.round as { scores?: unknown[] } | null;
  if (round && Array.isArray(round.scores)) {
    state.round.scores = Array.from({ length: courseSize }, (_, i) => {
      const v = round.scores?.[i];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
  }
  state.focusHole = clampHole(state.focusHole, state.holes.length);
  state.holeNo = state.focusHole;
  return state;
}

const LAND_COUNT = { standard: 56 * 40, large: 84 * 60, estate: 112 * 80 };

function clampHole(n: number, len: number) {
  return Math.max(1, Math.min(len || 1, Math.round(n) || 1));
}

function cleanMap(m: unknown, n: number) {
  const o: Record<string, number> = {};
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    Object.keys(m as Record<string, unknown>).forEach((k) => {
      const i = +k;
      const v = +((m as Record<string, unknown>)[k] as number);
      if (Number.isInteger(i) && i >= 0 && i < n && v >= 1 && v <= 18) o[i] = v;
    });
  }
  return o;
}

export function normalizeBundle(raw: unknown): SaveBundle {
  const base = emptyBundle();
  if (!raw || typeof raw !== 'object') return base;
  const b = raw as Partial<SaveBundle>;
  base.settings = { ...defaultSettings(), ...(b.settings || {}) };
  base.settings.quality = asQuality(base.settings.quality);
  base.settings.master = clamp01(base.settings.master);
  base.settings.sfx = clamp01(base.settings.sfx);
  base.settings.music = clamp01(base.settings.music);
  if (b.autosave && typeof b.autosave === 'object') {
    const migrated = b.autosave.v === 4 ? sanitizeState(b.autosave) : migrateLegacy(b.autosave);
    base.autosave = migrated;
  }
  if (Array.isArray(b.slots)) {
    base.slots = b.slots
      .slice(0, 3)
      .map((slot, i) => ({
        id: slot?.id ?? i + 1,
        name: String(slot?.name || `Slot ${i + 1}`),
        savedAt: String(slot?.savedAt || ''),
        state: sanitizeState(slot?.state),
      }))
      .filter((s) => !!s.state) as SaveBundle['slots'];
  }
  return base;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(+n) ? +n : 0.8));
}

export function sanitizeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GameState>;
  if (!Array.isArray(s.tiles) || !s.cols || !s.rows) {
    return migrateLegacy(raw);
  }
  if (s.tiles.length !== s.cols * s.rows) return migrateLegacy(raw);
  const land = s.land === 'large' || s.land === 'estate' || s.land === 'standard' ? s.land : 'standard';
  const def = landDef(land);
  const state = migrateLegacy({
    ...s,
    land: def.key,
    cols: def.cols,
    rows: def.rows,
    tiles: s.tiles,
    holes: s.holes,
    v: 4,
  });
  if (!state) return null;
  state.name = typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 40) : 'My Course';
  state.difficulty = asDifficulty(s.difficulty);
  state.quality = asQuality(s.quality);
  state.sizes = sanitizeSizes(s.sizes ?? defaultSizes());
  if (Array.isArray(s.log)) state.log = s.log.filter((x) => typeof x === 'string').slice(-40);
  if (typeof s.playLog === 'string') state.playLog = s.playLog;
  return state;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function loadBundle(storage: StorageLike): { bundle: SaveBundle; importedLegacy: boolean } {
  let importedLegacy = false;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) return { bundle: normalizeBundle(JSON.parse(raw)), importedLegacy: false };
  } catch {
    /* fall through to legacy */
  }
  try {
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const state = migrateLegacy(JSON.parse(legacy));
      if (state) {
        importedLegacy = true;
        const bundle = emptyBundle();
        bundle.autosave = state;
        return { bundle, importedLegacy };
      }
    }
  } catch {
    /* ignore broken legacy */
  }
  return { bundle: emptyBundle(), importedLegacy: false };
}

export function writeBundle(storage: StorageLike, bundle: SaveBundle) {
  storage.setItem(SAVE_KEY, JSON.stringify(bundle));
}

export function exportJson(state: GameState) {
  return JSON.stringify({ kind: 'golf-course-tycoon', v: 4, state }, null, 2);
}

export function importJson(text: string): GameState | null {
  const parsed = JSON.parse(text) as { state?: unknown; tiles?: unknown };
  if (parsed && typeof parsed === 'object' && 'state' in parsed) return sanitizeState(parsed.state);
  return sanitizeState(parsed);
}
