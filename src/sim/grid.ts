import { clamp } from './math';
import { LANDS, type GameState, type LandKey, type TileKind } from './types';

export interface Grid {
  cols: number;
  rows: number;
  tiles: TileKind[];
}

export function landDef(k: string | undefined) {
  if (k === 'large' || k === 'estate' || k === 'standard') return LANDS[k];
  return LANDS.standard;
}

export function idx(cols: number, x: number, y: number) {
  return y * cols + x;
}

export function inBounds(g: { cols: number; rows: number }, x: number, y: number) {
  return x >= 0 && y >= 0 && x < g.cols && y < g.rows;
}

export function tileAt(g: Grid, x: number, y: number): TileKind | 'trees' {
  if (!inBounds(g, x, y)) return 'trees';
  return g.tiles[idx(g.cols, x, y)] ?? 'rough';
}

export function worldSize(state: Pick<GameState, 'cols' | 'rows' | 'land'>) {
  return {
    w: state.cols * 100,
    h: state.rows * 100,
    cols: state.cols,
    rows: state.rows,
    land: state.land,
  };
}

export function inferLand(cols: number, rows: number, fallback: LandKey = 'standard'): LandKey {
  for (const k of Object.keys(LANDS) as LandKey[]) {
    if (LANDS[k].cols === cols && LANDS[k].rows === rows) return k;
  }
  return fallback;
}

export function clampPt(p: { x: number; y: number }, cols: number, rows: number, margin = 0.5) {
  return {
    x: clamp(p.x, margin, cols - margin),
    y: clamp(p.y, margin, rows - margin),
  };
}
