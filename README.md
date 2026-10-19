# Golf Course Tycoon — v2 Premium

A free, single-file browser game: design a premium 9-hole golf course on canvas, run it as a business over a 12-week season, then play all nine holes you built. No downloads, no sign-up, no build step — just open the HTML file in a browser. Works offline after first load (no external CDNs, fonts, images or audio files).

**Play it:** open `index.html` in any modern browser (phone, tablet, or computer), or host it with GitHub Pages (below).

## What's new in v2

- **Canvas course rendering** — layered top-down course with mow-striped fairways/greens, rough texture, shaded sand, animated water shimmer, tree canopies with shadows, cart paths, tee boxes, waving flagsticks and ball trails. No emoji tiles.
- **Dark-luxe UI** — glass panels, gold accents, sticky HUD with animated cash counter, progress meters, toasts, modal dialogs and confetti celebrations.
- **Bigger design canvas** — 40 × 28 scrollable/zoomable grid (drag-paint, Pan tool, scroll/pinch zoom, Fit), mobile-first portrait layout with big touch targets, also responsive on desktop.
- **Synthesised sound & haptics** — WebAudio clicks, thwack, splash, cash and cheer sounds (mute toggle, no audio files) plus `navigator.vibrate` feedback where available.

## How to play

### 1) Design & Build
- Pick a paint tool and drag on the canvas: **Tee, Fairway, Green, Rough, Sand, Water, Trees, Path**, plus **Bulldoze** and **Pan**.
- **Tee / Green use the selected Hole No. (1–9).** Place Tee 1–9 and Green 1–9 to define nine real holes; par is derived from the actual tee-to-green distance (16 m per tile: Par 3 / 4 / 5).
- **Facilities** (2×2 footprint, build cost + weekly upkeep + prestige/revenue effects): **Clubhouse, Pro Shop, Practice Range, Restaurant / Bar, Car Park, Maintenance Shed, Irrigation / Lake System**.
- Budget is enforced on every tile/facility. A pre-built, editable **9-hole starter course** (Rating ~81, varied pars) is included.
- Live **Course Rating, Beauty, Difficulty and Prestige** scores, a hole-by-hole overview table, and an **opening checklist** (clubhouse, 9 tees, 9 greens, 9 complete holes, range, shop/restaurant, car park, rating ≥ 55).

### 2) Manage & Hit Budgets
- Start with **$750,000**. Season goal — finish **Week 12** with **Cash ≥ $850,000, Condition ≥ 70 and Reputation ≥ 65** for the Trophy screen. Go bankrupt (cash < $0) and the season ends early.
- Sliders: **green fee, maintenance spend, marketing, grounds staff level**. Each **Advance Week** produces a modal **Weekly P&L** (green fees, memberships, Pro Shop & Restaurant income vs staff wages, per-tile mowing, facility upkeep, marketing, loan interest), a **cash-history sparkline chart** with target line, weather, and Condition / Reputation / Satisfaction meters that move in response.
- **Random events:** storm damage, heatwave, tournament offer, vandalism, pro visit, wedding booking, junior clinic boom. Optional **$50k loan at 8%** weekly interest.
- Progress **autosaves to localStorage**; New Game asks for confirmation first.

### 3) Play Your Course
- Play **all 9 holes from your own design** — the play view renders your actual tee, green, fairways, sand, water, trees and paths around each hole.
- **Drag to aim** (aim arrow), choose **Driver / 5-Iron / Wedge / Putter**, then **press-hold-release Swing**: the oscillating power/accuracy meter rewards releasing in the green/yellow zone.
- Ball-flight animation with trail, bounce/roll feel and lie effects: **water = penalty + drop, sand 55% power, rough 75%, trees can deflect**, path 90%. On the green, putting uses a **break/slope indicator**. Hole-out animation, live 9-hole scorecard, and a final round summary — **prize money for a completed round is banked back into your Manage budget**.

Controls: tabs or keys `1/2/3`, `+`/`-` zoom, `0` fit, `Esc` closes dialogs. See the in-game **How to Play** guide.

## Publish on GitHub Pages (free hosting)

This game is one self-contained HTML file (`index.html` — all styles and code inline, no other files or local paths needed), so it uploads as-is.

1. Repository: `Precis60/golf-course-tycoon` (already created).
2. Upload/commit `index.html` to the repo root (`git add index.html && git commit && git push`).
3. Repo **Settings → Pages** → **Deploy from a branch**, `main` branch, `/ (root)`, **Save**.
4. Live URL: `https://precis60.github.io/golf-course-tycoon/`
5. Link it anywhere: `<a href="https://precis60.github.io/golf-course-tycoon/">Play Golf Course Tycoon</a>`

Publish steps are unchanged from v1 — just re-push the new `index.html` (and this README).

## Files

- `index.html` — the whole v2 game (HTML, CSS, JavaScript in one file, ~80 KB)
- `README.md` — this file

## Hole Designer & Professional Layouts (v3 upgrade)

- **Centreline-first design:** each Hole 1–9 has editable tee → bend/landing → green control points. Drag gold points on the master plan (Hole Edit tool) to create straight, dogleg-left/right, double-dogleg, S-curve and cape holes. Fairway is generated as a striped corridor around the centreline (fairway-width and rough-width sliders in metres), not hand-painted squares.
- **Master-plan look:** the Design view is an illustrated routing plan — cream/paper surround with property boundary, dense illustrated tree-canopy clusters between holes, flowing curved fairway ribbons, big lakes, tan bunker shapes, red/white circled tee badges, a clubhouse complex at the south facilities site, north arrow and 0–100 m scale bar. Hole 1 tees off by the clubhouse and Hole 9 returns beside it.
- **Professional shaping:** green presets (Round, Kidney, Peanut, Long/Narrow, Island, Redan, Biarritz, Punchbowl) + green-size and slope/contour direction; fairway bunkers at the landing zone, greenside and pot bunkers; creek crossings, lakes fronting greens and island-green water; Championship / Club / Ladies tees per hole with separate yardages. Template library: Straight Par 4, Dogleg Left, Dogleg Right, Double Dogleg Par 5, Short Par 3 over Water, Island Green, Cape Hole, S-Curve Par 5, plus architecture templates Cape, Redan Par 3, Biarritz, Punchbowl, Short Precision Par 3 and Reachable Par 5.
- **Architecture standards (inspired by classic strategic design, original code/art):** a Design Philosophy selector (Strategic / Penal / Heroic), per-hole architect feedback (preferred side & angle of approach, whether hazards actually guard the 200–260 m landing zone, green-complex guarding, risk–reward carries, straight-hole monotony and routing-direction warnings), and a Variety / Architect score feeding Course Rating. Golfer Satisfaction in Manage also responds to variety, and Prestige is tiered: Local 9 → Members Club → Championship Course → Resort Destination.
- **Yardage Book:** per-hole card (par auto-from-length with override, Stroke Index 1–9, lengths from all three tees, dogleg direction, carry distances, green size/slope) plus a drawn top-down diagram with dashed centreline, 50 m markers, hazards and compass. Driving arcs at 200/230/260 m and 50 m markers appear on the main plan.
- **Zoom as an editing tool:** 25%–450% zoom via mouse-wheel-to-cursor, two-finger pinch, +/− buttons and keyboard; Pan tool / two-finger pan; minimap overview with viewport rectangle (tap to jump); Fit Course and per-hole Zoom to Hole buttons; double-tap a hole badge to fly to that hole. Detail (50 m markers, landing arcs, bunker labels, green slope arrow) appears as you zoom in, and control points snap finer (0.25 tile) at high zoom.
- **Play uses the geometry:** ball lie is tested against the actual corridor/green/bunker/water geometry of the hole being played — a straight drive on a dogleg can run through the bend into rough/trees, hazards are where you placed them, and green slope drives the putting break.
- **Costs & saves:** re-routing a hole, applying a template, adding bunkers/water and reshaping greens all charge against cash. Saves bump to v3 under the same `golfTycoonV2` key; a v2 save loads without crashing (cash/season salvaged, holes rebuilt as the new starter) with a toast.

## Hi-Res Rendering, Blank Start & 18 Holes (latest upgrade)

**Honest resolution note:** Jamie asked for "200 times higher" quality. A literal 200× pixel count is not claimed — that would be ~176 million pixels for the design canvas alone and would not run on phones. What shipped is the maximum practical jump: geometry is **re-drawn as crisp vector paths at the current zoom every frame** (not a stretched bitmap), with a DPR-aware backing store (DPR capped at 3) plus supersampling.

Measured before → after (headless Chrome, desktop DPR 1, Quality = Ultra):

| Canvas | Before backing | After (Ultra) | Pixels before → after | Multiple |
|---|---|---|---|---|
| Design | 1120×784 | 5600×4000 (Ultra) | 878,080 → 22,400,000 | **~25.5× pixels (100 px/tile world)** |
| Play | 980×560 | 3920×2240 | 548,800 → 8,780,800 | **16×** |
| Yardage diagram | 760×340 | 3040×1360 | 258,400 → 4,134,400 | **16×** |
| Cash chart | 520×150 | 2080×600 | 78,000 → 1,248,000 | **16×** |
| Minimap | 260×182 | 1040×728 | 47,320 → 757,120 | **16×** |

At 350–450% zoom the effective sharpness gain is larger than 16× versus the old stretched view, because detail (grass speckle/blades, green contours, bunker rake lines, shoreline/shimmer, tree tufts) is generated at the display transform scale and scales with zoom. Quality selector (top bar): **Ultra / High / Battery Saver** — Battery Saver drops the design backing to 840×588 for weak devices; on small screens (<520 px wide) density and supersampling are adaptively reduced. Still one self-contained HTML file, no external assets.

**Blank start & 18 holes:**
- **New Game** offers Starter 9, Starter 18, **Blank Course 9** and **Blank Course 18**. Blank is a completely empty site: no holes, no fairways, no facilities — just rough land, $750,000 intact. **Clear to Blank** in Design (with confirm) does the same without resetting cash/season.
- **Building from blank (fixed):** every tool works on empty land. Painted Fairway now renders distinctly from Rough (lighter mow stripes, not the same colour). Placing **Tee n** shows a saved tee marker; placing the matching **Green n** then creates Hole n from those two points (drag its gold centreline points to shape it). On a hole that already exists, Tee/Green move that hole's tee/green point. Money is charged **only when a placement succeeds and renders**: occupied spots (facility, tee/green marker), a facility that does not fit a 2x2 inside the course, re-placing the same thing, and insufficient cash all charge $0 and show a toast saying why. Facilities are placed on tap/click only (dragging a facility or Tee/Green tool across tiles does not multi-charge), while drag-painting terrain charges once per newly changed tile and $0 over tiles already that type. Hole Designer actions (template, bends, bunkers, water, green shape, sliders) no longer silently create a hole — they ask for **+ Create Hole** first and charge $0 until a hole exists; a re-route that cannot be afforded is put back with no charge.
- **Painted course size 5600 x 4000:** the design world is 56 x 40 tiles at a clean 100 px per tile (5600 x 4000 world pixels). On **Ultra** the design-canvas backing store is exactly **5600 x 4000** on desktop and phone; **High** scales the backing to 2800 x 2000 and **Battery Saver** to 1400 x 1000 while world coordinates, pointer hit-testing, minimap and Zoom to Hole still use the same 5600 x 4000 world (CSS display stays responsive/fit-to-screen with zoom/pan as before). Other canvases keep their previous hi-res treatment. Before this change the Ultra design backing was 4480 x 3136.
- World enlarged from 40×28 to **56×40 tiles** so 18 pro-length holes plus facilities/lakes genuinely fit. Hole selector and Stroke Index run 1–18, the yardage book, hole table and scorecard (with Front 9 / Back 9 / Total) cover all holes, and Play plays every completed hole.
- Validation tiers: **Open (9 holes)** to trade/play, **Full 18 open** for a prestige bonus; visitors and prestige scale with completed holes. With 0 holes, Manage prompts you to design first and Play shows "Design at least 1 hole" with Swing disabled — no errors.
- Existing 9-hole saves load unchanged in 9-hole mode (old 40×28 tile maps are padded onto the larger world; cash/season kept).

Verified in headless Chrome (desktop 1280px + mobile 390×844, DPR 2): blank 18 = 0 holes / 0 errors; programmatic 18-hole build = 18 valid holes, scorecard shows holes 1–18 with Front/Back/Total and Hole 18 renders in Play; legacy template/drag/wheel-zoom/play tests still pass with 0 page errors. Rough render time on this box: ~3.4 ms per design frame, ~2.6 ms per play frame (20-frame average, Ultra, DPR 1).
