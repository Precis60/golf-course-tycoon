import { describe, expect, it } from 'vitest';
import { blankState, buildStarter, enlargeLand } from './course';
import { brushCells, footprintFor, greenAreaTiles, paintAt } from './designer';
import { advanceWeek, computeScores, isOpen, prizeFor, simulateWeek, validation } from './economy';
import { classifyHole, holeLengthM, holePar, teeLengths } from './holes';
import { geometryLie, planShot } from './play';
import { migrateLegacy } from './saves';
import type { Hole } from './types';

function rngSeq(values: number[]) {
  let i = 0;
  return () => {
    const v = values[i] ?? 0.5;
    i++;
    return v;
  };
}

describe('geometry', () => {
  it('derives par from length', () => {
    const straight = (tiles: number): Hole => ({
      points: [
        { x: 2, y: 2 },
        { x: 2 + tiles, y: 2 },
      ],
      parOverride: 0,
      si: 1,
      fwWidth: 26,
      roughWidth: 8,
      greenShape: 'round',
      greenSize: 13,
      slope: 'S',
      bunkers: [],
      waters: [],
      trees: 0,
      teeSize: 'S',
      templateName: '',
    });
    expect(holePar(straight(10))).toBe(3);
    expect(holePar(straight(16))).toBe(4);
    expect(holePar(straight(26))).toBe(5);
    expect(holePar({ ...straight(10), parOverride: 5 })).toBe(5);
  });

  it('classifies a dogleg and reports three tee lengths', () => {
    const h: Hole = {
      points: [
        { x: 4, y: 10 },
        { x: 12, y: 6 },
        { x: 20, y: 12 },
      ],
      parOverride: 4,
      si: 3,
      fwWidth: 28,
      roughWidth: 8,
      greenShape: 'kidney',
      greenSize: 13,
      slope: 'E',
      bunkers: [{ along: 0.5, side: 1, off: 18, kind: 'fairway', r: 6 }],
      waters: [],
      trees: 1,
      teeSize: 'M',
      templateName: 'Dogleg Right',
    };
    expect(classifyHole(h)).toMatch(/Dogleg|S-Curve|Double/);
    const L = teeLengths(h);
    expect(L.champ).toBe(holeLengthM(h) + 12);
    expect(L.club).toBe(holeLengthM(h));
    expect(L.ladies).toBe(Math.max(60, holeLengthM(h) - 24));
  });

  it('reads fairway, green and water from hole geometry', () => {
    const state = blankState({ land: 'standard', courseSize: 9, kind: 'blank' });
    state.holes = [
      {
        points: [
          { x: 6, y: 8 },
          { x: 16, y: 8 },
        ],
        parOverride: 4,
        si: 1,
        fwWidth: 26,
        roughWidth: 8,
        greenShape: 'island',
        greenSize: 12,
        slope: 'S',
        bunkers: [],
        waters: [{ kind: 'island', along: 1 }],
        trees: 0,
        teeSize: 'S',
        templateName: '',
      },
    ];
    expect(geometryLie(state, 10, 8, 1)).toBe('fairway');
    expect(geometryLie(state, 16, 8, 1)).toBe('green');
    expect(geometryLie(state, 17.4, 8, 1)).toBe('water');
  });
});

describe('designer economy', () => {
  it('round 5 is 13 tiles and square 5 is 25', () => {
    const state = blankState({ land: 'large', courseSize: 18, kind: 'blank' });
    state.sizes.brushSize = 5;
    state.sizes.brushShape = 'round';
    expect(brushCells(state, 20, 20)).toHaveLength(13);
    state.sizes.brushShape = 'square';
    expect(brushCells(state, 20, 20)).toHaveLength(25);
  });

  it('refuses a brush the player cannot afford and charges nothing', () => {
    const state = blankState({ land: 'large', kind: 'blank' });
    state.cash = 1000;
    state.tool = 'fairway';
    state.sizes.brushShape = 'round';
    state.sizes.brushSize = 5;
    const ghost = footprintFor(state, 'fairway', 20, 20);
    expect(ghost.newCount).toBe(13);
    expect(ghost.cost).toBe(13 * 900);
    const res = paintAt(state, 20, 20);
    expect(res.ok).toBe(false);
    expect(res.charged).toBe(0);
    expect(state.cash).toBe(1000);
    expect(state.tiles.every((t) => t === 'rough')).toBe(true);
  });

  it('charges new tiles once and ignores a repaint', () => {
    const state = blankState({ land: 'standard', kind: 'blank' });
    state.tool = 'sand';
    state.sizes.brushShape = 'square';
    state.sizes.brushSize = 5;
    const first = paintAt(state, 10, 10);
    expect(first.changed).toBe(true);
    expect(first.charged).toBe(25 * 1600);
    const cash = state.cash;
    const second = paintAt(state, 10, 10);
    expect(second.changed).toBe(false);
    expect(second.charged).toBe(0);
    expect(state.cash).toBe(cash);
  });

  it('does not charge a facility that does not fit', () => {
    const state = blankState({ land: 'standard', kind: 'blank' });
    const cash = state.cash;
    state.tool = 'clubhouse';
    state.sizes.facilitySize = 'L';
    const res = paintAt(state, state.cols - 1, state.rows - 1);
    expect(res.ok).toBe(false);
    expect(state.cash).toBe(cash);
    expect(state.tiles.includes('clubhouse')).toBe(false);
  });

  it('creates a hole only after both tee and green are placed', () => {
    const state = blankState({ land: 'standard', kind: 'blank' });
    state.holeNo = 1;
    state.tool = 'tee';
    const tee = paintAt(state, 8, 8);
    expect(tee.changed).toBe(true);
    expect(state.holes).toHaveLength(0);
    state.tool = 'green';
    const green = paintAt(state, 20, 10);
    expect(green.changed).toBe(true);
    expect(state.holes.length).toBeGreaterThanOrEqual(1);
    expect(holeLengthM(state.holes[0])).toBeGreaterThan(50);
  });

  it('enlarges land without moving a clubhouse or charging cash', () => {
    const state = blankState({ land: 'standard', kind: 'blank' });
    state.tool = 'clubhouse';
    paintAt(state, 10, 12);
    const cash = state.cash;
    const res = enlargeLand(state, 'estate');
    expect(res.ok).toBe(true);
    expect(state.cols).toBe(112);
    expect(state.rows).toBe(80);
    expect(state.tiles[12 * 112 + 10]).toBe('clubhouse');
    expect(state.cash).toBe(cash);
    expect(enlargeLand(state, 'standard').ok).toBe(false);
  });

  it('prices green area from radius', () => {
    expect(greenAreaTiles(8)).toBe(1);
    expect(greenAreaTiles(24)).toBeGreaterThan(greenAreaTiles(8));
  });
});

describe('season', () => {
  it('builds a starter 18 with variety and an opening checklist', () => {
    const state = blankState({ land: 'large', courseSize: 18, kind: 'starter' });
    expect(state.holes).toHaveLength(18);
    const sc = computeScores(state);
    expect(sc.valid).toBe(18);
    expect(sc.pairs.some((p) => p.par === 3)).toBe(true);
    expect(sc.pairs.some((p) => p.par === 5)).toBe(true);
    expect(sc.rating).toBeGreaterThan(40);
    expect(validation(state, sc).find((v) => v.label === 'Clubhouse built')?.ok).toBe(true);
    expect(isOpen(state, sc)).toBe(true);
    expect(state.tiles.includes('range')).toBe(true);
  });

  it('banks a deterministic week and can reach a trophy on easy books', () => {
    const state = blankState({ land: 'standard', courseSize: 9, difficulty: 'normal', kind: 'starter' });
    const before = state.cash;
    const preview = simulateWeek(state, rngSeq([0.2, 0.1, 0.9]));
    expect(preview.revenue).toBeGreaterThan(0);
    expect(preview.costsTotal).toBeGreaterThan(0);
    expect(state.cash).toBe(before);
    const applied = advanceWeek(state, rngSeq([0.2, 0.1, 0.9, 0.2]));
    expect(applied.ok).toBe(true);
    expect(state.week).toBe(2);
    expect(state.cashHist.length).toBeGreaterThan(1);
    expect(state.cash).not.toBe(before);
  });

  it('pays prize money from the score versus par', () => {
    expect(prizeFor(70, 72, 18)).toEqual({ diff: -2, prize: 18000 + 18000, bonus: Math.round(36000 * 0.6), banked: 36000 + Math.round(36000 * 0.6) });
    expect(prizeFor(72, 72, 9).banked).toBe(9000);
    expect(prizeFor(80, 72, 9).banked).toBe(0);
  });

  it('keeps a blocked course from charging a week', () => {
    const state = blankState({ kind: 'blank' });
    const cash = state.cash;
    const res = advanceWeek(state, () => 0.2);
    expect(res.ok).toBe(false);
    expect(state.cash).toBe(cash);
    expect(state.week).toBe(1);
  });
});

describe('saves', () => {
  it('migrates a legacy 40×28 save onto the standard world', () => {
    const tiles = Array(1120).fill('rough');
    tiles[0] = 'clubhouse';
    const state = migrateLegacy({
      v: 2,
      tiles,
      cash: 812000,
      week: 4,
      courseSize: 9,
      fee: 70,
    });
    expect(state).not.toBeNull();
    expect(state!.cols).toBe(56);
    expect(state!.rows).toBe(40);
    expect(state!.tiles[0]).toBe('clubhouse');
    expect(state!.cash).toBe(812000);
    expect(state!.week).toBe(4);
    expect(state!.holes.length).toBeGreaterThan(0);
    expect(state!.v).toBe(4);
  });

  it('keeps an explicit large-land save', () => {
    const built = blankState({ land: 'large', courseSize: 18, kind: 'starter' });
    const again = migrateLegacy(built);
    expect(again!.land).toBe('large');
    expect(again!.holes).toHaveLength(18);
    expect(again!.cols).toBe(84);
  });
});

describe('shots', () => {
  it('plans a shorter shot from the rough and a deflected tree lie', () => {
    const ball = { x: 10, y: 10 };
    const fair = planShot({
      club: 'driver',
      power: 0.6,
      aim: 0,
      ball,
      lie: 'fairway',
      distToPin: 180,
      breakDir: 0,
      rng: rngSeq([0.5, 0.5, 0.5]),
    });
    const rough = planShot({
      club: 'driver',
      power: 0.6,
      aim: 0,
      ball,
      lie: 'rough',
      distToPin: 180,
      breakDir: 0,
      rng: rngSeq([0.5, 0.5, 0.5]),
    });
    expect(rough.distM).toBeLessThan(fair.distM);
    expect(fair.sweet).toBe(true);
    const trees = planShot({
      club: 'iron',
      power: 0.7,
      aim: 0,
      ball,
      lie: 'trees',
      distToPin: 90,
      breakDir: 0.4,
      rng: rngSeq([0.2, 0.4, 0.1, 0.8, 0.2]),
    });
    expect(trees.deflected).toBe(true);
  });
});

describe('starter rebuild', () => {
  it('restores holes without touching cash when buildStarter is called', () => {
    const state = blankState({ kind: 'blank' });
    state.cash = 1234;
    buildStarter(state);
    expect(state.holes).toHaveLength(9);
    expect(state.cash).toBe(1234);
  });
});
