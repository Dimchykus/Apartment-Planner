# Flat planner — plan

Goal: web app (React + Three.js) to view a flat in realistic 3D (orbit + walk), edit walls, furnish it, share with friends.
App lives in `app/`. Run: `cd app && npm run dev` → http://localhost:5173

## Status legend
[x] done  [~] in progress  [ ] todo

## Phase 1 — Geometry & viewing
- [x] Vite + React + R3F + postprocessing scaffold
- [x] Trace flat 1Б from `public/plan1.png` into data
- [x] Orbit + walk (WASD, wall collision, doors passable)
- [x] Plan image overlay for checking the trace
- [~] Fix topology: walls share corner **nodes** (missing wall between living and loggia, x=333)
- [~] Net interior room areas (wall thickness subtracted) + total flat area (loggia ×0.5 as in the developer's figure 52.42)

## Phase 2 — Editable walls
- [~] State store (zustand): nodes, walls, rooms, furniture, selection, mode
- [x] "Edit walls" mode: only INNER walls editable (outer shell locked). Handles: bathroom wall corner (free), bathroom + bedroom walls slide along the north wall; 5 cm snap, live area update, length labels
- [ ] Reset to original trace; numeric correction (calibration px/m) if the trace is off
- [x] Add inner walls: two-click tool, thickness 8-20 cm, optional doorway, snaps to corners/walls, move ends or whole wall, delete (Del), saved + shared; area of added walls subtracted from the room
- [ ] Added walls do not yet split a room into two rooms with separate areas
- [ ] Drag door/window along a wall, change their width

## Phase 3 — Furniture
- [~] Catalog of parametric models with real dimensions (sofa, armchair, tables, chairs, bed, nightstand, wardrobe, TV unit, kitchen, fridge, bathtub, WC, vanity, washer, desk)
- [~] "Furniture" mode: click select, drag on floor (snap), rotate (R / Q / E), delete (Del), colour swatches, add from catalog
- [~] Default furnishing of this flat ("Auto-furnish")
- [x] Auto-furnish follows the developer plan: per-flat `hints` (px positions of kitchen, sofa, dining, bed, bath fixtures…) pull items to the drawn spot, fitted/shrunk to the real room; kitchen under a window drops upper cabinets. Rule-based auto-furnish (`app/src/autofurnish.ts`): works on the clear room outline (walls removed), avoids added walls, door swings and windows (tall items), shrinks items until they fit (sizes lists), kitchen run + fridge, sofa/TV/coffee table, dining set, bed + nightstands + wardrobe, bath fixtures (tub or shower)
- [x] Misplaced furniture (outside a room / through an added wall) gets a red outline in Furniture mode
- [x] Wall-mounted shelves (`shelf`, height slider 30–220 cm); auto-furnish hangs them above the sofa (2), bed and toilet where the wall is free
- [x] Variant picker for selected furniture: size presets, model style (round/rect table, sofa, bed, wardrobe, stool…), finish, exact W/D/H sliders, any colour, reset
- [x] "Rooms" mode: click a room → set its function (kitchen-living, living room, kitchen, bedroom, bathroom, office, empty) → room is re-furnished at once; pin kitchen/dining/sofa/TV/bed/wardrobe/desk positions on the floor; saved per flat + in share link
- [ ] Split an open-plan room into separate zones (kitchen zone | living zone) with own areas
- [x] Misplaced check now also covers: in front of a window (tall items, TV screen included), blocking a door, overlapping other items; panel shows the reason + "Fit to space" (nearest valid spot, shrinking / next size down) and "Fix all"; auto-furnish falls back: TV unit -> wall-mounted TV, sofa -> armchair, rect table -> round
- [x] Placement criteria (`app/src/criteria.ts`): 8 presets + 7 sliders (follow plan, free space, comfort, natural light, storage, privacy, home office); kitchen + bathroom fixtures are FIXED (always follow the plan, pins ignored, their rooms locked in Rooms mode)
- [x] "Max functional use of space" criterion + preset: fills free walls with shoe cabinet (by the entrance), bookcases, chest of drawers, tall bath cabinet, 2nd wardrobe, armchair, desk; loggia becomes storage; every addition must keep 60 cm passages between all doors (grid reachability check); "Space use" summary (floor used, storage m³, seats, beds, desks, passage warnings)
- [x] "Furniture" mode only edits (select, size, type, colour); dragging items is a separate "Move items" mode. Undo/redo (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z + buttons) for furniture, walls, room functions, pins and criteria: a drag = 1 step, slider bursts merged, 100 steps
- [x] Free flight mode ("Fly"): WASD along the view direction, Space up, C down, Shift x3, wheel = speed, no collisions, starts from the current camera
- [x] Criteria coordination: one shared scoring model for every movable item (space, comfort, light, storage, privacy, office, utilisation, plan), weights balanced when many are high (budget 4), conflict hints, cross-room desk choice, group-aware sizing (big sofa must not squeeze the dining table), tables aligned with the room walls, live layout scorecard (0-100% per criterion) in the criteria panel; verified: raising any slider never lowers its own score (19 up / 5 unchanged / 0 down over 3 flats)
- [x] Furniture groups: chairs belong to their table / desk, nightstands to the bed, coffee table to the sofa; they move, rotate and are removed together; "orphan" chairs / nightstands are flagged (red + reason) and Fit tucks a chair back to the nearest table (Fix all removes ones that cannot be placed)
- [x] Pins (Rooms mode): re-furnish at once, beat every criterion (pinned desk is created even without the office criterion), pin colour = green (item stands there) / orange (nearest valid spot, label says why: window, door swing, wall too short, another item) + dashed line to the real position
- [x] Pins are hard constraints: pinned items are placed first, shrink (below standard sizes if needed), ignore soft rules (window, door swing, clearance), neighbours adapt around them; live status circle + ghost outline under the cursor in Rooms mode (green fits / orange placed anyway with reason / red impossible); one big pick plane so the floor is clickable everywhere
- [x] Pins decide the room too: a bed pinned in the living room, a sofa in the bedroom etc. is generated there; single items (bed, sofa, TV, table, desk) are skipped in other rooms; notice lists what the pin cost the neighbours
- [ ] Furniture-vs-furniture overlap hints
- [ ] Swap in real glTF models (Poly Haven / Kenney, CC0) — needs user OK to download

- [x] "Dimensions" mode: clear wall lengths, wall thickness, door/window sizes, room areas, furniture sizes; Top view button

## Phase 4 — Realism
- [x] Soft shadows, HDRI, N8AO, tone mapping, SMAA, procedural floors
- [ ] Photo PBR textures (parquet, tile, plaster) from Poly Haven (CC0)
- [ ] Baked lightmaps / path-traced still render (`three-gpu-pathtracer`)
- [x] Environment: procedural sky + sun, street level 12 m below, neighbouring buildings, trees, fog; Day / Sunset / Night (stars, lit windows, warm room lights) selector; sun light and shadows follow the time of day
- [ ] Sun direction slider and real compass orientation of the flat; HDRI skybox from Poly Haven (needs download OK)

## Phase 5 — Sharing
- [~] Layout saved in localStorage and in the URL hash ("Copy share link")
- [ ] Deploy static build to Vercel / Cloudflare Pages
- [ ] Optional backend (Supabase) for saved projects, multiple flats, comments

## Phase 6 — More flats
- [x] Flat switcher in HUD; each flat keeps its own walls/furniture edits (localStorage + share link). Traced: 1Б (52.42), Apartment 29 (38.17), Apartment 62 (36.76; source image cropped, east wall inferred)
- [ ] Trace the remaining plans (images 1–4: CAD plans 1А, 1В, 1Б, 1А)
- [ ] In-app tracing tool: load image, calibrate scale, click corners

## Phase 7 — Sharing, library, UI (done)
- [x] `npm run package` → `app/share/FlatPlanner.zip`: `FlatPlanner.html` (one offline file, works from disk), `website/` (for Netlify Drop / any static host), `README.txt`
- [x] Offline by design: no HDRI / font / CDN downloads (light-panel environment, procedural sky)
- [x] Side menu redesign: scrollable, collapsible cards, hide with the button or `H`, light / dark theme, help dialog, screenshot, full screen; floating mode bar
- [x] Phones: bottom-sheet menu (drag handle), top mode bar, touch Walk / Fly with on-screen stick + drag-to-look, Fast / Balanced / Best graphics (auto Fast on phones), idle frames are not rendered
- [x] My flats: upload a plan image → set scale → trace walls (auto-split / snap) → doors & windows → click rooms (auto-detected from the walls) → kitchen / bath fixtures → Save. Edit, rename, duplicate (also built-in flats), delete, export / import a flat file, export / import whole project
- [x] Test tooling: `scripts/cdp.mjs` (headless Chrome driver), `scripts/e2e-tracer.mjs`, `scripts/e2e-ui.mjs`, `scripts/register-stub.mjs` (run logic tests in Node)

## Phase 8 — Style, doors, windows, lights (done)
- [x] Wall colour per room and per wall side (exterior too), 10 floor finishes (procedural), per room or all rooms; saved per flat, undoable, in the share link
- [x] Doors with leaf, frame, handle: Closed / Half open / Open (per door or all), flip hinge / swing, click a door in Orbit or press E in Walk; closed doors stop the walker
- [x] Windows & doors editor ("Doors" mode): add (window, wide, small, panoramic, full-wall glazing, door, glazed door), select, move, resize (width / sill / top), convert, remove; overlaps refused; edits feed auto-furnish (furniture keeps clear)
- [x] Lights: pendants, ceiling spots (kitchen run, bathroom mirror), bedside sconces, real light when on (auto at sunset / night), wall switches placed like an electrician (latch side of the door, bathroom switch OUTSIDE the bathroom, bedside switches, never behind tall furniture); regenerated with the furniture
- [x] 2D view: lighting plan (fixtures, switches, wiring runs) + optional ceiling slab
- [x] Tests: `scripts/e2e-features.mjs`, `scripts/e2e-walk.mjs`

## Phase 9 — AI furnishing with a local Ollama model (done)
- [x] `app/src/ai/`: Ollama client (`ollama.ts`), per-room prompts with wall spans / open spots / criteria in words (`prompt.ts`), orchestration + match score (`run.ts`), state (`aiStore.ts`); UI card "AI furnish (Ollama)"
- [x] The model decides where every piece goes (wall span + position, or an open spot); code only converts that to coordinates, rejects what does not fit the real geometry, repairs / drops it, adds forgotten essentials (optional), generates chairs / nightstands / coffee table
- [x] Different result every run (random seed + temperature + a design idea per variant); all layouts kept, sorted by how well they meet the wishes (★ best); applying a layout is undoable
- [x] Kitchen and bathroom fixtures stay rule-placed (plumbing); criteria sliders no longer re-furnish by themselves (option to restore), the AI button applies them
- [x] Test with the real model: `scripts/e2e-ai.mjs` (qwen2.5:7b: ~4-9 s per variant, 0 misplaced items, different layouts per run)

## Phase 10 — Menu split (done)
- [x] Left panel = general (flat, overview, scene & view, my flats, share), always the same in every mode; right panel = tools of the current edit mode (Walls, Furniture incl. AI furnish, Move, Rooms, Style, Doors, Sizes), hide / show with a button; on phones the sheet has a General | Tools tab that switches by itself when a mode is chosen; the 3D view stays centred between the open panels
