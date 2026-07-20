# pentedb — Design notes (Phase 4, Task 5: premium visual pass)

The workbench has one job: read a Pente position and think about it. Its identity is
**wood and stone** — the board is the hero, and the chrome around it stays quiet so the
board is what you look at. Everything below is a deliberate choice for that brief, not a
default. Nothing here changes behaviour; the pass is styling only.

Applies via three levers: the MUI theme (`src/shell/theme.js`), the board stylesheet
(`src/resources/board.css`), and the heat ramp (`src/features/explorer/heatScale.js`).
Board overlays (`HeatOverlay`, `AiGhostOverlay`, `ThreatBands`) got a geometry-registration
fix. `Board.js` logic was left untouched — the board skin is pure CSS on the classes it
already emits.

---

## 1. Heat ramp — `heatScale.js`

> **OVERRIDE (explorer feedback rework, 2026-07).** The ramp below was **reversed on the
> user's explicit direction** to a **green→red relative scale that matches their mobile DB
> apps** (`pentelive-android` `DatabaseActivity.java:723-735`, `penteLive-iOS`
> `DatabaseViewController.m:899-916`). The new ramp min-max **normalizes each shown move
> across the currently displayed candidate set** (`t=(v-min)/(max-min)`; `max==min → t=v/100`)
> then lerps **red→yellow→green** (`t≤0.5 → rgb(255,round(t·510),0)`, `t>0.5 →
> rgb(round((1-t)·510),255,0)`): worst-of-set = pure red, best = pure green, midpoint yellow.
> That relative stretch is what makes the heat distinctive, and it is now overlaid on the REAL
> board (`BoardHeatOverlay`), not a mini-preview. `heatScale.js` now exports pure
> `heatColor(t)` + `heatDomain(values)` + `heatT(value, domain)`; StatsRows, HeatOverlay and
> BoardHeatOverlay all normalize over the SAME shown set so the list and the board agree.
> **This knowingly abandons the CVD-safe pair below and reintroduces the red↔green colourblind
> ambiguity** — the tradeoff was raised and **accepted by explicit user request** (product
> parity with their apps), so it is intentional, not a regression. The CVD-safe rationale below
> is retained as historical context for whoever revisits this decision.


`heatScale(winPct)` maps a candidate move's win% (0–100) to a fill for the explorer / AI-ghost
overlay. The Phase-2 placeholder was a **red ↔ green** lerp — the textbook colourblind trap.
Replaced using the dataviz skill's method (form → colour → *validate with the script*).

**win% is diverging around 50% (even), so the ramp is cold → hot with a neutral middle:**

| win% | colour     | meaning  |
|-----:|------------|----------|
|   0  | `#063366`  | losing (cold, deep blue) |
|  50  | `#4A3F30`  | even (neutral dark umber) |
| 100  | `#7E2200`  | winning (hot, deep vermillion) |
| n/a  | `#60646A`  | no data (cool slate) |

Piecewise-linear between the three anchors, deterministic, and **theme-independent** — the
same win% yields the same colour in light and dark mode, so toggling the theme or rotating
the board never shifts a cell's heat (a behaviour contract the tests pin).

**Why these hues.** Blue ↔ vermillion is the ColorBrewer / Okabe–Ito cool→warm CVD-safe
pair. Simulating protanopia, deuteranopia and tritanopia, the 0 / 50 / 100 anchors stay
mutually separated (RGB-Euclid after CVD sim: prot 86/145, deut 85/143, trit 73/68 — all
well clear of the ~40 confusion floor). It also reads intuitively: cold = losing, hot =
winning.

**Contrast — validated, not eyeballed.** Every step is kept dark (low luminance) so the whole
ramp clears **≥3:1 WCAG contrast against ALL thirteen board felts**. Worst case is the renju
rose felt (`#D98880`); the Phase-2 placeholder failed it, this ramp does not:

| win% | vs pente amber (default) | vs renju rose (worst felt) | vs boat blue | vs o-pente green |
|-----:|:---:|:---:|:---:|:---:|
|   0  | 9.65 | 4.65 | 5.71 | 5.40 |
|  50  | 7.90 | 3.81 | 4.67 | 4.42 |
| 100  | 7.63 | **3.68** | 4.51 | 4.27 |

Global minimum across all steps × all felts = **3.68:1**. (`NO_DATA` clears the light felts at
4.6:1 but dips to 2.2:1 on the renju felt; it is a rare, achromatic informational state and is
also distinguished by being the only grey in the set — acceptable.)

**Distinct from the other overlays.** The heat blue is far darker than the threat-band blue
(`#1e88e5`) and the AI-ghost violet (`#7c4dff`); the hot vermillion is darker/redder than the
threat orange (`#fb8c00`). Identity is also carried by **form** — heat is solid discs, the AI
ghost is a bright dashed violet ring, threat bands are thin translucent lines — so the layers
never read as the same thing even where hues are adjacent. Heat discs also carry a faint dark
stroke (`rgba(15,12,10,0.5)`) for definition on the lighter felts.

---

## 2. Overlay geometry registration (the deferred T2/T5 item)

The ghost / heat / threat overlays previously placed marks under `translate(10,10)` — a plain
10-unit grid that matched the board only at the centre cell and drifted outward toward the
edges (the board's real transform includes a `scale(0.95)`). Now registered exactly.

The board renders a stone at canonical `(col,row)` at viewBox coordinate
`(9.5·col + 14.5, 9.5·row + 14.5)` — that's `#boardgroup`'s `scale(0.95) ∘ translate(5,5)`
composed with `#whole`'s `translate(5,5)`, applied to each `BoardSquare`'s stone centre. The
overlays share the board's viewBox and draw circles at `(10·col, 10·row)`, so their inner
group now uses **`translate(14.5,14.5) scale(0.95)`**, which reproduces that mapping exactly:
`(10·col,10·row) → (9.5·col+14.5, 9.5·row+14.5)`. Marks now sit dead-centre on their grid
intersections under any of the 8 board rotations. (`data-cell` / `data-canonical` attributes
are unchanged, so the rotation-correctness tests are untouched.)

---

## 3. Type scale — `theme.js`

Body/UI face is a crafted system stack (`'Inter', 'Segoe UI', system-ui, …`) — no web-font
fetch (offline / CSP safe); if the reader has Inter it's used, otherwise the platform grotesque.
The scale is tight and weighty at display sizes, comfortable in body, with a spaced overline for
section eyebrows:

| role | size | weight | tracking |
|------|------|-------:|----------|
| h1 | 2.5rem | 700 | −0.02em |
| h2 | 2rem | 700 | −0.015em |
| h3 | 1.6rem | 700 | −0.01em |
| h4 | 1.3rem | 700 | −0.005em |
| h5 | 1.1rem | 600 | — |
| h6 | 1rem | 700 | 0.01em |
| body1 | 1rem | — | line-height 1.55 |
| body2 | 0.875rem | — | line-height 1.5 |
| button | inherit | 600 | 0.01em, `textTransform: none` |
| overline | 0.6875rem | 700 | 0.09em, uppercase |

**Tabular figures everywhere** (`font-variant-numeric: tabular-nums` on `body`): win%, game
counts, move numbers and board coordinates align in columns and don't jitter as they update —
the single most subject-appropriate type choice for a database workbench.

---

## 4. Colour / chrome — `theme.js`

Quiet, slightly-warm neutral surfaces with **one** confident accent: a deep teal
(`#0F6E63` light / `#4FB3A5` dark). The teal is deliberately clear of every board-overlay hue
(heat blue/umber/vermillion, AI violet, threat blue/orange, last-move red) so an accented
control never reads as a board mark. Background is a warm greige (`#EFECE4`), not the ubiquitous
AI cream — the warmth ties to the wooden board without landing on the default.

| token | light | dark |
|-------|-------|------|
| primary (accent) | `#0F6E63` | `#4FB3A5` |
| background | `#EFECE4` | `#14120F` |
| paper | `#FBFAF6` | `#1E1B17` |
| text primary | `#23201C` | `#ECE7DE` |
| text secondary | `#6C665C` | `#A79F93` |
| coord-ink (board ruler) | `#6B5F52` | `#B9AD9C` |

**Panel chrome:** the header is flat with a hairline divider instead of a drop shadow; panels
drop the MUI gradient overlay; buttons are flat, `borderRadius: 8`, sentence case; tabs are
sentence case with a 44px hit target; corners are softened (`shape.borderRadius: 10`); scrollbars
are thinned and self-coloured. Interaction transitions are snappy (`shortest: 120ms`,
`shorter: 150ms`).

**Empty / loading / error states** ride the same system: the loading skeleton is rounded
(`MuiSkeleton`), `PanelError` stays a role="alert" line, and the board's empty state is now a
directive two-liner — *"No position open / Open a game or search a position to start analysing."*
— rather than a bare label.

---

## 5. Board skin — `board.css` (CSS only)

- **Grid ink:** warm near-black umber (`#2c231b`, hairline `0.22px`, 82% opacity) instead of
  pure `#000` — reads as a pressed wood grid, not a printed black overlay. Hoshi dots/circles
  follow in the same ink.
- **Stone glass:** the radial gradient runs a brighter, cooler specular highlight into a deeper
  rim — black `#5f666e → #0b0d10`, white `#ffffff → #c4c9d0` — so stones read as polished glass
  beads rather than flat discs. (The per-variant felt fills are the family's canonical variant
  colours and are left as-is — they carry recognition and are what the heat ramp is validated
  against.)
- **Board frame:** a soft elevation shadow under the board square (no layout shift) sets it on
  the workbench surface like a physical board.
- **Coordinate ruler:** now theme-aware via the `--board-coord-ink` variable the CssBaseline
  sets, fixing the previously-black labels that vanished on the dark surface.

---

## 6. Motion & accessibility

- **Place animation ≤150ms:** a newly-mounted stone eases in over 130ms (opacity + scale, a
  gentle overshoot). React reuses the DOM of standing stones, so it fires only on the stone(s)
  that just appeared (a place, a nav jump, a rotation) — never a re-animation of the whole
  position. Selector targets only placed stones (`#svgboard circle[filter]`).
- **Reduced motion:** a global `@media (prefers-reduced-motion: reduce)` reset (in CssBaseline)
  neutralises all CSS animation/transition — the place animation, the illegal-move shake, hover,
  and chrome. **One documented exception:** the AI-ghost pulse is an SVG SMIL `<animate>`, which
  CSS can't gate; it is ambient and frozen in any screenshot.
- **Focus-visible:** a consistent 2px teal focus ring (`*:focus-visible`, 2px offset) is applied
  globally as an accessibility floor on top of MUI's own focus styles.

---

## 7. Screenshots

`docs/screenshots/phase4/` — desktop (1400×900) and mobile (390×844), light and dark, across the
explorer / AI-hint / threats board views. Compared against `phase2/` and `phase3/`: the board now
has warm grid ink, glass stones and a lift shadow; overlays register precisely on intersections;
chrome carries a single teal accent with tabular numerics; the dark theme is a designed warm-dark
surface (with a legible board ruler) rather than a flat inversion.
