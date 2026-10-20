import { hash, clamp } from './math';
import { idx, inBounds, inferLand, landDef } from './grid';
import { normalizeHole } from './holes';
import {
  difficultyProfile,
  type Difficulty,
  type GameState,
  type Hole,
  type LandKey,
  type Sizes,
  type TileKind,
} from './types';

export function defaultSizes(): Sizes {
  return {
    brushSize: 5,
    brushShape: 'round',
    teeSize: 'M',
    greenRadius: 13,
    bunkerSize: 'M',
    treeClump: 'copse',
    facilitySize: 'S',
    brushByTool: {},
    facilityByTool: {},
  };
}

export function sanitizeSizes(v: unknown): Sizes {
  const d = defaultSizes();
  if (!v || typeof v !== 'object') return d;
  const o = v as Partial<Sizes>;
  d.brushSize = clamp(Math.round(+o.brushSize! || 5), 1, 15);
  d.brushShape = o.brushShape === 'single' || o.brushShape === 'square' ? o.brushShape : 'round';
  d.teeSize = o.teeSize === 'S' || o.teeSize === 'L' ? o.teeSize : 'M';
  d.greenRadius = clamp(+o.greenRadius! || 13, 8, 24);
  d.bunkerSize = o.bunkerSize === 'S' || o.bunkerSize === 'L' ? o.bunkerSize : 'M';
  d.treeClump = o.treeClump === 'single' || o.treeClump === 'woodland' ? o.treeClump : 'copse';
  d.facilitySize = o.facilitySize === 'M' || o.facilitySize === 'L' ? o.facilitySize : 'S';
  if (o.brushByTool && typeof o.brushByTool === 'object') d.brushByTool = o.brushByTool;
  if (o.facilityByTool && typeof o.facilityByTool === 'object') d.facilityByTool = o.facilityByTool;
  return d;
}

export function blankState(opts?: {
  land?: LandKey;
  courseSize?: 9 | 18;
  difficulty?: Difficulty;
  name?: string;
  kind?: 'blank' | 'starter';
}): GameState {
  const land = landDef(opts?.land ?? 'standard');
  const difficulty = opts?.difficulty ?? 'normal';
  const profile = difficultyProfile(difficulty);
  const courseSize: 9 | 18 = opts?.courseSize === 18 ? 18 : 9;
  const N = land.cols * land.rows;
  const state: GameState = {
    v: 4,
    name: opts?.name?.trim() || 'My Course',
    courseSize,
    land: land.key,
    cols: land.cols,
    rows: land.rows,
    sizes: defaultSizes(),
    quality: 'high',
    difficulty,
    cash: profile.startCash,
    week: 1,
    condition: 82,
    reputation: 55,
    satisfaction: 62,
    members: difficulty === 'hard' ? 80 : difficulty === 'easy' ? 150 : 120,
    loan: 0,
    tiles: Array(N).fill('rough') as TileKind[],
    teeMap: {},
    greenMap: {},
    fee: 65,
    maint: 18000,
    marketing: 6000,
    staff: 6,
    tool: 'holeedit',
    holeNo: 1,
    focusHole: 1,
    philosophy: 'strategic',
    holes: [],
    club: 'driver',
    cashHist: [profile.startCash],
    lastProfit: 0,
    weather: 'Fine',
    seasonOver: false,
    round: { scores: Array(courseSize).fill(null), started: true },
    log: [],
    playLog: 'Drag to aim, choose a club, then hold and release Swing.',
  };
  if (opts?.kind === 'starter') buildStarter(state);
  return state;
}

function setTile(state: GameState, x: number, y: number, v: TileKind) {
  x = Math.round(x);
  y = Math.round(y);
  if (inBounds(state, x, y)) state.tiles[idx(state.cols, x, y)] = v;
}

export function spreadPts(pts: number[][], cols: number, rows: number) {
  if (cols === 56 && rows === 40) return pts.map((q) => ({ x: q[0], y: q[1] }));
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
  const cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  const CCx = (cx * cols) / 56;
  const CCy = (cy * rows) / 40;
  return pts.map((q) => ({
    x: clamp(CCx + (q[0] - cx), 2.5, cols - 2.5),
    y: clamp(CCy + (q[1] - cy), 2.5, rows - 2.5),
  }));
}

export function buildStarter(state: GameState) {
  const t = Array(state.cols * state.rows).fill('rough') as TileKind[];
  state.tiles = t;
  const SX = (x: number) => (x * state.cols) / 56;
  const SY = (y: number) => (y * state.rows) / 40;
  for (let x = 0; x < state.cols; x++) {
    setTile(state, x, 0, 'trees');
    setTile(state, x, state.rows - 1, 'trees');
  }
  for (let y = 0; y < state.rows; y++) {
    setTile(state, 0, y, 'trees');
    setTile(state, state.cols - 1, y, 'trees');
  }
  const copses = [
    [5, 7], [6, 8], [15, 12], [16, 18], [22, 7], [31, 11], [33, 21], [10, 12], [19, 16], [26, 20], [4, 15], [36, 18], [13, 8], [30, 26],
  ];
  copses.forEach((p) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (hash(p[0] + dx, p[1] + dy) > 0.35) setTile(state, SX(p[0] + dx), SY(p[1] + dy), 'trees');
      }
    }
  });
  [
    [21, 3], [22, 3], [21, 4], [22, 4], [23, 4], [34, 5], [35, 5], [34, 6], [21, 20], [22, 20],
  ].forEach((p) => setTile(state, SX(p[0]), SY(p[1]), 'water'));
  const fac = (x: number, y: number, k: TileKind) => {
    const fx = clamp(Math.round(SX(x)), 0, state.cols - 3);
    const fy = clamp(Math.round(SY(y)), 0, state.rows - 3);
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach((o) => setTile(state, fx + o[0], fy + o[1], k));
  };
  fac(17, 25, 'clubhouse');
  fac(21, 25, 'proshop');
  fac(25, 25, 'restaurant');
  fac(29, 25, 'carpark');
  fac(33, 25, 'maintenance');
  fac(36, 22, 'irrigation');
  fac(33, 21, 'range');
  buildStarterHoles(state);
}

export function buildBlank(state: GameState, size?: 9 | 18) {
  if (size) state.courseSize = size;
  state.tiles = Array(state.cols * state.rows).fill('rough') as TileKind[];
  state.holes = [];
  state.teeMap = {};
  state.greenMap = {};
  state.focusHole = 1;
  state.holeNo = 1;
  state.round = { scores: Array(state.courseSize).fill(null), started: true };
}

export function buildStarterHoles(state: GameState) {
  const defs: {
    pts: number[][];
    shape: Hole['greenShape'];
    slope: Hole['slope'];
    b: [number, number, Hole['bunkers'][number]['kind']][];
    w: [Hole['waters'][number]['kind'], number][];
    tmpl: string;
    par?: 3 | 4 | 5;
  }[] = [
    { pts: [[16, 23], [24, 22], [32, 20]], shape: 'round', slope: 'S', b: [[0.55, 1, 'fairway']], w: [], tmpl: 'Straight Par 4' },
    { pts: [[33, 18], [35, 10], [29, 4]], shape: 'kidney', slope: 'NE', b: [[0.45, -1, 'fairway'], [0.92, 1, 'greenside']], w: [], tmpl: 'Dogleg Left' },
    { pts: [[26, 4], [23, 4], [20, 5]], shape: 'round', slope: 'E', b: [[0.9, 1, 'greenside']], w: [['creek', 0.6]], tmpl: 'Short Par 3 over Water', par: 3 },
    { pts: [[12, 2], [17, 7], [13, 14]], shape: 'peanut', slope: 'SW', b: [[0.5, 1, 'fairway'], [0.9, -1, 'greenside']], w: [], tmpl: 'Dogleg Right' },
    { pts: [[12, 16], [6, 19], [7, 23], [12, 24]], shape: 'long', slope: 'S', b: [[0.4, 1, 'pot'], [0.85, -1, 'greenside']], w: [], tmpl: 'S-Curve', par: 4 },
    { pts: [[3, 3], [9, 3], [15, 7]], shape: 'kidney', slope: 'SE', b: [[0.55, -1, 'fairway']], w: [['lake', 0.9]], tmpl: 'Cape Hole' },
    { pts: [[20, 9], [25, 11], [23, 15], [28, 17], [34, 16]], shape: 'peanut', slope: 'NW', b: [[0.38, 1, 'fairway'], [0.7, -1, 'fairway'], [0.94, 1, 'greenside']], w: [], tmpl: 'S-Curve Par 5', par: 5 },
    { pts: [[36, 13], [37, 8], [35, 4]], shape: 'island', slope: 'N', b: [[0.9, 1, 'greenside']], w: [['island', 1]], tmpl: 'Island Green', par: 3 },
    { pts: [[35, 24], [27, 25], [20, 24], [16, 24]], shape: 'round', slope: 'W', b: [[0.5, -1, 'fairway'], [0.92, 1, 'greenside']], w: [], tmpl: 'Returning Home' },
  ];
  const si = [5, 3, 9, 4, 7, 2, 1, 8, 6];
  state.holes = defs.map((d, i) =>
    normalizeHole(
      {
        points: spreadPts(d.pts, state.cols, state.rows),
        parOverride: d.par || 0,
        si: si[i],
        fwWidth: i === 2 || i === 7 ? 20 : 23,
        roughWidth: 7,
        greenShape: d.shape,
        greenSize: i === 7 ? 11 : 13,
        slope: d.slope,
        bunkers: d.b.map((b) => ({ along: b[0], side: b[1] as 1 | -1, off: 18, kind: b[2], r: b[2] === 'pot' ? 4 : 6 })),
        waters: d.w.map((w) => ({ kind: w[0], along: w[1] })),
        trees: 1,
      },
      i,
      state.cols,
      state.rows,
    ),
  );
  const reroute = [[12, 16], [5, 17], [4, 22], [9, 25], [14, 23]];
  state.holes[4].points = spreadPts(reroute, state.cols, state.rows);
  state.holes[4].parOverride = 5;
  const tm = [
    'Straight — Preferred Side',
    'Dogleg Left — Angle In',
    'Short Par 3 over Water',
    'Dogleg Right — Redan-style Green',
    'Double / S Par 5 — Reachable',
    'Cape (Template)',
    'S-Curve Par 5 — Biarritz Green',
    'Island / Punchbowl Par 3',
    'Home Hole — Punchbowl',
  ];
  state.holes.forEach((h, i) => (h.templateName = tm[i]));
  state.holes[3].greenShape = 'redan';
  state.holes[6].greenShape = 'biarritz';
  state.holes[8].greenShape = 'punchbowl';
  if (state.courseSize === 18) {
    const back: typeof defs = [
      { pts: [[18, 37], [26, 34], [34, 36]], shape: 'kidney', slope: 'S', b: [[0.5, 1, 'fairway'], [0.92, -1, 'greenside']], w: [], tmpl: 'Back 9 — Dogleg' },
      { pts: [[52, 32], [47, 36], [40, 33]], shape: 'round', slope: 'E', b: [[0.9, 1, 'greenside']], w: [['creek', 0.55]], tmpl: 'Back 9 — Creek Par 3', par: 3 },
      { pts: [[52, 14], [48, 21], [52, 27]], shape: 'peanut', slope: 'W', b: [[0.5, -1, 'fairway']], w: [], tmpl: 'Back 9 — Vertical' },
      { pts: [[42, 3], [48, 6], [44, 11]], shape: 'redan', slope: 'NE', b: [[0.9, 1, 'greenside']], w: [], tmpl: 'Back 9 — Redan' },
      { pts: [[50, 18], [43, 16], [38, 20]], shape: 'long', slope: 'S', b: [[0.45, 1, 'pot'], [0.9, -1, 'greenside']], w: [['lake', 0.85]], tmpl: 'Back 9 — Lake' },
      { pts: [[4, 32], [11, 29], [18, 31]], shape: 'punchbowl', slope: 'N', b: [[0.55, -1, 'fairway']], w: [], tmpl: 'Back 9 — Punchbowl' },
      { pts: [[6, 37], [14, 38], [22, 35]], shape: 'round', slope: 'SE', b: [[0.9, 1, 'greenside']], w: [], tmpl: 'Back 9 — Home Run' },
      { pts: [[28, 29], [24, 33], [28, 37]], shape: 'biarritz', slope: 'SW', b: [[0.5, 1, 'fairway']], w: [], tmpl: 'Back 9 — Biarritz' },
      { pts: [[38, 28], [45, 31], [52, 29]], shape: 'kidney', slope: 'W', b: [[0.5, -1, 'fairway'], [0.92, 1, 'greenside']], w: [], tmpl: 'Back 9 — Finisher' },
    ];
    const si18 = [15, 18, 12, 16, 10, 14, 11, 17, 13];
    back.forEach((d, j) => {
      state.holes.push(
        normalizeHole(
          {
            points: spreadPts(d.pts, state.cols, state.rows),
            parOverride: d.par || 0,
            si: si18[j],
            fwWidth: 24,
            roughWidth: 8,
            greenShape: d.shape,
            greenSize: 13,
            slope: d.slope,
            bunkers: d.b.map((b) => ({ along: b[0], side: b[1] as 1 | -1, off: 18, kind: b[2], r: b[2] === 'pot' ? 4 : 6 })),
            waters: d.w.map((w) => ({ kind: w[0], along: w[1] })),
            trees: 1,
            templateName: d.tmpl,
          },
          9 + j,
          state.cols,
          state.rows,
        ),
      );
    });
  }
  syncHoleMaps(state);
}

export function maxHoles(state: GameState) {
  return state.courseSize === 18 ? 18 : 9;
}

export function hasHole(state: GameState, n: number) {
  return !!state.holes[n - 1];
}

export function defaultHoleFor(state: GameState, n: number): Hole {
  const total = maxHoles(state);
  const colsN = 3;
  const rowsN = Math.max(1, Math.ceil(total / colsN));
  const col = (n - 1) % colsN;
  const row = Math.floor((n - 1) / colsN);
  const colW = (state.cols - 8) / colsN;
  const rowH = (state.rows - 8) / rowsN;
  const len = clamp(colW - 3, 8, 16);
  const x0 = 4 + col * colW;
  const y0 = 4 + row * rowH;
  const dir = row % 2 === 0 ? 1 : -1;
  const sx = dir > 0 ? x0 : x0 + len;
  const pts =
    dir > 0
      ? [
          { x: sx, y: y0 },
          { x: sx + len / 2, y: y0 + (n % 2 ? 1.2 : -0.6) },
          { x: sx + len, y: y0 + 0.4 },
        ]
      : [
          { x: sx, y: y0 },
          { x: sx - len / 2, y: y0 + (n % 2 ? 1.2 : -0.6) },
          { x: sx - len, y: y0 + 0.4 },
        ];
  const shapes: Hole['greenShape'][] = ['round', 'kidney', 'peanut', 'long'];
  const slopes: Hole['slope'][] = ['S', 'E', 'N', 'W'];
  return normalizeHole(
    {
      points: pts.map((q) => ({ x: clamp(q.x, 1, state.cols - 1), y: clamp(q.y, 1, state.rows - 1) })),
      si: n,
      fwWidth: 26,
      roughWidth: 8,
      greenShape: shapes[n % 4],
      slope: slopes[n % 4],
      bunkers: [
        { along: 0.52, side: 1, off: 19, kind: 'fairway', r: 6 },
        { along: 0.93, side: -1, off: 18, kind: 'greenside', r: 6 },
      ],
      waters: [],
      templateName: 'Created hole',
    },
    n - 1,
    state.cols,
    state.rows,
  );
}

export function ensureHole(state: GameState, n: number) {
  n = clamp(Math.round(+n || 1), 1, maxHoles(state));
  while (state.holes.length < n) state.holes.push(defaultHoleFor(state, state.holes.length + 1));
  syncHoleMaps(state);
  return state.holes[n - 1];
}

export function syncHoleMaps(state: GameState) {
  const pendT: Record<string, number> = {};
  const pendG: Record<string, number> = {};
  Object.keys(state.teeMap || {}).forEach((k) => {
    const n = +state.teeMap[k];
    if (!hasHole(state, n)) pendT[k] = n;
  });
  Object.keys(state.greenMap || {}).forEach((k) => {
    const n = +state.greenMap[k];
    if (!hasHole(state, n)) pendG[k] = n;
  });
  state.teeMap = {};
  state.greenMap = {};
  state.holes.forEach((h, i) => {
    const t = h.points[0];
    const g = h.points[h.points.length - 1];
    state.teeMap[idx(state.cols, clamp(Math.round(t.x), 0, state.cols - 1), clamp(Math.round(t.y), 0, state.rows - 1))] = i + 1;
    state.greenMap[idx(state.cols, clamp(Math.round(g.x), 0, state.cols - 1), clamp(Math.round(g.y), 0, state.rows - 1))] = i + 1;
  });
  Object.keys(pendT).forEach((k) => {
    if (!(k in state.teeMap)) state.teeMap[k] = pendT[k];
  });
  Object.keys(pendG).forEach((k) => {
    if (!(k in state.greenMap)) state.greenMap[k] = pendG[k];
  });
}

export function enlargeLand(state: GameState, newKey: LandKey): { ok: boolean; message: string } {
  const nd = landDef(newKey);
  if (nd.cols * nd.rows <= state.cols * state.rows) {
    return {
      ok: false,
      message: `Land can only be enlarged here. Shrinking to ${nd.label} needs a New Game so holes are not cut off. Nothing was charged.`,
    };
  }
  const oC = state.cols;
  const oR = state.rows;
  const oldTiles = state.tiles.slice();
  const remap = (m: Record<string, number>) => {
    const o: Record<string, number> = {};
    Object.keys(m || {}).forEach((k) => {
      const i = +k;
      const x = i % oC;
      const y = Math.floor(i / oC);
      o[y * nd.cols + x] = m[k];
    });
    return o;
  };
  const oldT = remap(state.teeMap);
  const oldG = remap(state.greenMap);
  state.land = nd.key;
  state.cols = nd.cols;
  state.rows = nd.rows;
  const nt = Array(nd.cols * nd.rows).fill('rough') as TileKind[];
  for (let y = 0; y < oR; y++) for (let x = 0; x < oC; x++) nt[y * nd.cols + x] = oldTiles[y * oC + x];
  state.tiles = nt;
  state.teeMap = oldT;
  state.greenMap = oldG;
  syncHoleMaps(state);
  return {
    ok: true,
    message: `Land enlarged to ${nd.label} ${nd.cols}×${nd.rows} (${nd.cols * 100}×${nd.rows * 100}). Rough was padded around the course. Nothing was charged.`,
  };
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function landKeyOf(cols: number, rows: number): LandKey {
  return inferLand(cols, rows);
}
