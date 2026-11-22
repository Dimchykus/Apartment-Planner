# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Flat Planner: a browser app (React 19 + TypeScript + Vite + three.js via react-three-fiber + zustand) to view a flat in 3D, trace one from a plan image, edit walls, furnish it (rules or local Ollama AI) and share it. All app code is in `app/`; the repo root only has `PLAN.md` (feature status), `SHARING.md` and `.mcp.json`.

## Commands (run from `app/`)

- `npm run dev`: Vite dev server (default http://localhost:5173). User data lives in `localStorage`, which is **per origin**: another port shows no saved flats.
- `npm run build`: `tsc -b && vite build`. Run `tsc -b` from `app/` (there is no tsconfig in `src/`).
- `npm run lint`: oxlint (the React-compiler style warnings in `Tracer.tsx` are pre-existing; errors must be 0).
- `npm run package`: builds `app/share/FlatPlanner.zip` (single-file `FlatPlanner.html` + `website/`), see `SHARING.md`.
- No unit-test framework. Checks are end-to-end scripts that drive headless Chrome through `scripts/cdp.mjs` against a **running dev server**: `node scripts/e2e-<name>.mjs` (set `URL=` for the server, `CHROME=` if Chrome is not at the default Windows path). `e2e-autotrace.mjs [plan1|plan2|plan3]` writes screenshots of the auto-detection (env flags `AI`, `PHOTO`, `FORCE`, `SWITCH`, `OUTL`). `e2e-tracer.mjs` has a pre-existing syntax error. `scripts/ai-bench.ts` compares Ollama models.
- `?debug=1` (or dev mode) exposes `window.__planner` (`store`, `ui`, `ai`, `three`) for scripts. Other URL switches: `?quality=low|med|high`, `?res=`, `?fps=`, `?mcp=1`, `?theme=`, `?help=0`, `?menu=0|1`, `?mode=`.

## Architecture

**Live-bound flat data (`src/plan.ts`).** The active flat's `nodes`, `walls`, `rooms`, `editable`, `PX_PER_M`, `STATED_TOTAL` are exported `let` variables, overwritten by `activateFlat()`. Read them at call time, never cache them in module scope. Geometry is in **image pixels**; convert with `m(px)` / `PX_PER_M`. Furniture (`Furn` in `catalog.ts`) is in **metres**, rotation in radians, and an item's front faces **+z** at rot 0 (rot = π/2 faces +x).

**Flats.** Built-in flats are in `flats.ts`. User flats are made by the **Tracer** (`ui/Tracer.tsx`, a step wizard: image → scale → walls → doors/windows → rooms → fixtures) and stored as `TraceState` in `localStorage`. `lib/library.ts` holds `TraceState`, the wall-graph editing (`addWall`, `faces()` = planar faces of the wall graph, `netFace` = room area with half wall thickness taken off) and `buildFlat()` which converts a trace to a `FlatDef`. Room dividers (`TraceWall.divider`) take part in `faces()` but are not built as walls. `lib/libraryActions.ts` does persistence/import/export; `lib/traceEdit.ts` has the editing helpers (move/merge corners, `resizeRoom`, keeping openings attached to walls).

**Auto-detection (`lib/detect.ts`, `lib/detectOutline.ts`).** Pure image processing in the browser (threshold, chamfer morphology, thinning, graph tracing, straightening, ray-cast gap bridging for doors/windows). Two readers: solid walls and an outlined/hatched CAD reader; `roomScore` picks one and keeps the other in `Detected.alt`. `classify()` turns the graph into walls with per-wall thickness (`TraceWall.thick`, cm) and openings, and `dropOpenWalls` drops pieces that border no closed room (neighbouring flats). Optional AI (`ai/visionPlan.ts`) only finds the flat's bounding box and gives a second opinion on door/window type; it never places coordinates.

**State.** `store.ts` is the main zustand store (flat, walls, furniture, room kinds, history with undo/redo). `ui/uiStore.ts` holds UI prefs persisted to `localStorage` (theme, quality, resolution, fps cap, mcp switch). `ai/aiStore.ts` holds Ollama connection/models state.

**Rendering.** `App.tsx` builds the R3F `Canvas`. Graphics modes (`quality`: low = Performance, med = Balanced, high = Quality) gate sky/outside scenery, environment lighting, sun + shadows, room point lights, N8AO, bloom, SMAA. With an fps cap the canvas runs `frameloop="never"` driven by `FpsLimiter`; otherwise `demand` (always in walk/fly). Shadow maps freeze while the camera is dragged (`FreezeShadows`). `Flat.tsx` builds walls/floors, `Editor.tsx` renders and edits furniture, `Openings.tsx`/`Electrics.tsx`/`wiring.ts` do doors, windows, lights, switches.

**Furniture models.** `Models.tsx` has one parametric component per `FType`, drawn at the catalog's default size; `Editor.tsx` stretches it to the item's `w/d/h`. To add an item type: extend `FType` + `CATALOG` (+ `PRESETS`/`STYLES`) in `catalog.ts`, add a `case` in `Model()`; the add-menu lists `CATALOG` automatically. Items with `group` (chairs at a table, nightstand at a bed) move/rotate/delete together.

**Auto-furnish.** `autofurnish.ts` is the rule engine (criteria in `criteria.ts`, room kinds in `roomkinds.ts`, misplacement checks `misplaced`/`misplacedReason`/`fitFurn`). `ai/run.ts` + `ai/prompt.ts` ask a local Ollama model (`ai/ollama.ts`) for layouts which are then validated against the real walls. Vision models must not use Ollama JSON mode (they loop); parse plain text tolerantly.

**MCP for Claude (`app/mcp`).** A separate Node package (own `package.json`, `npm install` there) with a stdio MCP server (`server.mjs`) that relays tool calls over a local WebSocket (127.0.0.1:7391) to `src/lib/mcpBridge.ts`, which edits furniture in the open tab. It runs only while the "Claude connection (MCP)" menu switch (or `?mcp=1`) is on. Register via the root `.mcp.json`. `node mcp/test.mjs` is its end-to-end test (needs the dev server and Chrome). Tool units: metres, x = east, z = south, rotation in degrees.
