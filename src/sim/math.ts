export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic 0..1 hash for procedural scatter. Same constants as the previous game. */
export function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function fmtMoney(n: number): string {
  const s = n < 0 ? '-$' : '$';
  return s + Math.abs(Math.round(n)).toLocaleString('en-AU');
}
