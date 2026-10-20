import { clamp } from './math';
import { tileAt } from './grid';
import { bunkerWorld, distToHoleM, pointAlong } from './holes';
import { hasHole } from './course';
import { CLUBS, TILE_M, isFacility, type ClubId, type GameState, type Hole, type Point } from './types';

export type Lie = 'tee' | 'fairway' | 'green' | 'rough' | 'sand' | 'water' | 'trees' | 'path';

export function geometryLie(state: GameState, x: number, y: number, holeNum: number): Lie {
  if (!hasHole(state, holeNum)) return 'rough';
  const h = state.holes[holeNum - 1];
  const g = h.points[h.points.length - 1];
  const dg = Math.hypot(x - g.x, y - g.y) * TILE_M;
  if (h.greenShape === 'island' || h.waters.some((w) => w.kind === 'island')) {
    if (dg <= h.greenSize) return 'green';
    if (dg <= h.greenSize + 13) return 'water';
  }
  if (dg <= h.greenSize) return 'green';
  for (const b of h.bunkers) {
    const p = bunkerWorld(h, b);
    if (Math.hypot(x - p.x, y - p.y) * TILE_M <= b.r + 3) return 'sand';
  }
  for (const w of h.waters) {
    const pt = pointAlong(h, w.along);
    if (w.kind === 'creek') {
      const along = Math.abs((x - pt.x) * Math.cos(pt.ang) + (y - pt.y) * Math.sin(pt.ang)) * TILE_M;
      const across = Math.abs(-(x - pt.x) * Math.sin(pt.ang) + (y - pt.y) * Math.cos(pt.ang)) * TILE_M;
      if (along < 9 && across < h.fwWidth) return 'water';
    }
    if (w.kind === 'lake') {
      const fr = pointAlong(h, Math.max(0, holeLenSafe(h) - 28) / Math.max(1, holeLenSafe(h)));
      if (Math.hypot(x - fr.x, y - fr.y) * TILE_M < 24) return 'water';
    }
  }
  const dc = distToHoleM(x, y, h);
  if (dc.d <= h.fwWidth / 2) return 'fairway';
  if (dc.d <= h.fwWidth / 2 + h.roughWidth) return 'rough';
  const t = tileAt(state, Math.floor(x), Math.floor(y));
  if (t === 'trees' || t === 'water' || t === 'sand') return t;
  if (isFacility(t)) return 'rough';
  for (let i = 0; i < state.holes.length; i++) {
    if (i + 1 !== holeNum && distToHoleM(x, y, state.holes[i]).d <= state.holes[i].fwWidth / 2) return 'fairway';
  }
  return 'rough';
}

function holeLenSafe(h: Hole) {
  let L = 0;
  for (let i = 1; i < h.points.length; i++) L += Math.hypot(h.points[i].x - h.points[i - 1].x, h.points[i].y - h.points[i - 1].y) * TILE_M;
  return Math.round(L);
}

export function lieMultiplier(lie: Lie) {
  if (lie === 'rough') return 0.75;
  if (lie === 'sand') return 0.55;
  if (lie === 'trees') return 0.7;
  if (lie === 'path') return 0.9;
  if (lie === 'water') return 0;
  return 1;
}

export function lieLabel(lie: Lie) {
  const map: Record<Lie, string> = {
    tee: 'Tee',
    fairway: 'Fairway',
    green: 'Green',
    rough: 'Rough — 75% power',
    sand: 'Sand — 55% power',
    water: 'Water',
    trees: 'Trees — deflection risk',
    path: 'Path — 90% power',
  };
  return map[lie];
}

const SLOPE_BREAK: Record<string, number> = { N: -0.2, NE: 0.7, E: 1, SE: 0.8, S: 0.2, SW: -0.8, W: -1, NW: -0.7 };

export function breakFor(hole: Hole, holeIdx: number, rand: (a: number, b: number) => number) {
  return (SLOPE_BREAK[hole.slope] || 0.5) * (0.7 + rand(holeIdx, 3) * 0.6);
}

export interface ShotPlan {
  distM: number;
  angle: number;
  target: Point;
  putt: boolean;
  deflected: boolean;
  sweet: boolean;
}

export function planShot(args: {
  club: ClubId;
  power: number;
  aim: number;
  ball: Point;
  lie: Lie;
  distToPin: number;
  breakDir: number;
  rng: () => number;
}): ShotPlan {
  const club = CLUBS[args.club];
  const putt = args.club === 'putter' || args.distToPin < 24;
  const sweet = args.power >= 0.45 && args.power <= 0.78;
  const spray = (args.power > 0.86 ? (args.power - 0.86) * 2.2 : args.power < 0.25 ? 0.25 : 0) + (sweet ? 0 : 0.08);
  let distM = club.max * args.power * lieMultiplier(args.lie) * (0.92 + args.rng() * 0.14);
  if (putt) distM = clamp(distM, 0, 34);
  let angle = args.aim + (args.rng() - 0.5) * club.spread * (Math.PI / 180) * (1 + spray * 7);
  if (putt) angle += args.breakDir * 0.012 * args.power;
  let deflected = false;
  if (args.lie === 'trees' && args.rng() < 0.42) {
    angle += (args.rng() > 0.5 ? 1 : -1) * (0.35 + args.rng() * 0.4);
    deflected = true;
  }
  const target = {
    x: args.ball.x + Math.cos(angle) * (distM / TILE_M),
    y: args.ball.y + Math.sin(angle) * (distM / TILE_M),
  };
  return { distM, angle, target, putt, deflected, sweet };
}

export function holeOutDistance() {
  return Math.max(9, TILE_M * 0.55);
}

export function dropPoint(hole: Hole): Point {
  const p = pointAlong(hole, 0.35);
  return { x: p.x, y: p.y };
}
