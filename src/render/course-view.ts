import { Application, Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { hash } from '../sim/math';
import { idx } from '../sim/grid';
import { bunkerWorld, holeLengthM, pointAlong } from '../sim/holes';
import { TILE_M, isFacility, type GameState, type GreenShape, type Hole, type Point, type Quality } from '../sim/types';
import { getArt, type ArtSet } from './textures';

export interface PlayDraw {
  ball: Point | null;
  aim: number;
  trail: Point[];
  lift: number;
  holeIdx: number;
  done: boolean;
}

export type ViewMode = 'title' | 'design' | 'manage' | 'play';

export class CourseView {
  readonly host: HTMLElement;
  private app: Application | null = null;
  private world = new Container();
  private staticLayer = new Container();
  private actorLayer = new Container();
  private fx = new Graphics();
  private art: ArtSet | null = null;
  private state: GameState | null = null;
  private builtRev = -1;
  rev = 0;
  mode: ViewMode = 'title';
  focusHole = 1;
  quality: Quality = 'high';
  reduceMotion = false;
  edit = true;
  colorblind = false;
  ghost: { x: number; y: number }[] = [];
  ghostBad = false;
  play: PlayDraw | null = null;
  cam = { x: 0, y: 0, zoom: 1 };
  private insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private camAnim: { x: number; y: number; zoom: number } | null = null;
  private carts: Sprite[] = [];
  private golfers: Sprite[] = [];
  private golferBase: Point[] = [];
  private path: Point[] = [];
  private readonly onResize = () => this.applyResolution();

  constructor(host: HTMLElement) {
    this.host = host;
  }

  get canvas() {
    return this.app?.canvas ?? null;
  }

  viewportTiles() {
    const state = this.state;
    if (!state) return null;
    const view = this.viewSize();
    const scale = this.fitScale(state) * this.cam.zoom || 1;
    return { x: this.cam.x, y: this.cam.y, w: view.w / scale, h: view.h / scale, zoom: this.cam.zoom };
  }

  async init() {
    const app = new Application();
    await app.init({
      antialias: true,
      background: 0xcbb98a,
      resizeTo: this.host,
      autoDensity: true,
      resolution: this.resolution(),
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.app = app;
    this.art = getArt();
    this.host.appendChild(app.canvas);
    app.stage.addChild(this.world);
    this.world.addChild(this.staticLayer, this.actorLayer, this.fx);
    app.ticker.add(() => this.frame());
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.app?.destroy(true);
  }

  private resolution() {
    const dpr = window.devicePixelRatio || 1;
    const narrow = this.host.clientWidth > 0 && this.host.clientWidth < 760;
    if (this.quality === 'battery') return 1;
    if (this.quality === 'high') return Math.min(dpr, narrow ? 1.25 : 1.5);
    return Math.min(dpr, narrow ? 1.5 : 2);
  }

  applyResolution() {
    if (!this.app) return;
    const next = this.resolution();
    if (Math.abs(this.app.renderer.resolution - next) > 0.05) {
      this.app.renderer.resolution = next;
      this.app.resize();
    }
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.applyResolution();
    this.builtRev = -1;
  }

  setInsets(next: { top: number; right: number; bottom: number; left: number }) {
    const i = this.insets;
    if (i.top === next.top && i.right === next.right && i.bottom === next.bottom && i.left === next.left) return;
    this.insets = { ...next };
  }

  pixelsPerMeter() {
    const state = this.state;
    if (!state) return 0;
    return (this.fitScale(state) * this.cam.zoom) / TILE_M;
  }

  markDirty() {
    this.rev++;
  }

  clientToTile(clientX: number, clientY: number): Point {
    const canvas = this.app?.canvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const s = this.world.scale.x || 1;
    return { x: (px - this.world.position.x) / s, y: (py - this.world.position.y) / s };
  }

  zoomAt(clientX: number, clientY: number, factor: number) {
    const before = this.clientToTile(clientX, clientY);
    this.cam.zoom = clampZoom(this.cam.zoom * factor);
    this.applyCamera();
    const after = this.clientToTile(clientX, clientY);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  panPixels(dx: number, dy: number) {
    const s = this.world.scale.x || 1;
    this.cam.x -= dx / s;
    this.cam.y -= dy / s;
    this.clampCam();
  }

  fit(animate = true) {
    this.moveCam(0, 0, 1, animate);
  }

  frameHole(n: number, animate = true) {
    const state = this.state;
    const h = state?.holes[n - 1];
    if (!state || !h) return false;
    const xs = h.points.map((p) => p.x);
    const ys = h.points.map((p) => p.y);
    const minx = Math.min(...xs) - 2.4;
    const maxx = Math.max(...xs) + 2.4;
    const miny = Math.min(...ys) - 2.4;
    const maxy = Math.max(...ys) + 2.4;
    const view = this.viewSize();
    const fit = this.fitScale(state);
    const spanX = Math.max(6, maxx - minx);
    const spanY = Math.max(5, maxy - miny);
    const zoom = clampZoom(Math.min(view.w / spanX, view.h / spanY) / fit);
    const scale = fit * zoom;
    const visW = view.w / scale;
    const visH = view.h / scale;
    const x = (minx + maxx) / 2 - visW * 0.5;
    const y = (miny + maxy) / 2 - visH / 2;
    this.moveCam(x, y, zoom, animate);
    return true;
  }

  private moveCam(x: number, y: number, zoom: number, animate: boolean) {
    if (!animate || this.reduceMotion) {
      this.cam.x = x;
      this.cam.y = y;
      this.cam.zoom = zoom;
      this.camAnim = null;
      return;
    }
    this.camAnim = { x, y, zoom };
  }

  private fullSize() {
    const canvas = this.app?.canvas;
    const rect = canvas?.getBoundingClientRect();
    return { w: rect?.width || this.host.clientWidth || 800, h: rect?.height || this.host.clientHeight || 600 };
  }

  private viewBox() {
    const full = this.fullSize();
    const left = Math.min(this.insets.left, full.w * 0.42);
    const right = Math.min(this.insets.right, full.w * 0.46);
    const top = Math.min(this.insets.top, full.h * 0.42);
    const bottom = Math.min(this.insets.bottom, full.h * 0.58);
    return {
      w: Math.max(160, full.w - left - right),
      h: Math.max(140, full.h - top - bottom),
      ox: left,
      oy: top,
    };
  }

  private viewSize() {
    const box = this.viewBox();
    return { w: box.w, h: box.h };
  }

  private fitScale(state: GameState) {
    const view = this.viewSize();
    return Math.min(view.w / state.cols, view.h / state.rows);
  }

  private clampCam() {
    const state = this.state;
    if (!state) return;
    this.cam.x = Math.max(-3, Math.min(state.cols + 1, this.cam.x));
    this.cam.y = Math.max(-3, Math.min(state.rows + 1, this.cam.y));
  }

  private applyCamera() {
    const state = this.state;
    if (!state) return;
    const box = this.viewBox();
    const s = this.fitScale(state) * this.cam.zoom;
    this.world.scale.set(s);
    this.world.position.set(box.ox - this.cam.x * s, box.oy - this.cam.y * s);
  }

  private frame() {
    if (this.mode === 'title' && !this.reduceMotion) {
      const time = this.app?.ticker.lastTime ?? 0;
      this.cam.zoom = 1.18;
      this.cam.x = 4 + Math.sin(time / 9000) * 3;
      this.cam.y = 2 + Math.cos(time / 11000) * 1.5;
      this.camAnim = null;
    } else if (this.camAnim) {
      this.cam.x += (this.camAnim.x - this.cam.x) * 0.18;
      this.cam.y += (this.camAnim.y - this.cam.y) * 0.18;
      this.cam.zoom += (this.camAnim.zoom - this.cam.zoom) * 0.18;
      if (Math.abs(this.cam.zoom - this.camAnim.zoom) < 0.01 && Math.hypot(this.cam.x - this.camAnim.x, this.cam.y - this.camAnim.y) < 0.05) {
        this.cam.x = this.camAnim.x;
        this.cam.y = this.camAnim.y;
        this.cam.zoom = this.camAnim.zoom;
        this.camAnim = null;
      }
    }
    if (this.state && this.builtRev !== this.rev) this.rebuild();
    this.applyCamera();
    this.drawFx();
  }

  show(state: GameState | null, opts?: { fit?: boolean }) {
    const landChanged = !!state && !!this.state && (state.cols !== this.state.cols || state.rows !== this.state.rows);
    const swapped = state !== this.state;
    this.state = state;
    if (swapped || landChanged) this.builtRev = -1;
    if (opts?.fit && state) this.fit(false);
  }

  centerOn(tx: number, ty: number) {
    const vp = this.viewportTiles();
    if (!vp) return;
    this.cam.x = tx - vp.w / 2;
    this.cam.y = ty - vp.h / 2;
    this.clampCam();
  }

  private rebuild() {
    const state = this.state;
    const art = this.art;
    if (!state || !art) return;
    this.builtRev = this.rev;
    for (const child of this.staticLayer.removeChildren()) child.destroy({ children: true });

    const paper = new Graphics();
    paper.rect(-4, -4, state.cols + 8, state.rows + 8).fill({ color: 0xe6d8b8 });
    for (let i = 0; i < 70; i++) {
      paper.rect(hash(i, 3) * state.cols, hash(9, i) * state.rows, 0.08, 0.08).fill({ color: 0x8a7048, alpha: 0.18 });
    }
    paper.rect(0, 0, state.cols, state.rows).stroke({ width: 0.12, color: 0x6d5a38, alpha: 0.7 });
    this.staticLayer.addChild(paper);

    const grass = new TilingSprite({ texture: art.grass, width: state.cols, height: state.rows });
    grass.tileScale.set(4 / 128);
    this.staticLayer.addChild(grass);

    const paint = new Graphics();
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const t = state.tiles[idx(state.cols, x, y)];
        if (t === 'rough' || t === 'trees' || isFacility(t)) continue;
        if (t === 'fairway') paint.rect(x, y, 1, 1).fill({ color: (x + y) % 2 ? 0x8ed072 : 0x7ec566 });
        else if (t === 'path') paint.roundRect(x + 0.08, y + 0.18, 0.84, 0.64, 0.2).fill({ color: 0xd2c09a });
        else if (t === 'water') {
          paint.ellipse(x + 0.5, y + 0.5, 0.46, 0.36).fill({ color: 0x1f6ea8 });
          paint.ellipse(x + 0.38, y + 0.38, 0.12, 0.05).fill({ color: 0xffffff, alpha: 0.35 });
        } else if (t === 'sand') paint.ellipse(x + 0.5, y + 0.5, 0.42, 0.3).fill({ color: 0xecd7a2 });
        else if (t === 'tee') {
          paint.rect(x, y, 1, 1).fill({ color: 0xb7e0a4 });
          paint.rect(x + 0.22, y + 0.38, 0.56, 0.22).fill({ color: 0xfffaf2 }).stroke({ width: 0.04, color: 0xc4322c });
        } else if (t === 'green') paint.circle(x + 0.5, y + 0.5, 0.42).fill({ color: 0x3fbe6c });
      }
    }
    this.staticLayer.addChild(paint);

    const holes = state.holes;
    const rough = new Graphics();
    const fringe = new Graphics();
    const fair = new Graphics();
    const stripe = new Graphics();
    for (const h of holes) {
      strokeHole(rough, h);
      rough.stroke({ width: (h.fwWidth + h.roughWidth * 2) / TILE_M, color: 0x3c6b34, cap: 'round', join: 'round', alpha: 0.95 });
      strokeHole(fringe, h);
      fringe.stroke({ width: (h.fwWidth + 8) / TILE_M, color: 0x8fc96e, cap: 'round', join: 'round' });
      strokeHole(fair, h);
      fair.stroke({ width: h.fwWidth / TILE_M, color: 0x6fbf62, cap: 'round', join: 'round' });
      dashFairway(stripe, h);
    }
    stripe.stroke({ width: 0.12, color: 0xffffff, alpha: 0.28, cap: 'round' });
    this.staticLayer.addChild(rough, fringe, fair, stripe);

    const hazards = new Graphics();
    holes.forEach((h, hi) => {
      for (const w of h.waters) this.drawWater(hazards, h, w.kind, w.along);
      h.bunkers.forEach((b, bi) => drawBunker(hazards, h, b, hi * 13 + bi));
    });
    this.staticLayer.addChild(hazards);

    holes.forEach((h, i) => {
      const g = h.points[h.points.length - 1];
      const prev = h.points[h.points.length - 2] ?? h.points[0];
      const ang = Math.atan2(g.y - prev.y, g.x - prev.x);
      const r = h.greenSize / TILE_M;
      const shadow = new Graphics();
      shadow.ellipse(0.08, 0.1, r * 1.05, r * 0.72).fill({ color: 0x000000, alpha: 0.16 });
      shadow.position.set(g.x, g.y);
      shadow.rotation = ang;
      const apron = new Graphics();
      traceGreen(apron, h.greenShape, r * 1.18);
      apron.fill({ color: 0x8ed07a });
      apron.position.set(g.x, g.y);
      apron.rotation = ang;
      const green = new Graphics();
      traceGreen(green, h.greenShape, r);
      green.fill({ color: i + 1 === this.focusHole ? 0x3ed889 : 0x2faf62 });
      green.stroke({ width: 0.045, color: 0xffffff, alpha: 0.7 });
      if (h.greenShape === 'biarritz') {
        green.moveTo(-r * 0.7, 0).quadraticCurveTo(0, r * 0.16, r * 0.7, 0).stroke({ width: 0.04, color: 0x145c32, alpha: 0.55 });
      }
      if (h.greenShape === 'punchbowl') {
        green.ellipse(0, 0, r * 0.62, r * 0.42).stroke({ width: 0.035, color: 0x145c32, alpha: 0.4 });
      }
      green.position.set(g.x, g.y);
      green.rotation = ang;
      this.staticLayer.addChild(shadow, apron, green);
      this.drawTees(h);
      const badge = new Sprite(art.numbers[i]);
      badge.anchor.set(0.5);
      badge.position.set(h.points[0].x, h.points[0].y - 0.85);
      badge.width = 1.15;
      badge.height = 1.15;
      this.staticLayer.addChild(badge);
    });

    this.drawTrees(state, art);
    this.drawFacilities(state, art);
    this.layoutActors(state, art);
  }

  private drawWater(g: Graphics, h: Hole, kind: 'creek' | 'lake' | 'island', along: number) {
    if (kind === 'creek') {
      const pt = pointAlong(h, along);
      const nx = Math.cos(pt.ang + Math.PI / 2);
      const ny = Math.sin(pt.ang + Math.PI / 2);
      g.moveTo(pt.x - nx * 1.8, pt.y - ny * 1.8).lineTo(pt.x + nx * 1.8, pt.y + ny * 1.8).stroke({ width: 0.55, color: 0x1d6eab, cap: 'round' });
      return;
    }
    if (kind === 'lake') {
      const fr = pointAlong(h, 0.9);
      g.ellipse(fr.x, fr.y, 2.3, 1.45).fill({ color: 0x1a679f });
      g.ellipse(fr.x - 0.4, fr.y - 0.3, 0.55, 0.2).fill({ color: 0xffffff, alpha: 0.28 });
      return;
    }
    const green = h.points[h.points.length - 1];
    const rad = (h.greenSize + 14) / TILE_M;
    g.ellipse(green.x, green.y, rad, rad * 0.86).fill({ color: 0x1a679f });
  }

  private drawTees(h: Hole) {
    const t0 = h.points[0];
    const t1 = h.points[1] ?? t0;
    const ang = Math.atan2(t1.y - t0.y, t1.x - t0.x);
    const marks: [number, number][] = [
      [-12, 0xfffaf2],
      [0, 0xf0d48a],
      [24, 0xf3b7c8],
    ];
    for (const [meters, color] of marks) {
      const d = meters / TILE_M;
      const box = new Graphics();
      box.roundRect(-0.28, -0.12, 0.56, 0.24, 0.04).fill({ color });
      box.position.set(t0.x + Math.cos(ang) * d, t0.y + Math.sin(ang) * d);
      box.rotation = ang;
      this.staticLayer.addChild(box);
    }
  }

  private drawTrees(state: GameState, art: ArtSet) {
    const step = this.quality === 'battery' ? 4 : this.quality === 'ultra' ? 2 : 3;
    const cap = this.quality === 'battery' ? 90 : this.quality === 'ultra' ? 380 : 200;
    let n = 0;
    const place = (x: number, y: number, pine: boolean, scale = 1) => {
      const s = new Sprite(pine ? art.treePine : art.tree);
      s.anchor.set(0.5, 0.72);
      s.position.set(x, y);
      const sc = (0.9 + hash(Math.round(x * 10), Math.round(y * 10)) * 0.55) * scale;
      s.scale.set(sc * 0.018, sc * 0.02);
      this.staticLayer.addChild(s);
    };
    for (let y = 1; y < state.rows - 1 && n < cap; y += step) {
      for (let x = 1; x < state.cols - 1 && n < cap; x += step) {
        if (hash(x, y) < 0.72) continue;
        if (state.tiles[idx(state.cols, x, y)] !== 'rough') continue;
        if (this.nearPlay(state, x + 0.5, y + 0.5)) continue;
        place(x + 0.5, y + 0.5, hash(y, x) > 0.55);
        n++;
      }
    }
    let explicit = 0;
    for (let i = 0; i < state.tiles.length && explicit < 1600; i++) {
      if (state.tiles[i] !== 'trees') continue;
      const x = i % state.cols;
      const y = Math.floor(i / state.cols);
      place(x + 0.5, y + 0.45, hash(x, y) > 0.62, 1.15);
      explicit++;
    }
  }

  private nearPlay(state: GameState, x: number, y: number) {
    for (const h of state.holes) {
      let best = 1e9;
      for (let i = 1; i < h.points.length; i++) {
        const a = h.points[i - 1];
        const b = h.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
        best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
      }
      if (best < h.fwWidth / TILE_M / 2 + h.roughWidth / TILE_M + 0.7) return true;
    }
    return false;
  }

  private drawFacilities(state: GameState, art: ArtSet) {
    const seen = new Set<number>();
    for (let i = 0; i < state.tiles.length; i++) {
      const t = state.tiles[i];
      if (!isFacility(t) || seen.has(i)) continue;
      const x0 = i % state.cols;
      const y0 = Math.floor(i / state.cols);
      if ((x0 > 0 && state.tiles[i - 1] === t) || (y0 > 0 && state.tiles[i - state.cols] === t)) {
        seen.add(i);
        continue;
      }
      let w = 1;
      while (x0 + w < state.cols && state.tiles[idx(state.cols, x0 + w, y0)] === t) w++;
      let h = 1;
      while (y0 + h < state.rows && state.tiles[idx(state.cols, x0, y0 + h)] === t) h++;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) seen.add(idx(state.cols, x0 + xx, y0 + yy));
      const shadow = new Graphics();
      shadow.ellipse(w / 2, h * 0.72, w * 0.48, h * 0.22).fill({ color: 0x000000, alpha: 0.18 });
      shadow.position.set(x0, y0);
      const sprite = new Sprite(art.facilities[t]);
      sprite.position.set(x0, y0);
      sprite.width = w;
      sprite.height = h;
      this.staticLayer.addChild(shadow, sprite);
    }
  }

  private layoutActors(state: GameState, art: ArtSet) {
    for (const s of [...this.carts, ...this.golfers]) s.destroy();
    this.carts = [];
    this.golfers = [];
    this.golferBase = [];
    this.actorLayer.removeChildren();
    const pts: Point[] = [];
    for (let i = 0; i < state.tiles.length && pts.length < 70; i++) {
      if (state.tiles[i] === 'path') pts.push({ x: (i % state.cols) + 0.5, y: Math.floor(i / state.cols) + 0.5 });
    }
    if (pts.length < 4) {
      const home = this.anchor(state, 'clubhouse') ?? { x: state.cols * 0.45, y: state.rows * 0.72 };
      for (let a = 0; a < 18; a++) {
        const t = (a / 18) * Math.PI * 2;
        pts.push({ x: home.x + 1 + Math.cos(t) * 3.4, y: home.y + 2.4 + Math.sin(t) * 1.5 });
      }
    }
    this.path = pts;
    const cartCount = this.quality === 'battery' ? 1 : 2;
    for (let i = 0; i < cartCount; i++) {
      const cart = new Sprite(art.cart);
      cart.anchor.set(0.5, 0.7);
      cart.scale.set(0.018);
      this.carts.push(cart);
      this.actorLayer.addChild(cart);
    }
    const spots = [state.holes[0]?.points[0], this.anchor(state, 'clubhouse'), state.holes[8]?.points[0]].filter(Boolean) as Point[];
    const count = this.quality === 'battery' ? 1 : Math.min(3, Math.max(1, spots.length));
    for (let i = 0; i < count; i++) {
      const g = new Sprite(art.golfer);
      g.anchor.set(0.5, 0.9);
      g.scale.set(0.016);
      const spot = { x: (spots[i]?.x ?? 4) + 0.7, y: (spots[i]?.y ?? 4) + 0.4 };
      g.position.set(spot.x, spot.y);
      this.golferBase.push(spot);
      this.golfers.push(g);
      this.actorLayer.addChild(g);
    }
  }

  private anchor(state: GameState, kind: string): Point | null {
    for (let i = 0; i < state.tiles.length; i++) {
      if (state.tiles[i] !== kind) continue;
      return { x: (i % state.cols) + 1, y: Math.floor(i / state.cols) + 1 };
    }
    return null;
  }

  private drawFx() {
    const g = this.fx;
    g.clear();
    const state = this.state;
    if (!state) return;
    const time = this.app?.ticker.lastTime ?? 0;
    if (!this.reduceMotion) {
      state.holes.forEach((h, i) => {
        for (const w of h.waters) {
          const pt = w.kind === 'lake' ? pointAlong(h, 0.9) : w.kind === 'island' ? { ...h.points[h.points.length - 1], ang: 0 } : pointAlong(h, w.along);
          const wave = 0.35 + Math.sin(time / 700 + i) * 0.25;
          g.ellipse(pt.x - 0.2, pt.y - 0.15, 0.45, 0.16).fill({ color: 0xffffff, alpha: 0.18 * wave });
        }
        const pin = h.points[h.points.length - 1];
        const wave = Math.sin(time / 280 + pin.x) * 0.18;
        g.moveTo(pin.x + 0.05, pin.y).lineTo(pin.x + 0.05, pin.y - 1.15).stroke({ width: 0.045, color: 0xf7f7f7 });
        g.poly([pin.x + 0.05, pin.y - 1.15, pin.x + 0.48 + wave, pin.y - 0.95, pin.x + 0.05, pin.y - 0.78]).fill({ color: 0xd24a3a });
      });
      if (this.path.length > 1) {
        this.carts.forEach((cart, i) => {
          const u = ((time / 9000 + i * 0.37) % 1) * this.path.length;
          const a = this.path[Math.floor(u) % this.path.length];
          const b = this.path[(Math.floor(u) + 1) % this.path.length];
          const t = u - Math.floor(u);
          cart.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
          cart.rotation = Math.atan2(b.y - a.y, b.x - a.x);
        });
        this.golfers.forEach((golfer, i) => {
          const base = this.golferBase[i];
          if (!base) return;
          golfer.position.set(base.x, base.y + Math.sin(time / 480 + i) * 0.06);
        });
      }
    } else {
      state.holes.forEach((h) => {
        const pin = h.points[h.points.length - 1];
        g.moveTo(pin.x + 0.05, pin.y).lineTo(pin.x + 0.05, pin.y - 1.15).stroke({ width: 0.045, color: 0xf7f7f7 });
        g.poly([pin.x + 0.05, pin.y - 1.15, pin.x + 0.42, pin.y - 0.95, pin.x + 0.05, pin.y - 0.78]).fill({ color: 0xd24a3a });
      });
    }

    if (this.mode === 'design' && this.cam.zoom >= 1.05 && state.holes[this.focusHole - 1]) {
      const hole = state.holes[this.focusHole - 1];
      const total = holeLengthM(hole) || 1;
      for (let m = 50; m < total - 12; m += 50) {
        const p = pointAlong(hole, m / total);
        g.circle(p.x, p.y, 0.09).fill({ color: 0xffffff, alpha: 0.9 });
      }
      if (this.cam.zoom >= 1.35) {
        const pin = hole.points[hole.points.length - 1];
        const v = SLOPE_VEC[hole.slope] ?? [0, 1];
        g.moveTo(pin.x, pin.y)
          .lineTo(pin.x + v[0] * 0.85, pin.y + v[1] * 0.85)
          .stroke({ width: 0.07, color: 0x102117 });
      }
    }

    if (this.mode === 'design' && this.edit && state.holes[this.focusHole - 1]) {
      const h = state.holes[this.focusHole - 1];
      g.moveTo(h.points[0].x, h.points[0].y);
      for (let i = 1; i < h.points.length; i++) g.lineTo(h.points[i].x, h.points[i].y);
      g.stroke({ width: 0.06, color: 0xffffff, alpha: 0.85 });
      if (this.cam.zoom >= 0.85) {
        [200, 230, 260].forEach((m) => {
          g.circle(h.points[0].x, h.points[0].y, m / TILE_M).stroke({ width: 0.035, color: 0xd24a3a, alpha: 0.45 });
        });
      }
      h.points.forEach((p, i) => {
        const color = i === 0 ? 0xffffff : i === h.points.length - 1 ? 0x2faf62 : 0xf0d48a;
        g.circle(p.x, p.y, Math.max(0.28, 0.55 / Math.max(0.6, this.cam.zoom))).fill({ color }).stroke({ width: 0.05, color: 0x142016 });
      });
    }

    for (const c of this.ghost) {
      g.rect(c.x, c.y, 1, 1).fill({ color: this.ghostBad ? 0xff6b6b : 0xf0d48a, alpha: 0.35 });
      g.rect(c.x, c.y, 1, 1).stroke({ width: 0.05, color: 0xf0d48a });
    }

    const play = this.play;
    if (this.mode === 'play' && play?.ball) {
      if (play.trail.length > 1) {
        g.moveTo(play.trail[0].x, play.trail[0].y);
        for (let i = 1; i < play.trail.length; i++) g.lineTo(play.trail[i].x, play.trail[i].y);
        g.stroke({ width: 0.08, color: 0xffffff, alpha: 0.8, cap: 'round' });
      }
      if (!play.done) {
        const len = 2.3;
        const ax = play.ball.x + Math.cos(play.aim) * len;
        const ay = play.ball.y + Math.sin(play.aim) * len;
        const aimColor = this.colorblind ? 0x111111 : 0xf0d48a;
        if (this.colorblind) {
          g.moveTo(play.ball.x, play.ball.y).lineTo(ax, ay).stroke({ width: 0.16, color: 0xf4e04a, cap: 'round' });
        }
        g.moveTo(play.ball.x, play.ball.y).lineTo(ax, ay).stroke({ width: 0.07, color: aimColor, cap: 'round' });
        const a1 = play.aim + 2.6;
        const a2 = play.aim - 2.6;
        g.poly([
          ax, ay,
          ax - Math.cos(a1) * 0.28, ay - Math.sin(a1) * 0.28,
          ax - Math.cos(a2) * 0.28, ay - Math.sin(a2) * 0.28,
        ]).fill({ color: 0xf0d48a });
      }
      g.ellipse(play.ball.x + 0.12, play.ball.y + 0.16, 0.18, 0.09).fill({ color: 0x000000, alpha: 0.35 });
      g.circle(play.ball.x, play.ball.y - play.lift, 0.16).fill({ color: 0xffffff }).stroke({ width: 0.03, color: 0xc8c8c8 });
    }
  }
}

const SLOPE_VEC: Record<string, [number, number]> = {
  N: [0, -1],
  NE: [0.7, -0.7],
  E: [1, 0],
  SE: [0.7, 0.7],
  S: [0, 1],
  SW: [-0.7, 0.7],
  W: [-1, 0],
  NW: [-0.7, -0.7],
};

function clampZoom(z: number) {
  return Math.max(0.25, Math.min(4.5, z));
}

function strokeHole(g: Graphics, h: Hole) {
  g.moveTo(h.points[0].x, h.points[0].y);
  for (let i = 1; i < h.points.length; i++) g.lineTo(h.points[i].x, h.points[i].y);
}

function dashFairway(g: Graphics, h: Hole) {
  const total = holeLengthM(h) || 1;
  for (let m = 8; m < total; m += 16) {
    const a = pointAlong(h, m / total);
    const b = pointAlong(h, Math.min(0.99, (m + 7) / total));
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
}

function drawBunker(g: Graphics, h: Hole, b: Hole['bunkers'][number], seed: number) {
  const p = bunkerWorld(h, b);
  const rr = Math.max(0.28, b.r / TILE_M);
  const pts: number[] = [];
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jr = rr * (0.82 + hash(seed, i) * 0.28);
    pts.push(p.x + Math.cos(a) * jr, p.y + Math.sin(a) * jr * 0.66);
  }
  g.poly(pts).fill({ color: 0xe7d09a }).stroke({ width: 0.04, color: 0xc4a15e, alpha: 0.8 });
}

function traceGreen(g: Graphics, shape: GreenShape, r: number) {
  if (shape === 'long' || shape === 'biarritz') g.ellipse(0, 0, r * 1.45, r * 0.62);
  else if (shape === 'kidney' || shape === 'redan') {
    g.circle(-r * 0.28, 0, r * 0.75);
    g.circle(r * 0.38, -r * 0.12, r * 0.58);
  } else if (shape === 'peanut') {
    g.circle(-r * 0.42, 0, r * 0.58);
    g.circle(r * 0.42, 0, r * 0.58);
    g.rect(-r * 0.42, -r * 0.32, r * 0.84, r * 0.64);
  } else g.circle(0, 0, r);
}
