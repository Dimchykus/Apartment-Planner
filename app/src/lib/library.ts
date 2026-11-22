// The user's own flats: tracing data -> FlatDef, persistence (localStorage), import / export.
import type { FlatDef, Pt, Room, Wall, Opening, Editable } from '../plan'
import type { FType } from '../catalog'

export type RoomTypeId = 'open' | 'living' | 'kitchen' | 'bedroom' | 'bath' | 'hall' | 'loggia' | 'office' | 'storage' | 'shaft'
export const ROOM_TYPES: { id: RoomTypeId; label: string; name: string; color: string }[] = [
  { id: 'open', label: 'Kitchen-living (open plan)', name: 'Kitchen-living', color: '#f2b134' },
  { id: 'living', label: 'Living room', name: 'Living room', color: '#e6c84a' },
  { id: 'kitchen', label: 'Kitchen', name: 'Kitchen', color: '#e0662c' },
  { id: 'bedroom', label: 'Bedroom', name: 'Bedroom', color: '#6a7fe0' },
  { id: 'bath', label: 'Bathroom / WC', name: 'Bathroom', color: '#35b6c9' },
  { id: 'hall', label: 'Hall / corridor', name: 'Hall', color: '#a7b36b' },
  { id: 'loggia', label: 'Loggia / balcony', name: 'Loggia', color: '#8fb8a8' },
  { id: 'office', label: 'Office / study', name: 'Office', color: '#8e5be0' },
  { id: 'storage', label: 'Storage / pantry', name: 'Storage', color: '#b08a5a' },
  { id: 'shaft', label: 'Utility shaft (not counted)', name: 'Utility shaft', color: '#9aa0a6' },
]
export const roomType = (id: RoomTypeId) => ROOM_TYPES.find((t) => t.id === id) ?? ROOM_TYPES[0]

export type TraceOpening = { id: string; at: Pt; kind: 'door' | 'window'; width: number; sill?: number; top?: number } // width in metres
export type TraceRoom = { id: string; at: Pt; type: RoomTypeId; stated?: number }
export type TraceWall = { id: string; a: string; b: string; thick?: number; divider?: boolean /* only splits a room from another: no wall is built */ } // thick: this wall's own thickness in cm (else the outer / inner default)
export type TraceState = {
  pxPerM: number | null
  nodes: Record<string, Pt>
  walls: TraceWall[]
  openings: TraceOpening[]
  rooms: TraceRoom[]
  fixtures: Partial<Record<FType, Pt>>
  outerThick: number // cm
  innerThick: number // cm
  dividerThick?: number // cm: strip taken off both rooms along a room divider (0 = they meet at the line)
}
export const emptyTrace = (): TraceState => ({ pxPerM: null, nodes: {}, walls: [], openings: [], rooms: [], fixtures: {}, outerThick: 25, innerThick: 12 })

export type UserFlat = { id: string; name: string; created: number; updated: number; image: string; imgW: number; imgH: number; trace: TraceState }

// ───────────────────────── geometry helpers ─────────────────────────
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const area2 = (p: Pt[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0) / 2
export const inPoly = (p: Pt, poly: Pt[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
export function projectOnSeg(p: Pt, a: Pt, b: Pt): { t: number; pt: Pt; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
  const pt: Pt = [a[0] + dx * t, a[1] + dy * t]
  return { t, pt, d: dist(p, pt) }
}
function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]], s: Pt = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-9) return null
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null // proper crossings only (shared ends are handled by node reuse)
  return [a[0] + r[0] * t, a[1] + r[1] * t]
}

let idc = 0
const uid = (p: string) => p + (Date.now().toString(36) + (idc++).toString(36))

// ───────────────────────── editing the wall graph ─────────────────────────
/** Add a wall from p to q. Ends snap to nodes / walls within `snap` px; crossings and T-junctions are split automatically. */
export function addWall(t: TraceState, p: Pt, q: Pt, snap: number, divider = false): TraceState {
  const nodes = { ...t.nodes }
  let walls = [...t.walls]
  const nodeAt = (pt: Pt): string | null => {
    let best: string | null = null, bd = snap
    for (const [id, n] of Object.entries(nodes)) { const d = dist(n, pt); if (d < bd) { bd = d; best = id } }
    return best
  }
  const splitWall = (w: TraceWall, id: string) => {
    walls = walls.filter((x) => x.id !== w.id)
    for (const [a, b] of [[w.a, id], [id, w.b]]) if (a !== b && !walls.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) walls.push({ id: uid('w'), a, b, ...(w.thick ? { thick: w.thick } : {}), ...(w.divider ? { divider: true } : {}) })
  }
  const ensureNode = (pt: Pt): string => {
    const near = nodeAt(pt)
    if (near) return near
    // lies on an existing wall? -> split it
    for (const w of walls) {
      const pr = projectOnSeg(pt, nodes[w.a], nodes[w.b])
      if (pr.d < snap && pr.t > 0 && pr.t < 1) {
        const id = uid('n'); nodes[id] = pr.pt; splitWall(w, id); return id
      }
    }
    const id = uid('n'); nodes[id] = pt; return id
  }
  const a0 = ensureNode(p), b0 = ensureNode(q)
  if (a0 === b0) return { ...t, nodes, walls }
  const A = nodes[a0], B = nodes[b0]
  // cut points along the new segment: existing nodes lying on it + crossings with existing walls
  const cuts: { t: number; id: string }[] = [{ t: 0, id: a0 }, { t: 1, id: b0 }]
  for (const [id, n] of Object.entries(nodes)) {
    if (id === a0 || id === b0) continue
    const pr = projectOnSeg(n, A, B)
    if (pr.d < Math.max(2, snap * 0.35) && pr.t > 0 && pr.t < 1) cuts.push({ t: pr.t, id })
  }
  for (const w of [...walls]) {
    const x = segIntersect(A, B, nodes[w.a], nodes[w.b])
    if (!x) continue
    const id = nodeAt(x) ?? (() => { const nid = uid('n'); nodes[nid] = x; return nid })()
    if (id !== w.a && id !== w.b) splitWall(w, id)
    const tt = projectOnSeg(x, A, B).t
    if (!cuts.some((c) => c.id === id)) cuts.push({ t: tt, id })
  }
  cuts.sort((x, y) => x.t - y.t)
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i].id, b = cuts[i + 1].id
    if (a !== b && !walls.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) walls.push({ id: uid('w'), a, b, ...(divider ? { divider: true } : {}) })
  }
  return { ...t, nodes, walls }
}

export function removeWall(t: TraceState, id: string): TraceState {
  const walls = t.walls.filter((w) => w.id !== id)
  const used = new Set(walls.flatMap((w) => [w.a, w.b]))
  const nodes: Record<string, Pt> = {}
  for (const [k, v] of Object.entries(t.nodes)) if (used.has(k)) nodes[k] = v
  return { ...t, walls, nodes }
}

// ───────────────────────── faces of the wall graph ─────────────────────────
export type Face = { nodes: string[]; poly: Pt[]; area: number; outer: boolean }
export function faces(t: TraceState): Face[] {
  const adj: Record<string, string[]> = {}
  for (const w of t.walls) { (adj[w.a] ??= []).push(w.b); (adj[w.b] ??= []).push(w.a) }
  const ang = (a: string, b: string) => Math.atan2(t.nodes[b][1] - t.nodes[a][1], t.nodes[b][0] - t.nodes[a][0])
  for (const [k, l] of Object.entries(adj)) l.sort((x, y) => ang(k, x) - ang(k, y))
  const seen = new Set<string>(), out: Face[] = []
  for (const w of t.walls) for (const [s0, e0] of [[w.a, w.b], [w.b, w.a]]) {
    if (seen.has(s0 + '>' + e0)) continue
    const cyc: string[] = []
    let u = s0, v = e0, guard = 0
    while (!seen.has(u + '>' + v) && guard++ < 5000) {
      seen.add(u + '>' + v); cyc.push(u)
      const l = adj[v], i = l.indexOf(u)
      const nxt = l[(i - 1 + l.length) % l.length] // the neighbour just clockwise of the way we came: keeps the face on one side
      u = v; v = nxt
    }
    if (cyc.length >= 3) { const poly = cyc.map((id) => t.nodes[id]); out.push({ nodes: cyc, poly, area: area2(poly), outer: false }) }
  }
  if (!out.length) return out
  const big = out.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a))
  for (const f of out) f.outer = Math.sign(f.area) === Math.sign(big.area) && Math.abs(f.area) > 1e-6
  return out.filter((f) => Math.abs(f.area) > 1e-6)
}
/** Floor area of a closed area in m²: every wall line is moved in by half its own thickness, then the corners are re-cut. */
export function netFace(t: TraceState, f: Face, pxm: number): { area: number; poly: Pt[] } {
  const n = f.poly.length
  if (n < 3 || !pxm) return { area: 0, poly: [] }
  const sgn = Math.sign(f.area) || 1
  const outerPx = (t.outerThick / 100) * pxm, innerPx = (t.innerThick / 100) * pxm
  const outerE = new Set<string>()
  for (const q of faces(t)) if (q.outer) for (let i = 0; i < q.nodes.length; i++) { const a = q.nodes[i], b = q.nodes[(i + 1) % q.nodes.length]; outerE.add(a + '|' + b); outerE.add(b + '|' + a) }
  const lines = f.poly.map((p, i) => {
    const q = f.poly[(i + 1) % n], a = f.nodes[i], b = f.nodes[(i + 1) % n]
    const w = t.walls.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
    const th = (w?.divider ? ((t.dividerThick ?? 0) / 100) * pxm : w?.thick ? (w.thick / 100) * pxm : outerE.has(a + '|' + b) ? outerPx : innerPx) / 2
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1
    // inward normal: left of the direction for a positive (counter-clockwise in y-up maths) area
    const nx = (-dy / L) * sgn, ny = (dx / L) * sgn
    return { p: [p[0] + nx * th, p[1] + ny * th] as Pt, d: [dx, dy] as Pt }
  })
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n], B = lines[i]
    const den = A.d[0] * B.d[1] - A.d[1] * B.d[0]
    if (Math.abs(den) < 1e-9) { pts.push(B.p); continue }
    const s = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den
    pts.push([A.p[0] + A.d[0] * s, A.p[1] + A.d[1] * s])
  }
  return { area: Math.abs(area2(pts)) / pxm / pxm, poly: pts }
}
export const netFaceArea = (t: TraceState, f: Face, pxm: number) => netFace(t, f, pxm).area
export const innerFaces = (t: TraceState) => faces(t).filter((f) => !f.outer)
export function faceAt(t: TraceState, pt: Pt): Face | null {
  let best: Face | null = null
  for (const f of innerFaces(t)) if (inPoly(pt, f.poly) && (!best || Math.abs(f.area) < Math.abs(best.area))) best = f
  return best
}

/** A point well inside a polygon (centroid if it is inside, else the middle of the widest horizontal chord). */
export function interiorPoint(poly: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length], f = x1 * y2 - x2 * y1
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
  }
  if (Math.abs(a) > 1e-6) { const c: Pt = [cx / (3 * a), cy / (3 * a)]; if (inPoly(c, poly)) return c }
  const ys = poly.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys)
  let best: Pt = poly[0], bw = -1
  for (let k = 1; k < 12; k++) {
    const y = y0 + ((y1 - y0) * k) / 12, xs: number[] = []
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length]
      if (p[1] > y !== q[1] > y) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
    }
    xs.sort((m, n) => m - n)
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y] }
  }
  return best
}

// ───────────────────────── TraceState -> FlatDef ─────────────────────────
export type BuildResult = { def: FlatDef; problems: string[]; netTotal: number } | { error: string }

export function buildFlat(u: Pick<UserFlat, 'id' | 'name' | 'image' | 'imgW' | 'imgH' | 'trace'>): BuildResult {
  const t = u.trace
  if (!t.pxPerM) return { error: 'Set the scale first.' }
  const pxm = t.pxPerM
  const problems: string[] = []
  const all = faces(t)
  const inner = all.filter((f) => !f.outer)
  if (!inner.length) return { error: 'Draw closed walls: no enclosed room found yet.' }
  // outer walls = edges that touch the unbounded face
  const outerEdges = new Set<string>()
  for (const f of all.filter((q) => q.outer)) for (let i = 0; i < f.nodes.length; i++) {
    const a = f.nodes[i], b = f.nodes[(i + 1) % f.nodes.length]
    outerEdges.add(a + '|' + b); outerEdges.add(b + '|' + a)
  }
  // renumber nodes / walls compactly (n1.., w1..)
  const nid: Record<string, string> = {}
  const nodes: Record<string, Pt> = {}
  Object.keys(t.nodes).forEach((k, i) => { nid[k] = 'n' + (i + 1); nodes[nid[k]] = t.nodes[k] })
  const outerPx = (t.outerThick / 100) * pxm, innerPx = (t.innerThick / 100) * pxm
  const tw = t.walls.filter((w) => !w.divider) // room dividers only cut rooms apart, no wall is built there
  const walls: Wall[] = tw.map((w, i) => ({ id: 'w' + (i + 1), a: nid[w.a], b: nid[w.b], thick: w.thick ? (w.thick / 100) * pxm : outerEdges.has(w.a + '|' + w.b) ? outerPx : innerPx, openings: [] as Opening[] }))
  const outerIds = new Set(walls.filter((_, i) => outerEdges.has(tw[i].a + '|' + tw[i].b)).map((w) => w.id))
  // doors and windows -> openings on the nearest wall
  let unplaced = 0
  for (const o of t.openings) {
    let best: { w: Wall; t: number; d: number } | null = null
    for (const w of walls) {
      const pr = projectOnSeg(o.at, nodes[w.a], nodes[w.b])
      if (!best || pr.d < best.d) best = { w, t: pr.t, d: pr.d }
    }
    if (!best || best.d > 0.5 * pxm) { unplaced++; continue }
    const L = dist(nodes[best.w.a], nodes[best.w.b]), half = (o.width * pxm) / 2
    const from = Math.max(0, best.t * L - half), to = Math.min(L, best.t * L + half)
    if (to - from < 0.25 * pxm) { unplaced++; continue }
    const op: Opening = o.kind === 'door'
      ? { from, to, sill: 0, top: o.top ?? 2.05, kind: 'door' }
      : { from, to, sill: o.sill ?? 0.9, top: o.top ?? 2.1, kind: 'window' }
    best.w.openings!.push(op)
  }
  if (unplaced) problems.push(unplaced + ' door/window mark(s) are not on a wall and were ignored.')
  walls.forEach((w) => { if (!w.openings!.length) delete w.openings })
  // rooms
  const rooms: Room[] = []
  const used = new Set<Face>()
  for (const r of t.rooms) {
    const f = inner.filter((q) => inPoly(r.at, q.poly)).sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0]
    if (!f || used.has(f)) { problems.push('A room mark is not inside a closed area.'); continue }
    used.add(f)
    const ty = roomType(r.type)
    rooms.push({
      id: 'r' + (rooms.length + 1), name: ty.name, stated: r.stated && r.stated > 0 ? r.stated : 0, // 0 = the plan prints no figure (nothing to compare with)
      nodes: f.nodes.map((k) => nid[k]),
      floor: r.type === 'bath' ? 'tile' : r.type === 'loggia' ? 'loggia' : 'parquet',
      countsFull: r.type !== 'loggia',
      ...(r.type === 'shaft' ? { skip: true } : {}),
    })
  }
  if (!rooms.length) return { error: 'Click inside each room (Rooms step) and choose what it is.' }
  // movable inner walls: nodes touched only by inner walls move freely; T-junctions on an outer wall slide along it
  const editable: Record<string, Editable> = {}
  const xs = Object.values(nodes).map((p) => p[0]), ys = Object.values(nodes).map((p) => p[1])
  const box: [number, number, number, number] = [Math.min(...xs) + 0.3 * pxm, Math.min(...ys) + 0.3 * pxm, Math.max(...xs) - 0.3 * pxm, Math.max(...ys) - 0.3 * pxm]
  for (const k of Object.keys(nodes)) {
    const inc = walls.filter((w) => w.a === k || w.b === k)
    const outerInc = inc.filter((w) => outerIds.has(w.id))
    const innerInc = inc.filter((w) => !outerIds.has(w.id))
    if (!innerInc.length) continue
    if (!outerInc.length) editable[k] = { type: 'free', box }
    else if (outerInc.length === 2 && innerInc.length >= 1) {
      const [n1, n2] = outerInc.map((w) => (w.a === k ? w.b : w.a))
      editable[k] = { type: 'slide', a: n1, b: n2, margin: 0.6 * pxm }
    }
  }
  // hints for the fixed items (kitchen / bathroom fixtures)
  const hints: Partial<Record<FType, Pt>> = { ...t.fixtures }
  // walking start: just inside the entrance door (a door in an outer wall), looking at the middle of the flat
  const cen: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  let start: Pt = interiorPoint(rooms[0].nodes.map((k) => nodes[k]))
  for (const w of walls) {
    const door = w.openings?.find((o) => o.kind === 'door')
    if (!door || !outerIds.has(w.id)) continue
    const L = dist(nodes[w.a], nodes[w.b]), tt = (door.from + door.to) / 2 / L
    const p: Pt = [nodes[w.a][0] + (nodes[w.b][0] - nodes[w.a][0]) * tt, nodes[w.a][1] + (nodes[w.b][1] - nodes[w.a][1]) * tt]
    const k = (0.7 * pxm) / (dist(p, cen) || 1)
    start = [p[0] + (cen[0] - p[0]) * k, p[1] + (cen[1] - p[1]) * k]
    break
  }
  const haveAll = rooms.every((r) => r.skip || r.stated > 0)
  const counted = haveAll ? rooms.filter((r) => !r.skip).reduce((s, r) => s + (r.countsFull ? r.stated : r.stated * 0.5), 0) : 0
  // net floor area (walls taken off) of what the user marked, loggia counted half: area - perimeter * half wall thickness
  let netTotal = 0
  for (const r of rooms) {
    if (r.skip) continue
    const poly = r.nodes.map((k) => nodes[k])
    let a = Math.abs(area2(poly)), per = 0
    poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; const w = walls.find((x) => (x.a === r.nodes[i] && x.b === r.nodes[(i + 1) % poly.length]) || (x.b === r.nodes[i] && x.a === r.nodes[(i + 1) % poly.length])); per += dist(p, q) * (w ? w.thick / 2 : 0) })
    a -= per
    netTotal += (Math.max(a, 0) / pxm / pxm) * (r.countsFull ? 1 : 0.5)
  }
  const def: FlatDef = {
    id: u.id, name: u.name, image: u.image, imgW: u.imgW, imgH: u.imgH, pxPerM: pxm,
    nodes, walls, rooms, editable, statedTotal: Math.round(counted * 100) / 100,
    start: { pos: start, look: cen }, furniture: [], hints,
  }
  return { def, problems, netTotal: Math.round(netTotal * 100) / 100 }
}

// ───────────────────────── a built-in flat -> trace (so it can be copied and edited) ─────────────────────────
/** What the user changed in a flat after it was made (saved per flat); baked into the copy so it is exactly what they see. */
export type FlatEdits = { nodes?: Record<string, Pt>; customWalls?: Wall[]; openings?: Record<string, Opening[]>; roomKinds?: Record<string, string> }

export function traceFromDef(def: FlatDef, edits: FlatEdits = {}): TraceState {
  const pxm = def.pxPerM
  const nodes: Record<string, Pt> = structuredClone(def.nodes)
  for (const k of Object.keys(def.editable)) if (edits.nodes?.[k]) nodes[k] = edits.nodes[k]
  const custom = edits.customWalls ?? []
  for (const w of custom) for (const k of [w.a, w.b]) { const q = edits.nodes?.[k]; if (q) nodes[k] = q }
  const all: Wall[] = [...def.walls, ...custom]
  const thick = all.map((w) => w.thick), outer = Math.max(...thick), inner = Math.min(...thick)
  const t: TraceState = {
    pxPerM: pxm, nodes,
    walls: all.map((w) => ({ id: 'w' + w.id, a: w.a, b: w.b, thick: Math.round((w.thick / pxm) * 100) })), // every wall keeps its own thickness
    openings: [], rooms: [], fixtures: structuredClone(def.hints ?? {}),
    outerThick: Math.round((outer / pxm) * 100), innerThick: Math.round((inner / pxm) * 100),
  }
  for (const w of all) {
    const A = nodes[w.a], B = nodes[w.b]
    if (!A || !B) continue
    const L = dist(A, B)
    let list: Opening[] = edits.openings?.[w.id] ?? w.openings ?? []
    if (w.door && !edits.openings?.[w.id] && L >= 1.3 * pxm) list = [{ from: L / 2 - 0.45 * pxm, to: L / 2 + 0.45 * pxm, sill: 0, top: 2.05, kind: 'door' }] // a "doorway" wall carries a door in the middle
    for (const o of list) {
      const from = o.end === 'b' ? L - o.to : o.from, to = o.end === 'b' ? L - o.from : o.to
      const m = (from + to) / 2 / L
      t.openings.push({ id: uid('o'), at: [A[0] + (B[0] - A[0]) * m, A[1] + (B[1] - A[1]) * m], kind: o.kind, width: (to - from) / pxm, sill: o.sill, top: o.top })
    }
  }
  const KIND: Record<string, RoomTypeId> = { open: 'open', living: 'living', kitchen: 'kitchen', bedroom: 'bedroom', bath: 'bath', office: 'office', storage: 'storage' }
  for (const r of def.rooms) {
    const poly = r.nodes.map((k) => nodes[k]).filter(Boolean)
    const n = r.name.toLowerCase()
    const byName: RoomTypeId = r.skip ? 'shaft' : n.includes('bath') ? 'bath' : n.includes('bed') ? 'bedroom' : n.includes('loggia') ? 'loggia'
      : n.includes('kitchen') && n.includes('living') ? 'open' : n.includes('living') ? 'living' : n.includes('kitchen') ? 'kitchen' : n.includes('office') ? 'office' : 'hall'
    const type: RoomTypeId = r.skip || r.floor === 'loggia' ? byName : KIND[edits.roomKinds?.[r.id] ?? ''] ?? byName
    t.rooms.push({ id: uid('r'), at: interiorPoint(poly), type, stated: r.stated })
  }
  return t
}

// ───────────────────────── persistence ─────────────────────────
const KEY = 'planner-user-flats-v1'
export function readUserFlats(): UserFlat[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as UserFlat[] } catch { return [] }
}
export function writeUserFlats(list: UserFlat[]): string | null {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return null } catch { return 'The browser storage is full. Export some flats to files and delete them.' }
}

export const newFlatId = () => 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Re-read the user's flats and build their definitions. Flats that fail to build are skipped. */
export function loadUserFlats(): { rec: UserFlat; def: FlatDef }[] {
  const out: { rec: UserFlat; def: FlatDef }[] = []
  for (const rec of readUserFlats()) {
    const r = buildFlat(rec)
    if ('def' in r) out.push({ rec, def: r.def })
  }
  return out
}

// ───────────────────────── files ─────────────────────────
export function exportFlatJson(u: UserFlat): string {
  return JSON.stringify({ kind: 'flat-planner-flat', version: 1, flat: u })
}
export function parseFlatJson(text: string): UserFlat {
  const d = JSON.parse(text)
  const f = d?.kind === 'flat-planner-flat' ? d.flat : null
  if (!f || !f.trace || !f.image || !f.imgW || !f.imgH) throw new Error('This file is not a Flat Planner flat.')
  return { ...f, id: newFlatId(), created: Date.now(), updated: Date.now() }
}

/** Shrink a picked image to a sensible size and return it as a JPEG data URL (keeps the saved flat small). */
export async function loadImage(file: File, maxSide = 1800): Promise<{ url: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h)
  g.drawImage(bmp, 0, 0, w, h)
  return { url: c.toDataURL('image/jpeg', 0.85), w, h }
}
