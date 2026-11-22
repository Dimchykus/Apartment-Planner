// Rule-based furnishing. Everything works in metres on the *clear* room outline (wall thickness already removed),
// so nothing can end up inside a wall. Items shrink step by step (sizes lists) until they fit.
import { rooms, walls as baseWalls, insetRoom, openingsOf, areaM2, flat, PX_PER_M, doorSwing, type Pt, type Wall, type Room, type Opening } from './plan'
import { CATALOG, PRESETS, sizeOf, type FType, type Furn } from './catalog'
import { DEFAULT_CRITERIA, type Criteria } from './criteria'

type V = [number, number]
type OBB = { c: V; ax: V; az: V; hx: number; hz: number } // oriented box; az = "front" direction
type Edge = { P: V; t: V; n: V; L: number; hasWindow: boolean; hasDoor: boolean }
type Cand = { x: number; z: number; rot: number; edge: number; s: number; w: number; d: number; flushS: boolean; flushE: boolean }
type Ctx = {
  id: string
  poly: V[]; edges: Edge[]
  walls: OBB[]; doors: OBB[]; windows: OBB[]; entrances: V[]
  placed: { o: OBB; h: number }[]; reserved: OBB[]; shelves: OBB[]; out: Furn[]
}

const GAP = 0.02
const NEAR = 1.5 // an item may drift this far (m) from where the plan draws it before we give up and look elsewhere
const toM = (p: Pt): V => [p[0] / PX_PER_M, p[1] / PX_PER_M]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1]
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1])
// Position hints for the room being furnished: the plan's own hints + user overrides, limited to this room
let curHints: Partial<Record<FType, V>> = {}
let C: Criteria = DEFAULT_CRITERIA
let deskDone = false
let pinRoom: Partial<Record<FType, string>> = {} // room that holds each user pin (strictly inside)
const pinnedElsewhere = (ctx: { id: string }, t: FType) => userPinned.has(t) && !!pinRoom[t] && pinRoom[t] !== ctx.id
const pinnedHere = (ctx: { id: string }, t: FType) => userPinned.has(t) && pinRoom[t] === ctx.id
let userPinned = new Set<FType>() // items the user pinned on the floor: their pin beats every criterion
const wantDesk = () => C.office > 0.4 || userPinned.has('desk')
let deskRoomId = ''
let entrancePts: V[] = []
let kitchenPos: V | null = null
/** Kitchen and bathroom fixtures can't move (plumbing, drains, risers): they always follow the plan, whatever the criteria say. */
export const FIXED: FType[] = ['kitchen', 'fridge', 'bathtub', 'shower', 'wc', 'vanity', 'washer']
const hint = (t: FType): V | undefined => (!FIXED.includes(t) && C.plan < 0.35 && !userPinned.has(t) ? undefined : curHints[t])
/** Criteria compete for the same layout: when the total exceeds the budget every weight is scaled down proportionally. */
export const BUDGET = 4
export function balanced(c: Criteria): { eff: Criteria; scale: number } {
  const sum = (Object.keys(c) as (keyof Criteria)[]).reduce((a, k) => a + c[k], 0)
  const scale = sum > BUDGET ? BUDGET / sum : 1
  const eff = { ...c }
  for (const k of Object.keys(eff) as (keyof Criteria)[]) eff[k] = c[k] * scale
  return { eff, scale }
}
/** Pairs of criteria that pull in opposite directions (for the UI). */
export function conflicts(c: Criteria): string[] {
  const out: string[] = []
  if (c.space > 0.5 && c.comfort > 0.5) out.push('Free space and comfort pull sizes in opposite directions: sizes end up in the middle.')
  if (c.plan > 0.6 && (c.space > 0.6 || c.light > 0.8 || c.privacy > 0.8)) out.push('Following the plan competes with space / light / privacy: items may move away from where the plan draws them.')
  if (c.utilization > 0.6 && c.comfort > 0.6) out.push('Max functional use fills walls that comfort would keep free.')
  if (c.light > 0.8 && c.storage > 0.6) out.push('Storage wants long unbroken walls, light wants windows kept clear.')
  return out
}

/** Size list: start further down (smaller sizes) when "free space" outweighs "comfort". */
const sz = <T,>(l: T[]): T[] => l.slice(Math.min(l.length - 1, Math.round(Math.max(0, C.space + C.utilization * 0.6 - C.comfort) * (l.length - 1) * 0.6)))
const distToPoly = (p: V, poly: V[]) => {
  let best = Infinity
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t))
  })
  return best
}
const pull = (c: { x: number; z: number }, h?: V, t?: FType) => (h ? -dist([c.x, c.z], h) * 2 * (t && userPinned.has(t) ? 1.5 : t && !FIXED.includes(t) ? C.plan : 1) : 0)

const mk = (x: number, z: number, rot: number, w: number, d: number): OBB => ({
  c: [x, z], ax: [Math.cos(rot), -Math.sin(rot)], az: [Math.sin(rot), Math.cos(rot)], hx: w / 2, hz: d / 2,
})
const corners = (o: OBB): V[] => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as V[]).map(([a, b]) => [
  o.c[0] + o.ax[0] * o.hx * a + o.az[0] * o.hz * b, o.c[1] + o.ax[1] * o.hx * a + o.az[1] * o.hz * b,
])
const overlaps = (a: OBB, b: OBB, gap = 0) => {
  const dc: V = [b.c[0] - a.c[0], b.c[1] - a.c[1]]
  for (const u of [a.ax, a.az, b.ax, b.az]) {
    const ra = a.hx * Math.abs(dot(a.ax, u)) + a.hz * Math.abs(dot(a.az, u))
    const rb = b.hx * Math.abs(dot(b.ax, u)) + b.hz * Math.abs(dot(b.az, u))
    if (Math.abs(dot(dc, u)) >= ra + rb + gap - 0.004) return false
  }
  return true
}
const inPoly = (p: V, poly: V[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const signedArea = (p: V[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0) / 2

/** Wall boxes of custom walls + door / window zones of every wall. */
export function zones(all: Wall[], nodes: Record<string, Pt>) {
  const custom: OBB[] = [], doors: OBB[] = [], windows: OBB[] = [], entrances: V[] = []
  for (const w of all) {
    const A = toM(nodes[w.a]), B = toM(nodes[w.b])
    const L = dist(A, B)
    if (L < 0.01) continue
    const u: V = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], v: V = [-u[1], u[0]]
    const box = (from: number, to: number, hz: number): OBB => {
      const mid = (from + to) / 2
      return { c: [A[0] + u[0] * mid, A[1] + u[1] * mid], ax: u, az: v, hx: (to - from) / 2, hz }
    }
    if (w.custom) custom.push(box(0, L, w.thick / PX_PER_M / 2))
    for (const o of openingsOf(w, nodes)) {
      const a = (o.end === 'b' ? L * PX_PER_M - o.to : o.from) / PX_PER_M
      const b = (o.end === 'b' ? L * PX_PER_M - o.from : o.to) / PX_PER_M
      if (o.kind === 'door') {
        // Account for actual door opening side: full leaf swing on the swing side, minimal threshold clearance on the other side
        const sg = doorSwing(w, o, nodes)
        const ht = w.thick / PX_PER_M / 2
        const swingDepth = Math.max(0.55, Math.min(0.95, b - a))
        const backClear = 0.05
        const mid = (a + b) / 2
        const off = sg * (swingDepth - backClear) / 2
        const hz = ht + (swingDepth + backClear) / 2
        doors.push({ c: [A[0] + u[0] * mid + v[0] * off, A[1] + u[1] * mid + v[1] * off], ax: u, az: v, hx: (b - a) / 2 + 0.05, hz })
        if (w.thick / PX_PER_M >= 0.21) entrances.push([A[0] + u[0] * mid, A[1] + u[1] * mid]) // door in an exterior-thickness wall = flat entrance
      }
      else windows.push(box(a, b, 0.3))
    }
  }
  return { custom, doors, windows, entrances }
}

export function makeCtx(room: Room, nodes: Record<string, Pt>, all: Wall[], z: ReturnType<typeof zones>): Ctx {
  const poly = insetRoom(room, nodes).map(toM)
  const sgn = Math.sign(signedArea(poly)) || 1
  const edges: Edge[] = poly.map((P, i) => {
    const Q = poly[(i + 1) % poly.length]
    const L = dist(P, Q)
    const t: V = [(Q[0] - P[0]) / (L || 1), (Q[1] - P[1]) / (L || 1)]
    const w = all.find((q) => (q.a === room.nodes[i] && q.b === room.nodes[(i + 1) % poly.length]) || (q.b === room.nodes[i] && q.a === room.nodes[(i + 1) % poly.length]))
    const ops = w ? openingsOf(w, nodes) : []
    return { P, t, n: [-t[1] * sgn, t[0] * sgn], L, hasWindow: ops.some((o) => o.kind === 'window'), hasDoor: ops.some((o) => o.kind === 'door') }
  })
  return { id: room.id, poly, edges, walls: z.custom, doors: z.doors, windows: z.windows, entrances: z.entrances, placed: [], reserved: [], shelves: [], out: [] }
}

function valid(ctx: Ctx, o: OBB, h: number, ignore?: OBB[], soft = false) {
  for (const c of corners(o)) if (!inPoly(c, ctx.poly)) return false
  for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) {
    if (!inPoly([o.c[0] + o.ax[0] * o.hx * 2 * a + o.az[0] * o.hz * 2 * b, o.c[1] + o.ax[1] * o.hx * 2 * a + o.az[1] * o.hz * 2 * b], ctx.poly)) return false
  }
  for (const v of ctx.poly) { // reflex corners poking into the item
    const d: V = [v[0] - o.c[0], v[1] - o.c[1]]
    if (Math.abs(dot(d, o.ax)) < o.hx - 0.01 && Math.abs(dot(d, o.az)) < o.hz - 0.01) return false
  }
  for (const w of ctx.walls) if (overlaps(o, w)) return false
  if (!soft) for (const d of ctx.doors) if (overlaps(o, d)) return false
  if (!soft && h > (C.light > 0.5 ? 0.3 : 1.2)) for (const w of ctx.windows) if (overlaps(o, w)) return false
  for (const p of ctx.placed) if (!ignore?.includes(p.o) && overlaps(o, p.o, 0.03)) return false
  if (!soft) for (const r of ctx.reserved) if (overlaps(o, r)) return false
  if (!soft && h > 1.3) for (const s of ctx.shelves) if (overlaps(o, s)) return false // don't build tall items into a wall shelf
  return true
}

/** Wall-mounted shelf on the wall behind `host` (a candidate placed against that wall), at height y. */
function shelfAbove(ctx: Ctx, host: Cand, widths: number[], y: number) {
  const e = ctx.edges[host.edge], d = 0.25
  const [x, z] = edgePoint(e, host.s, d)
  for (const w of widths) {
    const o = mk(x, z, host.rot, w, d)
    const ok = corners(o).every((c) => inPoly(c, ctx.poly)) && !ctx.windows.some((q) => overlaps(o, q)) && !ctx.doors.some((q) => overlaps(o, q))
      && !ctx.walls.some((q) => overlaps(o, q)) && !ctx.placed.some((p) => p.h > y - 0.05 && overlaps(o, p.o, 0.02))
    if (!ok) continue
    ctx.shelves.push(o)
    ctx.out.push({ id: 'a' + ++counter, type: 'shelf', x, z, rot: host.rot, w, d, y })
    return true
  }
  return false
}

const edgePoint = (e: Edge, s: number, depth: number): V => [
  e.P[0] + e.t[0] * s + e.n[0] * (depth / 2 + GAP), e.P[1] + e.t[1] * s + e.n[1] * (depth / 2 + GAP),
]
const rotOf = (e: Edge) => Math.atan2(e.n[0], e.n[1])

function wallCands(ctx: Ctx, w: number, d: number): Cand[] {
  const out: Cand[] = []
  ctx.edges.forEach((e, i) => {
    const smin = w / 2 + GAP, smax = e.L - w / 2 - GAP
    if (smax < smin - 1e-6) return
    const ss: number[] = []
    for (let s = smin; s < smax; s += 0.05) ss.push(s)
    ss.push(smax)
    for (const s of ss) {
      const [x, z] = edgePoint(e, s, d)
      out.push({ x, z, rot: rotOf(e), edge: i, s, w, d, flushS: s - smin < 0.011, flushE: smax - s < 0.011 })
    }
  })
  return out
}

/** Best candidate against a wall for the first size (largest first) that fits anywhere. score() = null rejects. */
const DAYLIGHT: FType[] = ['desk', 'diningTable', 'armchair', 'chair']
const STORAGE_T: FType[] = ['wardrobe', 'bookcase', 'dresser', 'shoeCabinet']
const PRIVATE_T: FType[] = ['bed', 'nightstand', 'dresser', 'wardrobe']

/** Free distance (m, up to 1.5) in front of a wall-hugging candidate. */
function frontFree(ctx: Ctx, c: Cand): number {
  const e = ctx.edges[c.edge]
  for (let t = 0.1; t <= 1.5; t += 0.1) {
    const p: V = [c.x + e.n[0] * (c.d / 2 + t), c.z + e.n[1] * (c.d / 2 + t)]
    if (!inPoly(p, ctx.poly)) return t - 0.1
    for (const o of ctx.placed) {
      const d: V = [p[0] - o.o.c[0], p[1] - o.o.c[1]]
      if (Math.abs(dot(d, o.o.ax)) < o.o.hx && Math.abs(dot(d, o.o.az)) < o.o.hz) return t - 0.1
    }
  }
  return 1.5
}

/** One scoring model for every movable item: each criterion contributes the same way whatever the item is. */
function common(ctx: Ctx, type: FType, c: Cand, e: Edge): number {
  let s = 0
  const pos: V = [c.x, c.z]
  const winD = ctx.windows.length ? Math.min(...ctx.windows.map((w) => dist(pos, w.c))) : 9
  const entD = entrancePts.length ? Math.min(...entrancePts.map((p) => dist(pos, p))) : 4
  s += C.space * 0.8 * flush(c) + C.utilization * 0.5 * flush(c)                 // space / utilisation: hug walls and corners
  if (C.comfort > 0) s += C.comfort * 0.6 * frontFree(ctx, c)                      // comfort: room to use the item
  if (DAYLIGHT.includes(type)) s += C.light * Math.max(0, 2.5 - winD) * 0.6         // light: work / eat / sit by a window ...
  else if (winD < 0.9) s -= C.light * 1.0                                          // ... keep everything else off the glass
  if (STORAGE_T.includes(type)) s += C.storage * (c.w * 0.4 + e.L * 0.1 - (e.hasWindow ? 0.5 : 0)) // storage: wide, on long unbroken walls
  if (PRIVATE_T.includes(type)) s += C.privacy * 0.5 * Math.min(6, entD)           // privacy: sleeping / dressing away from the entrance
  if (type === 'desk' && kitchenPos) s += C.office * 0.4 * Math.min(6, dist(pos, kitchenPos)) // office: quiet corner away from the kitchen
  return s
}

function pickWall(ctx: Ctx, sizes: [number, number][], h: number, clear: number, score: (c: Cand, e: Edge) => number | null, near?: V, type?: FType): Cand | null {
  const run = (limit: boolean) => pickWallIn(ctx, sizes, h, clear, score, limit ? near : undefined, type)
  return (near && run(true)) || run(false)
}
function pickWallIn(ctx: Ctx, sizes: [number, number][], h: number, clear: number, score: (c: Cand, e: Edge) => number | null, near?: V, type?: FType): Cand | null {
  // without a hint: biggest size that fits anywhere. With a hint: the best trade-off between staying at the
  // drawn spot and keeping the full size (every shrink step costs 0.4 ≈ 20 cm of drift).
  let best: Cand | null = null, bs = -Infinity
  const pinned = !!type && userPinned.has(type)
  if (pinned && sizes.length) { // a pinned item may shrink well below its smallest standard size before we give up the pin
    const [lw, ld] = sizes[sizes.length - 1]
    sizes = [...sizes, ...[0.85, 0.7, 0.55].map((f) => [lw * f, Math.max(0.25, ld * (0.5 + 0.5 * f))] as [number, number])]
  }
  for (let si = 0; si < sizes.length; si++) {
    const [w, d] = sizes[si]
    let found = false
    for (const c of wallCands(ctx, w, d)) {
      if (near && dist([c.x, c.z], near) > NEAR) continue
      const o = mk(c.x, c.z, c.rot, w, d)
      if (!valid(ctx, o, h, undefined, pinned)) continue
      if (clear > 0 && !pinned) {
        const e = ctx.edges[c.edge]
        const cz = mk(c.x + e.n[0] * (d / 2 + clear / 2), c.z + e.n[1] * (d / 2 + clear / 2), c.rot, w * 0.9, clear)
        if (ctx.walls.some((q) => overlaps(cz, q)) || ctx.placed.some((q) => overlaps(cz, q.o))) continue
      }
      const sc0 = score(c, ctx.edges[c.edge])
      if (sc0 === null) continue
      const sc = sc0 + (type && !userPinned.has(type) ? common(ctx, type, c, ctx.edges[c.edge]) : 0)
      found = true
      const tot = near ? sc - si * 0.4 : sc
      if (tot > bs) { bs = tot; best = c }
    }
    if (found && !near) break
  }
  return best
}

let counter = 0
function add(ctx: Ctx, type: FType, x: number, z: number, rot: number, w: number, d: number, reserveClear = 0) {
  const o = mk(x, z, rot, w, d)
  ctx.placed.push({ o, h: CATALOG[type].h })
  ctx.out.push({ id: 'a' + ++counter, type, x, z, rot, w, d })
  if (reserveClear > 0) ctx.reserved.push(mk(x + o.az[0] * (d / 2 + reserveClear / 2), z + o.az[1] * (d / 2 + reserveClear / 2), rot, w, reserveClear))
}
const addCand = (ctx: Ctx, type: FType, c: Cand, reserveClear = 0) => add(ctx, type, c.x, c.z, c.rot, c.w, c.d, reserveClear)
const centroid = (p: V[]): V => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]
const flush = (c: Cand) => (c.flushS || c.flushE ? 1 : 0)
const doorDist = (ctx: Ctx, c: { x: number; z: number }) => (ctx.doors.length ? Math.min(...ctx.doors.map((d) => dist([c.x, c.z], d.c))) : 6)

type LivingOpts = { kitchen: boolean; sofa: boolean; dining: boolean }
function living(ctx: Ctx, opts: LivingOpts) {
  let kc = centroid(ctx.poly)
  // kitchen run = cabinets + fridge, along the best wall, with 90 cm free in front
  // base cabinets may stand under a window (h 0.9); upper cabinets are then left out (`low`)
  const k = !opts.kitchen ? null : pickWall(ctx, [3.2, 2.9, 2.6, 2.3, 2.0, 1.7].map((w) => [w, 0.65] as [number, number]), 0.25, 0.9,
    (c, e) => (hint('kitchen') ? pull(c, hint('kitchen'), 'kitchen') + flush(c) * 0.5 : e.L * 0.5 + flush(c) * 2) - (e.hasDoor ? 1.5 : 0), hint('kitchen'))
  if (k) {
    const e = ctx.edges[k.edge]
    const Wk = k.w - 0.62, s0 = k.s - k.w / 2
    const fridgeAtStart = !(k.flushE && !k.flushS)
    const sf = fridgeAtStart ? s0 + 0.31 : s0 + Wk + 0.01 + 0.31
    const sk = fridgeAtStart ? s0 + 0.62 + Wk / 2 : s0 + Wk / 2
    const pk = edgePoint(e, sk, 0.6), pf = edgePoint(e, sf, 0.65)
    add(ctx, 'kitchen', pk[0], pk[1], k.rot, Wk, 0.6)
    ctx.out[ctx.out.length - 1].low = ctx.windows.some((w) => overlaps(mk(k.x, k.z, k.rot, k.w, k.d), w))
    add(ctx, 'fridge', pf[0], pf[1], k.rot, 0.6, 0.65)
    ctx.reserved.push(mk(k.x + e.n[0] * (k.d / 2 + 0.45), k.z + e.n[1] * (k.d / 2 + 0.45), k.rot, k.w, 0.9))
    kc = [k.x, k.z]
  }

  if (userPinned.has('desk') && !deskDone && ctx.id === deskRoomId) placeDesk(ctx)
  let sofa = null as Cand | null
  let sofaType: FType = 'sofa'
  const stepSofa = () => {
    if (pinnedElsewhere(ctx, 'sofa')) return
    // sofa far from the kitchen, TV on the opposite wall, coffee table between
    const sofaScore = (c: Cand, e: Edge) => (hint('sofa') ? pull(c, hint('sofa'), 'sofa') : dist([c.x, c.z], kc) * 0.6) + e.L * 0.2 - (e.hasWindow ? 0.3 + C.light : 0) + flush(c) * C.space * 1.5
    sofa = !opts.sofa ? null : pickWall(ctx, sz<[number, number]>([...(C.comfort > 0.6 ? [[2.6, 1.0] as [number, number]] : []), [2.2, 0.95], [2.0, 0.9], [1.8, 0.9], [1.6, 0.85]]), 0.85, 0.5, sofaScore, hint('sofa'), 'sofa')
    if (opts.sofa && !sofa) { sofa = pickWall(ctx, [[0.85, 0.85], [0.75, 0.8]], 0.85, 0.5, sofaScore, undefined, 'armchair'); sofaType = 'armchair' } // no room for a sofa: switch type
    if (sofa) {
      const e = ctx.edges[sofa.edge]
      addCand(ctx, sofaType, sofa)
      shelfAbove(ctx, sofa, [Math.min(1.6, sofa.w - 0.2), 1.2, 0.8], 1.45)
      shelfAbove(ctx, sofa, [Math.min(1.2, sofa.w - 0.4), 0.8], 1.95)
      // TV opposite the sofa: unit (shrinking) -> unit with relaxed alignment -> wall-mounted TV (switch type)
      const tvScore = (relaxed: boolean) => (c: Cand, te: Edge) => {
        if (dot(te.n, e.n) > (relaxed ? -0.6 : -0.9)) return null
        const dv: V = [c.x - sofa!.x, c.z - sofa!.z]
        const dd = dot(dv, e.n), lat = Math.abs(dot(dv, e.t))
        if (dd < (relaxed ? 1.0 : 1.5) || dd > (relaxed ? 7 : 5.5) || lat > (relaxed ? 4 : 2.6)) return null
        return -lat - Math.abs(dd - 3) * 0.3 + pull(c, hint('tvUnit'), 'tvUnit')
      }
      const units = sz<[number, number]>([...(C.comfort > 0.6 ? [[2.2, 0.45] as [number, number]] : []), [1.8, 0.4], [1.5, 0.4], [1.2, 0.4], [1.0, 0.35]])
      if (pinnedElsewhere(ctx, 'tvUnit')) { /* TV pinned in another room */ } else {
    let tv = pickWall(ctx, units, 1.3, 0, tvScore(false), hint('tvUnit'), 'tvUnit')
      if (!tv) tv = pickWall(ctx, units, 1.3, 0, tvScore(true), undefined, 'tvUnit')
      if (tv) { addCand(ctx, 'tvUnit', tv); if (C.storage > 0.4) shelfAbove(ctx, tv, [Math.min(1.4, tv.w), 0.9], 1.75) }
      else {
        const wt = pickWall(ctx, [[1.25, 0.06], [0.95, 0.06], [0.75, 0.06]], 1.6, 0, tvScore(true))
        if (wt) { addCand(ctx, 'tv', wt); const o = ctx.out[ctx.out.length - 1]; o.y = 0.9; o.h = wt.w * 0.58 }
      }
      }
      for (const [w, d] of C.space > 0.6 && C.comfort < 0.4 ? [] : sz([[1.0, 0.6], [0.9, 0.55], [0.8, 0.5]])) {
        const o = 0.35 + d / 2 + sofa.d / 2
        const x = sofa.x + e.n[0] * o, z = sofa.z + e.n[1] * o
        if (valid(ctx, mk(x, z, sofa.rot, w, d), 0.4)) { add(ctx, 'coffeeTable', x, z, sofa.rot, w, d); ctx.out[ctx.out.length - 1].group = ctx.out.find((q) => q.type === 'sofa' || q.type === 'armchair')?.id; break }
      }
    }
  }

  const stepDining = () => {
    if (pinnedElsewhere(ctx, 'diningTable')) return
    // dining table with chairs: free-standing, as close to the kitchen as possible
    const bb = { x0: Math.min(...ctx.poly.map((p) => p[0])), x1: Math.max(...ctx.poly.map((p) => p[0])), z0: Math.min(...ctx.poly.map((p) => p[1])), z1: Math.max(...ctx.poly.map((p) => p[1])) }
    const dsizes = sz<[number, number, string]>([...(C.comfort > 0.6 ? [[1.8, 0.9, ''] as [number, number, string]] : []), [1.4, 0.8, ''], [1.2, 0.75, ''], [1.0, 0.7, ''], [0.8, 0.8, ''], [0.9, 0.9, 'round'], ...(userPinned.has('diningTable') ? [[0.7, 0.7, 'round'] as [number, number, string]] : [])])
    let diningDone = false
    // first pass keeps the room walkable; if no size manages that, still place the best-scoring table (a table beats no table)
    for (const strict of [true, false]) for (const [tw, td, dstyle] of opts.dining && !diningDone ? dsizes : []) {
      let best: { x: number; z: number; rot: number } | null = null
      const cands: { x: number; z: number; rot: number; sc: number }[] = []
      for (const rot of alignedRots(ctx)) for (let x = bb.x0; x <= bb.x1; x += 0.1) for (let z = bb.z0; z <= bb.z1; z += 0.1) {
        if (!valid(ctx, mk(x, z, rot, tw + 0.04, td + 1.0), 0.9, undefined, userPinned.has('diningTable'))) continue
        const wl = ctx.windows.length ? Math.min(...ctx.windows.map((w) => dist([x, z], w.c))) : 9
        const sc = -dist([x, z], hint('diningTable') ?? kc) * (userPinned.has('diningTable') ? 2 : C.plan >= 0.35 && hint('diningTable') ? 1 : 0.6) + C.light * Math.max(0, 3 - wl) * 0.8
        cands.push({ x, z, rot, sc })
      }
      // best-scoring spot that still leaves a walkable route between the doors
      cands.sort((a, b) => b.sc - a.sc)
      const base = reach(ctx)
      for (const c of strict ? cands.slice(0, 40) : cands.slice(0, 1)) {
        const r = strict ? reach(ctx, [mk(c.x, c.z, c.rot, tw + 0.04, td + 1.0)]) : base
        if (!strict || ((!base.ok || r.ok) && r.size >= base.size * 0.85)) { best = { x: c.x, z: c.z, rot: c.rot }; break }
      }
      if (!best) continue
      const o = mk(best.x, best.z, best.rot, tw, td)
      const chairs: { x: number; z: number; rot: number }[] = []
      for (const side of [1, -1]) for (const ps of tw >= 1.2 ? [-tw / 4, tw / 4] : [0]) {
        const x = o.c[0] + o.ax[0] * ps + o.az[0] * side * (td / 2 + 0.2), z = o.c[1] + o.ax[1] * ps + o.az[1] * side * (td / 2 + 0.2)
        const rot = best.rot + (side > 0 ? Math.PI : 0)
        if (valid(ctx, mk(x, z, rot, 0.45, 0.5), 0.9)) chairs.push({ x, z, rot })
      }
      const c0 = ctx.out.length
      for (const c of chairs) add(ctx, 'chair', c.x, c.z, c.rot, 0.45, 0.5)
      add(ctx, 'diningTable', best.x, best.z, best.rot, tw, td)
      if (dstyle) ctx.out[ctx.out.length - 1].style = dstyle
      const tid = ctx.out[ctx.out.length - 1].id
      for (let i = c0; i < ctx.out.length - 1; i++) ctx.out[i].group = tid // chairs belong to their table
      diningDone = true
      break
    }
  }

  // a pinned dining table is placed before the sofa group so the pin gets the spot
  if (userPinned.has('diningTable') && !userPinned.has('sofa')) { stepDining(); stepSofa() } else { stepSofa(); stepDining() }

  // criteria extras
  if (sofa && sofaType === 'sofa' && C.comfort > 0.4 && C.space < 0.7) {
    const ar = pickWall(ctx, [[0.85, 0.85], [0.75, 0.8]], 0.85, 0.4, (c) => -dist([c.x, c.z], [sofa!.x, sofa!.z]) * 0.8 - (ctx.edges[c.edge].hasWindow ? C.light : 0), undefined, 'armchair')
    if (ar && dist([ar.x, ar.z], [sofa.x, sofa.z]) < 4.5) addCand(ctx, 'armchair', ar)
  }
  if (wantDesk() && !deskDone && ctx.id === deskRoomId) placeDesk(ctx)
  if (C.storage > 0.5) {
    const wd2 = pickWall(ctx, [[1.2, 0.6], [0.9, 0.6]], 2.4, 0.7, (c) => flush(c) + dist([c.x, c.z], kc) * 0.3 - (ctx.edges[c.edge].hasDoor ? 0.5 : 0), undefined, 'wardrobe')
    if (wd2) addCand(ctx, 'wardrobe', wd2)
  }
}

function placeDesk(ctx: Ctx): boolean {
  const desk = pickWall(ctx, [...sz<[number, number]>([[1.4, 0.65], [1.2, 0.6], [1.0, 0.6]]), [0.8, 0.5]], 0.75, 0.55, // a compact desk is better than none
    (c, e) => e.L * 0.3 + (e.hasWindow ? 1 + C.light * 2 : 0) + flush(c) * 0.5 - (e.hasDoor ? 1 : 0) + pull(c, hint('desk'), 'desk'), hint('desk'), 'desk')
  if (!desk) return false
  const e = ctx.edges[desk.edge]
  const cx = desk.x + e.n[0] * (desk.d / 2 + 0.28), cz = desk.z + e.n[1] * (desk.d / 2 + 0.28)
  addCand(ctx, 'desk', desk)
  const did = ctx.out[ctx.out.length - 1].id
  if (valid(ctx, mk(cx, cz, desk.rot + Math.PI, 0.45, 0.5), 0.9)) { add(ctx, 'chair', cx, cz, desk.rot + Math.PI, 0.45, 0.5); ctx.out[ctx.out.length - 1].group = did }
  shelfAbove(ctx, desk, [Math.min(1.4, desk.w), 0.9], 1.4)
  deskDone = true
  return true
}

/** Table orientations parallel / perpendicular to the room's own walls (so the dining set lines up with the architecture). */
function alignedRots(ctx: Ctx): number[] {
  const out: number[] = []
  for (const e of ctx.edges) for (const r of [rotOf(e), rotOf(e) + Math.PI / 2]) {
    const m = ((r % Math.PI) + Math.PI) % Math.PI
    if (!out.some((q) => Math.abs(q - m) < 0.05 || Math.abs(Math.abs(q - m) - Math.PI) < 0.05)) out.push(m)
  }
  return out.slice(0, 6)
}

function office(ctx: Ctx) {
  placeDesk(ctx)
  const wd = pickWall(ctx, [[1.2, 0.6], [0.9, 0.6]], 2.4, 0.7, (c) => flush(c) + pull(c, hint('wardrobe'), 'wardrobe'), hint('wardrobe'), 'wardrobe')
  if (wd) addCand(ctx, 'wardrobe', wd)
}

const BED_NS: [number, number][] = [[0.45, 0.4], [0.4, 0.35]]
const nsSpot = (ctx: Ctx, c: Cand, side: number, w: number, d: number): V => edgePoint(ctx.edges[c.edge], c.s + side * (c.w / 2 + 0.02 + w / 2), d)

function placeBed(ctx: Ctx): Cand | null {
  const bed = pickWall(ctx, [...sz<[number, number]>([...(C.comfort > 0.6 ? [[1.8, 2.0] as [number, number]] : []), [1.6, 2.0], [1.4, 2.0]]), [1.2, 2.0], [0.9, 2.0]], 1.0, 0.5, (c, e) => {
    let sides = 0
    for (const side of [1, -1]) {
      const [w, d] = BED_NS[0], p = nsSpot(ctx, c, side, w, d)
      if (valid(ctx, mk(p[0], p[1], c.rot, w, d), 0.5, [])) sides++
    }
    return e.L * 0.3 + sides * 1.5 - (e.hasWindow ? 1.5 + C.light : 0) - (e.hasDoor ? 1 : 0) - Math.abs(c.s - e.L / 2) * 0.3 + pull(c, hint('bed'), 'bed') + C.privacy * 0.6 * Math.min(6, doorDist(ctx, c))
  }, hint('bed'), 'bed')
  if (!bed) return null
  // nightstands first need the bed's footprint to be free, so check them before the bed is committed
  const stands: { x: number; z: number; w: number; d: number }[] = []
  for (const side of [1, -1]) for (const [w, d] of BED_NS) {
    const p = nsSpot(ctx, bed, side, w, d)
    if (valid(ctx, mk(p[0], p[1], bed.rot, w, d), 0.5)) { stands.push({ x: p[0], z: p[1], w, d }); break }
  }
  addCand(ctx, 'bed', bed)
  const bedId = ctx.out[ctx.out.length - 1].id
  shelfAbove(ctx, bed, [Math.min(1.4, bed.w), 0.9], 1.6)
  for (const st of stands) { add(ctx, 'nightstand', st.x, st.z, bed.rot, st.w, st.d); ctx.out[ctx.out.length - 1].group = bedId }
  return bed
}

function placeWardrobe(ctx: Ctx, bed: Cand | null) {
  const wlist = [2.4, 2.1, 1.8, 1.5, 1.2, 0.9].map((w) => [w, 0.6] as [number, number])
  const wd = pickWall(ctx, C.storage > 0.5 ? wlist : sz(wlist), 2.4, 0.7,
    (c, e) => (bed && c.edge !== bed.edge ? 1 : 0) + flush(c) * (1.5 + C.space) + c.w * (0.3 + C.storage * 0.6) - (e.hasDoor ? 0.5 : 0) + pull(c, hint('wardrobe'), 'wardrobe'), hint('wardrobe'), 'wardrobe')
  if (wd) addCand(ctx, 'wardrobe', wd)
}

function bedroom(ctx: Ctx) {
  let bed = null as Cand | null
  const stepBed = () => { if (!pinnedElsewhere(ctx, 'bed')) bed = placeBed(ctx) }
  const stepWardrobe = () => placeWardrobe(ctx, bed)
  const stepDesk = () => { if (wantDesk() && !deskDone && ctx.id === deskRoomId) placeDesk(ctx) }
  // everything the user pinned is placed first (so the pin gets its spot), the rest adapts around it
  const steps: [FType, () => void][] = [['bed', stepBed], ['wardrobe', stepWardrobe], ['desk', stepDesk]]
  steps.sort((a, b) => Number(userPinned.has(b[0])) - Number(userPinned.has(a[0])))
  for (const [, run] of steps) run()
}

/** Whatever the user pinned in THIS room is placed here even if the room's function wouldn't normally hold it (a bed pinned in the living room, a sofa in the bedroom ...). */
function forcePinned(ctx: Ctx) {
  const has = (...t: FType[]) => ctx.out.some((q) => t.includes(q.type))
  if (pinnedHere(ctx, 'bed') && !has('bed')) placeBed(ctx)
  if ((pinnedHere(ctx, 'sofa') || pinnedHere(ctx, 'tvUnit')) && !has('sofa', 'armchair')) living(ctx, { kitchen: false, sofa: true, dining: false })
  if (pinnedHere(ctx, 'diningTable') && !has('diningTable')) living(ctx, { kitchen: false, sofa: false, dining: true })
  if (pinnedHere(ctx, 'wardrobe') && !has('wardrobe')) placeWardrobe(ctx, null)
  if (pinnedHere(ctx, 'desk') && !deskDone) placeDesk(ctx)
}

function bath(room: Ctx) {
  const run = (useTub: boolean) => {
    const ctx: Ctx = { ...room, placed: [], reserved: [], shelves: [], out: [] }
    const mh = useTub ? hint('bathtub') : hint('shower')
    const main = useTub
      ? pickWall(ctx, [[1.7, 0.75], [1.6, 0.7], [1.5, 0.7]], 0.55, 0.5, (c, e) => e.L * 0.5 + flush(c) * 2 - (e.hasDoor ? 2 : 0) + pull(c, mh), mh)
      : pickWall(ctx, [[0.9, 0.9], [0.8, 0.8]], 2.0, 0.5, (c, e) => flush(c) * 3 - (e.hasDoor ? 2 : 0) + pull(c, mh), mh)
    if (main) addCand(ctx, useTub ? 'bathtub' : 'shower', main)
    const wc = pickWall(ctx, [[0.4, 0.7], [0.4, 0.6]], 0.8, 0.55, (c, e) => flush(c) * 1 - (e.hasDoor ? 1 : 0) + (main && c.edge !== main.edge ? 0.5 : 0) + pull(c, hint('wc'), 'wc'), hint('wc'))
    if (wc) { addCand(ctx, 'wc', wc, 0.55); shelfAbove(ctx, wc, [0.6, 0.4], 1.5) }
    const vn = pickWall(ctx, [0.8, 0.7, 0.6, 0.5].map((w) => [w, 0.5] as [number, number]), 0.85, 0.5, (c) => flush(c) * 1 + pull(c, hint('vanity'), 'vanity'), hint('vanity'))
    if (vn) addCand(ctx, 'vanity', vn)
    const wm = pickWall(ctx, [[0.6, 0.6], [0.6, 0.55]], 0.85, 0.5, (c) => flush(c) * 1 + pull(c, hint('washer'), 'washer'), hint('washer'))
    if (wm) addCand(ctx, 'washer', wm)
    return ctx.out
  }
  const commit = (items: Furn[]) => {
    for (const f of items) {
      room.out.push(f)
      const { w, d, h } = sizeOf(f), o = mk(f.x, f.z, f.rot, w, d)
      room.placed.push({ o, h })
      if (f.type === 'wc') room.reserved.push(mk(f.x + o.az[0] * (d / 2 + 0.275), f.z + o.az[1] * (d / 2 + 0.275), f.rot, w, 0.55))
    }
  }
  if (hint('bathtub') && !hint('shower')) commit(run(true))
  else if (hint('shower') && !hint('bathtub')) commit(run(false))
  else {
    const a = run(true), b = run(false)
    commit(b.length > a.length ? b : a)
  }
}


// ───────── circulation: keep a 60 cm wide path between all doors of a room ─────────
const STEP = 0.12, HALF_PASS = 0.3
export function reach(ctx: Ctx, extra: OBB[] = []): { ok: boolean; size: number } {
  const xs = ctx.poly.map((p) => p[0]), zs = ctx.poly.map((p) => p[1])
  const x0 = Math.min(...xs), z0 = Math.min(...zs)
  const nx = Math.ceil((Math.max(...xs) - x0) / STEP) + 1, nz = Math.ceil((Math.max(...zs) - z0) / STEP) + 1
  const blockers = [...ctx.placed.map((p) => p.o), ...ctx.walls, ...extra]
  const free = new Uint8Array(nx * nz)
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const p: V = [x0 + i * STEP, z0 + j * STEP]
    if (!inPoly(p, ctx.poly) || distToPoly(p, ctx.poly) < 0.08) continue
    let hit = false
    for (const o of blockers) {
      const d: V = [p[0] - o.c[0], p[1] - o.c[1]]
      if (Math.abs(dot(d, o.ax)) < o.hx + HALF_PASS && Math.abs(dot(d, o.az)) < o.hz + HALF_PASS) { hit = true; break }
    }
    if (!hit) free[i * nz + j] = 1
  }
  // door cells: nearest free cell within 0.9 m of each door centre that belongs to this room
  const targets: number[] = []
  for (const d of ctx.doors) {
    if (distToPoly(d.c, ctx.poly) > 0.8) continue
    let best = -1, bd = 0.9
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (!free[i * nz + j]) continue
      const dd = Math.hypot(x0 + i * STEP - d.c[0], z0 + j * STEP - d.c[1])
      if (dd < bd) { bd = dd; best = i * nz + j }
    }
    if (best >= 0) targets.push(best)
  }
  const comp = new Int32Array(nx * nz).fill(-1)
  const sizes: number[] = []
  for (let k = 0; k < nx * nz; k++) {
    if (!free[k] || comp[k] >= 0) continue
    const id = sizes.length; let n = 0; const stack = [k]; comp[k] = id
    while (stack.length) {
      const q = stack.pop()!; n++
      const i = Math.floor(q / nz), j = q % nz
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue
        const r = a * nz + b
        if (free[r] && comp[r] < 0) { comp[r] = id; stack.push(r) }
      }
    }
    sizes.push(n)
  }
  const ids = new Set(targets.map((t) => comp[t]))
  const main = targets.length ? comp[targets[0]] : sizes.indexOf(Math.max(0, ...sizes))
  return { ok: ids.size <= 1, size: sizes[main] ?? 0 }
}

/** Like pickWall, but only accepts spots that keep the room walkable (all doors still connected, >=88% of the free floor reachable). */
function pickConn(ctx: Ctx, sizes: [number, number][], h: number, clear: number, score: (c: Cand, e: Edge) => number | null, type?: FType): Cand | null {
  const base = reach(ctx)
  for (const [w, d] of sizes) {
    const list: { c: Cand; sc: number }[] = []
    for (const c of wallCands(ctx, w, d)) {
      if (!valid(ctx, mk(c.x, c.z, c.rot, w, d), h)) continue
      if (clear > 0) {
        const e = ctx.edges[c.edge]
        const cz = mk(c.x + e.n[0] * (d / 2 + clear / 2), c.z + e.n[1] * (d / 2 + clear / 2), c.rot, w * 0.9, clear)
        if (ctx.walls.some((q) => overlaps(cz, q)) || ctx.placed.some((q) => overlaps(cz, q.o))) continue
      }
      const sc0 = score(c, ctx.edges[c.edge])
      if (sc0 !== null) list.push({ c, sc: sc0 + (type && !userPinned.has(type) ? common(ctx, type, c, ctx.edges[c.edge]) : 0) })
    }
    list.sort((a, b) => b.sc - a.sc)
    for (const { c } of list.slice(0, 25)) {
      const r = reach(ctx, [mk(c.x, c.z, c.rot, w, d)])
      if ((!base.ok || r.ok) && r.size >= base.size * 0.88) return c
    }
  }
  return null
}

/** Run a placement; undo it if it makes the room harder to walk through. */
function keepIfWalkable(ctx: Ctx, fn: () => unknown) {
  const base = reach(ctx), n = { p: ctx.placed.length, o: ctx.out.length, r: ctx.reserved.length, s: ctx.shelves.length }
  const dd = deskDone
  fn()
  const r = reach(ctx)
  if ((base.ok && !r.ok) || r.size < base.size * 0.88) {
    ctx.placed.length = n.p; ctx.out.length = n.o; ctx.reserved.length = n.r; ctx.shelves.length = n.s; deskDone = dd
  }
}

/** "Functional use of space": after the main layout, fill free wall space with useful items without blocking walking paths. */
function fill(ctx: Ctx, kind: RoomKind) {
  const force = kind === 'storage'
  const u = C.utilization
  if (u <= 0.3 && !force) return
  const has = (t: FType) => ctx.out.some((q) => q.type === t)
  const count = (t: FType) => ctx.out.filter((q) => q.type === t).length
  const place = (type: FType, sizes: [number, number][], h: number, clear: number, score: (c: Cand, e: Edge) => number | null) => {
    const c = pickConn(ctx, sizes, h, clear, score, type)
    if (c) addCand(ctx, type, c)
    return c
  }
  const maxBook = 1 + Math.round(u * 2)
  const bookScore = (c: Cand, e: Edge) => e.L * 0.2 + flush(c) - (e.hasDoor ? 0.5 : 0)
  if (kind === 'open' || kind === 'living' || kind === 'kitchen') {
    if (ctx.entrances.length && !has('shoeCabinet')) {
      place('shoeCabinet', [[0.9, 0.3], [0.7, 0.3]], 1.2, 0.5, (c) => {
        const dd = Math.min(...ctx.entrances.map((p) => dist([c.x, c.z], p)))
        return dd > 3.5 ? null : -dd + flush(c) * 0.3
      })
    }
    while (count('bookcase') < maxBook && place('bookcase', [[0.8, 0.3], [0.6, 0.3], [0.4, 0.3]], 2.0, 0.6, bookScore)) { /* keep filling */ }
    if (kind !== 'kitchen' && !has('armchair')) {
      const sofa = ctx.out.find((q) => q.type === 'sofa')
      place('armchair', [[0.85, 0.85], [0.75, 0.8]], 0.85, 0.4, (c) => (sofa ? -dist([c.x, c.z], [sofa.x, sofa.z]) : 0))
    }
    if (u > 0.6 && !deskDone && ctx.id === deskRoomId) keepIfWalkable(ctx, () => placeDesk(ctx))
  } else if (kind === 'bedroom') {
    place('dresser', [[1.2, 0.45], [1.0, 0.45], [0.8, 0.4]], 0.85, 0.6, bookScore)
    while (count('bookcase') < Math.max(1, maxBook - 1) && place('bookcase', [[0.8, 0.3], [0.6, 0.3], [0.4, 0.3]], 2.0, 0.6, bookScore)) { /* keep filling */ }
    if (u > 0.6 && !deskDone && ctx.id === deskRoomId) keepIfWalkable(ctx, () => placeDesk(ctx))
  } else if (kind === 'bath') {
    if (place('bookcase', [[0.4, 0.3]], 1.8, 0.6, (c) => flush(c))) ctx.out[ctx.out.length - 1].h = 1.8 // tall bathroom cabinet
  } else if (kind === 'storage') {
    while (count('bookcase') < 3 && place('bookcase', [[1.2, 0.35], [0.8, 0.3], [0.6, 0.3]], 2.0, 0.6, bookScore)) { /* keep filling */ }
  } else if (kind === 'office') {
    while (count('bookcase') < maxBook && place('bookcase', [[0.8, 0.3], [0.6, 0.3]], 2.0, 0.6, bookScore)) { /* keep filling */ }
  }
}

/** Numbers behind a layout: how much floor is used, storage volume, seats, beds, desks, and whether every room stays walkable. */
export function analyze(furn: Furn[], nodes: Record<string, Pt>, customWalls: Wall[]) {
  const all = [...baseWalls, ...customWalls], z = zones(all, nodes)
  let net = 0, used = 0, storage = 0, seats = 0, sleeps = 0, desks = 0
  const blocked: string[] = []
  for (const r of rooms) if (!r.skip) net += areaM2(insetRoom(r, nodes))
  for (const f of furn) {
    const { w, d, h } = sizeOf(f)
    if ((f.y ?? 0) < 0.3 && f.type !== 'tv') used += w * d
    if (['wardrobe', 'bookcase', 'dresser', 'shoeCabinet'].includes(f.type)) storage += w * d * h * 0.8
    if (f.type === 'kitchen') storage += w * d * (f.low ? 0.9 : 2.1) * 0.7
    if (f.type === 'sofa') seats += Math.max(1, Math.floor(w / 0.7))
    if (f.type === 'armchair' || f.type === 'chair') seats += 1
    if (f.type === 'bed') sleeps += w >= 1.4 ? 2 : 1
    if (f.type === 'desk') desks += 1
  }
  for (const r of rooms) {
    if (r.skip) continue
    const ctx = makeCtx(r, nodes, all, z)
    if (ctx.doors.filter((d) => distToPoly(d.c, ctx.poly) <= 0.8).length < 2) continue
    for (const f of furn) {
      if ((f.y ?? 0) >= 0.3 || !inPoly([f.x, f.z], ctx.poly)) continue
      const s = sizeOf(f)
      ctx.placed.push({ o: mk(f.x, f.z, f.rot, s.w, s.d), h: s.h })
    }
    if (!reach(ctx).ok) blocked.push(r.name)
  }
  return { usedPct: net ? (used / net) * 100 : 0, storageM3: storage, seats, sleeps, desks, blocked }
}

export type RoomKind = 'open' | 'living' | 'kitchen' | 'bedroom' | 'bath' | 'office' | 'storage' | 'none'
export const defaultKind = (r: Room): RoomKind => {
  const n = r.name.toLowerCase()
  if (r.skip) return 'none'
  if (n.includes('bedroom')) return 'bedroom'
  if (n.includes('bath') || n.includes('wc') || n.includes('toilet')) return 'bath'
  if (n.includes('kitchen') && n.includes('living')) return 'open'
  if (n.includes('living')) return 'living'
  if (n.includes('kitchen')) return 'kitchen'
  if (n.includes('office') || n.includes('study')) return 'office'
  if (n.includes('storage') || n.includes('pantry')) return 'storage'
  return 'none'
}

export type FurnishOpts = { kinds?: Record<string, RoomKind>; hints?: Partial<Record<FType, Pt>>; only?: string; criteria?: Criteria }

export function autoFurnish(nodes: Record<string, Pt>, customWalls: Wall[], opts: FurnishOpts = {}): Furn[] {
  const all = [...baseWalls, ...customWalls]
  const z = zones(all, nodes)
  const out: Furn[] = []
  C = balanced(opts.criteria ?? DEFAULT_CRITERIA).eff
  userPinned = new Set((Object.keys(opts.hints ?? {}) as FType[]).filter((t) => !FIXED.includes(t)))
  pinRoom = {}
  const merged = { ...(flat?.hints ?? {}), ...(opts.hints ?? {}) } as Partial<Record<FType, Pt>>
  for (const t of FIXED) { if (flat?.hints?.[t]) merged[t] = flat.hints[t]; else delete merged[t] } // plumbing can't move: pins never apply to kitchen / bathroom fixtures
  for (const t of userPinned) {
    const v = merged[t] ? toM(merged[t]!) : null
    const hit = v && rooms.find((r) => inPoly(v, insetRoom(r, nodes).map(toM)))
    if (hit) pinRoom[t] = hit.id
  }
  deskDone = false
  entrancePts = z.entrances
  kitchenPos = flat?.hints?.kitchen ? toM(flat.hints.kitchen) : null
  const kindFor = (r: Room): RoomKind => {
    const k = opts.kinds?.[r.id] ?? defaultKind(r)
    return k === 'none' && r.name.toLowerCase().includes('loggia') && C.utilization > 0.5 ? 'storage' : k
  }
  // one desk for the whole flat: in the room with the most daylight, far from the kitchen (coordinated across rooms)
  deskRoomId = ''
  const ranked: { r: Room; sc: number }[] = []
  for (const r of rooms) {
    const kd = kindFor(r)
    if (!['bedroom', 'open', 'living', 'office'].includes(kd)) continue
    const cx = makeCtx(r, nodes, all, z)
    if (areaM2(insetRoom(r, nodes)) < 7) continue
    const wins = cx.windows.filter((w) => distToPoly(w.c, cx.poly) < 0.6).length
    const cen = centroid(cx.poly)
    const sc = C.light * wins + 0.25 * (kitchenPos ? dist(cen, kitchenPos) : 0) + (kd === 'office' ? 2 : 0) + (kd === 'bedroom' ? 0.3 : 0) - (kd === 'open' ? 0.2 : 0)
    ranked.push({ r, sc })
  }
  ranked.sort((a, b) => b.sc - a.sc)
  deskRoomId = ranked[0]?.r.id ?? ''
  if (userPinned.has('desk') && merged.desk) { // a pinned desk goes into the room that holds the pin
    const v = toM(merged.desk)
    const hit = ranked.find(({ r }) => inPoly(v, insetRoom(r, nodes).map(toM)))
    if (hit) deskRoomId = hit.r.id
  }
  for (const r of rooms) {
    if (opts.only && r.id !== opts.only) continue
    const kind = kindFor(r) // (max utilisation also puts storage on the loggia)
    const hasPins = [...userPinned].some((t) => pinRoom[t] === r.id)
    if (kind === 'none' && !hasPins) continue
    const build = () => {
      const c = makeCtx(r, nodes, all, z)
      curHints = {}
      for (const [t, p] of Object.entries(merged)) {
        const v = toM(p as Pt)
        if (inPoly(v, c.poly) || distToPoly(v, c.poly) < 0.6) curHints[t as FType] = v
      }
      return c
    }
    const livingOpts: Record<string, LivingOpts> = { open: { kitchen: true, sofa: true, dining: true }, living: { kitchen: false, sofa: true, dining: false }, kitchen: { kitchen: true, sofa: false, dining: true } }
    let ctx = build()
    if (livingOpts[kind]) {
      living(ctx, livingOpts[kind])
      // coordination between items: a bigger sofa / TV must not squeeze the dining table, so comfort sizes are capped when that happens
      if (C.comfort > 0.6 && ctx.out.some((q) => q.type === 'diningTable' && (q.w ?? 9) < 1.2)) {
        const prev = C
        C = { ...C, comfort: 0.6 }
        ctx = build()
        living(ctx, livingOpts[kind])
        C = prev
      }
    }
    else if (kind === 'bedroom') bedroom(ctx)
    else if (kind === 'office') office(ctx)
    else if (kind === 'bath') { const prev = C; C = { ...C, light: 0 }; bath(ctx); C = prev } // bathroom fixtures stay put even if they sit by a window
    if (kind !== 'bath') forcePinned(ctx)
    fill(ctx, kind)
    out.push(...ctx.out)
  }
  // the preferred room had no space for the desk: try the other rooms in order of preference
  if (!opts.only && !deskDone && (wantDesk() || (C.utilization > 0.6 && C.office > 0.2))) {
    for (const { r } of ranked) {
      if (r.id === deskRoomId) continue
      const ctx = makeCtx(r, nodes, all, z)
      for (const f of out) {
        const sz2 = sizeOf(f), o = mk(f.x, f.z, f.rot, sz2.w, sz2.d)
        if (!inPoly([f.x, f.z], ctx.poly)) continue
        if ((f.y ?? 0) > 0.3) ctx.shelves.push(o); else ctx.placed.push({ o, h: sz2.h })
      }
      curHints = {}
      if (!reach(ctx).ok) continue
      keepIfWalkable(ctx, () => placeDesk(ctx))
      if (deskDone) { out.push(...ctx.out); break }
    }
  }
  curHints = {}
  C = DEFAULT_CRITERIA
  entrancePts = []
  userPinned = new Set()
  pinRoom = {}
  return out
}

/** Rooms whose function is fixed by the building: wet rooms and the room holding the kitchen. null = free choice. */
export function allowedKinds(r: Room, nodes: Record<string, Pt>): RoomKind[] | null {
  if (defaultKind(r) === 'bath') return ['bath']
  const k = flat?.hints?.kitchen
  if (k) {
    const poly = insetRoom(r, nodes).map(toM), p = toM(k)
    if (inPoly(p, poly) || distToPoly(p, poly) < 0.6) return ['open', 'kitchen']
  }
  return null
}

/** Is the item's centre inside the clear outline of this room? */
export function inRoom(f: Furn, roomId: string, nodes: Record<string, Pt>): boolean {
  const r = rooms.find((q) => q.id === roomId)
  return !!r && inPoly([f.x, f.z], insetRoom(r, nodes).map(toM))
}

/** Why a piece of furniture is a problem (null = fine): outside the rooms, through a wall, in front of a window / door, overlapping another item. */
export function misplacedReason(f: Furn, nodes: Record<string, Pt>, customWalls: Wall[], others: Furn[] = []): string | null {
  const { w, d, h } = sizeOf(f)
  const y0 = f.y ?? 0
  const o = mk(f.x, f.z, f.rot, w, d)
  const cs = corners(o)
  const fits = rooms.some((r) => {
    const poly = insetRoom(r, nodes).map(toM)
    return cs.every((c) => inPoly(c, poly))
  })
  if (!fits) return 'sticks out of the room / into a wall'
  const z = zones([...baseWalls, ...customWalls], nodes)
  if (z.custom.some((q) => overlaps(o, q))) return 'goes through a wall you added'
  if (y0 < 2.0 && f.type !== 'rug' && z.doors.some((q) => overlaps(o, q))) return 'blocks a door'
  if (y0 + h > 1.2 && f.type !== 'shower' && f.type !== 'rug' && !(f.type === 'kitchen' && f.low) && z.windows.some((q) => overlaps(o, q))) return 'stands in front of a window'
  for (const g of others) {
    if (g.id === f.id) continue
    if (f.type === 'rug' || g.type === 'rug') continue
    if ((f.type === 'chair' && g.type === 'diningTable') || (g.type === 'chair' && f.type === 'diningTable')) continue
    const gs = sizeOf(g), gy = g.y ?? 0
    if (y0 >= gy + gs.h - 0.02 || gy >= y0 + h - 0.02) continue // stacked / mounted at different heights
    if (overlaps(o, mk(g.x, g.z, g.rot, gs.w, gs.d), -0.01)) return 'overlaps ' + CATALOG[g.type].label.toLowerCase()
  }
  // dependants only make sense next to what they belong to
  if (f.type === 'chair') {
    const near = nearest(f, others.filter((g) => g.type === 'diningTable' || g.type === 'desk'))
    if (!near || near.d > 0.5) return 'a chair with no table or desk'
    if (near.face < 0.3) return 'a chair that does not face its table'
  }
  if (f.type === 'nightstand') {
    const near = nearest(f, others.filter((g) => g.type === 'bed'))
    if (!near || near.d > 0.9) return 'a nightstand with no bed next to it'
  }
  return null
}

/** Nearest item of a list: distance from f's centre to its outline, and how directly f faces it (1 = straight at it). */
function nearest(f: Furn, list: Furn[]): { g: Furn; d: number; face: number } | null {
  let best: { g: Furn; d: number; face: number } | null = null
  for (const g of list) {
    const s = sizeOf(g), dx = f.x - g.x, dz = f.z - g.z
    const lx = Math.abs(dx * Math.cos(g.rot) - dz * Math.sin(g.rot)) - s.w / 2, lz = Math.abs(dx * Math.sin(g.rot) + dz * Math.cos(g.rot)) - s.d / 2
    const d = Math.hypot(Math.max(0, lx), Math.max(0, lz)), L = Math.hypot(dx, dz) || 1
    const face = (Math.sin(f.rot) * -dx + Math.cos(f.rot) * -dz) / L
    if (!best || d < best.d) best = { g, d, face }
  }
  return best
}
export const misplaced = (f: Furn, nodes: Record<string, Pt>, customWalls: Wall[], others: Furn[] = []) => misplacedReason(f, nodes, customWalls, others) !== null

/** If an item blocks a door's swing zone, return that door's wall, opening, and state key. */
export function blockingDoor(f: Furn, nodes: Record<string, Pt>, customWalls: Wall[]): { wall: Wall; opening: Opening; key: string } | null {
  const { w: fw, d: fd } = sizeOf(f)
  if ((f.y ?? 0) >= 2.0) return null
  const fo = mk(f.x, f.z, f.rot, fw, fd)
  for (const wall of [...baseWalls, ...customWalls]) {
    const A = toM(nodes[wall.a]), B = toM(nodes[wall.b]), L = dist(A, B)
    if (L < 0.01) continue
    const u: V = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], v: V = [-u[1], u[0]]
    const ht = wall.thick / PX_PER_M / 2
    for (const o of openingsOf(wall, nodes)) {
      if (o.kind !== 'door') continue
      const a = (o.end === 'b' ? L * PX_PER_M - o.to : o.from) / PX_PER_M
      const b = (o.end === 'b' ? L * PX_PER_M - o.from : o.to) / PX_PER_M
      const sg = doorSwing(wall, o, nodes)
      const swingDepth = Math.max(0.55, Math.min(0.95, b - a)), backClear = 0.05
      const mid = (a + b) / 2, off = sg * (swingDepth - backClear) / 2, hz = ht + (swingDepth + backClear) / 2
      const box: OBB = { c: [A[0] + u[0] * mid + v[0] * off, A[1] + u[1] * mid + v[1] * off], ax: u, az: v, hx: (b - a) / 2 + 0.05, hz }
      if (overlaps(fo, box)) return { wall, opening: o, key: wall.id + ':' + (o.i ?? 0) }
    }
  }
  return null
}

export type OverflowZone = {
  poly: [number, number][]
  kind: 'wall' | 'custom' | 'door' | 'window' | 'item'
  label: string
  y0: number
  y1: number
}

function clipHalfPlane(poly: V[], ax: number, az: number, nx: number, nz: number): V[] {
  if (!poly.length) return []
  const out: V[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const da = (a[0] - ax) * nx + (a[1] - az) * nz
    const db = (b[0] - ax) * nx + (b[1] - az) * nz
    if (da >= 0) out.push(a)
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

function clipOBB(subj: V[], b: OBB): V[] {
  let poly = subj
  poly = clipHalfPlane(poly, b.c[0] - b.ax[0] * b.hx, b.c[1] - b.ax[1] * b.hx, b.ax[0], b.ax[1])
  poly = clipHalfPlane(poly, b.c[0] + b.ax[0] * b.hx, b.c[1] + b.ax[1] * b.hx, -b.ax[0], -b.ax[1])
  poly = clipHalfPlane(poly, b.c[0] - b.az[0] * b.hz, b.c[1] - b.az[1] * b.hz, b.az[0], b.az[1])
  poly = clipHalfPlane(poly, b.c[0] + b.az[0] * b.hz, b.c[1] + b.az[1] * b.hz, -b.az[0], -b.az[1])
  return poly.length >= 3 ? poly : []
}

function signedAreaV(p: V[]) {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

function distToSeg(p: V, a: V, b: V) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}

/** Exact XZ polygons where a furniture item overflows a wall, door, window, or another item. */
export function overflowZones(f: Furn, nodes: Record<string, Pt>, customWalls: Wall[], others: Furn[] = []): OverflowZone[] {
  const { w, d, h } = sizeOf(f)
  const y0 = f.y ?? 0, y1 = y0 + h
  const o = mk(f.x, f.z, f.rot, w, d)
  const cs = corners(o)
  const out: OverflowZone[] = []

  const roomPolys = rooms.filter((r) => !r.skip).map((r) => insetRoom(r, nodes).map(toM))
  const fits = roomPolys.some((poly) => cs.every((c) => inPoly(c, poly)))
  if (!fits) {
    let host = roomPolys.find((poly) => inPoly([f.x, f.z], poly))
    if (!host) {
      let bd = Infinity
      for (const poly of roomPolys) {
        const dd = distToPoly([f.x, f.z], poly)
        if (dd < bd) { bd = dd; host = poly }
      }
    }
    let addedWall = false
    if (host && cs.some((c) => inPoly(c, host!))) {
      const sgn = Math.sign(signedAreaV(host)) || 1
      for (let i = 0; i < host.length; i++) {
        const a = host[i], b = host[(i + 1) % host.length]
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz)
        if (L < 0.02) continue
        const outNx = (dz / L) * sgn, outNz = (-dx / L) * sgn
        const clipped = clipHalfPlane(cs, a[0], a[1], outNx, outNz)
        if (clipped.length < 3) continue
        let maxDepth = 0, mx = 0, mz = 0
        for (const p of clipped) {
          mx += p[0]; mz += p[1]
          const dep = (p[0] - a[0]) * outNx + (p[1] - a[1]) * outNz
          if (dep > maxDepth) maxDepth = dep
        }
        mx /= clipped.length; mz /= clipped.length
        if (maxDepth >= 0.005 && !inPoly([mx, mz], host) && distToSeg([mx, mz], a, b) <= maxDepth + 0.15) {
          out.push({ poly: clipped, kind: 'wall', label: `wall +${Math.round(maxDepth * 100)} cm`, y0, y1 })
          addedWall = true
        }
      }
    }
    if (!addedWall) out.push({ poly: cs, kind: 'wall', label: 'outside room', y0, y1 })
  }

  const z = zones([...baseWalls, ...customWalls], nodes)
  for (const q of z.custom) {
    if (!overlaps(o, q)) continue
    const poly = clipOBB(cs, q)
    if (poly.length >= 3) out.push({ poly, kind: 'custom', label: 'added wall', y0, y1 })
  }
  if (y0 < 2.0 && f.type !== 'rug') {
    for (const q of z.doors) {
      if (!overlaps(o, q)) continue
      const poly = clipOBB(cs, q)
      if (poly.length >= 3) out.push({ poly, kind: 'door', label: 'blocks door', y0, y1: Math.min(y1, 2.05) })
    }
  }
  if (y1 > 1.2 && f.type !== 'shower' && f.type !== 'rug' && !(f.type === 'kitchen' && f.low)) {
    for (const q of z.windows) {
      if (!overlaps(o, q)) continue
      const poly = clipOBB(cs, q)
      if (poly.length >= 3) out.push({ poly, kind: 'window', label: 'window', y0: Math.max(y0, 0.9), y1 })
    }
  }
  for (const g of others) {
    if (g.id === f.id) continue
    if (f.type === 'rug' || g.type === 'rug') continue
    if ((f.type === 'chair' && g.type === 'diningTable') || (g.type === 'chair' && f.type === 'diningTable')) continue
    const gs = sizeOf(g), gy = g.y ?? 0
    if (y0 >= gy + gs.h - 0.02 || gy >= y1 - 0.02) continue
    const go = mk(g.x, g.z, g.rot, gs.w, gs.d)
    if (!overlaps(o, go, -0.01)) continue
    const poly = clipOBB(cs, go)
    if (poly.length >= 3) {
      const oy0 = Math.max(y0, gy), oy1 = Math.max(Math.min(y1, gy + gs.h), oy0 + 0.08)
      out.push({ poly, kind: 'item', label: 'overlaps ' + CATALOG[g.type].label.toLowerCase(), y0: oy0, y1: oy1 })
    }
  }
  return out
}

/** Nudge a piece of furniture by the smallest translation along its overflowing axis so it fits, without rotating or resizing it. */
export function fitFurn(f: Furn, others: Furn[], nodes: Record<string, Pt>, customWalls: Wall[]): Furn | null {
  const test = (x: number, z: number): boolean => {
    const dx = x - f.x, dz = z - f.z
    const cand: Furn = { ...f, x, z }
    const shifted = others.map((g) => (g.id === f.id ? cand : g.group === f.id ? { ...g, x: g.x + dx, z: g.z + dz } : g))
    return misplacedReason(cand, nodes, customWalls, shifted) === null
  }
  if (test(f.x, f.z)) return f

  // Build candidate axes: item's local axes + world X/Z (deduplicated), prioritizing axes pointing away from overflows
  const ux = Math.cos(f.rot), uz = -Math.sin(f.rot)
  const vx = Math.sin(f.rot), vz = Math.cos(f.rot)
  const rawDirs: V[] = [[ux, uz], [-ux, -uz], [vx, vz], [-vx, -vz]]
  if (Math.abs(ux) > 0.05 && Math.abs(uz) > 0.05) rawDirs.push([1, 0], [-1, 0], [0, 1], [0, -1])

  const ovs = overflowZones(f, nodes, customWalls, others)
  // Average push direction: from overflow centroids back toward the item centre
  let px = 0, pz = 0
  for (const ov of ovs) {
    const cx = ov.poly.reduce((s, p) => s + p[0], 0) / ov.poly.length
    const cz = ov.poly.reduce((s, p) => s + p[1], 0) / ov.poly.length
    const dx = f.x - cx, dz = f.z - cz, L = Math.hypot(dx, dz)
    if (L > 1e-4) { px += dx / L; pz += dz / L }
  }
  const dirs = [...rawDirs].sort((a, b) => (b[0] * px + b[1] * pz) - (a[0] * px + a[1] * pz))

  // Pass 1: minimal single-axis nudge (1 cm steps up to 1.5 m)
  for (let d = 0.01; d <= 1.501; d += 0.01) {
    for (const [dx, dz] of dirs) {
      const x = Math.round((f.x + dx * d) * 1000) / 1000
      const z = Math.round((f.z + dz * d) * 1000) / 1000
      if (test(x, z)) return { ...f, x, z }
    }
  }

  // Pass 2: minimal 2-axis nudge (for corner overflows on both axes at once)
  let bestX = f.x, bestZ = f.z, bestD = Infinity
  for (const step of [0.02, 0.05]) {
    const lim = step === 0.02 ? 0.5 : 1.5
    for (let a = -lim; a <= lim + 1e-6; a += step) {
      for (let b = -lim; b <= lim + 1e-6; b += step) {
        if (Math.abs(a) < 1e-4 || Math.abs(b) < 1e-4) continue
        const distSq = a * a + b * b
        if (distSq >= bestD * bestD) continue
        const x = Math.round((f.x + ux * a + vx * b) * 1000) / 1000
        const z = Math.round((f.z + uz * a + vz * b) * 1000) / 1000
        if (test(x, z)) { bestX = x; bestZ = z; bestD = Math.sqrt(distSq) }
      }
    }
    if (Number.isFinite(bestD)) return { ...f, x: bestX, z: bestZ }
  }

  return null
}

export type LayoutScore = Record<keyof Criteria, number>
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** How well a layout meets each criterion, 0..1 (independent of the sliders): lets you see what a slider really did. */
export function scoreLayout(furn: Furn[], nodes: Record<string, Pt>, customWalls: Wall[]): LayoutScore {
  const all = [...baseWalls, ...customWalls], z = zones(all, nodes)
  const a = analyze(furn, nodes, customWalls)
  // plan: how close the main items are to where the developer's plan draws them
  const hs = Object.entries(flat?.hints ?? {}) as [FType, Pt][]
  const d = hs.map(([t, p]) => {
    const v = toM(p), items = furn.filter((f) => f.type === t)
    return items.length ? clamp01(1 - Math.min(...items.map((f) => dist([f.x, f.z], v))) / 3) : 0
  })
  // light: share of windows that no floor item stands in front of
  const blockers = furn.filter((f) => (f.y ?? 0) < 0.3 && sizeOf(f).h > 0.3 && f.type !== 'kitchen').map((f) => { const s = sizeOf(f); return mk(f.x, f.z, f.rot, s.w, s.d) })
  const freeWin = z.windows.length ? z.windows.filter((w) => !blockers.some((o) => overlaps(o, w))).length / z.windows.length : 1
  // comfort: how close the big items are to their full catalogue size
  const big = furn.filter((f) => ['sofa', 'bed', 'diningTable', 'wardrobe', 'tvUnit', 'armchair'].includes(f.type))
  const sizeRatio = big.length ? big.reduce((acc, f) => { const s = sizeOf(f), c = CATALOG[f.type]; return acc + Math.min(1, (s.w * s.d) / (c.w * c.d)) }, 0) / big.length : 0.5
  const bedW = furn.find((f) => f.type === 'bed') ? sizeOf(furn.find((f) => f.type === 'bed')!).w : 0
  const comfort = 0.5 * sizeRatio + 0.25 * clamp01(a.seats / 8) + 0.25 * clamp01(bedW / 1.8) // sizes, seating, bed
  // privacy: distance bed - entrance
  const bed = furn.find((f) => f.type === 'bed')
  const priv = bed && z.entrances.length ? clamp01(Math.min(...z.entrances.map((p) => dist([bed.x, bed.z], p))) / 6) : 0.5
  // office
  const desk = furn.find((f) => f.type === 'desk')
  const office = desk ? (z.windows.length && Math.min(...z.windows.map((w) => dist([desk.x, desk.z], w.c))) < 2.5 ? 1 : 0.6) : 0
  // utilisation: wall length used by wall-hugging items relative to the usable perimeter
  const per = rooms.filter((r) => !r.skip).reduce((acc, r) => acc + insetRoom(r, nodes).reduce((p, q, i, arr) => p + dist(toM(q), toM(arr[(i + 1) % arr.length])), 0), 0)
  const used = furn.filter((f) => (f.y ?? 0) < 0.3 && !['chair', 'diningTable', 'coffeeTable', 'tv'].includes(f.type)).reduce((acc, f) => acc + sizeOf(f).w, 0)
  return {
    plan: d.length ? d.reduce((x, y) => x + y, 0) / d.length : 1,
    space: clamp01((100 - a.usedPct - 62) / 20),
    comfort,
    light: freeWin,
    storage: clamp01(a.storageM3 / 8),
    privacy: priv,
    office,
    utilization: clamp01(used / (0.45 * per)),
  }
}

/** For a pin the user placed: where the item really ended up, and if that is not at the pin, why the pin spot doesn't work. */
export function explainPin(type: FType, pin: Pt, furn: Furn[], nodes: Record<string, Pt>, customWalls: Wall[]): { item: Furn | null; dist: number; reason: string | null } {
  const p = toM(pin)
  const items = furn.filter((f) => f.type === type)
  if (!items.length) return { item: null, dist: 0, reason: 'there is no free spot for it in this room' }
  const item = items.reduce((a, b) => (dist([a.x, a.z], p) <= dist([b.x, b.z], p) ? a : b))
  const d = nearest({ id: '', type, x: p[0], z: p[1], rot: 0 }, [item])?.d ?? dist([item.x, item.z], p) // distance from the pin to the item's outline
  if (d < 0.3) return { item, dist: d, reason: null }
  const all = [...baseWalls, ...customWalls], z = zones(all, nodes)
  let room: Room | null = null, bd = Infinity
  for (const r of rooms) {
    const poly = insetRoom(r, nodes).map(toM)
    const dd = inPoly(p, poly) ? 0 : distToPoly(p, poly)
    if (dd < bd) { bd = dd; room = r }
  }
  if (!room) return { item, dist: d, reason: null }
  const ctx = makeCtx(room, nodes, all, z), s = sizeOf(item)
  const cands = wallCands(ctx, s.w, s.d)
  if (!cands.length) return { item, dist: d, reason: 'no wall here is long enough for a ' + Math.round(s.w * 100) + ' cm ' + CATALOG[type].label.toLowerCase() }
  const c = cands.reduce((a, b) => (dist([a.x, a.z], p) <= dist([b.x, b.z], p) ? a : b))
  const test: Furn = { ...item, x: c.x, z: c.z, rot: c.rot }
  const why = misplacedReason(test, nodes, customWalls, furn.filter((f) => f.id !== item.id && f.group !== item.id))
  const text = why
    ? why.replace('stands in front of a window', 'a window is in the way').replace('blocks a door', 'a door swing area is there').replace('sticks out of the room / into a wall', "it doesn't fit against that wall")
    : 'the layout criteria preferred another spot'
  return { item, dist: d, reason: text }
}

export type PinProbe = { status: 'ok' | 'adapt' | 'no'; reason: string; spot?: { x: number; z: number; rot: number; w: number; d: number } }

/** What would happen if the user pinned this item at point `pin` (px)? Used for the live circle under the cursor in Rooms mode. */
export function probePin(type: FType, pin: Pt, furn: Furn[], nodes: Record<string, Pt>, customWalls: Wall[]): PinProbe {
  const p = toM(pin)
  const all = [...baseWalls, ...customWalls], z = zones(all, nodes)
  const room = rooms.find((r) => inPoly(p, insetRoom(r, nodes).map(toM)))
  if (!room) return { status: 'no', reason: 'outside the rooms (that is a wall)' }
  if (defaultKind(room) === 'bath' && type !== 'desk') return { status: 'no', reason: 'the bathroom is a wet room: only bathroom fixtures go here' }
  const ctx = makeCtx(room, nodes, all, z)
  const gone = new Set(furn.filter((f) => f.type === type).map((f) => f.id))
  const others = furn.filter((f) => !gone.has(f.id) && !(f.group && gone.has(f.group)))
  for (const g of others) {
    const gs = sizeOf(g), o = mk(g.x, g.z, g.rot, gs.w, gs.d)
    if ((g.y ?? 0) > 0.3) ctx.shelves.push(o); else ctx.placed.push({ o, h: gs.h })
  }
  const hard: Ctx = { ...ctx, placed: [], reserved: [], shelves: [] }
  const cat = CATALOG[type], h = cat.h
  const sizes: [number, number][] = [[cat.w, cat.d]]
  for (const pr of [...(PRESETS[type] ?? [])].sort((a, b) => b.w * b.d - a.w * a.d)) if (pr.w * pr.d < cat.w * cat.d - 1e-6) sizes.push([pr.w, pr.d])
  const [lw, ld] = sizes[sizes.length - 1]
  for (const f of [0.85, 0.7, 0.55]) sizes.push([lw * f, Math.max(0.25, ld * (0.5 + 0.5 * f))])
  const free = type === 'diningTable'
  for (let si = 0; si < sizes.length; si++) {
    const [w, d] = sizes[si]
    let spot: { x: number; z: number; rot: number } | null = null
    if (free) {
      const rot = alignedRots(ctx)[0] ?? 0
      if (valid(hard, mk(p[0], p[1], rot, w + 0.04, d + 1.0), h, undefined, true)) spot = { x: p[0], z: p[1], rot }
    } else {
      let bd = 1.0
      for (const c of wallCands(hard, w, d)) {
        const dd = dist([c.x, c.z], p)
        if (dd < bd && valid(hard, mk(c.x, c.z, c.rot, w, d), h, undefined, true)) { bd = dd; spot = { x: c.x, z: c.z, rot: c.rot } }
      }
    }
    if (!spot) continue
    const o = mk(spot.x, spot.z, spot.rot, w, d)
    const notes: string[] = []
    if (si > 0) notes.push('shrinks to ' + Math.round(w * 100) + ' cm')
    if (ctx.doors.some((q) => overlaps(o, q))) notes.push('in a door swing area')
    if (h > 1.2 && ctx.windows.some((q) => overlaps(o, q))) notes.push('in front of a window')
    const hit = others.filter((g) => { const gs = sizeOf(g); return (g.y ?? 0) < 0.3 && overlaps(o, mk(g.x, g.z, g.rot, gs.w, gs.d), 0.02) && !(type === 'diningTable' && g.type === 'chair') })
    if (hit.length) notes.push('moves ' + [...new Set(hit.map((g) => CATALOG[g.type].label.toLowerCase()))].join(', '))
    const strict = si === 0 && valid(ctx, mk(spot.x, spot.z, spot.rot, w, d), h)
    return { status: strict ? 'ok' : 'adapt', reason: strict ? 'fits here' : notes.join(' · ') || 'fits after small adjustments', spot: { ...spot, w, d } }
  }
  return { status: 'no', reason: free ? 'no free floor for it here' : cat.label.toLowerCase() + ' stands against a wall: click within 1 m of a wall with enough free length' }
}

// ───────────────────────────── AI furnishing support ─────────────────────────────
// The language model decides WHAT goes WHERE (wall number + position along it, or a free-standing spot); this code only
// turns that into coordinates, checks the real geometry (walls, doors, windows, other items) and repairs what doesn't fit.

export type Span = { id: string; wall: number; from: number; to: number; len: number; faces: string; tall: [number, number][]; windowNear: boolean; doorNear: boolean }
export type Spot = { id: string; x: number; z: number; free: number }
export type RoomGeom = {
  id: string; name: string; kind: RoomKind; area: number
  poly: V[]
  edges: { i: number; from: V; to: V; len: number; normal: V; windows: { from: number; to: number; sill: number }[]; doors: { from: number; to: number }[] }[]
  spans: Span[]   // stretches of wall where furniture can stand with its back to the wall (door swings and fixed items already subtracted)
  spots: Spot[]   // open floor positions for free-standing items (tables), with the free radius around them
}

/** Clear room outlines with, for every wall edge, where the windows and doors are (metres from the edge start). */
export function describeRooms(nodes: Record<string, Pt>, customWalls: Wall[], kinds: Record<string, RoomKind> = {}, fixed: Furn[] = []): RoomGeom[] {
  const all = [...baseWalls, ...customWalls], z = zones(all, nodes)
  const out: RoomGeom[] = []
  for (const r of rooms) {
    if (r.skip) continue
    const ctx = makeCtx(r, nodes, all, z)
    const edges = ctx.edges.map((e, i) => {
      const Q: V = [e.P[0] + e.t[0] * e.L, e.P[1] + e.t[1] * e.L]
      const wall = all.find((q) => (q.a === r.nodes[i] && q.b === r.nodes[(i + 1) % ctx.poly.length]) || (q.b === r.nodes[i] && q.a === r.nodes[(i + 1) % ctx.poly.length]))
      const windows: { from: number; to: number; sill: number }[] = [], doors: { from: number; to: number }[] = []
      if (wall) {
        const A = nodes[wall.a], B = nodes[wall.b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
        const proj = (s: number) => { const p = toM([A[0] + ((B[0] - A[0]) / L) * s, A[1] + ((B[1] - A[1]) / L) * s]); return (p[0] - e.P[0]) * e.t[0] + (p[1] - e.P[1]) * e.t[1] }
        for (const o of openingsOf(wall, nodes)) {
          const a = proj(o.from), b = proj(o.to), lo = Math.max(0, Math.min(a, b)), hi = Math.min(e.L, Math.max(a, b))
          if (hi - lo < 0.15) continue
          if (o.kind === 'door') doors.push({ from: +lo.toFixed(2), to: +hi.toFixed(2) })
          else windows.push({ from: +lo.toFixed(2), to: +hi.toFixed(2), sill: o.sill })
        }
      }
      return { i, from: e.P, to: Q, len: +e.L.toFixed(2), normal: e.n, windows, doors }
    })
    // wall spans: free stretches along each edge
    const compass = (dx: number, dz: number) => (Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north')
    const spans: Span[] = []
    let sid = 0
    for (const [ei, e] of ctx.edges.entries()) {
      const ed = edges[ei]
      const cut: [number, number][] = ed.doors.map((d) => [d.from - 0.85, d.to + 0.85] as [number, number])
      for (const f of fixed) { // fixed items already standing against this wall
        const fs2 = sizeOf(f), o = mk(f.x, f.z, f.rot, fs2.w, fs2.d), cs = corners(o)
        const ts = cs.map((c) => (c[0] - e.P[0]) * e.t[0] + (c[1] - e.P[1]) * e.t[1]), ds = cs.map((c) => (c[0] - e.P[0]) * e.n[0] + (c[1] - e.P[1]) * e.n[1])
        if (Math.min(...ds) < 0.25 && Math.max(...ds) > 0) cut.push([Math.min(...ts) - 0.05, Math.max(...ts) + 0.05])
      }
      cut.sort((a, b) => a[0] - b[0])
      let at = 0
      const free: [number, number][] = []
      for (const [a, b] of cut) { if (a - at >= 0.45) free.push([at, Math.min(a, e.L)]); at = Math.max(at, b) }
      if (e.L - at >= 0.45) free.push([at, e.L])
      for (const [a, b] of free) {
        const tall: [number, number][] = []; let t0 = a
        for (const w of [...ed.windows].sort((p, q) => p.from - q.from)) { if (w.from - 0.1 - t0 >= 0.45) tall.push([+t0.toFixed(2), +Math.min(w.from - 0.1, b).toFixed(2)]); t0 = Math.max(t0, w.to + 0.1) }
        if (b - t0 >= 0.45) tall.push([+t0.toFixed(2), +b.toFixed(2)])
        spans.push({ id: 'S' + ++sid, wall: ei, from: +a.toFixed(2), to: +b.toFixed(2), len: +(b - a).toFixed(2), faces: compass(e.n[0], e.n[1]), tall: tall.filter(([p, q]) => p >= a - 0.01 && q <= b + 0.01), windowNear: ed.windows.some((w) => w.to > a - 0.2 && w.from < b + 0.2), doorNear: ed.doors.some((d) => d.to > a - 1 && d.from < b + 1) })
      }
    }
    // open floor spots for free-standing items
    const xs = ctx.poly.map((p) => p[0]), zs = ctx.poly.map((p) => p[1])
    const cand: Spot[] = []
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.25) for (let zz = Math.min(...zs); zz <= Math.max(...zs); zz += 0.25) {
      if (!inPoly([x, zz], ctx.poly)) continue
      let free = Infinity
      ctx.edges.forEach((e) => { const dd = (x - e.P[0]) * e.n[0] + (zz - e.P[1]) * e.n[1]; const t = (x - e.P[0]) * e.t[0] + (zz - e.P[1]) * e.t[1]; if (t > -0.3 && t < e.L + 0.3) free = Math.min(free, dd) })
      for (const f of fixed) { const fs2 = sizeOf(f); free = Math.min(free, Math.max(0, Math.hypot(x - f.x, zz - f.z) - Math.max(fs2.w, fs2.d) / 2)) }
      if (ctx.doors.some((d) => dist([x, zz], d.c) < 1.3)) free = Math.min(free, 0.4)
      if (free >= 1.0) cand.push({ id: '', x: +x.toFixed(2), z: +zz.toFixed(2), free: +free.toFixed(2) })
    }
    cand.sort((a, b) => b.free - a.free)
    const spots: Spot[] = []
    for (const c of cand) { if (spots.length >= 6) break; if (spots.every((s2) => dist([s2.x, s2.z], [c.x, c.z]) >= 1.6)) spots.push({ ...c, id: 'P' + (spots.length + 1) }) }
    out.push({ id: r.id, name: r.name, kind: (kinds[r.id] ?? defaultKind(r)) as RoomKind, area: +areaM2(insetRoom(r, nodes)).toFixed(1), poly: ctx.poly, edges, spans, spots })
  }
  return out
}

export type AIItem = {
  type: string; room?: string
  span?: string; place?: string | number    // wall item: span id (S1…) and where inside it: start | center | end | metres from the span start
  spot?: string                              // free-standing item: open spot id (P1…)
  wall?: number; at?: number               // against wall edge `wall`, centre `at` metres from the edge start
  x?: number; z?: number; turn?: number     // free-standing: centre, 0 / 90 = long side along x / along z
  w?: number; d?: number; y?: number
  chairs?: number; nightstands?: number; coffeeTable?: boolean
}
export type AISpec = { idea?: string; items: AIItem[] }
export type AIResult = { furniture: Furn[]; log: string[]; dropped: number; placed: number; filled: number }

/** What may stand in which kind of room (the model sometimes suggests a dining table in a bedroom). */
export const AI_ALLOWED: Record<RoomKind, FType[]> = {
  open: ['sofa', 'armchair', 'tvUnit', 'tv', 'diningTable', 'coffeeTable', 'bookcase', 'shoeCabinet', 'dresser', 'desk', 'wardrobe', 'shelf'],
  living: ['sofa', 'armchair', 'tvUnit', 'tv', 'coffeeTable', 'bookcase', 'shoeCabinet', 'dresser', 'desk', 'wardrobe', 'shelf'],
  kitchen: ['diningTable', 'bookcase', 'shelf', 'armchair'],
  bedroom: ['bed', 'wardrobe', 'desk', 'bookcase', 'dresser', 'armchair', 'tvUnit', 'tv', 'shelf'],
  office: ['desk', 'bookcase', 'shelf', 'armchair', 'dresser', 'wardrobe', 'sofa'],
  storage: ['bookcase', 'shelf', 'wardrobe', 'dresser', 'shoeCabinet', 'desk'],
  bath: [], none: [],
}
const AI_LIMIT: Partial<Record<FType, number>> = { bed: 1, sofa: 1, tvUnit: 1, tv: 1, diningTable: 1, desk: 1, wardrobe: 2, bookcase: 3, dresser: 1, shoeCabinet: 1, armchair: 2, coffeeTable: 1 }
const AI_ORDER = ['bed', 'wardrobe', 'sofa', 'tvUnit', 'tv', 'diningTable', 'desk', 'shoeCabinet', 'bookcase', 'dresser', 'armchair', 'coffeeTable', 'shelf']
const AI_FREE: FType[] = ['diningTable', 'armchair', 'coffeeTable']
const ESSENTIAL: Record<string, FType[][]> = { open: [['sofa', 'armchair'], ['tvUnit', 'tv'], ['diningTable']], living: [['sofa', 'armchair'], ['tvUnit', 'tv']], kitchen: [['diningTable']], bedroom: [['bed'], ['wardrobe']], office: [['desk']] }

export function materializeAI(spec: AISpec, nodes: Record<string, Pt>, customWalls: Wall[], fixed: Furn[], kinds: Record<string, RoomKind>, baseline: Furn[] = [], fill = true, geoms: RoomGeom[] = []): AIResult {
  const all = [...baseWalls, ...customWalls], z = zones(all, nodes)
  const ctxs = new Map<string, Ctx>()
  for (const r of rooms) if (!r.skip) ctxs.set(r.id, makeCtx(r, nodes, all, z))
  const out: Furn[] = [], log: string[] = []
  let n = 0, dropped = 0, placed = 0, filled = 0
  const roomOfPoint = (x: number, zz: number) => [...ctxs.entries()].find(([, c]) => inPoly([x, zz], c.poly))?.[0]
  const reg = (f: Furn, reserve = 0) => {
    const c = ctxs.get(roomOfPoint(f.x, f.z) ?? '')
    const s = sizeOf(f), o = mk(f.x, f.z, f.rot, s.w, s.d)
    if (c) { if ((f.y ?? 0) > 0.3) c.shelves.push(o); else c.placed.push({ o, h: s.h }); if (reserve > 0) c.reserved.push(mk(f.x + o.az[0] * (s.d / 2 + reserve / 2), f.z + o.az[1] * (s.d / 2 + reserve / 2), f.rot, s.w, reserve)) }
    out.push(f)
  }
  for (const f of fixed) reg(f, f.type === 'kitchen' ? 0.9 : f.type === 'wc' ? 0.55 : 0)

  const items = [...(spec.items ?? [])].filter((it) => it && typeof it.type === 'string')
  items.sort((a, b) => (AI_ORDER.indexOf(a.type) + 1 || 99) - (AI_ORDER.indexOf(b.type) + 1 || 99))
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined)

  for (const it of items) {
    const type = it.type as FType
    // resolve span / spot ids into wall + offset or x/z
    if (typeof it.span === 'string') {
      const sp = geoms.flatMap((g) => g.spans.map((x) => ({ g, x }))).find((q) => q.x.id === it.span && (!it.room || q.g.id === it.room))
      if (sp && CATALOG[type]) {
        const ww = Math.min(num(it.w) ?? CATALOG[type].w, sp.x.len)
        const pl = it.place, off = typeof pl === 'number' ? Math.max(0, Math.min(sp.x.len, pl)) : pl === 'start' ? ww / 2 : pl === 'end' ? sp.x.len - ww / 2 : sp.x.len / 2
        it.room = sp.g.id; it.wall = sp.x.wall; it.at = sp.x.from + off
      } else { log.push(`${it.type}: span ${it.span} does not exist`); dropped++; continue }
    } else if (typeof it.spot === 'string') {
      const sp = geoms.flatMap((g) => g.spots.map((x) => ({ g, x }))).find((q) => q.x.id === it.spot && (!it.room || q.g.id === it.room))
      if (sp) { it.room = sp.g.id; it.x = sp.x.x; it.z = sp.x.z } else { log.push(`${it.type}: spot ${it.spot} does not exist`); dropped++; continue }
    }
    if (!CATALOG[type] || FIXED.includes(type) || type === 'chair' || type === 'nightstand') { log.push(`${it.type}: ignored (not a placeable item)`); continue }
    const cat = CATALOG[type]
    const free = AI_FREE.includes(type) && num(it.x) !== undefined && num(it.z) !== undefined && num(it.wall) === undefined
    const wmax = type === 'wardrobe' ? 4.5 : cat.w * 2
    const w0 = Math.min(wmax, Math.max(0.3, num(it.w) ?? cat.w)), d0 = Math.min(cat.d * 2, Math.max(0.2, num(it.d) ?? cat.d))
    const roomId = it.room && ctxs.has(it.room) ? it.room : free ? roomOfPoint(it.x!, it.z!) : undefined
    const ctx = roomId ? ctxs.get(roomId) : undefined
    if (!ctx) { log.push(`${type}: unknown room "${it.room}"`); dropped++; continue }
    const rk = (kinds[roomId!] ?? defaultKind(rooms.find((r) => r.id === roomId)!)) as RoomKind
    if (!AI_ALLOWED[rk].includes(type)) { log.push(`${type}: does not belong in this room, skipped`); dropped++; continue }
    const have = out.filter((q) => q.type === type && inPoly([q.x, q.z], ctx.poly)).length
    if (have >= (AI_LIMIT[type] ?? 9)) { log.push(`${type}: already have enough in this room, skipped`); dropped++; continue }
    const h = cat.h
    let f: Furn | null = null

    if (free) {
      const rot = (num(it.turn) ?? 0) === 90 ? Math.PI / 2 : 0
      const foot = (x: number, zz: number, ww: number, dd: number) => type === 'diningTable' ? mk(x, zz, rot, ww + 0.04, dd + 1.0) : mk(x, zz, rot, ww, dd)
      outer: for (const k of [1, 0.9, 0.8, 0.7]) {
        const ww = w0 * k, dd = d0 * (0.5 + 0.5 * k)
        const cands: [number, number][] = [[it.x!, it.z!]]
        for (let r2 = 0.1; r2 <= 1.6; r2 += 0.1) for (let a = 0; a < 360; a += 30) cands.push([it.x! + Math.cos((a * Math.PI) / 180) * r2, it.z! + Math.sin((a * Math.PI) / 180) * r2])
        for (const [x, zz] of cands) if (valid(ctx, foot(x, zz, ww, dd), type === 'diningTable' ? 0.9 : h)) { f = { id: 'ai' + ++n, type, x, z: zz, rot, w: ww, d: dd }; break outer }
      }
    } else {
      const e = ctx.edges[num(it.wall) ?? -1]
      if (!e) { log.push(`${type}: wall ${it.wall} does not exist in ${roomId}`); dropped++; continue }
      const at0 = num(it.at) ?? e.L / 2
      outer2: for (const k of [1, 0.9, 0.8, 0.7]) {
        const ww = w0 * k, dd = d0 * (0.5 + 0.5 * k)
        if (e.L < ww + 0.04) continue
        const clampS = (s: number) => Math.max(ww / 2 + GAP, Math.min(e.L - ww / 2 - GAP, s))
        for (let j = 0; j <= Math.ceil(e.L / 0.05); j++) for (const sg of j === 0 ? [1] : [1, -1]) {
          const s = clampS(at0 + sg * j * 0.05)
          const [x, zz] = edgePoint(e, s, dd)
          if (valid(ctx, mk(x, zz, rotOf(e), ww, dd), h)) { f = { id: 'ai' + ++n, type, x, z: zz, rot: rotOf(e), w: ww, d: dd }; if (type === 'shelf' || type === 'tv') f.y = num(it.y) ?? (type === 'tv' ? 0.9 : 1.5); if (j > 0 && j * 0.05 > 0.3) log.push(`${type}: moved ${(j * 0.05).toFixed(1)} m along ${roomId}/w${e.L ? num(it.wall) : ''} to fit`); break outer2 }
        }
      }
      if (!f) {
        // other walls of the same room, nearest to where the model wanted it
        const want = edgePoint(e, Math.min(e.L, Math.max(0, at0)), d0)
        const probe: Furn = { id: 'ai' + ++n, type, x: want[0], z: want[1], rot: rotOf(e), w: w0, d: d0 }
        const fit = fitFurn(probe, out, nodes, customWalls)
        if (fit) { f = fit; log.push(`${type}: no room on that wall, moved to the nearest free spot`) }
      }
    }
    if (!f) { log.push(`${type} in ${roomId}: no valid spot, dropped`); dropped++; continue }
    if ((type === 'shelf' || type === 'tv') && f) { // wall mounted: never over a window or a door
      const so = sizeOf(f), fo = mk(f.x, f.z, f.rot, so.w, so.d)
      if (ctx.windows.some((q) => overlaps(fo, q)) || ctx.doors.some((q) => overlaps(fo, q))) { log.push(`${type}: would hang over a window or door, dropped`); dropped++; continue }
    }
    reg(f)
    placed++
    // mechanical extras
    if (type === 'diningTable') {
      const s = sizeOf(f), o = mk(f.x, f.z, f.rot, s.w, s.d), want = Math.max(0, Math.min(8, Math.round(num(it.chairs) ?? 4)))
      const spots: { x: number; z: number; rot: number }[] = []
      for (const side of [1, -1]) for (const ps of s.w >= 1.2 ? [-s.w / 4, s.w / 4] : [0]) spots.push({ x: o.c[0] + o.ax[0] * ps + o.az[0] * side * (s.d / 2 + 0.2), z: o.c[1] + o.ax[1] * ps + o.az[1] * side * (s.d / 2 + 0.2), rot: f.rot + (side > 0 ? Math.PI : 0) })
      for (const side of [1, -1]) spots.push({ x: o.c[0] + o.ax[0] * side * (s.w / 2 + 0.2), z: o.c[1] + o.ax[1] * side * (s.w / 2 + 0.2), rot: f.rot + (side > 0 ? -Math.PI / 2 : Math.PI / 2) })
      let k = 0
      for (const sp of spots) { if (k >= want) break; if (valid(ctx, mk(sp.x, sp.z, sp.rot, 0.45, 0.5), 0.9, out.length ? ctx.placed.filter((p) => p.o.c[0] === o.c[0] && p.o.c[1] === o.c[1]).map((p) => p.o) : undefined)) { const c: Furn = { id: 'ai' + ++n, type: 'chair', x: sp.x, z: sp.z, rot: sp.rot, group: f.id }; reg(c); k++ } }
    }
    if (type === 'bed') {
      const s = sizeOf(f), wanted = Math.max(0, Math.min(2, Math.round(num(it.nightstands) ?? 2)))
      const e = [...ctx.edges].sort((a, b) => Math.hypot(a.P[0] + a.t[0] * a.L / 2 - f!.x, a.P[1] + a.t[1] * a.L / 2 - f!.z) - Math.hypot(b.P[0] + b.t[0] * b.L / 2 - f!.x, b.P[1] + b.t[1] * b.L / 2 - f!.z))[0]
      void e
      const o = mk(f.x, f.z, f.rot, s.w, s.d); let k = 0
      for (const side of [1, -1]) {
        if (k >= wanted) break
        for (const [nw, nd] of [[0.45, 0.4], [0.4, 0.35]]) {
          const x = o.c[0] + o.ax[0] * side * (s.w / 2 + 0.02 + nw / 2) - o.az[0] * (s.d / 2 - nd / 2 - 0.02), zz = o.c[1] + o.ax[1] * side * (s.w / 2 + 0.02 + nw / 2) - o.az[1] * (s.d / 2 - nd / 2 - 0.02)
          if (valid(ctx, mk(x, zz, f.rot, nw, nd), 0.5)) { reg({ id: 'ai' + ++n, type: 'nightstand', x, z: zz, rot: f.rot, w: nw, d: nd, group: f.id }); k++; break }
        }
      }
    }
    if (type === 'sofa' && it.coffeeTable) {
      const s = sizeOf(f), o = mk(f.x, f.z, f.rot, s.w, s.d)
      for (const [cw, cd] of [[1.0, 0.6], [0.9, 0.55], [0.8, 0.5]]) {
        const dd = 0.4 + cd / 2 + s.d / 2, x = f.x + o.az[0] * dd, zz = f.z + o.az[1] * dd
        if (valid(ctx, mk(x, zz, f.rot, cw, cd), 0.4)) { reg({ id: 'ai' + ++n, type: 'coffeeTable', x, z: zz, rot: f.rot, w: cw, d: cd, group: f.id }); break }
      }
    }
  }

  // anything essential the model forgot is taken from the rule-based layout (and fitted to what is already there)
  if (fill) {
    for (const [rid, ctx] of ctxs) {
      const kind = kinds[rid] ?? defaultKind(rooms.find((r) => r.id === rid)!)
      for (const group of ESSENTIAL[kind] ?? []) {
        if (out.some((f) => group.includes(f.type) && inPoly([f.x, f.z], ctx.poly))) continue
        const base = baseline.filter((f) => group.includes(f.type) && inPoly([f.x, f.z], ctx.poly))
        for (const b of base.slice(0, 1)) {
          const fit = fitFurn({ ...b, id: 'ai' + ++n }, out, nodes, customWalls)
          if (fit) { reg(fit); filled++; log.push(`${fit.type} in ${rid}: the model left it out, added by the rules`) }
        }
      }
    }
  }
  return { furniture: out, log, dropped, placed, filled }
}
