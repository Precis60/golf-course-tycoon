import { clamp } from './math';
import { idx, inBounds } from './grid';
import { holeLengthM, holePar } from './holes';
import { ensureHole, hasHole, maxHoles, syncHoleMaps } from './course';
import {
  BUNKER_R,
  FACILITY_INFO,
  FAC_DIMS,
  TEE_TILES,
  TILE_INFO,
  TILE_M,
  isFacility,
  type Cell,
  type FacilityKind,
  type GameState,
  type Hole,
  type SizeLetter,
  type ToolId,
} from './types';

export interface Footprint {
  cells: Cell[];
  label: string;
  cost: number;
  newCount: number;
}

export function brushCells(state: GameState, cx: number, cy: number): Cell[] {
  const z = state.sizes;
  const cx0 = Math.floor(cx);
  const cy0 = Math.floor(cy);
  const size = z.brushShape === 'single' ? 1 : clamp(Math.round(z.brushSize || 3), 1, 15);
  if (z.brushShape === 'single' || size <= 1) {
    return inBounds(state, cx0, cy0) ? [{ x: cx0, y: cy0 }] : [];
  }
  const cells: Cell[] = [];
  const lo = -Math.floor((size - 1) / 2);
  const hi = lo + size - 1;
  const r = (size - 1) / 2;
  for (let y = lo; y <= hi; y++) {
    for (let x = lo; x <= hi; x++) {
      if (z.brushShape === 'round' && x * x + y * y > r * r + 0.01) continue;
      const nx = cx0 + x;
      const ny = cy0 + y;
      if (inBounds(state, nx, ny)) cells.push({ x: nx, y: ny });
    }
  }
  return cells;
}

export function treeCells(state: GameState, cx: number, cy: number): Cell[] {
  const z = state.sizes;
  if (z.treeClump === 'single') {
    const x = Math.floor(cx);
    const y = Math.floor(cy);
    return inBounds(state, x, y) ? [{ x, y }] : [];
  }
  const base = brushCells(state, cx, cy);
  if (z.treeClump !== 'woodland') return base;
  const set = new Map(base.map((c) => [`${c.x},${c.y}`, c]));
  base.forEach((c) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (inBounds(state, nx, ny)) set.set(`${nx},${ny}`, { x: nx, y: ny });
      }
    }
  });
  return [...set.values()];
}

export function teeOffsets(sz: SizeLetter): [number, number][] {
  if (sz === 'S') return [[0, 0]];
  if (sz === 'L') return [[0, 0], [1, 0], [0, 1], [1, 1]];
  return [[0, 0], [1, 0]];
}

export function teeCells(state: GameState, cx: number, cy: number): Cell[] {
  return teeOffsets(state.sizes.teeSize)
    .map(([ox, oy]) => ({ x: Math.floor(cx) + ox, y: Math.floor(cy) + oy }))
    .filter((c) => inBounds(state, c.x, c.y));
}

export function greenAreaTiles(radius: number) {
  return Math.max(1, Math.round((Math.PI * radius * radius) / 256));
}

export function greenCells(state: GameState, cx: number, cy: number): Cell[] {
  const r = state.sizes.greenRadius / TILE_M;
  const rad = Math.ceil(r);
  const cells: Cell[] = [];
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      if (Math.hypot(x, y) <= r) {
        const c = { x: Math.floor(cx) + x, y: Math.floor(cy) + y };
        if (inBounds(state, c.x, c.y)) cells.push(c);
      }
    }
  }
  return cells;
}

export function facilityDims(state: GameState, tool: string) {
  const saved = state.sizes.facilityByTool[tool];
  const sz = saved || state.sizes.facilitySize || 'S';
  return FAC_DIMS[sz] || FAC_DIMS.S;
}

export function facilityCost(state: GameState, tool: FacilityKind) {
  const d = facilityDims(state, tool);
  return Math.round((FACILITY_INFO[tool].cost / 4) * d.w * d.h);
}

export function footprintFor(state: GameState, tool: ToolId, cx: number, cy: number): Footprint {
  const z = state.sizes;
  if (isFacility(tool)) {
    const d = facilityDims(state, tool);
    const cells: Cell[] = [];
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) cells.push({ x: Math.floor(cx) + x, y: Math.floor(cy) + y });
    const inside = cells.filter((c) => inBounds(state, c.x, c.y));
    return {
      cells: inside,
      label: `${FACILITY_INFO[tool].label} ${z.facilitySize} ${d.w}×${d.h}`,
      cost: facilityCost(state, tool),
      newCount: inside.length,
    };
  }
  if (tool === 'tee') {
    const cells = teeCells(state, cx, cy);
    return { cells, label: `Tee ${z.teeSize}`, cost: TILE_INFO.tee.cost * cells.length, newCount: cells.length };
  }
  if (tool === 'green') {
    const cells = greenCells(state, cx, cy);
    const area = greenAreaTiles(z.greenRadius);
    return {
      cells,
      label: `Green r${z.greenRadius} m`,
      cost: TILE_INFO.green.cost * area,
      newCount: area,
    };
  }
  if (tool === 'trees') {
    const cells = treeCells(state, cx, cy);
    const nc = cells.filter((c) => state.tiles[idx(state.cols, c.x, c.y)] !== 'trees').length;
    return { cells, label: `Trees ${z.treeClump}`, cost: TILE_INFO.trees.cost * nc, newCount: nc };
  }
  if (tool === 'fairway' || tool === 'rough' || tool === 'sand' || tool === 'water' || tool === 'path' || tool === 'bulldoze') {
    const cells = brushCells(state, cx, cy);
    const tgt = tool === 'bulldoze' ? 'rough' : tool;
    const nc = cells.filter((c) => {
      const cur = state.tiles[idx(state.cols, c.x, c.y)];
      return cur !== tgt && !isFacility(cur);
    }).length;
    const unit = tool === 'bulldoze' || tool === 'rough' ? 0 : TILE_INFO[tool].cost;
    const shape = z.brushShape === 'single' ? 1 : z.brushSize;
    return {
      cells,
      label: `${tool === 'bulldoze' ? 'Bulldoze' : TILE_INFO[tool].label} ${z.brushShape} ${shape}`,
      cost: unit * nc,
      newCount: nc,
    };
  }
  return { cells: [], label: tool, cost: 0, newCount: 0 };
}

export interface ActionResult {
  ok: boolean;
  charged: number;
  changed: boolean;
  message?: string;
}

function fail(message: string): ActionResult {
  return { ok: false, charged: 0, changed: false, message };
}

function pay(state: GameState, cost: number, label: string): ActionResult | null {
  if (cost <= 0) return null;
  if (state.cash < cost) return fail(`Not enough cash for ${label} ($${cost.toLocaleString('en-AU')}). Nothing was placed.`);
  state.cash -= cost;
  return null;
}

function clearMarker(state: GameState, i: number) {
  if (state.teeMap[i]) delete state.teeMap[i];
  if (state.greenMap[i]) delete state.greenMap[i];
}

export function paintAt(state: GameState, cx: number, cy: number, opts?: { erase?: boolean }): ActionResult {
  const x = Math.floor(cx);
  const y = Math.floor(cy);
  if (!inBounds(state, x, y)) return fail('Outside the property.');
  const tool: ToolId | 'rough' = opts?.erase ? 'rough' : state.tool;
  if (tool === 'pan' || tool === 'holeedit') return { ok: true, charged: 0, changed: false };

  const paintTool = opts?.erase ? 'rough' : tool;
  if (
    paintTool === 'fairway' ||
    paintTool === 'rough' ||
    paintTool === 'sand' ||
    paintTool === 'water' ||
    paintTool === 'trees' ||
    paintTool === 'path'
  ) {
    const eff = paintTool;
    const cells = eff === 'trees' && !opts?.erase ? treeCells(state, cx, cy) : brushCells(state, cx, cy);
    const targets: number[] = [];
    for (const c of cells) {
      const ii = idx(state.cols, c.x, c.y);
      const cur = state.tiles[ii];
      if (isFacility(cur)) continue;
      if (cur === 'tee' || cur === 'green') {
        if (eff === 'rough') targets.push(ii);
        continue;
      }
      if (cur !== eff) targets.push(ii);
    }
    if (!targets.length) return { ok: true, charged: 0, changed: false };
    const unit = eff === 'rough' ? 0 : TILE_INFO[eff].cost;
    const cost = unit * targets.length;
    const denied = pay(state, cost, TILE_INFO[eff].label);
    if (denied) return denied;
    targets.forEach((ii) => {
      clearMarker(state, ii);
      state.tiles[ii] = eff;
    });
    return { ok: true, charged: cost, changed: true };
  }

  if (tool === 'bulldoze') {
    const cells = brushCells(state, cx, cy);
    const done = new Set<number>();
    let changed = false;
    for (const c of cells) {
      const ii = idx(state.cols, c.x, c.y);
      if (done.has(ii)) continue;
      const t = state.tiles[ii];
      if (isFacility(t)) {
        const q = [ii];
        const seen = new Set([ii]);
        while (q.length) {
          const cur = q.pop()!;
          const cx0 = cur % state.cols;
          const cy0 = Math.floor(cur / state.cols);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx0 + dx;
            const ny = cy0 + dy;
            if (!inBounds(state, nx, ny)) continue;
            const ni = idx(state.cols, nx, ny);
            if (!seen.has(ni) && state.tiles[ni] === t) {
              seen.add(ni);
              q.push(ni);
            }
          }
        }
        seen.forEach((ni) => {
          state.tiles[ni] = 'rough';
          clearMarker(state, ni);
          done.add(ni);
        });
        changed = true;
      } else if (t !== 'rough') {
        state.tiles[ii] = 'rough';
        clearMarker(state, ii);
        changed = true;
      }
    }
    return { ok: true, charged: 0, changed };
  }

  if (isFacility(tool)) return placeFacility(state, tool, x, y);
  if (tool === 'tee' || tool === 'green') return placeEnd(state, tool, x, y);
  return { ok: true, charged: 0, changed: false };
}

function placeFacility(state: GameState, tool: FacilityKind, x: number, y: number): ActionResult {
  const d = facilityDims(state, tool);
  if (x + d.w > state.cols || y + d.h > state.rows) {
    return fail(`A ${d.w}×${d.h} ${FACILITY_INFO[tool].label} does not fit there. Nothing was charged.`);
  }
  const cells: number[] = [];
  for (let yy = 0; yy < d.h; yy++) for (let xx = 0; xx < d.w; xx++) cells.push(idx(state.cols, x + xx, y + yy));
  if (cells.every((ii) => state.tiles[ii] === tool)) {
    return fail(`${FACILITY_INFO[tool].label} is already there. Nothing was charged.`);
  }
  if (cells.some((ii) => isFacility(state.tiles[ii]) || state.tiles[ii] === 'tee' || state.tiles[ii] === 'green')) {
    return fail('That spot is occupied by a facility or a tee/green. Bulldoze it first. Nothing was charged.');
  }
  const cost = facilityCost(state, tool);
  const denied = pay(state, cost, FACILITY_INFO[tool].label);
  if (denied) return denied;
  cells.forEach((ii) => {
    clearMarker(state, ii);
    state.tiles[ii] = tool;
  });
  return {
    ok: true,
    charged: cost,
    changed: true,
    message: `${FACILITY_INFO[tool].label} ${state.sizes.facilitySize} (${d.w}×${d.h}) built for $${cost.toLocaleString('en-AU')}.`,
  };
}

function placeEnd(state: GameState, tool: 'tee' | 'green', x: number, y: number): ActionResult {
  const hn = clamp(Math.round(+state.holeNo || 1), 1, maxHoles(state));
  const i = idx(state.cols, x, y);
  const z = state.sizes;
  if (isFacility(state.tiles[i])) return fail('Occupied by a facility. Bulldoze it first. Nothing was charged.');

  if (hasHole(state, hn)) {
    const h = state.holes[hn - 1];
    const isTee = tool === 'tee';
    const endPt = isTee ? h.points[0] : h.points[h.points.length - 1];
    const otherPt = isTee ? h.points[h.points.length - 1] : h.points[0];
    if (
      Math.round(endPt.x) === x &&
      Math.round(endPt.y) === y &&
      (isTee ? (h.teeSize || 'M') === z.teeSize : h.greenSize === z.greenRadius)
    ) {
      return fail(`${isTee ? 'Tee' : 'Green'} ${hn} is already there at that size. Nothing was charged.`);
    }
    if (Math.floor(otherPt.x) === x && Math.floor(otherPt.y) === y) {
      return fail('Tee and green cannot share a tile. Nothing was charged.');
    }
    const cost = isTee ? TILE_INFO.tee.cost * (TEE_TILES[z.teeSize] || 2) : TILE_INFO.green.cost * greenAreaTiles(z.greenRadius);
    const denied = pay(state, cost, isTee ? 'moving the tee' : 'moving the green');
    if (denied) return denied;
    if (isTee) {
      clearTeeTiles(state, h);
      h.points[0] = { x: x + 0.5, y: y + 0.5 };
      h.teeSize = z.teeSize;
      paintTeeTiles(state, h);
    } else {
      h.points[h.points.length - 1] = { x: x + 0.5, y: y + 0.5 };
      h.greenSize = z.greenRadius;
    }
    state.focusHole = hn;
    syncHoleMaps(state);
    return {
      ok: true,
      charged: cost,
      changed: true,
      message: `${isTee ? 'Tee' : 'Green'} ${hn} moved. Hole ${hn} is ${holeLengthM(h)} m, par ${holePar(h)}.`,
    };
  }

  const map = tool === 'tee' ? state.teeMap : state.greenMap;
  const other = tool === 'tee' ? state.greenMap : state.teeMap;
  if (map[i] === hn && tool === 'green') return fail(`Green ${hn} is already there. Nothing was charged.`);
  if (other[i] === hn) return fail('Tee and green cannot share a tile. Nothing was charged.');
  const cost = tool === 'tee' ? TILE_INFO.tee.cost * (TEE_TILES[z.teeSize] || 2) : TILE_INFO.green.cost * greenAreaTiles(z.greenRadius);
  const denied = pay(state, cost, tool === 'tee' ? 'tee' : 'green');
  if (denied) return denied;
  const existing = Object.keys(map).find((k) => map[k] === hn);
  if (existing !== undefined) {
    if (state.tiles[+existing] === tool) state.tiles[+existing] = 'rough';
    delete map[existing];
  }
  if (tool === 'tee') {
    teeCells(state, x, y).forEach((c) => {
      const ii = idx(state.cols, c.x, c.y);
      clearMarker(state, ii);
      state.tiles[ii] = 'tee';
    });
    map[i] = hn;
  } else {
    clearMarker(state, i);
    state.tiles[i] = 'green';
    map[i] = hn;
  }
  state.focusHole = hn;
  const teeK = Object.keys(state.teeMap).find((k) => state.teeMap[k] === hn);
  const greenK = Object.keys(state.greenMap).find((k) => state.greenMap[k] === hn);
  if (teeK !== undefined && greenK !== undefined) {
    const tp = { x: +teeK % state.cols, y: Math.floor(+teeK / state.cols) };
    const gp = { x: +greenK % state.cols, y: Math.floor(+greenK / state.cols) };
    const created = ensureHole(state, hn);
    const teePt = { x: tp.x + 0.5, y: tp.y + 0.5 };
    const greenPt = { x: gp.x + 0.5, y: gp.y + 0.5 };
    created.points =
      Math.hypot(greenPt.x - teePt.x, greenPt.y - teePt.y) >= 3
        ? [teePt, { x: (teePt.x + greenPt.x) / 2, y: (teePt.y + greenPt.y) / 2 }, greenPt]
        : [teePt, greenPt];
    created.teeSize = z.teeSize;
    created.greenSize = z.greenRadius;
    if (state.tiles[+greenK] === 'green') state.tiles[+greenK] = 'rough';
    paintTeeTiles(state, created);
    syncHoleMaps(state);
    return {
      ok: true,
      charged: cost,
      changed: true,
      message: `Hole ${hn} created, ${holeLengthM(created)} m, par ${holePar(created)}. Drag the gold points to shape it.`,
    };
  }
  syncHoleMaps(state);
  return {
    ok: true,
    charged: cost,
    changed: true,
    message: `${tool === 'tee' ? 'Tee' : 'Green'} ${hn} placed. Add the matching ${tool === 'tee' ? 'green' : 'tee'} to create the hole.`,
  };
}

export function clearTeeTiles(state: GameState, h: Hole) {
  const pt = h.points[0];
  teeOffsets(h.teeSize || 'M').forEach(([ox, oy]) => {
    const x = Math.floor(pt.x) + ox;
    const y = Math.floor(pt.y) + oy;
    if (inBounds(state, x, y) && state.tiles[idx(state.cols, x, y)] === 'tee') state.tiles[idx(state.cols, x, y)] = 'rough';
  });
}

export function paintTeeTiles(state: GameState, h: Hole) {
  const pt = h.points[0];
  teeOffsets(h.teeSize || 'M').forEach(([ox, oy]) => {
    const x = Math.floor(pt.x) + ox;
    const y = Math.floor(pt.y) + oy;
    if (inBounds(state, x, y) && !isFacility(state.tiles[idx(state.cols, x, y)])) state.tiles[idx(state.cols, x, y)] = 'tee';
  });
}

export function applyResize(state: GameState): ActionResult {
  const z = state.sizes;
  const hn = state.focusHole || state.holeNo || 1;
  if (state.tool === 'sand' && hasHole(state, hn) && state.holes[hn - 1].bunkers.length) {
    const h = state.holes[hn - 1];
    const b = h.bunkers[h.bunkers.length - 1];
    const nr = BUNKER_R[z.bunkerSize];
    const oldT = Math.max(1, Math.round((Math.PI * b.r * b.r) / 256));
    const newT = Math.max(1, Math.round((Math.PI * nr * nr) / 256));
    const diff = (newT - oldT) * TILE_INFO.sand.cost;
    if (diff === 0) return fail('Bunker is already that size. Nothing was charged.');
    if (diff > 0) {
      const denied = pay(state, diff, 'bunker resize');
      if (denied) return denied;
    } else state.cash += -diff;
    b.r = nr;
    return { ok: true, charged: Math.max(0, diff), changed: true, message: `Bunker resized to ${z.bunkerSize} (r ${nr} m).` };
  }
  if (state.tool === 'tee' && hasHole(state, hn)) {
    const h = state.holes[hn - 1];
    const oldT = TEE_TILES[h.teeSize || 'M'];
    const newT = TEE_TILES[z.teeSize];
    const diff = (newT - oldT) * TILE_INFO.tee.cost;
    if (diff === 0) return fail(`Tee is already ${z.teeSize}. Nothing was charged.`);
    if (diff > 0) {
      const denied = pay(state, diff, 'tee resize');
      if (denied) return denied;
    } else state.cash += -diff;
    clearTeeTiles(state, h);
    h.teeSize = z.teeSize;
    paintTeeTiles(state, h);
    return { ok: true, charged: Math.max(0, diff), changed: true, message: `Tee ${hn} resized to ${z.teeSize} (${newT} tiles).` };
  }
  if (hasHole(state, hn)) {
    const h = state.holes[hn - 1];
    const oldR = h.greenSize;
    const newR = z.greenRadius;
    const oldT = Math.max(1, Math.round((Math.PI * oldR * oldR) / 256));
    const newT = greenAreaTiles(newR);
    const diff = (newT - oldT) * TILE_INFO.green.cost;
    if (oldR === newR || diff === 0) {
      h.greenSize = newR;
      return fail('Green is already about that size. Nothing was charged.');
    }
    if (diff > 0) {
      const denied = pay(state, diff, 'green resize');
      if (denied) return denied;
    } else state.cash += -diff;
    h.greenSize = newR;
    return { ok: true, charged: Math.max(0, diff), changed: true, message: `Green ${hn} resized to r ${newR} m.` };
  }
  return fail('Nothing to resize yet. Create a hole first. Nothing was charged.');
}

export function charge(state: GameState, cost: number, label: string): ActionResult {
  const denied = pay(state, cost, label);
  if (denied) return denied;
  return { ok: true, charged: Math.max(0, cost), changed: true };
}
