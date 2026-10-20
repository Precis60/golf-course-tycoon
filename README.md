# Golf Course Tycoon

A browser game: design an illustrated golf course, run the club for a 12-week season, then play every hole on the geometry you drew.

**Play it (after this branch is merged and Pages is switched):** [https://precis60.github.io/golf-course-tycoon/](https://precis60.github.io/golf-course-tycoon/)

The live site still serves the previous single-file game from the `main` branch root until GitHub Pages is pointed at the Actions workflow. See [After you merge](#after-you-merge).

## Run it locally

```bash
npm ci
npm run dev
```

Other commands: `npm test`, `npm run lint`, `npm run build`, `npm run preview`.

The build is static files in `dist/` with a relative base, so the same output works on GitHub Pages and on a local preview.

## What changed in this studio build

The game used to be one hand-written `index.html` (Canvas 2D, CSS and JS inline). It is now a Vite + TypeScript + PixiJS (WebGL) project:

- Typed simulation in `src/sim/` (geometry, economy, designer, play, saves) with Vitest coverage
- One WebGL scene in `src/render/` for the title, design, and play views
- DOM chrome in `src/ui/` (title, new game, tutorial, pause, settings, toasts)
- Original procedural textures and a small WebAudio synth in `src/audio/` — no third-party images or samples
- ESLint and Prettier
- GitHub Actions workflow that tests, builds, and deploys `dist/` to Pages

## How to play

### New game

Choose the name, 9 or 18 holes, land size, a starter routing or a blank site, and a difficulty.

| Difficulty | Starting cash | Trophy line |
|---|---|---|
| Club | $900,000 | $800,000, condition 65, reputation 60 |
| Members | $750,000 | $850,000, condition 70, reputation 65 |
| Open | $620,000 | $980,000, condition 75, reputation 70 |

Members is the original win line. A tile is 100 world units and 16 metres.

| Land | Tiles | Painted world |
|---|---|---|
| Standard | 56×40 | 5600×4000 |
| Large | 84×60 | 8400×6000 |
| Estate | 112×80 | 11200×8000 |

Land can only grow. Enlarge pads rough around the existing course and keeps holes, tiles, and buildings. Shrinking is refused.

### Design

- Hole edit: drag the centreline (tee, up to three bends, green) for doglegs, S-curves, and cape holes. Fairway and rough are generated corridors. Width sliders are in metres.
- Champ, Club, and Ladies tees, with yardages on the hole card.
- Green shapes: round, kidney, peanut, long, island, Redan, Biarritz, Punchbowl. Size and slope are per hole.
- Fairway, greenside, and pot bunkers. Creeks, lakes, and island greens.
- Template library, par (auto or override), stroke index, architect notes, and a Strategic / Penal / Heroic read for the current hole.
- Yardage card: par, stroke index, three tee lengths, carries, and a mini diagram. Zoom in for 50 m ticks, driving arcs, and a slope arrow.
- Brushes: single, round, or square, size 1–15. Ghost preview shows the tiles and the cost before anything is charged. Sizes for tees (S/M/L), greens, bunkers, tree clumps, and facilities (S 2×2, M 3×3, L 4×3).
- Facilities: clubhouse, pro shop, range, restaurant, car park, maintenance shed, irrigation.
- Tools: fairway, rough, sand, water, trees, path, tee, green, bulldoze, pan, and the facilities.
- Zoom 25–450%, wheel to cursor, pinch, fit, zoom to hole, minimap jump, double-tap a hole to frame it.
- Validate-then-charge: a brush, facility, template, bunker, or reroute that does not land is not billed. Repainting the same tile costs nothing. Undo and redo cover designer strokes.

Opening the club needs a clubhouse, nine real holes, green-shape variety, a range, a shop or restaurant, a car park, and a rating of at least 55. Eighteen holes is a prestige bonus, not a gate.

### Manage

Twelve weeks. Green fee, maintenance, marketing, and grounds staff move condition, reputation, and satisfaction. Each week opens a P&L (green fees, memberships, shop, restaurant, wages, mowing, facilities, marketing, loan interest) plus weather and a random event. The cash chart draws the trophy line. Prestige runs Local 9 → Members Club → Championship Course → Resort Destination. A loan is $50,000 at 8% weekly interest. Cash below zero ends the season. A finished round’s prize is paid back into the same account.

### Play

Aim on the hole you built, pick driver, iron, wedge, or putter, then hold Swing and release inside the gold band. The ball uses that hole’s corridor: fairway, rough, sand, water, trees, and the green. Water is a stroke and a drop. Green slope moves the putt. The scorecard has front nine, back nine, and total.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Modes | Design, Manage, Play | `1` `2` `3` |
| Tools | Tool buttons | `Alt+1` … `Alt+9` |
| Brush size | Slider | `[` `]` |
| Zoom | Wheel, buttons, pinch | `+` `-` |
| Fit course | Fit | `0` |
| Pan | Pan tool, middle mouse, Space-drag, two fingers | Arrow keys while Space is down |
| Erase | Right-click drag | |
| Undo / redo | Buttons | `Ctrl/Cmd+Z`, `Ctrl+Y` or `Shift+Ctrl/Cmd+Z` |
| Aim | Drag on the hole | Arrow keys |
| Swing | Hold the Swing button | Hold Space |
| Pause | Pause | `Esc` |

## Saves

The new game stores up to three slots plus an autosave under `gct.v4` in localStorage. Export and import are JSON files in the pause menu.

An older save under `golfTycoonV2` is imported into `gct.v4` on first launch when the new key is empty, and can be imported again from the pause menu. The old key is left in place so the previous site still reads it. A legacy 40×28 map is padded onto Standard, top-left. A save with no hole list keeps the painted tiles and rebuilds a starter routing.

Settings (picture quality, master / music / effects, vibration, reduce motion, stronger aim contrast) live in the same bundle.

## Picture and sound

Quality is Battery, High, or Ultra. Ultra raises the pixel ratio (capped at 2, lower on narrow screens) and draws more trees. The course is vector geometry in a WebGL scene, redrawn when the land changes, with flags, water glints, carts, and golfers animated on top. There is no multi-thousand-pixel CPU bitmap; sharpness comes from the GPU transform.

Art is procedural: grass, trees, buildings, carts, golfers, and hole badges are drawn in-repo onto canvases. Sound is a pentatonic pad and short synthesised effects. Both start after the first click or tap.

## Project map

```
index.html              Vite entry
src/main.ts             boot
src/style.css           chrome
src/sim/                rules, geometry, economy, saves, tests
src/game/session.ts     undo, designer actions, the round
src/render/             Pixi scene and generated textures
src/audio/synth.ts      WebAudio
src/ui/shell.ts         screens, input, HUD
.github/workflows/pages.yml
```

## After you merge

The workflow `.github/workflows/pages.yml` runs on every push to `main`. It installs, tests, builds, and deploys `dist/` with GitHub Actions.

Until Pages is switched, a merge will **replace the live single-file game with the Vite source `index.html`**, which does not run the game by itself. Do this immediately after merging:

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. If the merge’s deploy job failed because Pages was still “deploy from a branch”, open **Actions → Deploy GitHub Pages → Run workflow** once the source is Actions.
3. Confirm [https://precis60.github.io/golf-course-tycoon/](https://precis60.github.io/golf-course-tycoon/) loads the title screen. The first load can take a minute while the new artifact is published.

Do not set Pages back to “Deploy from a branch / main / root”. That would publish this repository’s source `index.html` instead of `dist/`.

## Honest gaps

This is a real game with a studio structure, and it is not a commissioned commercial art pass.

- The course is original procedural illustration. A painted master-plan set (trees, clubhouse, bunkers, paper) from an artist would be the largest visual step up.
- The swing is an arcade model: club distance, a sweet band, lie multipliers, and a short ball flight. It is not tour physics, and the hole-out distance is 9 metres.
- Music is a generated pad, not a scored soundtrack.
- Facility upkeep is charged once per building. The previous file charged once per facility type. A starter course has one of each, so that season matches; a second clubhouse now costs its own upkeep.
- Ultra is a higher device-pixel ratio, not a 5600×4000 CPU backing store. Zoom stays sharp because the fairways are vectors.
