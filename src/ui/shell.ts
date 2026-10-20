import { AudioBus, haptic } from '../audio/synth';
import { Session, aimAt } from '../game/session';
import { CourseView } from '../render/course-view';
import { blankState, buildBlank, buildStarter, enlargeLand, hasHole, maxHoles } from '../sim/course';
import { footprintFor, greenAreaTiles } from '../sim/designer';
import { computeScores, isOpen, validation } from '../sim/economy';
import { TEMPLATE_NAMES, architectCourseNotes, architectFeedback, bendInfo, bunkerWorld, classifyHole, doglegDir, holeLengthM, holePar, pointAlong, teeLengths } from '../sim/holes';
import { fmtMoney } from '../sim/math';
import { exportJson, importJson, loadBundle, writeBundle, LEGACY_KEY, type StorageLike } from '../sim/saves';
import {
  CLUBS,
  GREEN_SHAPES,
  LANDS,
  SLOPES,
  TILE_INFO,
  TOOL_DEFS,
  difficultyProfile,
  isFacility,
  type ClubId,
  type Difficulty,
  type GameState,
  type LandKey,
  type Quality,
  type Settings,
  type ToolId,
} from '../sim/types';

const memory = new Map<string, string>();
const fallbackStore: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function storage(): StorageLike {
  try {
    localStorage.setItem('__gct', '1');
    localStorage.removeItem('__gct');
    return localStorage;
  } catch {
    return fallbackStore;
  }
}

export async function boot(root: HTMLElement) {
  const store = storage();
  const loaded = loadBundle(store);
  const audio = new AudioBus();
  const stage = document.createElement('div');
  stage.id = 'stage';
  const view = new CourseView(stage);
  const app = new GameApp(root, view, audio, loaded.bundle, store, loaded.importedLegacy);
  await view.init();
  app.start();
}

class GameApp {
  screen: 'title' | 'game' = 'title';
  tab: 'design' | 'manage' | 'play' = 'design';
  session: Session | null = null;
  settings: Settings;
  showcase: GameState;
  private modal: string | null = null;
  private stamp = '';
  private saveTimer = 0;
  private lastFrame = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private space = false;
  private painting = false;
  private erasing = false;
  private panning = false;
  private aiming = false;
  private dragPt = -1;
  private dragOrigin: { x: number; y: number } | null = null;
  private dragMoved = false;
  private lastTap = 0;
  private ghostLabel = '';
  private sheetOpen = false;
  private wasWide = window.innerWidth > 860;
  private seenTab = '';
  private importedNote: string | null = null;

  constructor(
    private root: HTMLElement,
    private view: CourseView,
    private audio: AudioBus,
    private bundle: ReturnType<typeof loadBundle>['bundle'],
    private store: StorageLike,
    imported: boolean,
  ) {
    this.settings = bundle.settings;
    if (!this.store.getItem('gct.v4') && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settings.reduceMotion = true;
    }
    this.audio.attach(this.settings);
    this.showcase = blankState({ land: 'large', courseSize: 18, kind: 'starter', name: 'Northridge' });
    this.importedNote = imported ? 'Your previous course was imported from this browser.' : null;
    this.root.innerHTML = markup();
    this.root.querySelector('#stage')?.replaceWith(this.view.host);
  }

  start() {
    this.bind();
    this.layoutView();
    this.view.show(this.showcase, { fit: true });
    this.view.mode = 'title';
    this.view.setQuality(this.settings.quality);
    this.view.reduceMotion = this.settings.reduceMotion;
    this.view.markDirty();
    this.sync();
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
    if (this.importedNote) this.toast(this.importedNote);
  }

  private frame = (now: number) => {
    try {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      const session = this.session;
      if (session && this.screen === 'game' && this.tab === 'play') {
        session.tick(now, dt);
        const p = session.play;
        if (p.holding) {
          const out = this.root.querySelector('#power-out');
          const fill = this.root.querySelector<HTMLElement>('#power-fill');
          if (out) out.textContent = `Power ${Math.round(p.power)}% — release in the sweet spot`;
          if (fill) fill.style.width = `${p.power}%`;
        }
      }
      this.pushView();
      this.drawMinimap();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(this.frame);
  };

  private pushView() {
    const session = this.session;
    const playing = this.screen === 'game' && session;
    this.view.mode = playing ? this.tab : 'title';
    this.view.reduceMotion = this.settings.reduceMotion;
    this.view.edit = !!session && session.state.tool === 'holeedit' && this.tab === 'design';
    this.view.colorblind = this.settings.colorblind;
    if (playing && session) {
      this.view.focusHole = session.state.focusHole;
      const p = session.play;
      this.view.play =
        this.tab === 'play'
          ? { ball: p.ball, aim: p.aim, trail: p.trail, lift: p.lift, holeIdx: p.holeIdx, done: p.done }
          : null;
    } else {
      this.view.play = null;
      this.view.ghost = [];
    }
  }

  private bind() {
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || el.id === 'swing') return;
      void this.audio.unlock();
      this.audio.click();
      this.onAct(el.dataset.act || '', el);
    });
    this.root.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'minimap' && this.session) {
        const rect = target.getBoundingClientRect();
        const tx = ((e.clientX - rect.left) / rect.width) * this.session.state.cols;
        const ty = ((e.clientY - rect.top) / rect.height) * this.session.state.rows;
        this.view.centerOn(tx, ty);
      }
      if (target.closest('#swing') && this.session) {
        e.preventDefault();
        void this.audio.unlock();
        this.session.holdSwing(performance.now());
      }
    });
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.space = false;
        if (this.tab === 'play' && this.session?.play.holding) this.releaseSwing();
      }
    });
    const canvasEvents = () => this.view.canvas;
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== canvasEvents()) return;
      this.onPointerDown(e);
    });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    window.addEventListener(
      'wheel',
      (e) => {
        if (e.target !== this.view.canvas || this.screen !== 'game' || this.tab === 'manage') return;
        e.preventDefault();
        this.view.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.9);
      },
      { passive: false },
    );
    window.addEventListener('contextmenu', (e) => {
      if (e.target === this.view.canvas) e.preventDefault();
    });
    window.addEventListener('resize', () => {
      const wide = window.innerWidth > 860;
      if (wide) this.sheetOpen = true;
      else if (this.wasWide) this.sheetOpen = false;
      this.wasWide = wide;
      this.sync();
    });
  }

  private layoutView() {
    const wide = window.innerWidth > 860;
    if (this.screen !== 'game') {
      this.view.setInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }
    if (wide) {
      this.view.setInsets({
        top: 156,
        right: 384,
        bottom: 76,
        left: this.tab === 'design' ? 200 : 16,
      });
      return;
    }
    const tools = this.tab === 'design' ? 78 : 0;
    const sheet = this.sheetOpen ? Math.round(window.innerHeight * 0.52) : 120;
    this.view.setInsets({
      top: 136 + tools,
      right: 8,
      bottom: 70 + sheet,
      left: 8,
    });
  }

  private sessionOn = () => {
    if (!this.session) return;
    this.view.show(this.session.state);
    this.view.markDirty();
    this.sync();
    this.queueSave();
  };

  private adopt(session: Session, tutorial: boolean) {
    this.session = session;
    session.subscribe(this.sessionOn);
    this.screen = 'game';
    this.tab = 'design';
    this.modal = tutorial && !this.settings.tutorialDone ? 'tutorial' : null;
    this.layoutView();
    this.view.show(session.state, { fit: true });
    this.view.markDirty();
    this.sheetOpen = window.innerWidth > 860;
    this.sync();
    this.queueSave();
  }

  private onAct(act: string, el: HTMLElement) {
    if (act === 'new') this.modal = 'new';
    else if (act === 'continue') this.continueGame();
    else if (act === 'settings') this.modal = 'settings';
    else if (act === 'help') this.modal = 'help';
    else if (act === 'close') this.modal = null;
    else if (act === 'pause') this.modal = this.modal === 'pause' ? null : 'pause';
    else if (act === 'title') {
      this.screen = 'title';
      this.modal = null;
      this.view.show(this.showcase, { fit: true });
    } else if (act === 'tutorial-done') {
      this.settings.tutorialDone = true;
      this.modal = null;
      this.persist();
    } else if (act === 'tab') this.tab = (el.dataset.tab as typeof this.tab) || 'design';
    else if (act === 'sheet') this.sheetOpen = !this.sheetOpen;
    else if (act === 'sound') {
      this.settings.master = this.settings.master > 0 ? 0 : 0.8;
      this.audio.applyVolumes();
    } else if (act === 'start-game') this.startGame();
    else if (act === 'zoom-in') this.view.zoomAt(innerWidth / 2, innerHeight / 2, 1.25);
    else if (act === 'zoom-out') this.view.zoomAt(innerWidth / 2, innerHeight / 2, 0.8);
    else if (act === 'zoom-fit') this.view.fit(true);
    else if (act === 'zoom-hole') {
      const n = this.session?.state.focusHole ?? 1;
      if (!this.view.frameHole(n, true)) this.toast('Create the hole first.');
    } else if (act === 'tool') this.setTool((el.dataset.tool || 'holeedit') as ToolId);
    else if (act === 'undo') this.flash(this.session?.undo() ? 'Undone.' : 'Nothing to undo.');
    else if (act === 'redo') this.flash(this.session?.redo() ? 'Redone.' : 'Nothing to redo.');
    else if (act.startsWith('slot-save-')) this.saveSlot(Number(act.slice(10)));
    else if (act.startsWith('slot-load-')) this.loadSlot(Number(act.slice(10)));
    else if (act === 'export') this.exportSave();
    else if (act === 'import-legacy') this.importLegacy();
    else if (act === 'week') this.doWeek();
    else if (act === 'loan') this.doLoan();
    else if (act === 'preset') this.restoreStarter();
    else if (act === 'blank') this.modal = 'blank';
    else if (act === 'blank-yes') this.clearBlank();
    else this.designAct(act, el);
    this.sync();
  }

  private designAct(act: string, el: HTMLElement) {
    const s = this.session;
    if (!s) return;
    const reply = (r: { ok: boolean; message?: string }) => {
      if (r.message) this.toast(r.message);
      if (!r.ok) this.audio.deny();
    };
    if (act === 'create-hole') reply(s.createHole());
    else if (act === 'delete-hole') reply(s.deleteHole());
    else if (act === 'template') reply(s.applyTemplate(value('template')));
    else if (act === 'bend-add') reply(s.addBend());
    else if (act === 'bend-del') reply(s.removeBend());
    else if (act === 'bunker-fairway') reply(s.addBunker('fairway'));
    else if (act === 'bunker-green') reply(s.addBunker('greenside'));
    else if (act === 'bunker-pot') reply(s.addBunker('pot'));
    else if (act === 'water-creek') reply(s.addWater('creek'));
    else if (act === 'water-lake') reply(s.addWater('lake'));
    else if (act === 'water-island') reply(s.addWater('island'));
    else if (act === 'clear-haz') reply(s.clearHazards());
    else if (act === 'resize') reply(s.resizeSelected());
    else if (act === 'enlarge') {
      const key = value('land') as LandKey;
      const armed = el.dataset.armed === key;
      if (!armed && LANDS[key] && LANDS[key].cols * LANDS[key].rows > s.state.cols * s.state.rows) {
        el.dataset.armed = key;
        el.textContent = `Confirm enlarge to ${LANDS[key].label}`;
        this.toast('Enlarging pads rough around the course and keeps everything. Click confirm. Nothing is charged.');
        return;
      }
      const res = enlargeLand(s.state, key);
      this.toast(res.message);
      if (res.ok) {
        this.view.show(s.state, { fit: true });
        this.view.markDirty();
      }
    } else if (act === 'club') {
      s.state.club = (el.dataset.club || 'driver') as ClubId;
      s.emit();
    } else if (act === 'prev-hole' || act === 'next-hole') {
      const len = Math.max(1, computeScores(s.state).pairs.length);
      const dir = act === 'next-hole' ? 1 : -1;
      s.startHole((s.play.holeIdx + dir + len) % len);
      const pair = s.currentHole();
      if (pair) this.view.frameHole(pair.hole, true);
    } else if (act === 'reset-hole') {
      s.state.round.scores[s.play.holeIdx] = null;
      s.startHole(s.play.holeIdx);
      this.toast('Back on the tee.');
    } else if (act === 'new-round') {
      s.state.round = { scores: Array(maxHoles(s.state)).fill(null), started: true };
      s.startHole(0);
      this.toast('New round.');
    } else if (act === 'claim') {
      const res = s.claimPrize();
      this.toast(res.message);
      if (res.banked) {
        this.audio.cash();
        this.confetti();
      }
    } else if (act === 'swing') {
      /* hold is pointer based */
    }
  }

  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    const s = this.session;
    if (!s || !t?.id) return;
    const st = s.state;
    if (t.id === 'fee') st.fee = +t.value;
    else if (t.id === 'maint') st.maint = +t.value;
    else if (t.id === 'marketing') st.marketing = +t.value;
    else if (t.id === 'staff') st.staff = +t.value;
    else if (t.id === 'fw' && st.holes[st.focusHole - 1]) st.holes[st.focusHole - 1].fwWidth = +t.value;
    else if (t.id === 'roughw' && st.holes[st.focusHole - 1]) st.holes[st.focusHole - 1].roughWidth = +t.value;
    else if (t.id === 'greenr' && st.holes[st.focusHole - 1]) st.holes[st.focusHole - 1].greenSize = +t.value;
    else if (t.id === 'brush') {
      st.sizes.brushSize = Math.max(1, Math.min(15, Math.round(+t.value)));
      if (st.sizes.brushShape === 'single') st.sizes.brushShape = 'round';
      remember(st);
    } else if (t.id === 'green-radius') st.sizes.greenRadius = +t.value;
    else if (t.id === 'master') this.settings.master = +t.value;
    else if (t.id === 'music') this.settings.music = +t.value;
    else if (t.id === 'sfx') this.settings.sfx = +t.value;
    else return;
    this.audio.applyVolumes();
    this.view.markDirty();
    this.syncLabels();
    this.queueSave();
  }

  private onChange(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const s = this.session;
    if (!t?.id) return;
    if (t.id === 'quality') {
      this.settings.quality = t.value as Quality;
      if (s) s.state.quality = this.settings.quality;
      this.view.setQuality(this.settings.quality);
      this.persist();
    } else if (t.id === 'reduce' || t.id === 'haptics' || t.id === 'colorblind') {
      this.settings.reduceMotion = !!(this.root.querySelector<HTMLInputElement>('#reduce')?.checked);
      this.settings.haptics = !!(this.root.querySelector<HTMLInputElement>('#haptics')?.checked);
      this.settings.colorblind = !!(this.root.querySelector<HTMLInputElement>('#colorblind')?.checked);
      this.view.reduceMotion = this.settings.reduceMotion;
      this.persist();
    } else if (!s) return;
    else if (t.id === 'hole-no') {
      s.state.holeNo = +t.value;
      s.state.focusHole = +t.value;
      s.emit();
    } else if (t.id === 'philosophy') {
      s.state.philosophy = t.value as GameState['philosophy'];
      this.toast(`Philosophy: ${t.value}. Notes now judge the hole that way.`);
      s.emit();
    } else if (t.id === 'shape') {
      const res = s.reshapeGreen(t.value as GameState['holes'][number]['greenShape']);
      this.toast(res.message || '');
      if (!res.ok) this.audio.deny();
    } else if (t.id === 'slope' && s.state.holes[s.state.focusHole - 1]) {
      s.state.holes[s.state.focusHole - 1].slope = t.value as GameState['holes'][number]['slope'];
      s.startHole(s.play.holeIdx, false);
      this.toast(`Green falls ${t.value}. Putting break follows it.`);
      s.emit();
    } else if (t.id === 'par' && s.state.holes[s.state.focusHole - 1]) {
      s.state.holes[s.state.focusHole - 1].parOverride = +t.value as 0 | 3 | 4 | 5;
      s.emit();
    } else if (t.id === 'si' && s.state.holes[s.state.focusHole - 1]) {
      s.state.holes[s.state.focusHole - 1].si = +t.value;
      s.emit();
    } else if (t.id === 'brush-shape') {
      s.state.sizes.brushShape = t.value as GameState['sizes']['brushShape'];
      remember(s.state);
      s.emit();
    } else if (t.id === 'tee-size') {
      s.state.sizes.teeSize = t.value as GameState['sizes']['teeSize'];
      s.emit();
    } else if (t.id === 'bunker-size') {
      s.state.sizes.bunkerSize = t.value as GameState['sizes']['bunkerSize'];
      this.toast(`Bunker size ${t.value}. New bunkers and Apply resize use it.`);
      s.emit();
    } else if (t.id === 'tree-size') {
      s.state.sizes.treeClump = t.value as GameState['sizes']['treeClump'];
      s.emit();
    } else if (t.id === 'fac-size') {
      s.state.sizes.facilitySize = t.value as GameState['sizes']['facilitySize'];
      remember(s.state);
      s.emit();
    } else if (t.id === 'course-name') {
      s.state.name = t.value.slice(0, 40) || 'My Course';
      this.queueSave();
    } else if (t.id === 'import-file') {
      const file = (t as HTMLInputElement).files?.[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          const state = importJson(text);
          if (!state) throw new Error('empty');
          this.adopt(new Session(state), false);
          this.toast('Course imported.');
        } catch {
          this.toast('That file is not a Golf Course Tycoon save.');
        }
      });
    }
    this.syncLabels();
  }

  private onKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if (e.code === 'Space') this.space = true;
    if (e.key === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.painting || this.dragPt >= 0) this.cancelGesture();
      else if (this.screen === 'game') this.modal = 'pause';
      this.sync();
      return;
    }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.session?.redo();
      else this.session?.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      this.session?.redo();
      return;
    }
    if (this.screen !== 'game' || !this.session) return;
    if (e.key === '1') this.tab = 'design';
    if (e.key === '2') this.tab = 'manage';
    if (e.key === '3') this.tab = 'play';
    if (e.key === '0') this.view.fit(true);
    if (e.key === '+' || e.key === '=') this.view.zoomAt(innerWidth / 2, innerHeight / 2, 1.12);
    if (e.key === '-') this.view.zoomAt(innerWidth / 2, innerHeight / 2, 0.9);
    if (e.key === '[' || e.key === ']') {
      const z = this.session.state.sizes;
      z.brushSize = Math.max(1, Math.min(15, z.brushSize + (e.key === ']' ? 1 : -1)));
      if (z.brushShape === 'single') z.brushShape = 'round';
      remember(this.session.state);
      this.toast(`Brush ${z.brushSize}`);
    }
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const tool = TOOL_DEFS[+e.key - 1];
      if (tool) this.setTool(tool.id);
      e.preventDefault();
    }
    if (this.tab === 'play' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      this.session.play.aim += e.key === 'ArrowLeft' ? -0.06 : 0.06;
    }
    if (this.tab === 'play' && e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.session.holdSwing(performance.now());
    }
    this.sync();
  }

  private onPointerDown(e: PointerEvent) {
    if (this.screen !== 'game' || !this.session || this.modal) return;
    this.view.canvas?.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.view.clientToTile(e.clientX, e.clientY);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.painting = false;
      this.panning = true;
      return;
    }
    if (this.tab === 'play') {
      this.aiming = true;
      aimAt(this.session.play, p);
      return;
    }
    if (this.tab !== 'design') return;
    const now = Date.now();
    if (now - this.lastTap < 320) {
      const hit = nearestHole(this.session.state, p.x, p.y);
      if (hit && hit.d < 2.6) {
        this.session.state.focusHole = hit.n;
        this.session.state.holeNo = hit.n;
        this.view.frameHole(hit.n, true);
        this.toast(`Hole ${hit.n}`);
        this.lastTap = 0;
        return;
      }
    }
    this.lastTap = now;
    const st = this.session.state;
    if (e.button === 2) {
      this.erasing = true;
      this.session.beginStroke();
      const res = this.session.paint(p.x, p.y, true);
      if (!res.ok && res.message) this.toast(res.message);
      return;
    }
    if (st.tool === 'holeedit' && e.button === 0 && !this.space) {
      if (!hasHole(st, st.focusHole)) {
        this.toast(`Hole ${st.focusHole} is not created yet. Use Create Hole, or place its tee and green.`);
        return;
      }
      const h = st.holes[st.focusHole - 1];
      let best = -1;
      let bestD = Math.max(0.75, 1.15 / this.view.cam.zoom);
      h.points.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) {
        this.dragPt = best;
        this.dragOrigin = { ...h.points[best] };
        this.dragMoved = false;
        this.session.beginStroke();
        return;
      }
    }
    if (st.tool === 'pan' || e.button === 1 || this.space) {
      this.panning = true;
      return;
    }
    this.painting = true;
    this.session.beginStroke();
    if (isFacility(st.tool) || st.tool === 'tee' || st.tool === 'green') {
      const res = this.session.paint(p.x, p.y, false);
      if (res.message) this.toast(res.message);
      if (!res.ok) this.audio.deny();
      else if (res.charged > 0) {
        this.audio.cash();
        haptic(12, this.settings.haptics);
      } else this.audio.paint();
      this.painting = false;
    } else {
      const res = this.session.paint(p.x, p.y, false);
      if (!res.ok && res.message) {
        this.toast(res.message);
        this.audio.deny();
        this.painting = false;
      } else if (res.changed) this.audio.paint();
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.session || this.screen !== 'game') return;
    const p = this.view.clientToTile(e.clientX, e.clientY);
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      this.view.zoomAt(midX, midY, d / this.pinch);
      this.pinch = d;
      return;
    }
    if (this.tab === 'design') this.updateGhost(p.x, p.y);
    if (this.aiming && this.tab === 'play') aimAt(this.session.play, p);
    if (this.dragPt >= 0) {
      const h = this.session.state.holes[this.session.state.focusHole - 1];
      if (!h) return;
      const snap = this.view.cam.zoom >= 2 ? 0.25 : 0.5;
      h.points[this.dragPt] = {
        x: Math.max(0.5, Math.min(this.session.state.cols - 0.5, Math.round(p.x / snap) * snap)),
        y: Math.max(0.5, Math.min(this.session.state.rows - 0.5, Math.round(p.y / snap) * snap)),
      };
      this.dragMoved = true;
      this.view.markDirty();
      this.syncLabels();
      return;
    }
    if (this.panning) this.view.panPixels(e.movementX, e.movementY);
    else if (this.erasing) this.session.paint(p.x, p.y, true);
    else if (this.painting) {
      const tool = this.session.state.tool;
      if (!isFacility(tool) && tool !== 'tee' && tool !== 'green') {
        const res = this.session.paint(p.x, p.y, false);
        if (!res.ok) this.painting = false;
      }
    }
  }

  private onPointerUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    const s = this.session;
    if (s && this.dragPt >= 0) {
      const h = s.state.holes[s.state.focusHole - 1];
      const origin = this.dragOrigin;
      const moved =
        !!h &&
        !!origin &&
        (Math.abs(h.points[this.dragPt].x - origin.x) > 0.01 || Math.abs(h.points[this.dragPt].y - origin.y) > 0.01);
      const idx = this.dragPt;
      const res = s.routeCharge(moved && this.dragMoved, () => {
        if (h && origin) h.points[idx] = { ...origin };
      });
      if (res.message) this.toast(res.message);
      if (!res.ok) this.audio.deny();
      s.endStroke();
      this.view.markDirty();
    } else if (s && (this.painting || this.erasing)) s.endStroke();
    this.dragPt = -1;
    this.dragOrigin = null;
    this.painting = false;
    this.erasing = false;
    this.panning = false;
    this.aiming = false;
    if (this.view.canvas?.hasPointerCapture?.(e.pointerId)) this.view.canvas.releasePointerCapture(e.pointerId);
    if (s?.play.holding) this.releaseSwing();
  }

  private cancelGesture() {
    if (this.dragPt >= 0 && this.dragOrigin && this.session) {
      const h = this.session.state.holes[this.session.state.focusHole - 1];
      if (h) h.points[this.dragPt] = { ...this.dragOrigin };
      this.session.undo();
    }
    this.dragPt = -1;
    this.painting = false;
    this.erasing = false;
    this.session?.endStroke();
    this.view.ghost = [];
  }

  private updateGhost(x: number, y: number) {
    const s = this.session;
    if (!s) return;
    const tool = s.state.tool;
    if (tool === 'holeedit' || tool === 'pan') {
      this.view.ghost = [];
      this.ghostLabel = 'Drag gold points, or pick a brush.';
      const chip = this.root.querySelector('#ghost');
      if (chip) chip.textContent = this.ghostLabel;
      return;
    }
    const fp = footprintFor(s.state, tool, x, y);
    this.view.ghost = fp.cells;
    this.view.ghostBad = fp.cost > s.state.cash;
    const tiles = tool === 'green' ? `~${greenAreaTiles(s.state.sizes.greenRadius)} tiles` : `${fp.cells.length} tiles`;
    this.ghostLabel = `${fp.label} — ${tiles} — ${fmtMoney(fp.cost)}${fp.newCount ? ` (${fp.newCount} new)` : ''}`;
    const chip = this.root.querySelector('#ghost');
    if (chip) chip.textContent = this.ghostLabel;
  }

  private releaseSwing() {
    const s = this.session;
    if (!s) return;
    const note = s.releaseSwing(performance.now());
    if (s.state.club === 'putter') this.audio.putt();
    else this.audio.thwack();
    haptic(18, this.settings.haptics);
    if (note) this.toast(note);
    const watch = () => {
      if (!s.play.flight && s.state.playLog.includes('Splash')) this.audio.splash();
      if (s.play.done) {
        this.audio.hole();
        this.confetti();
      }
    };
    window.setTimeout(watch, (s.play.flight?.dur ?? 700) + 40);
  }

  private setTool(tool: ToolId) {
    const s = this.session;
    if (!s) return;
    remember(s.state);
    s.state.tool = tool;
    recall(s.state);
    this.tab = 'design';
    s.emit();
  }

  private startGame() {
    const name = value('ng-name') || 'My Course';
    const land = (value('ng-land') || 'large') as LandKey;
    const holes = this.root.querySelector<HTMLInputElement>('input[name="holes"]:checked')?.value === '9' ? 9 : 18;
    const kind = value('ng-kind') === 'blank' ? 'blank' : 'starter';
    const difficulty = (value('ng-diff') || 'normal') as Difficulty;
    const state = blankState({ name, land, courseSize: holes, difficulty, kind });
    state.quality = this.settings.quality;
    this.adopt(new Session(state), true);
    this.toast(kind === 'blank' ? 'Empty land. Your budget is intact.' : 'Starter routing is on the land. Make it yours.');
  }

  private continueGame() {
    const state = this.bundle.autosave ?? this.bundle.slots[0]?.state;
    if (!state) {
      this.modal = 'new';
      this.sync();
      return;
    }
    this.adopt(new Session(structuredClone(state)), false);
  }

  private doWeek() {
    const s = this.session;
    if (!s) return;
    const res = s.week();
    if (!res.ok) {
      this.toast(res.message || 'Not open yet.');
      this.audio.deny();
      this.tab = 'design';
      return;
    }
    const report = res.report!;
    if (report.profit >= 0) this.audio.cash();
    else this.audio.deny();
    haptic(report.profit >= 0 ? 12 : [30, 40, 30], this.settings.haptics);
    this.modal = 'report';
    if (report.won) {
      this.audio.cheer();
      this.confetti();
    }
  }

  private doLoan() {
    const s = this.session;
    if (!s) return;
    const before = s.state.loan;
    s.loan();
    if (s.state.loan !== before) this.audio.cash();
    else this.audio.deny();
    this.toast(s.state.loan !== before ? '$50,000 received. Weekly interest is 8%.' : 'A loan is already outstanding.');
  }

  private restoreStarter() {
    const s = this.session;
    if (!s) return;
    s.transact(() => {
      buildStarter(s.state);
      return true;
    });
    s.startHole(0, false);
    this.view.markDirty();
    this.toast('Starter routing restored. Cash was not charged.');
  }

  private clearBlank() {
    const s = this.session;
    if (!s) return;
    s.transact(() => {
      buildBlank(s.state);
      return true;
    });
    s.startHole(0, false);
    this.modal = null;
    this.view.markDirty();
    this.toast('Cleared to rough. Cash and the season stay as they are.');
  }

  private saveSlot(id: number) {
    const s = this.session;
    if (!s) return;
    const slot = { id, name: s.state.name || `Slot ${id}`, savedAt: new Date().toISOString(), state: structuredClone(s.state) };
    const slots = this.bundle.slots.filter((x) => x.id !== id);
    slots.push(slot);
    this.bundle.slots = slots.sort((a, b) => a.id - b.id).slice(0, 3);
    this.persist();
    this.toast(`Saved to slot ${id}.`);
  }

  private loadSlot(id: number) {
    const slot = this.bundle.slots.find((x) => x.id === id);
    if (!slot) {
      this.toast('That slot is empty.');
      return;
    }
    this.adopt(new Session(structuredClone(slot.state)), false);
    this.modal = null;
    this.toast(`Loaded ${slot.name}.`);
  }

  private exportSave() {
    if (!this.session) return;
    const blob = new Blob([exportJson(this.session.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.session.state.name.replace(/\s+/g, '-').toLowerCase()}.gct.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private importLegacy() {
    try {
      const raw = this.store.getItem(LEGACY_KEY);
      if (!raw) {
        this.toast('No previous browser save was found.');
        return;
      }
      const state = importJson(raw);
      if (!state) throw new Error('bad');
      this.adopt(new Session(state), false);
      this.toast('Imported the previous version save. The old key was left in place.');
    } catch {
      this.toast('The previous save could not be read.');
    }
  }

  private queueSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 350);
  }

  private persist() {
    if (this.session) this.bundle.autosave = structuredClone(this.session.state);
    this.bundle.settings = this.settings;
    try {
      writeBundle(this.store, this.bundle);
      const note = this.root.querySelector('#save-note');
      if (note) note.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      /* private mode */
    }
  }

  private flash(msg: string) {
    this.toast(msg);
  }

  private toast(msg: string) {
    if (!msg) return;
    const host = this.root.querySelector('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    host.appendChild(el);
    window.setTimeout(() => el.remove(), 3600);
  }

  private confetti() {
    if (this.settings.reduceMotion) return;
    const c = this.root.querySelector<HTMLCanvasElement>('#confetti');
    if (!c) return;
    c.width = innerWidth;
    c.height = innerHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const parts = Array.from({ length: 90 }, () => ({
      x: Math.random() * c.width,
      y: -20,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      r: 3 + Math.random() * 4,
      color: ['#e4c36a', '#f6f1e4', '#8ed07a', '#7ec8ef', '#d24a3a'][Math.floor(Math.random() * 5)],
    }));
    const t0 = performance.now();
    const step = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.r, p.r * 0.6);
      });
      if (t - t0 < 2200) requestAnimationFrame(step);
      else ctx.clearRect(0, 0, c.width, c.height);
    };
    requestAnimationFrame(step);
  }

  private sync() {
    const s = this.session;
    this.layoutView();
    this.root.dataset.screen = this.screen;
    this.root.dataset.tab = this.tab;
    this.root.dataset.sheet = this.sheetOpen ? 'open' : 'closed';
    this.root.classList.toggle('cb', this.settings.colorblind);
    this.root.classList.toggle('reduce-motion', this.settings.reduceMotion);
    const continueBtn = this.root.querySelector<HTMLButtonElement>('#continue');
    if (continueBtn) continueBtn.hidden = !this.bundle.autosave && !this.bundle.slots.length;
    if (s) {
      const sc = computeScores(s.state);
      const profile = difficultyProfile(s.state.difficulty);
      const nameInput = this.root.querySelector<HTMLInputElement>('#course-name');
      if (nameInput && document.activeElement !== nameInput) nameInput.value = s.state.name;
      setText('#cash', fmtMoney(s.state.cash));
      setText('#week', `Week ${Math.min(s.state.week, 12)} / 12`);
      setText('#rating', String(sc.rating));
      setText('#condition', `${s.state.condition}%`);
      setText('#rep', String(s.state.reputation));
      setText('#sat', `${s.state.satisfaction}%`);
      setText('#tier', sc.prestigeTier);
      setText('#weather', s.state.weather);
      const delta = this.root.querySelector('#delta');
      if (delta) {
        delta.textContent = s.state.lastProfit ? `Last ${s.state.lastProfit >= 0 ? '+' : ''}${fmtMoney(s.state.lastProfit)}` : 'Season open';
        delta.classList.toggle('neg', s.state.lastProfit < 0);
      }
      setText('#goal', s.state.seasonOver
        ? 'Season complete'
        : `Win: ${fmtMoney(profile.targetCash)} · Condition ${profile.cond}+ · Reputation ${profile.rep}+`);
      this.root.querySelectorAll<HTMLElement>('nav [data-tab]').forEach((n) => n.classList.toggle('on', n.dataset.tab === this.tab));
      this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((n) => n.classList.toggle('on', n.dataset.tool === s.state.tool));
    }
    const structural = `${this.screen}|${this.tab}|${s?.state.tool}|${s?.state.focusHole}|${s?.state.holes.length}|${s?.state.land}|${s?.state.philosophy}|${s?.state.seasonOver}|${this.modal}|${this.settings.quality}|${s?.state.sizes.brushShape}|${s?.state.sizes.teeSize}|${s?.state.sizes.facilitySize}`;
    if (structural !== this.stamp) {
      this.stamp = structural;
      this.renderInspector();
      this.renderModal();
      this.renderTools();
    }
    this.syncLabels();
    if (s && this.screen === 'game' && this.tab === 'play' && this.seenTab !== 'play') {
      const pair = s.currentHole();
      if (pair) this.view.frameHole(pair.hole, !this.settings.reduceMotion);
    }
    this.seenTab = this.screen === 'game' ? this.tab : '';
    const zoom = this.root.querySelector('#zoom-read');
    if (zoom) zoom.textContent = `${Math.round(this.view.cam.zoom * 100)}%`;
    const ppm = this.view.pixelsPerMeter();
    const bar = this.root.querySelector<HTMLElement>('#scale-bar');
    const scaleRead = this.root.querySelector('#scale-read');
    if (bar && scaleRead && ppm > 0) {
      const meters = 88 / ppm;
      const nice = meters < 35 ? 20 : meters < 75 ? 50 : meters < 150 ? 100 : meters < 300 ? 200 : 400;
      bar.style.width = `${Math.max(10, Math.round(nice * ppm))}px`;
      scaleRead.textContent = `${nice} m`;
    }
    const sound = this.root.querySelector('#sound-label');
    if (sound) sound.textContent = this.settings.master > 0 ? 'Sound' : 'Muted';
  }

  private syncLabels() {
    const s = this.session;
    if (!s) return;
    const st = s.state;
    const h = st.holes[st.focusHole - 1];
    const setVal = (id: string, v: string | number) => {
      const el = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (el && document.activeElement !== el) el.value = String(v);
    };
    setVal('fee', st.fee);
    setVal('maint', st.maint);
    setVal('marketing', st.marketing);
    setVal('staff', st.staff);
    setVal('brush', st.sizes.brushSize);
    setVal('green-radius', st.sizes.greenRadius);
    if (h) {
      setVal('fw', h.fwWidth);
      setVal('roughw', h.roughWidth);
      setVal('greenr', h.greenSize);
    }
    const out = (id: string, text: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el) el.textContent = text;
    };
    out('fee-out', fmtMoney(st.fee));
    out('maint-out', `${fmtMoney(st.maint)} / wk`);
    out('mkt-out', `${fmtMoney(st.marketing)} / wk`);
    out('staff-out', `${st.staff} · ${fmtMoney(st.staff * 1450)} wages`);
    out('brush-out', `${st.sizes.brushSize} · ${st.sizes.brushShape}`);
    out('green-out', `${st.sizes.greenRadius} m · ~${Math.round(Math.PI * st.sizes.greenRadius ** 2)} m²`);
    if (h) {
      const L = teeLengths(h);
      const length = holeLengthM(h);
      const carries = h.waters.map((w) => `${w.kind} ${Math.round(w.along * length)} m`).join(', ');
      out('live-yardage', `Hole ${st.focusHole} · ${classifyHole(h)} · Par ${holePar(h)} · Champ ${L.champ} m · Club ${L.club} m · Ladies ${L.ladies} m · ${doglegDir(h)}`);
      out('carries', carries ? `Carries: ${carries}` : 'No forced carry on this hole.');
      out('fw-out', `${h.fwWidth} m`);
      out('rough-out', `${h.roughWidth} m`);
      out('gs-out', `${h.greenSize} m`);
      const diagram = this.root.querySelector('#yardage-diagram');
      if (diagram) diagram.innerHTML = yardageDiagram(h);
    }
    if (this.tab === 'play') this.syncPlay(s);
    const ghost = this.root.querySelector('#ghost');
    if (ghost && this.ghostLabel) ghost.textContent = this.ghostLabel;
  }

  private syncPlay(s: Session) {
    const pair = s.currentHole();
    const pairs = computeScores(s.state).pairs;
    const scores = s.state.round.scores;
    out('play-hole', pair ? `Hole ${pair.hole} · Par ${pair.par} · ${pair.distM} m` : 'Design at least one hole');
    out('play-dist', `${Math.round(s.distToPin())} m to pin`);
    out('play-lie', pair ? `Lie: ${s.play.strokes === 0 ? 'Tee' : s.lie()}` : 'Lie: —');
    out('play-status', !pairs.length ? 'Design a hole' : s.play.done ? 'Holed' : `Stroke ${s.play.strokes + 1}`);
    const br = s.play.breakDir;
    out('play-break', s.distToPin() < 32 && pair ? `Break ${br > 0 ? 'right' : 'left'} ${Math.abs(br).toFixed(1)}` : 'Break shows on the green');
    out('play-log', s.state.playLog);
    const swing = this.root.querySelector<HTMLButtonElement>('#swing');
    if (swing) swing.disabled = !pairs.length || !!s.play.flight;
    this.root.querySelectorAll<HTMLElement>('[data-club]').forEach((n) => n.classList.toggle('on', n.dataset.club === s.state.club));
    const table = this.root.querySelector('#scorecard');
    if (table) table.innerHTML = scorecard(pairs, scores);
  }

  private renderTools() {
    const host = this.root.querySelector('#tools');
    const s = this.session;
    if (!host || !s || this.tab !== 'design') {
      if (host && this.tab !== 'design') host.innerHTML = '';
      return;
    }
    host.innerHTML = TOOL_DEFS.map((t) => {
      const cost = isFacility(t.id) ? '' : t.id in TILE_INFO ? fmtMoney(TILE_INFO[t.id as keyof typeof TILE_INFO].cost) : '';
      const on = s.state.tool === t.id ? ' on' : '';
      return `<button type="button" class="tool${on}" data-act="tool" data-tool="${t.id}" data-tip="${t.hint}"><b>${t.label}</b><small>${cost || t.hint}</small></button>`;
    }).join('');
  }

  private renderInspector() {
    const host = this.root.querySelector('#inspector');
    if (!host) return;
    const s = this.session;
    if (!s || this.screen !== 'game') {
      host.innerHTML = '';
      return;
    }
    if (this.tab === 'manage') host.innerHTML = manageHtml(s.state);
    else if (this.tab === 'play') host.innerHTML = playHtml(s);
    else host.innerHTML = designHtml(s.state);
  }

  private renderModal() {
    const host = this.root.querySelector('#modal');
    if (!host) return;
    if (!this.modal) {
      host.innerHTML = '';
      host.setAttribute('hidden', '');
      return;
    }
    host.removeAttribute('hidden');
    host.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${modalHtml(this.modal, this)}</div>`;
  }

  private drawMinimap() {
    const canvas = this.root.querySelector<HTMLCanvasElement>('#minimap');
    const s = this.session;
    if (!canvas || !s || this.screen !== 'game' || this.tab === 'manage') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(80, canvas.clientWidth);
    const h = Math.max(56, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#6eae56';
    ctx.fillRect(0, 0, w, h);
    const sx = w / s.state.cols;
    const sy = h / s.state.rows;
    ctx.strokeStyle = '#d7e7b0';
    ctx.lineWidth = 2;
    s.state.holes.forEach((hole) => {
      ctx.beginPath();
      hole.points.forEach((p, i) => (i ? ctx.lineTo(p.x * sx, p.y * sy) : ctx.moveTo(p.x * sx, p.y * sy)));
      ctx.stroke();
    });
    const vp = this.view.viewportTiles();
    if (vp) {
      ctx.strokeStyle = '#f3e0a6';
      ctx.strokeRect(vp.x * sx, vp.y * sy, vp.w * sx, vp.h * sy);
    }
  }
}

function out(sel: string, text: string) {
  const el = document.querySelector(`#${sel}`);
  if (el) el.textContent = text;
}

function setText(sel: string, text: string) {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

function value(id: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value ?? '';
}

function remember(state: GameState) {
  const z = state.sizes;
  if (['fairway', 'rough', 'sand', 'water', 'trees', 'path', 'bulldoze'].includes(state.tool)) {
    z.brushByTool[state.tool] = { brushSize: z.brushSize, brushShape: z.brushShape };
  }
  if (isFacility(state.tool)) z.facilityByTool[state.tool] = z.facilitySize;
}

function recall(state: GameState) {
  const saved = state.sizes.brushByTool[state.tool];
  if (saved) {
    state.sizes.brushSize = saved.brushSize;
    state.sizes.brushShape = saved.brushShape;
  }
  const fac = state.sizes.facilityByTool[state.tool];
  if (fac) state.sizes.facilitySize = fac;
}

function nearestHole(state: GameState, x: number, y: number) {
  let best = 1e9;
  let n = 0;
  state.holes.forEach((h, i) => {
    const d = Math.hypot(h.points[0].x - x, h.points[0].y - y);
    if (d < best) {
      best = d;
      n = i + 1;
    }
  });
  return n ? { n, d: best } : null;
}

function holeOptions(state: GameState) {
  return Array.from({ length: maxHoles(state) }, (_, i) => {
    const n = i + 1;
    return `<option value="${n}" ${state.focusHole === n ? 'selected' : ''}>${n}${hasHole(state, n) ? '' : ' · new'}</option>`;
  }).join('');
}

function yardageDiagram(h: GameState['holes'][number]) {
  const xs = h.points.map((p) => p.x);
  const ys = h.points.map((p) => p.y);
  const minx = Math.min(...xs) - 2.4;
  const maxx = Math.max(...xs) + 2.4;
  const miny = Math.min(...ys) - 2.4;
  const maxy = Math.max(...ys) + 2.4;
  const w = 320;
  const ht = 150;
  const s = Math.min(w / (maxx - minx), ht / (maxy - miny));
  const ox = (w - (maxx - minx) * s) / 2;
  const oy = (ht - (maxy - miny) * s) / 2;
  const X = (x: number) => ox + (x - minx) * s;
  const Y = (y: number) => oy + (y - miny) * s;
  const line = h.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const length = holeLengthM(h) || 1;
  const ticks: string[] = [];
  for (let m = 50; m < length - 8; m += 50) {
    const p = pointAlong(h, m / length);
    ticks.push(`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.2" fill="#fff"/>`);
  }
  const bunkers = h.bunkers
    .map((b) => {
      const p = bunkerWorld(h, b);
      return `<ellipse cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" rx="${Math.max(3, (b.r / 16) * s).toFixed(1)}" ry="${Math.max(2, (b.r / 22) * s).toFixed(1)}" fill="#e7d09a" stroke="#a68445"/>`;
    })
    .join('');
  const water = h.waters
    .map((feat) => {
      const p = feat.kind === 'island' ? h.points[h.points.length - 1] : pointAlong(h, feat.kind === 'lake' ? 0.9 : feat.along);
      return `<ellipse cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" rx="${feat.kind === 'creek' ? 10 : 14}" ry="${feat.kind === 'creek' ? 3 : 8}" fill="#1d6eab" opacity="0.85"/>`;
    })
    .join('');
  const tee = h.points[0];
  const pin = h.points[h.points.length - 1];
  return `<svg class="yardage" viewBox="0 0 ${w} ${ht}" role="img" aria-label="Yardage diagram, ${length} metres">
    <rect width="${w}" height="${ht}" fill="#e7dcc0"/>
    <polyline points="${line}" fill="none" stroke="#3c6b34" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${line}" fill="none" stroke="#7dbe68" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${line}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="4 3"/>
    ${water}${bunkers}${ticks.join('')}
    <circle cx="${X(pin.x).toFixed(1)}" cy="${Y(pin.y).toFixed(1)}" r="7" fill="#2faf62" stroke="#fff"/>
    <circle cx="${X(tee.x).toFixed(1)}" cy="${Y(tee.y).toFixed(1)}" r="6" fill="#c4322c"/>
    <text x="${X(tee.x).toFixed(1)}" y="${(Y(tee.y) + 3).toFixed(1)}" text-anchor="middle" font-size="8" fill="#fff">T</text>
    <text x="8" y="16" font-size="11" fill="#5c4a32">N</text>
  </svg>`;
}

function designHtml(state: GameState) {
  const h = state.holes[state.focusHole - 1];
  const sc = computeScores(state);
  const checks = validation(state, sc);
  const notes = h ? architectFeedback(h, state.philosophy) : [`Hole ${state.focusHole} is not on the land yet.`];
  const courseNotes = architectCourseNotes(state.holes);
  const yard = h
    ? `<p id="live-yardage">Hole ${state.focusHole} · ${classifyHole(h)} · Par ${holePar(h)}</p><div id="yardage-diagram">${yardageDiagram(h)}</div><p id="carries" class="note"></p>`
    : `<p id="live-yardage">No hole yet. Create one, or place tee ${state.focusHole} and green ${state.focusHole}.</p>`;
  return `
    <div class="panel-head"><h2>Design</h2><button type="button" class="text" data-act="sheet">Panel</button></div>
    ${yard}
    <label>Hole <select id="hole-no">${holeOptions(state)}</select></label>
    <div class="row">
      <button type="button" class="btn" data-act="create-hole">Create hole</button>
      <button type="button" class="btn ghost" data-act="delete-hole">Delete</button>
      <button type="button" class="btn ghost" data-act="zoom-hole">Zoom to hole</button>
    </div>
    <label>Template <select id="template">${TEMPLATE_NAMES.map((n) => `<option>${n}</option>`).join('')}</select></label>
    <button type="button" class="btn" data-act="template">Apply template · $3,500</button>
    <label>Philosophy
      <select id="philosophy">
        ${['strategic', 'penal', 'heroic'].map((p) => `<option value="${p}" ${state.philosophy === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </label>
    <label>Fairway width <output id="fw-out"></output><input id="fw" type="range" min="18" max="42" value="${h?.fwWidth ?? 26}"></label>
    <label>Rough margin <output id="rough-out"></output><input id="roughw" type="range" min="4" max="24" value="${h?.roughWidth ?? 8}"></label>
    <label>Green radius <output id="gs-out"></output><input id="greenr" type="range" min="8" max="24" value="${h?.greenSize ?? 13}"></label>
    <div class="row">
      <label>Shape <select id="shape">${GREEN_SHAPES.map((g) => `<option ${h?.greenShape === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label>Slope <select id="slope">${SLOPES.map((g) => `<option ${h?.slope === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label>Par <select id="par">${[0, 3, 4, 5].map((p) => `<option value="${p}" ${h?.parOverride === p ? 'selected' : ''}>${p === 0 ? 'Auto' : p}</option>`).join('')}</select></label>
      <label>Stroke index <select id="si">${Array.from({ length: maxHoles(state) }, (_, i) => `<option ${h?.si === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <button type="button" class="btn ghost" data-act="bend-add">Add bend · $800</button>
      <button type="button" class="btn ghost" data-act="bend-del">Remove bend</button>
    </div>
    <div class="row">
      <button type="button" class="btn ghost" data-act="bunker-fairway">Fairway bunker</button>
      <button type="button" class="btn ghost" data-act="bunker-green">Greenside</button>
      <button type="button" class="btn ghost" data-act="bunker-pot">Pot</button>
    </div>
    <div class="row">
      <button type="button" class="btn ghost" data-act="water-creek">Creek</button>
      <button type="button" class="btn ghost" data-act="water-lake">Lake</button>
      <button type="button" class="btn ghost" data-act="water-island">Island</button>
      <button type="button" class="btn ghost" data-act="clear-haz">Clear hazards</button>
    </div>
    <p class="note">${h ? `Bends ${bendInfo(h).map((n) => Math.round(n) + '°').join(', ') || 'none'}` : ''}</p>
    <h3>Architect</h3>
    <ul class="notes">${[...notes, ...courseNotes].map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    <h3>Brush & footprints</h3>
    <p id="ghost" class="ghost">Hover the land. Cost is shown before anything is charged.</p>
    <label>Brush shape <select id="brush-shape">${['round', 'square', 'single'].map((n) => `<option ${state.sizes.brushShape === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Brush size <output id="brush-out"></output><input id="brush" type="range" min="1" max="15" value="${state.sizes.brushSize}"></label>
    <label>Tee <select id="tee-size">${['S', 'M', 'L'].map((n) => `<option ${state.sizes.teeSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Green paint radius <output id="green-out"></output><input id="green-radius" type="range" min="8" max="24" value="${state.sizes.greenRadius}"></label>
    <label>Bunker <select id="bunker-size">${['S', 'M', 'L'].map((n) => `<option ${state.sizes.bunkerSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Trees <select id="tree-size">${['single', 'copse', 'woodland'].map((n) => `<option ${state.sizes.treeClump === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Facility <select id="fac-size">${['S', 'M', 'L'].map((n) => `<option ${state.sizes.facilitySize === n ? 'selected' : ''}>${n === 'S' ? 'S · 2×2' : n === 'M' ? 'M · 3×3' : 'L · 4×3'}</option>`).join('')}</select></label>
    <button type="button" class="btn" data-act="resize">Apply resize to selected</button>
    <h3>Land</h3>
    <p>${LANDS[state.land].label} ${state.cols}×${state.rows} · ${state.cols * 100}×${state.rows * 100} world</p>
    <label>Enlarge <select id="land">${Object.values(LANDS).map((l) => `<option value="${l.key}" ${state.land === l.key ? 'selected' : ''}>${l.label} · ${l.blurb}</option>`).join('')}</select></label>
    <button type="button" class="btn ghost" data-act="enlarge">Enlarge land</button>
    <div class="row">
      <button type="button" class="btn ghost" data-act="preset">Restore starter</button>
      <button type="button" class="btn danger" data-act="blank">Clear to blank</button>
    </div>
    <h3>Opening</h3>
    <ul class="checks">${checks.map((c) => `<li class="${c.ok ? 'ok' : ''}"><span>${c.ok ? '✓' : '·'}</span>${c.label}<small>${c.detail}</small></li>`).join('')}</ul>
    <p class="note">${isOpen(state, sc) ? 'The course can trade.' : 'Manage stays closed until the opening list is done, apart from the full-18 line.'} Rating ${sc.rating} · Beauty ${sc.beauty} · Difficulty ${sc.difficulty} · ${sc.prestigeTier}</p>
    <div class="table-wrap">${overview(sc)}</div>`;
}

function overview(sc: ReturnType<typeof computeScores>) {
  if (!sc.pairs.length) return '<p>No holes yet.</p>';
  const head = sc.pairs.map((p) => `<th>${p.hole}</th>`).join('');
  return `<table><tr><th></th>${head}</tr>
    <tr><td>Par</td>${sc.pairs.map((p) => `<td>${p.par}</td>`).join('')}</tr>
    <tr><td>SI</td>${sc.pairs.map((p) => `<td>${p.si}</td>`).join('')}</tr>
    <tr><td>Champ</td>${sc.pairs.map((p) => `<td>${p.distM}</td>`).join('')}</tr>
    <tr><td>Shape</td>${sc.pairs.map((p) => `<td>${p.shape.split(' ')[0]}</td>`).join('')}</tr></table>`;
}

function manageHtml(state: GameState) {
  const sc = computeScores(state);
  const profile = difficultyProfile(state.difficulty);
  const open = isOpen(state, sc);
  return `
    <div class="panel-head"><h2>Manage</h2><button type="button" class="text" data-act="sheet">Panel</button></div>
    <p id="goal" class="goal">${open ? `Week ${state.week} of 12 · target ${fmtMoney(profile.targetCash)}` : 'Finish the Design opening list before the gates open.'}</p>
    <div class="kpis">
      <div><b>${state.members}</b><span>Members</span></div>
      <div><b>${sc.rating}</b><span>Rating</span></div>
      <div><b>${sc.prestige}</b><span>${sc.prestigeTier}</span></div>
      <div><b>${fmtMoney(state.loan)}</b><span>Loan</span></div>
    </div>
    <label>Green fee <output id="fee-out"></output><input id="fee" type="range" min="20" max="180" value="${state.fee}"></label>
    <label>Maintenance <output id="maint-out"></output><input id="maint" type="range" min="0" max="40000" step="500" value="${state.maint}"></label>
    <label>Marketing <output id="mkt-out"></output><input id="marketing" type="range" min="0" max="25000" step="500" value="${state.marketing}"></label>
    <label>Grounds staff <output id="staff-out"></output><input id="staff" type="range" min="1" max="16" value="${state.staff}"></label>
    <div class="row">
      <button type="button" class="btn" data-act="week" ${open && !state.seasonOver ? '' : 'disabled'}>Advance week</button>
      <button type="button" class="btn ghost" data-act="loan">Borrow $50,000</button>
    </div>
    <div class="meters">
      ${meter('Condition', state.condition, 'good')}${meter('Reputation', state.reputation, 'gold')}${meter('Satisfaction', state.satisfaction, 'blue')}
    </div>
    <h3>Cash</h3>
    ${chart(state.cashHist, profile.targetCash)}
    <h3>Ledger</h3>
    <pre class="log">${escapeHtml(state.log.slice(-8).join('\n') || 'No weeks yet.')}</pre>
    <p class="note">Weather ${state.weather}. Visitors care about rating, variety, price and condition. A played round pays back into this account.</p>`;
}

function playHtml(s: Session) {
  const pair = s.currentHole();
  return `
    <div class="panel-head"><h2>Play</h2><button type="button" class="text" data-act="sheet">Panel</button></div>
    <p id="play-hole">${pair ? `Hole ${pair.hole}` : 'Design at least one hole'}</p>
    <div class="row chips">
      <span id="play-dist">0 m</span><span id="play-lie">Lie</span><span id="play-status">Stroke 1</span><span id="play-break">Break</span>
    </div>
    <div class="clubs">${(Object.keys(CLUBS) as ClubId[]).map((c) => `<button type="button" class="btn ghost" data-act="club" data-club="${c}">${CLUBS[c].label}<small>${CLUBS[c].max} m</small></button>`).join('')}</div>
    <div class="power"><div id="power-fill"></div><em>sweet</em></div>
    <p id="power-out">Hold Swing, release in the gold band.</p>
    <button type="button" class="btn swing" id="swing" data-act="swing">Swing</button>
    <div class="row">
      <button type="button" class="btn ghost" data-act="prev-hole">Hole ‹</button>
      <button type="button" class="btn ghost" data-act="next-hole">Hole ›</button>
      <button type="button" class="btn ghost" data-act="reset-hole">Replay hole</button>
      <button type="button" class="btn ghost" data-act="new-round">New round</button>
    </div>
    <p id="play-log" class="log"></p>
    <div class="table-wrap"><table id="scorecard"></table></div>
    <button type="button" class="btn" data-act="claim">Finish round & bank prize</button>`;
}

function meter(label: string, n: number, tone: string) {
  return `<div class="meter"><span>${label}</span><b>${n}</b><i class="${tone}" style="width:${n}%"></i></div>`;
}

function chart(hist: number[], target: number) {
  const data = hist.length ? hist : [0];
  const min = Math.min(...data, target) * 0.96;
  const max = Math.max(...data, target) * 1.04 || 1;
  const x = (i: number) => (data.length < 2 ? 160 : 8 + (i * 304) / (data.length - 1));
  const y = (v: number) => 78 - ((v - min) / (max - min || 1)) * 64;
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 320 90" role="img" aria-label="Cash history"><line x1="0" y1="${y(target)}" x2="320" y2="${y(target)}" stroke="#e4c36a" stroke-dasharray="4 4"/><polyline fill="none" stroke="#8ed07a" stroke-width="2.4" points="${line}"/></svg>`;
}

function scorecard(pairs: ReturnType<typeof computeScores>['pairs'], scores: (number | null)[]) {
  if (!pairs.length) return '<tr><td>No holes yet</td></tr>';
  const front = pairs.filter((p) => p.hole <= 9);
  const back = pairs.filter((p) => p.hole > 9);
  const sum = (arr: typeof pairs, pick: 'par' | 'score') =>
    arr.reduce((a, p) => a + (pick === 'par' ? p.par : scores[p.hole - 1] || 0), 0);
  const cells = pairs
    .map((p) => {
      const sc = scores[p.hole - 1];
      const cls = sc == null ? '' : sc <= p.par ? 'good' : 'bad';
      return `<td class="${cls}">${sc ?? '–'}</td>`;
    })
    .join('');
  const extra = back.length
    ? `<th>Out</th><th>In</th>`
    : '';
  const extraPar = back.length ? `<td>${sum(front, 'par')}</td><td>${sum(back, 'par')}</td>` : '';
  const extraSc = back.length ? `<td>${sum(front, 'score') || '–'}</td><td>${sum(back, 'score') || '–'}</td>` : '';
  return `<tr><th>Hole</th>${pairs.map((p) => `<th>${p.hole}</th>`).join('')}${extra}<th>Tot</th></tr>
    <tr><td>Par</td>${pairs.map((p) => `<td>${p.par}</td>`).join('')}${extraPar}<td>${sum(pairs, 'par')}</td></tr>
    <tr><td>Score</td>${cells}${extraSc}<td>${scores.some((x) => x != null) ? sum(pairs, 'score') : '–'}</td></tr>`;
}

function modalHtml(kind: string, app: GameApp) {
  if (kind === 'new') return newGameHtml();
  if (kind === 'settings') return settingsHtml(app);
  if (kind === 'help' || kind === 'tutorial') return helpHtml(kind === 'tutorial');
  if (kind === 'pause') return pauseHtml();
  if (kind === 'blank') {
    return `<h2>Clear the land?</h2><p>Holes, fairways and buildings go. Cash and the week stay. This can be undone.</p><div class="row"><button type="button" class="btn danger" data-act="blank-yes">Clear to blank</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div>`;
  }
  if (kind === 'report') return reportHtml(app);
  return '';
}

function newGameHtml() {
  const wide = window.innerWidth >= 1000;
  return `<h2>New course</h2>
    <label>Name <input id="ng-name" maxlength="40" value="Northridge"></label>
    <fieldset><legend>Holes</legend>
      <label><input type="radio" name="holes" id="ng-holes-9" value="9"> 9</label>
      <label><input type="radio" name="holes" value="18" checked> 18</label>
    </fieldset>
    <label>Land <select id="ng-land">
      <option value="standard">Standard · 56×40</option>
      <option value="large" ${wide ? 'selected' : ''}>Large · 84×60</option>
      <option value="estate">Estate · 112×80</option>
    </select></label>
    <label>Start <select id="ng-kind"><option value="starter">Starter routing</option><option value="blank">Blank land</option></select></label>
    <label>Difficulty <select id="ng-diff">
      <option value="easy">Club · $900k, softer target</option>
      <option value="normal" selected>Members · $750k, classic target</option>
      <option value="hard">Open · $620k, higher target</option>
    </select></label>
    <div class="row"><button type="button" class="btn" data-act="start-game">Open the gates</button><button type="button" class="btn ghost" data-act="close">Back</button></div>
    <p class="note">Tile = 100 world units = 16 m. A painted Standard course is 5600×4000. Enlarging later keeps what you built.</p>`;
}

function settingsHtml(app: GameApp) {
  const s = app.settings;
  return `<h2>Settings</h2>
    <label>Picture <select id="quality">
      <option value="battery" ${s.quality === 'battery' ? 'selected' : ''}>Battery</option>
      <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option>
      <option value="ultra" ${s.quality === 'ultra' ? 'selected' : ''}>Ultra</option>
    </select></label>
    <label>Master <input id="master" type="range" min="0" max="1" step="0.01" value="${s.master}"></label>
    <label>Music <input id="music" type="range" min="0" max="1" step="0.01" value="${s.music}"></label>
    <label>Effects <input id="sfx" type="range" min="0" max="1" step="0.01" value="${s.sfx}"></label>
    <label class="checkline"><input id="haptics" type="checkbox" ${s.haptics ? 'checked' : ''}> Vibration</label>
    <label class="checkline"><input id="reduce" type="checkbox" ${s.reduceMotion ? 'checked' : ''}> Reduce motion</label>
    <label class="checkline"><input id="colorblind" type="checkbox" ${s.colorblind ? 'checked' : ''}> Stronger aim & swing contrast</label>
    <div class="row"><button type="button" class="btn" data-act="close">Done</button></div>`;
}

function helpHtml(tutorial: boolean) {
  return `<h2>${tutorial ? 'A short walk around' : 'How to play'}</h2>
    <ol class="guide">
      <li><b>Design.</b> Drag the gold points for doglegs and cape holes. Templates, fairway width, green shape and hazards charge only when they land. The ghost shows tiles and cost before you paint. Right-click erases. Nothing is billed twice.</li>
      <li><b>Open the club.</b> You need a clubhouse, nine real holes, shape variety, a range, a shop or restaurant, a car park and a rating of 55. Eighteen holes adds a prestige bonus.</li>
      <li><b>Manage.</b> Twelve weeks. Fees, staff, marketing and maintenance move condition, reputation and satisfaction. Random weather and events hit the weekly P&amp;L. Win on cash, condition and reputation together.</li>
      <li><b>Play your holes.</b> Aim, pick a club, hold Swing and release in the sweet band. The ball uses the corridor you drew: rough, sand, trees, water and the green’s slope. Prize money returns to Manage.</li>
    </ol>
    <p class="note">Keys: 1 2 3 modes · [ ] brush · Alt+1–9 tools · wheel zoom · Space or middle-mouse pan · Ctrl+Z undo · arrows aim · Esc pause.</p>
    <div class="row"><button type="button" class="btn" data-act="${tutorial ? 'tutorial-done' : 'close'}">${tutorial ? 'Start designing' : 'Close'}</button></div>`;
}

function pauseHtml() {
  return `<h2>Paused</h2>
    <div class="row"><button type="button" class="btn" data-act="close">Resume</button><button type="button" class="btn ghost" data-act="help">How to play</button><button type="button" class="btn ghost" data-act="settings">Settings</button></div>
    <h3>Slots</h3>
    <div class="row">
      ${[1, 2, 3].map((n) => `<button type="button" class="btn ghost" data-act="slot-save-${n}">Save ${n}</button><button type="button" class="btn ghost" data-act="slot-load-${n}">Load ${n}</button>`).join('')}
    </div>
    <div class="row"><button type="button" class="btn ghost" data-act="export">Export JSON</button><label class="btn ghost">Import<input id="import-file" type="file" accept="application/json" hidden></label><button type="button" class="btn ghost" data-act="import-legacy">Import previous save</button></div>
    <div class="row"><button type="button" class="btn danger" data-act="title">Main menu</button></div>
    <p class="note" id="save-note">Autosave is on.</p>`;
}

function reportHtml(app: GameApp) {
  const report = app.session?.lastReport;
  const state = app.session?.state;
  if (!report || !state) return `<h2>Week</h2><button type="button" class="btn" data-act="close">Close</button>`;
  const rows: [string, number][] = [
    [`Green fees (${report.visitors} × ${fmtMoney(state.fee)})`, report.greenFees],
    [`Memberships`, report.membersIncome],
    ['Pro shop', report.shopIncome],
    ['Restaurant', report.foodIncome],
    ['Wages', -report.wages],
    ['Mowing', -report.mow],
    ['Facilities', -report.facUpkeep],
    ['Maintenance', -report.maint],
    ['Marketing', -report.marketing],
    ['Loan interest', -report.interest],
  ];
  if (report.event) rows.push([report.event.n, report.event.cash]);
  const title = report.won ? 'Trophy week' : report.bankrupt ? 'Receivers at the gate' : `Week ${report.week}`;
  return `<h2>${title}</h2>
    <p>${report.weather.n} · next ${report.nextWeather} · rating ${report.sc.rating} · ${report.sc.prestigeTier}</p>
    ${rows.map(([k, v]) => `<div class="pl"><span>${k}</span><b>${fmtMoney(v)}</b></div>`).join('')}
    <div class="pl total"><span>Profit</span><b>${fmtMoney(report.profit)}</b></div>
    <p>Cash ${fmtMoney(state.cash)} · Condition ${state.condition}% · Reputation ${state.reputation} · Satisfaction ${state.satisfaction}%</p>
    ${report.event ? `<p><b>${report.event.n}.</b> ${report.event.txt}</p>` : ''}
    ${report.bankrupt ? '<p>Cash fell below zero. The season is over.</p>' : ''}
    ${report.final && !report.won && !report.bankrupt ? '<p>The season ended short of the trophy line.</p>' : ''}
    ${report.won ? '<p>The club is a destination. Screenshot it if you like — the books are real.</p>' : ''}
    <button type="button" class="btn" data-act="close">Continue</button>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

function markup() {
  return `
  <div id="stage"></div>
  <div class="vignette" aria-hidden="true"></div>
  <section id="title">
    <div class="crest" aria-hidden="true"><span>GT</span></div>
    <p class="kicker">Design · Manage · Play</p>
    <h1>Golf Course Tycoon</h1>
    <p class="lede">Route a course, open the club, and play every hole you drew.</p>
    <div class="title-actions">
      <button type="button" class="btn" id="continue" data-act="continue" hidden>Continue</button>
      <button type="button" class="btn" data-act="new">New game</button>
      <button type="button" class="btn ghost" data-act="help">How to play</button>
      <button type="button" class="btn ghost" data-act="settings">Settings</button>
    </div>
  </section>
  <div class="gamechrome">
    <header class="top">
      <div class="brand">Golf Course Tycoon</div>
      <input id="course-name" aria-label="Course name" maxlength="40" value="My Course">
      <span id="save-note"></span>
      <button type="button" class="icon" data-act="undo" aria-label="Undo">↺</button>
      <button type="button" class="icon" data-act="redo" aria-label="Redo">↻</button>
      <button type="button" class="icon" id="sound" data-act="sound" aria-label="Mute"><span id="sound-label">Sound</span></button>
      <button type="button" class="icon" data-act="pause" aria-label="Pause">Pause</button>
    </header>
    <div class="hud" aria-label="Club status">
      <div><b id="cash">$750,000</b><span>Cash</span><small id="delta"></small></div>
      <div><b id="week">Week 1 / 12</b><span id="weather">Fine</span></div>
      <div><b id="rating">0</b><span>Rating</span><small id="tier"></small></div>
      <div><b id="condition">82%</b><span>Condition</span></div>
      <div><b id="rep">55</b><span>Reputation</span></div>
      <div><b id="sat">62%</b><span>Satisfaction</span></div>
    </div>
    <div id="tools" class="tools"></div>
    <aside id="inspector" class="inspector"></aside>
    <div class="floaters">
      <button type="button" class="icon" data-act="zoom-in" aria-label="Zoom in">+</button>
      <button type="button" class="icon" data-act="zoom-out" aria-label="Zoom out">−</button>
      <button type="button" class="icon" data-act="zoom-fit" aria-label="Fit course">Fit</button>
      <span id="zoom-read">100%</span>
      <span class="scale"><i id="scale-bar"></i><span id="scale-read">100 m</span></span>
      <button type="button" class="mini-btn" data-act="zoom-hole">Hole</button>
      <canvas id="minimap" width="180" height="120" aria-label="Minimap"></canvas>
      <div class="north" aria-hidden="true">N</div>
    </div>
    <nav class="modes">
      <button type="button" data-act="tab" data-tab="design">Design</button>
      <button type="button" data-act="tab" data-tab="manage">Manage</button>
      <button type="button" data-act="tab" data-tab="play">Play</button>
    </nav>
  </div>
  <div id="modal" class="modal" hidden></div>
  <div id="toasts" aria-live="polite"></div>
  <canvas id="confetti" aria-hidden="true"></canvas>`;
}

// GameApp is referenced inside modal helpers via structural fields.
export type { GameApp };
