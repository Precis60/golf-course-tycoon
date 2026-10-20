import { clamp, lerp } from './math';
import { clampPt } from './grid';
import {
  GREEN_SHAPES,
  SLOPES,
  TILE_M,
  type Bunker,
  type GreenShape,
  type Hole,
  type Philosophy,
  type Point,
  type Slope,
  type WaterFeat,
} from './types';

const GREEN_SET = new Set<string>(GREEN_SHAPES);
const SLOPE_SET = new Set<string>(SLOPES);

export function segLen(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
}

export function holeLengthM(h: Hole) {
  let L = 0;
  for (let i = 1; i < h.points.length; i++) L += segLen(h.points[i - 1], h.points[i]);
  return Math.round(L);
}

export function holePar(h: Hole): 3 | 4 | 5 {
  if (h.parOverride === 3 || h.parOverride === 4 || h.parOverride === 5) return h.parOverride;
  const L = holeLengthM(h) + 12;
  return L < 210 ? 3 : L < 390 ? 4 : 5;
}

export function teeLengths(h: Hole) {
  const L = holeLengthM(h);
  return { champ: L + 12, club: L, ladies: Math.max(60, L - 24) };
}

export function pointAlong(h: Hole, frac: number): Point & { ang: number } {
  const total = holeLengthM(h) || 1;
  const want = clamp(frac, 0, 1) * total;
  let acc = 0;
  for (let i = 1; i < h.points.length; i++) {
    const sl = segLen(h.points[i - 1], h.points[i]);
    if (acc + sl >= want) {
      const t = sl ? (want - acc) / sl : 0;
      return {
        x: lerp(h.points[i - 1].x, h.points[i].x, t),
        y: lerp(h.points[i - 1].y, h.points[i].y, t),
        ang: Math.atan2(h.points[i].y - h.points[i - 1].y, h.points[i].x - h.points[i - 1].x),
      };
    }
    acc += sl;
  }
  const a = h.points[h.points.length - 2];
  const b = h.points[h.points.length - 1];
  return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function distToSeg(px: number, py: number, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / L2, 0, 1);
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { d: Math.hypot(px - x, py - y) * TILE_M, x, y, t };
}

export function distToHoleM(x: number, y: number, h: Hole) {
  let best = 1e9;
  let bestAlong = 0;
  let acc = 0;
  const total = holeLengthM(h) || 1;
  for (let i = 1; i < h.points.length; i++) {
    const r = distToSeg(x, y, h.points[i - 1], h.points[i]);
    const sl = segLen(h.points[i - 1], h.points[i]);
    if (r.d < best) {
      best = r.d;
      bestAlong = (acc + r.t * sl) / total;
    }
    acc += sl;
  }
  return { d: best, along: bestAlong };
}

export function bendInfo(h: Hole) {
  const bends: number[] = [];
  for (let i = 1; i < h.points.length - 1; i++) {
    const a = h.points[i - 1];
    const b = h.points[i];
    const c = h.points[i + 1];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    bends.push((d * 180) / Math.PI);
  }
  return bends;
}

export function classifyHole(h: Hole): string {
  const b = bendInfo(h).filter((x) => Math.abs(x) > 12);
  if (h.greenShape === 'island' || h.waters.some((w) => w.kind === 'island')) return 'Island Green';
  if (h.waters.some((w) => w.kind === 'creek') && holePar(h) === 3) return 'Par 3 over Water';
  if (h.waters.some((w) => w.kind === 'lake') && b.length <= 1) return 'Cape Hole';
  if (b.length >= 2 && Math.sign(b[0]) !== Math.sign(b[1])) return 'S-Curve';
  if (b.length >= 2) return 'Double Dogleg';
  if (b.length === 1) return b[0] > 0 ? 'Dogleg Right' : 'Dogleg Left';
  if (h.waters.some((w) => w.kind === 'lake')) return 'Cape / Lake';
  return 'Straight';
}

export function doglegDir(h: Hole) {
  const c = classifyHole(h);
  return c.includes('Left') ? 'Left' : c.includes('Right') ? 'Right' : c;
}

export function bunkerWorld(h: Hole, b: Bunker): Point {
  const pt = pointAlong(h, b.along);
  const off = b.side * (b.off / TILE_M);
  return {
    x: pt.x + Math.cos(pt.ang + Math.PI / 2) * off,
    y: pt.y + Math.sin(pt.ang + Math.PI / 2) * off,
  };
}

export function normalizeHole(raw: unknown, i: number, cols: number, rows: number): Hole {
  const h = raw && typeof raw === 'object' ? (raw as Partial<Hole>) : {};
  const src = Array.isArray(h.points) ? h.points : [];
  const pts = src
    .filter((q) => q && Number.isFinite(+q.x) && Number.isFinite(+q.y))
    .map((q) => clampPt({ x: +q.x, y: +q.y }, cols, rows, 0.5));
  while (pts.length < 2) pts.push({ x: 3 + i * 3, y: 3 + i * 2 });
  const par = Number(h.parOverride ?? 0);
  const shape = GREEN_SET.has(String(h.greenShape)) ? (h.greenShape as GreenShape) : 'round';
  const slope = SLOPE_SET.has(String(h.slope)) ? (h.slope as Slope) : 'S';
  const bunkers: Bunker[] = Array.isArray(h.bunkers)
    ? h.bunkers.slice(0, 10).map((b) => ({
        along: clamp(+b.along || 0.5, 0, 0.98),
        side: b.side < 0 ? -1 : 1,
        off: +b.off || 14,
        kind: b.kind === 'greenside' || b.kind === 'pot' ? b.kind : 'fairway',
        r: clamp(+b.r || 6, 3, 10),
      }))
    : [];
  const waters: WaterFeat[] = Array.isArray(h.waters)
    ? h.waters.slice(0, 6).map((w) => ({
        kind: w.kind === 'lake' || w.kind === 'island' ? w.kind : 'creek',
        along: clamp(+w.along || 0.6, 0, 1),
      }))
    : [];
  return {
    points: pts.slice(0, 6),
    parOverride: par === 3 || par === 4 || par === 5 ? par : 0,
    si: clamp(Number(h.si ?? i + 1), 1, 18),
    fwWidth: clamp(Number(h.fwWidth ?? 28), 18, 42),
    roughWidth: clamp(Number(h.roughWidth ?? 12), 4, 24),
    greenShape: shape,
    greenSize: clamp(Number(h.greenSize ?? 13), 8, 24),
    slope,
    bunkers,
    waters,
    trees: clamp(Number(h.trees ?? 1), 0, 2),
    teeSize: h.teeSize === 'M' || h.teeSize === 'L' ? h.teeSize : 'S',
    templateName: typeof h.templateName === 'string' ? h.templateName : '',
  };
}

export interface TemplateDef {
  bends: { f: number; p: number }[];
  fw: number;
  shape: GreenShape;
  water?: WaterFeat['kind'];
}

export const TEMPLATES: Record<string, TemplateDef> = {
  'Straight Par 4': { bends: [], fw: 30, shape: 'round' },
  'Dogleg Left': { bends: [{ f: 0.48, p: -16 }], fw: 28, shape: 'kidney' },
  'Dogleg Right': { bends: [{ f: 0.48, p: 16 }], fw: 28, shape: 'peanut' },
  'Double Dogleg Par 5': { bends: [{ f: 0.34, p: 14 }, { f: 0.68, p: 14 }], fw: 29, shape: 'long' },
  'Short Par 3 over Water': { bends: [], fw: 24, shape: 'round', water: 'creek' },
  'Island Green': { bends: [{ f: 0.55, p: 10 }], fw: 26, shape: 'island', water: 'island' },
  'Cape Hole': { bends: [{ f: 0.5, p: -12 }], fw: 27, shape: 'kidney', water: 'lake' },
  'S-Curve Par 5': { bends: [{ f: 0.33, p: -15 }, { f: 0.66, p: 15 }], fw: 29, shape: 'peanut' },
  'Cape (Template)': { bends: [{ f: 0.5, p: -13 }], fw: 27, shape: 'kidney', water: 'lake' },
  'Redan Par 3': { bends: [], fw: 24, shape: 'redan' },
  'Biarritz Green': { bends: [{ f: 0.5, p: 8 }], fw: 28, shape: 'biarritz' },
  'Punchbowl Green': { bends: [{ f: 0.5, p: -9 }], fw: 28, shape: 'punchbowl' },
  'Short Precision Par 3': { bends: [], fw: 22, shape: 'round', water: 'creek' },
  'Reachable Par 5 — Guarded Green': { bends: [{ f: 0.45, p: 12 }], fw: 30, shape: 'peanut', water: 'lake' },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function applyTemplateTo(h: Hole, name: string, cols: number, rows: number) {
  const T = TEMPLATES[name] ?? TEMPLATES['Straight Par 4'];
  const a = h.points[0];
  const g = h.points[h.points.length - 1];
  const ang = Math.atan2(g.y - a.y, g.x - a.x);
  const perp = ang + Math.PI / 2;
  const dist = Math.hypot(g.x - a.x, g.y - a.y);
  const pts: Point[] = [{ x: a.x, y: a.y }];
  T.bends.forEach((b) => {
    pts.push({
      x: a.x + Math.cos(ang) * dist * b.f + Math.cos(perp) * (b.p / TILE_M),
      y: a.y + Math.sin(ang) * dist * b.f + Math.sin(perp) * (b.p / TILE_M),
    });
  });
  pts.push({ x: g.x, y: g.y });
  h.points = pts.map((q) => clampPt(q, cols, rows, 1));
  h.fwWidth = T.fw;
  h.greenShape = T.shape;
  if (T.water) {
    h.waters = h.waters.filter((w) => w.kind !== T.water);
    h.waters.push({ kind: T.water, along: T.water === 'creek' ? 0.62 : T.water === 'island' ? 1 : 0.88 });
  }
  if (name.includes('Par 5') || name.includes('Reachable')) h.parOverride = 5;
  else if (name.includes('Par 3') || name.includes('Redan')) h.parOverride = 3;
  else if (name.includes('Par 4')) h.parOverride = 4;
  h.templateName = name;
  h.bunkers = [
    { along: 0.52, side: 1, off: h.fwWidth / 2 + 6, kind: 'fairway', r: 6 },
    { along: 0.93, side: -1, off: h.greenSize + 5, kind: 'greenside', r: 6 },
  ];
  return h;
}

export function architectFeedback(h: Hole, philosophy: Philosophy = 'strategic'): string[] {
  const L = holeLengthM(h);
  const notes: string[] = [];
  const landB = h.bunkers.filter((b) => b.along > 0.38 && b.along < 0.68);
  if (!landB.length) {
    notes.push('No hazard influences the tee shot. Place a bunker on the 200–260 m landing zone so the ideal line has a decision.');
  } else {
    notes.push('Fairway hazard at the landing zone rewards the brave line and punishes the safe bail-out.');
  }
  const bends = bendInfo(h).filter((x) => Math.abs(x) > 15);
  if (!bends.length && holePar(h) > 3) {
    notes.push('Straight hole: the preferred side is unclear. Add a bend or offset the green so the angle of approach matters.');
  } else if (bends.length) {
    notes.push(`Dogleg of ${Math.round(bends[0])}° creates a preferred side of the fairway for the best approach.`);
  }
  if (!h.bunkers.some((b) => b.along > 0.85)) {
    notes.push('Green is unguarded. Add a greenside bunker on the side the approach wants to miss.');
  } else {
    notes.push('Green complex is guarded on the approach side. Angle matters.');
  }
  if (h.greenShape === 'round') {
    notes.push(`Round green with ${h.slope} slope. Kidney, Redan, Biarritz or Punchbowl would give this green its own fall-off.`);
  } else {
    notes.push(`${cap(h.greenShape)} green, slope ${h.slope}, gives the complex its own character.`);
  }
  if (h.waters.length) {
    notes.push(
      `Risk-reward water at ${h.waters.map((w) => `${Math.round(w.along * L)} m (${w.kind})`).join(', ')}. Carry for the advantage, or lay up and pay with a longer club.`,
    );
  }
  if (L < 150 && holePar(h) === 3) notes.push('Short hole: precision over power, a change of pace in the round.');

  if (philosophy === 'strategic') {
    notes.push(
      landB.length
        ? 'Strategic read: the hazard sits beside the ideal line, so position is worth more than raw length.'
        : 'Strategic read: this hole still plays the same from every angle. Offset a hazard to create a preferred side.',
    );
  } else if (philosophy === 'penal') {
    const heavy = h.bunkers.length + h.waters.length >= 3;
    notes.push(
      heavy
        ? 'Penal read: misses are expensive. Make sure the safe line is still a fair bogey, not a lost ball.'
        : 'Penal read: punishment is light. A pot bunker or water on the common miss would sharpen the hole.',
    );
  } else {
    const heroic = h.waters.length > 0 || landB.some((b) => b.off < h.fwWidth / 2 + 8);
    notes.push(
      heroic
        ? 'Heroic read: there is a carry for the player who wants the shorter approach, and a way around it.'
        : 'Heroic read: offer a forced carry over water or a fairway bunker, with an obvious lay-up beside it.',
    );
  }
  return notes;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function architectCourseNotes(holes: Hole[]): string[] {
  const notes: string[] = [];
  const shapes = holes.map((h) => classifyHole(h));
  let run = 0;
  for (const sh of shapes) {
    run = sh === 'Straight' ? run + 1 : 0;
    if (run === 3) notes.push('Three straight holes in a row. Bend one centreline so the routing does not march back and forth.');
  }
  const lens = holes.map((h) => teeLengths(h).champ);
  if (holes.length >= 5 && new Set(lens.map((x) => Math.round(x / 50))).size < 5) {
    notes.push('Hole lengths are too similar. Stretch or shorten tees for a short 3, a long 4 and a reachable 5.');
  }
  const bearings = holes.map((h) => {
    const a = h.points[0];
    const b = h.points[h.points.length - 1];
    return Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI / 45);
  });
  if (holes.length >= 6 && new Set(bearings).size < 4) {
    notes.push('Routing plays in too few directions. Turn holes so wind and sun change through the round.');
  }
  return notes;
}
