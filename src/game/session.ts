import { cloneState, ensureHole, hasHole, maxHoles } from '../sim/course';
import { applyTemplateTo, architectFeedback, holeLengthM, holePar } from '../sim/holes';
import { advanceWeek, computeScores, prizeFor, takeLoan, type WeekReport } from '../sim/economy';
import { applyResize, charge, paintAt, type ActionResult } from '../sim/designer';
import { breakFor, dropPoint, geometryLie, holeOutDistance, lieLabel, planShot, type Lie } from '../sim/play';
import { hash } from '../sim/math';
import {
  BUNKER_R,
  CLUBS,
  TILE_M,
  type GameState,
  type Point,
} from '../sim/types';

export interface PlayRuntime {
  holeIdx: number;
  ball: Point | null;
  strokes: number;
  aim: number;
  trail: Point[];
  done: boolean;
  power: number;
  dir: 1 | -1;
  holding: boolean;
  breakDir: number;
  lift: number;
  deflected: boolean;
  flight: null | {
    a: Point;
    b: Point;
    start: number;
    dur: number;
    putt: boolean;
    distM: number;
  };
}

export class Session {
  state: GameState;
  play: PlayRuntime;
  past: GameState[] = [];
  future: GameState[] = [];
  lastReport: WeekReport | null = null;
  private listeners = new Set<() => void>();
  private strokeBase: GameState | null = null;
  private strokeUsed = false;
  rev = 0;

  constructor(state: GameState) {
    this.state = state;
    this.play = freshPlay();
    this.startHole(0, false);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.rev++;
    this.listeners.forEach((fn) => fn());
  }

  transact(fn: () => boolean) {
    const before = cloneState(this.state);
    const changed = fn();
    if (!changed) return false;
    this.past.push(before);
    if (this.past.length > 40) this.past.shift();
    this.future = [];
    this.emit();
    return true;
  }

  beginStroke() {
    this.strokeBase = cloneState(this.state);
    this.strokeUsed = false;
  }

  markStroke() {
    if (this.strokeBase && !this.strokeUsed) {
      this.past.push(this.strokeBase);
      if (this.past.length > 40) this.past.shift();
      this.future = [];
      this.strokeUsed = true;
    }
  }

  endStroke() {
    this.strokeBase = null;
    this.strokeUsed = false;
  }

  undo() {
    if (this.play.flight) return false;
    const prev = this.past.pop();
    if (!prev) return false;
    this.future.push(cloneState(this.state));
    this.state = prev;
    this.emit();
    return true;
  }

  redo() {
    if (this.play.flight) return false;
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(cloneState(this.state));
    this.state = next;
    this.emit();
    return true;
  }

  paint(x: number, y: number, erase = false): ActionResult {
    const result = paintAt(this.state, x, y, { erase });
    if (result.changed) {
      this.markStroke();
      this.emit();
    }
    return result;
  }

  currentHole() {
    const pairs = computeScores(this.state).pairs;
    if (!pairs.length) return null;
    return pairs[Math.max(0, Math.min(pairs.length - 1, this.play.holeIdx))] ?? null;
  }

  lie(): Lie {
    const pair = this.currentHole();
    if (!pair || !this.play.ball) return 'rough';
    if (this.play.strokes === 0) return 'tee';
    return geometryLie(this.state, this.play.ball.x, this.play.ball.y, pair.hole);
  }

  distToPin() {
    const pair = this.currentHole();
    if (!pair || !this.play.ball) return 0;
    return Math.hypot(pair.holeDef.points.at(-1)!.x - this.play.ball.x, pair.holeDef.points.at(-1)!.y - this.play.ball.y) * TILE_M;
  }

  startHole(idx: number, emit = true) {
    const pairs = computeScores(this.state).pairs;
    this.play.flight = null;
    this.play.holding = false;
    this.play.done = false;
    this.play.strokes = 0;
    this.play.trail = [];
    this.play.lift = 0;
    this.play.power = 0;
    if (!pairs.length) {
      this.play.holeIdx = 0;
      this.play.ball = null;
      this.play.breakDir = 0.4;
      if (emit) this.emit();
      return;
    }
    this.play.holeIdx = Math.max(0, Math.min(pairs.length - 1, idx));
    const pair = pairs[this.play.holeIdx];
    const tee = pair.holeDef.points[0];
    const next = pair.holeDef.points[1] ?? pair.holeDef.points.at(-1)!;
    this.play.ball = { x: tee.x, y: tee.y };
    this.play.aim = Math.atan2(next.y - tee.y, next.x - tee.x);
    this.play.breakDir = breakFor(pair.holeDef, this.play.holeIdx, hash);
    if (emit) this.emit();
  }

  holdSwing(now: number) {
    if (this.play.done || !this.currentHole() || this.play.flight) return false;
    this.play.holding = true;
    this.play.power = 4;
    this.play.dir = 1;
    this.play.flight = null;
    void now;
    return true;
  }

  tick(now: number, dt: number) {
    if (this.play.holding) {
      this.play.power += this.play.dir * 144 * dt;
      if (this.play.power >= 100) {
        this.play.power = 100;
        this.play.dir = -1;
      }
      if (this.play.power <= 3) {
        this.play.power = 3;
        this.play.dir = 1;
      }
    }
    const flight = this.play.flight;
    if (!flight || !this.play.ball) return;
    const k = Math.max(0, Math.min(1, (now - flight.start) / flight.dur));
    const e = 1 - (1 - k) * (1 - k);
    this.play.ball = { x: flight.a.x + (flight.b.x - flight.a.x) * e, y: flight.a.y + (flight.b.y - flight.a.y) * e };
    this.play.lift = flight.putt ? 0.04 : Math.sin(k * Math.PI) * 0.95;
    if (k > 0 && k < 1 && this.play.trail.length < 80) this.play.trail.push({ ...this.play.ball });
    if (k >= 1) this.resolveLanding(flight);
  }

  releaseSwing(now: number) {
    if (!this.play.holding) return null;
    this.play.holding = false;
    return this.swing(this.play.power / 100, now);
  }

  swing(power: number, now: number) {
    if (this.play.done || this.play.flight) return 'The hole is already complete.';
    const pair = this.currentHole();
    if (!pair || !this.play.ball) return 'Design at least one hole before you play it.';
    const lie = this.lie();
    const plan = planShot({
      club: this.state.club,
      power,
      aim: this.play.aim,
      ball: this.play.ball,
      lie,
      distToPin: this.distToPin(),
      breakDir: this.play.breakDir,
      rng: Math.random,
    });
    this.play.strokes++;
    this.play.deflected = plan.deflected;
    this.state.playLog = `${CLUBS[this.state.club].label} away, ${Math.round(plan.distM)} m…`;
    this.play.trail = [{ ...this.play.ball }];
    this.play.flight = {
      a: { ...this.play.ball },
      b: plan.target,
      start: now,
      dur: plan.putt ? 650 : 980,
      putt: plan.putt,
      distM: plan.distM,
    };
    return plan.deflected ? 'Clipped the trees. The ball kicks sideways.' : null;
  }

  private resolveLanding(flight: NonNullable<PlayRuntime['flight']>) {
    const pair = this.currentHole();
    this.play.flight = null;
    this.play.lift = 0;
    if (!pair || !this.play.ball) return;
    this.play.ball = {
      x: Math.max(0.4, Math.min(this.state.cols - 0.4, flight.b.x)),
      y: Math.max(0.4, Math.min(this.state.rows - 0.4, flight.b.y)),
    };
    const lie = geometryLie(this.state, this.play.ball.x, this.play.ball.y, pair.hole);
    if (lie === 'water') {
      this.play.strokes++;
      const drop = dropPoint(pair.holeDef);
      this.play.ball = drop;
      this.play.trail = [];
      this.state.playLog = `Splash. Water hazard, one-stroke penalty and a drop. ${this.play.strokes} strokes, ${Math.round(this.distToPin())} m to the pin.`;
      this.emit();
      return;
    }
    const dPin = this.distToPin();
    if (dPin <= holeOutDistance()) {
      const pin = pair.holeDef.points.at(-1)!;
      this.play.ball = { x: pin.x, y: pin.y };
      this.play.done = true;
      this.state.round.scores[this.play.holeIdx] = this.play.strokes;
      const diff = this.play.strokes - pair.par;
      const name = diff <= -2 ? 'Eagle class.' : diff === -1 ? 'Birdie.' : diff === 0 ? 'Par.' : diff === 1 ? 'Bogey.' : `+${diff}.`;
      this.state.playLog = `Holed out on ${pair.hole} in ${this.play.strokes} (par ${pair.par}). ${name}`;
      this.emit();
      return;
    }
    const label = lieLabel(lie);
    let msg = `Shot ${this.play.strokes}: ${Math.round(flight.distM)} m with the ${CLUBS[this.state.club].label}. ${label}. ${Math.round(dPin)} m to the pin.`;
    if (lie === 'sand') msg += ' Wedge out of the bunker.';
    if (lie === 'rough') msg += ' The rough will cost you distance.';
    if (lie === 'green' || dPin < 32) msg += ' Putter is the club. Watch the break.';
    if (flight.putt) msg = `Putt ran ${Math.round(flight.distM)} m. ${Math.round(dPin)} m remain. Break ${this.play.breakDir > 0 ? 'right' : 'left'}.`;
    this.state.playLog = msg;
    this.emit();
  }

  claimPrize(): { ok: boolean; message: string; banked: number } {
    const pairs = computeScores(this.state).pairs;
    const scores = this.state.round.scores;
    if (!pairs.length || pairs.some((_, i) => scores[i] == null)) {
      return { ok: false, message: `Finish all ${pairs.length} holes before collecting the prize.`, banked: 0 };
    }
    const total = pairs.reduce((a, _p, i) => a + (scores[i] ?? 0), 0);
    const par = pairs.reduce((a, p) => a + p.par, 0);
    const prize = prizeFor(total, par, pairs.length);
    if (prize.banked > 0) {
      this.state.cash += prize.banked;
      this.state.reputation = Math.max(5, Math.min(100, this.state.reputation + (prize.diff < 0 ? 3 : 1)));
      this.state.cashHist.push(this.state.cash);
    }
    this.state.round = { scores: Array(maxHoles(this.state)).fill(null), started: true };
    this.state.log.push(`Round ${total} (par ${par}). Prize $${prize.banked.toLocaleString('en-AU')} banked.`);
    this.state.playLog = 'Prize banked into the club account. A new round is on the tee.';
    this.startHole(0, false);
    this.emit();
    return {
      ok: true,
      banked: prize.banked,
      message: prize.banked
        ? `Round ${total} against par ${par}. $${prize.banked.toLocaleString('en-AU')} banked.`
        : `Round ${total} against par ${par}. No prize this time.`,
    };
  }

  week(rng: () => number = Math.random) {
    const before = cloneState(this.state);
    const result = advanceWeek(this.state, rng);
    if (!result.ok || !result.report) return result;
    this.past.push(before);
    this.future = [];
    this.lastReport = result.report;
    this.emit();
    return result;
  }

  loan() {
    return this.transact(() => {
      const res = takeLoan(this.state);
      this.state.playLog = res.message;
      return res.ok;
    });
  }

  applyTemplate(name: string) {
    const n = this.state.focusHole;
    if (!hasHole(this.state, n)) return { ok: false, message: `Create hole ${n} first. Nothing was charged.` };
    let message = '';
    const ok = this.transact(() => {
      const paid = charge(this.state, 3500, name);
      if (!paid.ok) {
        message = paid.message ?? 'Not enough cash.';
        return false;
      }
      applyTemplateTo(this.state.holes[n - 1], name, this.state.cols, this.state.rows);
      message = `${name} applied to hole ${n}. Drag the gold points to tune it.`;
      return true;
    });
    return { ok, message };
  }

  addBend() {
    const n = this.state.focusHole;
    const h = this.state.holes[n - 1];
    if (!h) return { ok: false, message: `Create hole ${n} first. Nothing was charged.` };
    if (h.points.length >= 5) return { ok: false, message: 'Three bend points is the maximum. Nothing was charged.' };
    let message = '';
    const ok = this.transact(() => {
      const paid = charge(this.state, 800, 'a bend point');
      if (!paid.ok) {
        message = paid.message ?? '';
        return false;
      }
      let bi = 1;
      let best = -1;
      for (let i = 1; i < h.points.length; i++) {
        const d = Math.hypot(h.points[i].x - h.points[i - 1].x, h.points[i].y - h.points[i - 1].y);
        if (d > best) {
          best = d;
          bi = i;
        }
      }
      h.points.splice(bi, 0, {
        x: (h.points[bi - 1].x + h.points[bi].x) / 2,
        y: (h.points[bi - 1].y + h.points[bi].y) / 2,
      });
      message = 'Bend point added.';
      return true;
    });
    return { ok, message };
  }

  removeBend() {
    const h = this.state.holes[this.state.focusHole - 1];
    if (!h) return { ok: false, message: 'Create the hole first.' };
    if (h.points.length <= 2) return { ok: false, message: 'A hole needs a tee and a green.' };
    this.transact(() => {
      h.points.splice(h.points.length - 2, 1);
      return true;
    });
    return { ok: true, message: 'Bend point removed.' };
  }

  addBunker(kind: 'fairway' | 'greenside' | 'pot') {
    const h = this.state.holes[this.state.focusHole - 1];
    if (!h) return { ok: false, message: 'Create the hole first. Nothing was charged.' };
    const sz = this.state.sizes.bunkerSize;
    const mult = sz === 'L' ? 2.5 : sz === 'M' ? 1.5 : 1;
    const cost = Math.round((kind === 'pot' ? 1200 : 1600) * mult);
    let message = '';
    const ok = this.transact(() => {
      const paid = charge(this.state, cost, `${kind} bunker`);
      if (!paid.ok) {
        message = paid.message ?? '';
        return false;
      }
      h.bunkers.push({
        along: kind === 'greenside' ? 0.93 : kind === 'pot' ? 0.62 : 0.5,
        side: Math.random() > 0.5 ? 1 : -1,
        off: kind === 'greenside' ? h.greenSize + 5 : h.fwWidth / 2 + 6,
        kind,
        r: kind === 'pot' ? Math.max(3, BUNKER_R[sz] - 2) : BUNKER_R[sz],
      });
      message = `${kind} bunker ${sz} added.`;
      return true;
    });
    return { ok, message };
  }

  addWater(kind: 'creek' | 'lake' | 'island') {
    const h = this.state.holes[this.state.focusHole - 1];
    if (!h) return { ok: false, message: 'Create the hole first. Nothing was charged.' };
    const cost = kind === 'creek' ? 2800 : kind === 'lake' ? 3200 : 3500;
    let message = '';
    const ok = this.transact(() => {
      const paid = charge(this.state, cost, `${kind} water`);
      if (!paid.ok) {
        message = paid.message ?? '';
        return false;
      }
      h.waters.push({ kind, along: kind === 'creek' ? 0.6 : kind === 'lake' ? 0.88 : 1 });
      if (kind === 'island') h.greenShape = 'island';
      message = `${kind} added to hole ${this.state.focusHole}.`;
      return true;
    });
    return { ok, message };
  }

  clearHazards() {
    const h = this.state.holes[this.state.focusHole - 1];
    if (!h) return { ok: false, message: 'Create the hole first.' };
    this.transact(() => {
      h.bunkers = [];
      h.waters = [];
      return true;
    });
    return { ok: true, message: 'Hazards cleared. No refund — sand and water already shaped the land.' };
  }

  createHole() {
    const n = this.state.focusHole;
    this.transact(() => {
      ensureHole(this.state, n);
      return true;
    });
    return { ok: true, message: `Hole ${n} created. Drag its gold points or apply a template. ${this.state.holes.length}/${maxHoles(this.state)} holes.` };
  }

  deleteHole() {
    const n = this.state.focusHole;
    if (!hasHole(this.state, n)) return { ok: false, message: `Hole ${n} does not exist yet.` };
    this.transact(() => {
      this.state.holes.splice(n - 1, 1);
      this.state.focusHole = Math.max(1, Math.min(n, this.state.holes.length || 1));
      this.state.holeNo = this.state.focusHole;
      return true;
    });
    return { ok: true, message: 'Hole deleted. Later holes renumbered.' };
  }

  reshapeGreen(shape: GameState['holes'][number]['greenShape']) {
    const h = this.state.holes[this.state.focusHole - 1];
    if (!h) return { ok: false, message: 'Create the hole first. Nothing was charged.' };
    let message = '';
    const ok = this.transact(() => {
      const paid = charge(this.state, 1200, 'reshaping the green');
      if (!paid.ok) {
        message = paid.message ?? '';
        return false;
      }
      h.greenShape = shape;
      message = `${shape} green shaped.`;
      return true;
    });
    return { ok, message };
  }

  resizeSelected() {
    let message = '';
    const ok = this.transact(() => {
      const res = applyResize(this.state);
      message = res.message ?? (res.ok ? 'Resized.' : 'Nothing changed.');
      return res.changed;
    });
    return { ok, message };
  }

  feedback() {
    const h = this.state.holes[this.state.focusHole - 1];
    if (!h) return [`Create hole ${this.state.focusHole} first. Open needs 9 holes. A full ${maxHoles(this.state)} earns the championship bonus.`];
    return architectFeedback(h, this.state.philosophy);
  }

  routeCharge(moved: boolean, revert: () => void) {
    if (!moved) return { ok: true, message: '' };
    this.markStroke();
    const paid = charge(this.state, 1800, 're-routing the hole');
    if (!paid.ok) {
      if (this.strokeUsed) this.undo();
      else revert();
      return { ok: false, message: 'Re-route cancelled. Not enough cash, so the point was put back and nothing was charged.' };
    }
    const h = this.state.holes[this.state.focusHole - 1];
    const message = h ? `Hole re-routed for $1,800. ${holeLengthM(h)} m, par ${holePar(h)}.` : 'Re-routed.';
    this.emit();
    return { ok: true, message };
  }
}

function freshPlay(): PlayRuntime {
  return {
    holeIdx: 0,
    ball: null,
    strokes: 0,
    aim: 0,
    trail: [],
    done: false,
    power: 0,
    dir: 1,
    holding: false,
    breakDir: 0.4,
    lift: 0,
    deflected: false,
    flight: null,
  };
}

export function aimAt(play: PlayRuntime, world: Point) {
  if (!play.ball) return;
  play.aim = Math.atan2(world.y - play.ball.y, world.x - play.ball.x);
}

