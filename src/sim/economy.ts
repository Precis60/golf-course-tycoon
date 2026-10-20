import { clamp, lerp } from './math';
import { idx } from './grid';
import {
  bendInfo,
  classifyHole,
  holePar,
  teeLengths,
} from './holes';
import { maxHoles } from './course';
import {
  EVENTS,
  FACILITY_INFO,
  FINAL_WEEK,
  TILE_INFO,
  WEATHERS,
  difficultyProfile,
  isFacility,
  type FacilityKind,
  type GameState,
  type Hole,
  type TileKind,
} from './types';

export interface HolePair {
  hole: number;
  par: 3 | 4 | 5;
  shape: string;
  distM: number;
  clubM: number;
  ladiesM: number;
  si: number;
  holeDef: Hole;
}

export interface Scores {
  rating: number;
  beauty: number;
  difficulty: number;
  prestige: number;
  prestigeTier: string;
  counts: Partial<Record<TileKind, number>>;
  valid: number;
  pairs: HolePair[];
  varietyIndex: number;
  archScore: number;
  shapes: string[];
  target: number;
  full18: boolean;
  open9: boolean;
}

export function countsOf(state: GameState) {
  const c: Partial<Record<TileKind, number>> = {};
  for (const t of state.tiles) c[t] = (c[t] || 0) + 1;
  return c;
}

export function hasFac(state: GameState, k: FacilityKind) {
  return state.tiles.includes(k);
}

export function holePairs(state: GameState): HolePair[] {
  return state.holes.map((hh, hIdx) => {
    const L = teeLengths(hh);
    return {
      hole: hIdx + 1,
      par: holePar(hh),
      shape: classifyHole(hh),
      distM: L.champ,
      clubM: L.club,
      ladiesM: L.ladies,
      si: hh.si,
      holeDef: hh,
    };
  });
}

export function prestigeTier(v: number) {
  return v < 25 ? 'Local 9' : v < 50 ? 'Members Club' : v < 75 ? 'Championship Course' : 'Resort Destination';
}

export function computeScores(state: GameState): Scores {
  const c = countsOf(state);
  const pairs = holePairs(state);
  const valid = pairs.length;
  const fair = c.fairway || 0;
  const wat = c.water || 0;
  const snd = c.sand || 0;
  const tre = c.trees || 0;
  const pth = c.path || 0;
  const shapes = new Set(pairs.map((p) => p.shape));
  const greens = new Set(pairs.map((p) => p.holeDef.greenShape));
  const pars = pairs.map((p) => p.par);
  const landingBunkers = pairs.filter((p) => p.holeDef.bunkers.some((b) => b.along > 0.35 && b.along < 0.7)).length;
  const varietyIndex = Math.round(
    clamp(
      (shapes.size / 7) * 40 + (greens.size / 5) * 25 + (new Set(pars).size / 3) * 20 + (landingBunkers / Math.max(1, valid)) * 15,
      0,
      100,
    ),
  );
  let rating =
    Math.min(valid, 9) * 3.2 +
    Math.max(0, valid - 9) * 0.9 +
    clamp(fair / 14, 0, 6) +
    (hasFac(state, 'clubhouse') ? 5 : 0) +
    (hasFac(state, 'range') ? 3 : 0) +
    varietyIndex * 0.16;
  const beauty = clamp(tre / 6 + wat / 3 + snd / 8 + pth / 12 + (hasFac(state, 'irrigation') ? 10 : 0) + valid * 2 + greens.size * 2, 0, 100);
  const difficulty = clamp(
    valid * 2.4 +
      pairs.reduce((a, p) => a + p.holeDef.bunkers.length, 0) * 1.3 +
      pairs.reduce((a, p) => a + p.holeDef.waters.length, 0) * 2 +
      landingBunkers * 1.6 +
      tre / 12,
    0,
    100,
  );
  let prestige = 0;
  (Object.keys(FACILITY_INFO) as FacilityKind[]).forEach((k) => {
    if (hasFac(state, k)) prestige += FACILITY_INFO[k].prestige;
  });
  prestige = clamp(prestige * 0.72 + Math.min(valid, 9) * 1.1 + (valid >= 18 ? 9 : valid >= 9 ? 3 : 0) + beauty * 0.12 + varietyIndex * 0.1, 0, 100);
  const archAngles = pairs.filter(
    (p) => Math.abs(bendInfo(p.holeDef)[0] || 0) > 12 || p.holeDef.bunkers.some((b) => b.along > 0.38 && b.along < 0.68),
  ).length;
  const archScore = Math.round(
    clamp(
      (archAngles / Math.max(1, valid)) * 35 +
        (landingBunkers / Math.max(1, valid)) * 25 +
        (greens.size / 5) * 20 +
        (new Set(pairs.map((p) => Math.round(p.distM / 50))).size / 7) * 20,
      0,
      100,
    ),
  );
  rating = clamp(Math.round(rating + prestige * 0.1 + archScore * 0.1), 0, 100);
  const prestigeR = Math.round(prestige);
  return {
    rating,
    beauty: Math.round(beauty),
    difficulty: Math.round(difficulty),
    prestige: prestigeR,
    prestigeTier: prestigeTier(prestigeR),
    counts: c,
    valid,
    pairs,
    varietyIndex,
    archScore,
    shapes: [...shapes],
    target: maxHoles(state),
    full18: valid >= 18,
    open9: valid >= 9,
  };
}

export interface CheckItem {
  label: string;
  ok: boolean;
  detail: string;
}

export function validation(state: GameState, sc?: Scores): CheckItem[] {
  sc = sc ?? computeScores(state);
  const pars = sc.pairs.map((p) => p.par);
  const tgt = maxHoles(state);
  const p3 = pars.filter((x) => x === 3).length;
  const p5 = pars.filter((x) => x === 5).length;
  const shapes = new Set(sc.pairs.map((p) => p.shape)).size;
  return [
    { label: 'Clubhouse built', ok: hasFac(state, 'clubhouse'), detail: 'Prestige and members' },
    {
      label: 'Open (9 holes)',
      ok: sc.valid >= 9 && sc.pairs.slice(0, 9).every((p) => p.holeDef.points.length >= 2),
      detail: `${sc.valid} / 9 holes`,
    },
    {
      label: `Full ${tgt} open`,
      ok: sc.valid >= tgt,
      detail: `${sc.valid} / ${tgt} holes${tgt === 18 && sc.valid >= 18 ? ' · prestige bonus' : ''}`,
    },
    { label: 'At least two Par 3s and two Par 5s', ok: p3 >= 2 && p5 >= 2, detail: `${p3}× P3 · ${p5}× P5` },
    { label: 'Dogleg / shape variety (4+ shapes)', ok: shapes >= 4, detail: `${shapes} shapes` },
    { label: 'Practice Range', ok: hasFac(state, 'range'), detail: 'Rating boost' },
    { label: 'Pro Shop or Restaurant', ok: hasFac(state, 'proshop') || hasFac(state, 'restaurant'), detail: 'Extra revenue' },
    { label: 'Car Park', ok: hasFac(state, 'carpark'), detail: 'Visitor access' },
    { label: 'Rating at least 55', ok: sc.rating >= 55, detail: `${sc.rating} / 100` },
  ];
}

export function isOpen(state: GameState, sc?: Scores) {
  return validation(state, sc)
    .filter((i) => !i.label.startsWith('Full'))
    .every((i) => i.ok);
}

export interface WeekReport {
  weather: (typeof WEATHERS)[number];
  visitors: number;
  greenFees: number;
  membersIncome: number;
  shopIncome: number;
  foodIncome: number;
  revenue: number;
  mow: number;
  facUpkeep: number;
  wages: number;
  interest: number;
  maint: number;
  marketing: number;
  costsTotal: number;
  profit: number;
  sc: Scores;
  event: (typeof EVENTS)[number] | null;
  nextWeather: string;
  week: number;
  won: boolean;
  bankrupt: boolean;
  final: boolean;
  repay: number;
}

function facilityComponents(state: GameState) {
  const seen = new Set<number>();
  let upkeep = 0;
  const found = new Set<FacilityKind>();
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (!isFacility(t) || seen.has(i)) continue;
    found.add(t);
    const q = [i];
    seen.add(i);
    while (q.length) {
      const cur = q.pop()!;
      const x = cur % state.cols;
      const y = Math.floor(cur / state.cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
        const ni = idx(state.cols, nx, ny);
        if (!seen.has(ni) && state.tiles[ni] === t) {
          seen.add(ni);
          q.push(ni);
        }
      }
    }
    upkeep += FACILITY_INFO[t].upkeep;
  }
  return { upkeep, found };
}

/** Pure weekly books. Does not mutate state. */
export function simulateWeek(state: GameState, rng: () => number = Math.random) {
  const sc = computeScores(state);
  const weather = WEATHERS.find((w) => w.n === state.weather) ?? WEATHERS[0];
  const priceFactor = clamp(1.55 - state.fee / 115, 0.18, 1.35);
  const demandBase =
    75 +
    (sc.valid >= 18 ? 34 : sc.valid >= 9 ? 15 : sc.valid * 1.2) +
    sc.rating * 1.55 +
    state.reputation * 0.85 +
    state.condition * 0.45 +
    state.satisfaction * 0.35 +
    state.marketing / 950 +
    (hasFac(state, 'carpark') ? 22 : 0) +
    (hasFac(state, 'range') ? 14 : 0);
  const demand = difficultyProfile(state.difficulty).demand;
  const visitors = Math.max(0, Math.round(demandBase * priceFactor * weather.mult * demand + (rng() * 36 - 14)));
  const greenFees = visitors * state.fee;
  const membersIncome = Math.round(state.members * (125 + sc.prestige * 0.6));
  const shopIncome = visitors * (hasFac(state, 'proshop') ? 9 : 2);
  const foodIncome = visitors * (hasFac(state, 'restaurant') ? 13 : 3);
  const revenue = greenFees + membersIncome + shopIncome + foodIncome;
  const c = sc.counts;
  const mowTiles =
    (c.fairway || 0) * TILE_INFO.fairway.upkeep +
    (c.green || 0) * TILE_INFO.green.upkeep +
    (c.tee || 0) * TILE_INFO.tee.upkeep +
    (c.rough || 0) * 2 +
    (c.path || 0) * TILE_INFO.path.upkeep;
  const fac = facilityComponents(state);
  const wages = state.staff * 1450;
  const interest = Math.round(state.loan * 0.08);
  const costsTotal = Math.round(mowTiles) + fac.upkeep + wages + state.marketing + state.maint + interest;
  const profit = revenue - costsTotal;
  return {
    sc,
    weather,
    visitors,
    greenFees,
    membersIncome,
    shopIncome,
    foodIncome,
    revenue,
    mow: Math.round(mowTiles),
    facUpkeep: fac.upkeep,
    wages,
    interest,
    costsTotal,
    profit,
  };
}

/** Applies one week. Mutates state. Returns the report. */
export function advanceWeek(state: GameState, rng: () => number = Math.random): { ok: boolean; message?: string; report?: WeekReport } {
  if (state.seasonOver) return { ok: false, message: 'Season is over. Start a New Game to play again.' };
  if (!isOpen(state)) {
    return { ok: false, message: 'Course is not open yet. Finish the Design checklist (clubhouse and 9 holes) before trading.' };
  }
  const r = simulateWeek(state, rng);
  state.cash += r.profit;
  state.lastProfit = r.profit;
  const maintNeed = 9000 + (r.sc.counts.fairway || 0) * 22 + state.staff * 900;
  const condDelta =
    clamp((state.maint - maintNeed) / 2600, -7, 6) +
    clamp(state.staff - 5, -3, 4) * 0.7 +
    r.weather.cond +
    (hasFac(state, 'irrigation') ? 2.2 : 0) +
    (hasFac(state, 'maintenance') ? 1.6 : 0) -
    (r.visitors > 420 ? 2 : 0);
  state.condition = clamp(Math.round(state.condition + condDelta), 5, 100);
  const valueScore =
    r.sc.rating * 0.42 +
    (r.sc.varietyIndex || 50) * 0.22 +
    state.condition * 0.3 -
    Math.max(0, state.fee - 85) * 0.28 +
    (hasFac(state, 'restaurant') ? 4 : 0) +
    (hasFac(state, 'range') ? 3 : 0);
  state.satisfaction = clamp(Math.round(lerp(state.satisfaction, clamp(valueScore, 5, 98), 0.42)), 5, 100);
  state.reputation = clamp(Math.round(state.reputation + clamp((state.satisfaction - 58) / 9, -3.5, 3.5) + (r.sc.prestige > 62 ? 1 : 0)), 5, 100);
  state.members = clamp(Math.round(state.members + (state.satisfaction - 55) / 4 + (state.reputation > 65 ? 5 : -2)), 40, 650);

  let ev: (typeof EVENTS)[number] | null = null;
  if (rng() < 0.48) {
    const pool = EVENTS.filter((e) => !e.needs || hasFac(state, e.needs));
    ev = pool[Math.floor(rng() * pool.length)];
    state.cash += ev.cash;
    state.condition = clamp(state.condition + ev.cond, 5, 100);
    state.reputation = clamp(state.reputation + ev.rep, 5, 100);
  }
  let repay = 0;
  if (state.loan > 0 && r.profit > 30000) {
    repay = Math.min(state.loan, Math.round(r.profit * 0.25));
    state.loan -= repay;
    state.cash -= repay;
  }
  const finishedWeek = state.week;
  state.week++;
  state.cashHist.push(state.cash);
  state.cashHist = state.cashHist.slice(-24);
  const next = WEATHERS[Math.floor(rng() * WEATHERS.length)];
  state.weather = next.n;
  const profile = difficultyProfile(state.difficulty);
  const bankrupt = state.cash < 0;
  const final = finishedWeek >= FINAL_WEEK;
  const won = final && state.cash >= profile.targetCash && state.condition >= profile.cond && state.reputation >= profile.rep;
  if (bankrupt || final) state.seasonOver = true;
  const line = `Week ${finishedWeek}: ${r.visitors} visitors (${r.weather.n}) · Revenue ${Math.round(r.revenue).toLocaleString('en-AU')} · Profit ${r.profit >= 0 ? '+' : ''}${Math.round(r.profit).toLocaleString('en-AU')}${ev ? ` · ${ev.n}` : ''}`;
  state.log.push(line);
  state.log = state.log.slice(-40);
  return {
    ok: true,
    report: {
      ...r,
      maint: state.maint,
      marketing: state.marketing,
      event: ev,
      nextWeather: state.weather,
      week: finishedWeek,
      won,
      bankrupt,
      final,
      repay,
    },
  };
}

export function takeLoan(state: GameState): { ok: boolean; message: string } {
  if (state.loan > 0) return { ok: false, message: `A loan is already outstanding ($${state.loan.toLocaleString('en-AU')}).` };
  state.loan = 50000;
  state.cash += 50000;
  state.cashHist.push(state.cash);
  return { ok: true, message: '$50,000 received. Interest is 8% each week, charged in the P&L. Strong weeks repay principal.' };
}

export function prizeFor(total: number, par: number, holes: number) {
  const diff = total - par;
  const prize = diff < 0 ? 18000 + Math.abs(diff) * 9000 : diff === 0 ? 9000 : diff <= 4 ? 2500 : 0;
  const bonus = holes >= 18 ? Math.round(prize * 0.6) : 0;
  return { diff, prize, bonus, banked: prize + bonus };
}
