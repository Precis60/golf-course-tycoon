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
