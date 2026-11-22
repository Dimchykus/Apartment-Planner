// Coordinates are image pixels of the traced floor plan; PX_PER_M is its calibration.
// The data of the active flat lives in these live-bound variables, set by activateFlat().
export let PX_PER_M = 74
export const CEILING = 2.7
export const m = (px: number) => px / PX_PER_M

export type Pt = [number, number]
// from/to are px along the wall, measured from node a (or from node b when end === 'b')
export type Opening = { from: number; to: number; sill: number; top: number; kind: 'window' | 'door'; end?: 'b'; glass?: boolean /* glazed door (french door) */; i?: number /* index in the wall's list (set by openingsOf) */ }
export type Wall = { id: string; a: string; b: string; thick: number; openings?: Opening[]; door?: boolean; custom?: boolean }
export type Room = { id: string; name: string; stated: number; nodes: string[]; floor: 'parquet' | 'tile' | 'loggia'; countsFull: boolean; skip?: boolean }

export let initialNodes: Record<string, Pt> = {}
export let walls: Wall[] = []

// Only interior walls can be edited; the outer shell is locked.
// 'slide' nodes move along an outer wall (between two fixed nodes); 'free' nodes move inside a box (px).
export type Editable =
  | { type: 'slide'; a: string; b: string; margin: number }
  | { type: 'free'; box: [number, number, number, number] }
export let editable: Record<string, Editable> = {}

export function constrainNode(id: string, x: number, y: number, nodes: Record<string, Pt>): Pt | null {
  const e = editable[id]
  if (!e) return null
  if (e.type === 'free') return [Math.min(e.box[2], Math.max(e.box[0], x)), Math.min(e.box[3], Math.max(e.box[1], y))]
  const [ax, ay] = nodes[e.a], [bx, by] = nodes[e.b]
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2)
  let t = ((x - ax) * dx + (y - ay) * dy) / L2
  t = Math.min(1 - e.margin / L, Math.max(e.margin / L, t))
  return [ax + dx * t, ay + dy * t]
}

export let rooms: Room[] = []

const wallBetween = (a: string, b: string) => walls.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))

const signedArea = (p: Pt[]) => {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

/** Room outline (px) pushed inwards by half the thickness of every wall it touches. */
export function insetRoom(room: Room, nodes: Record<string, Pt>): Pt[] {
  const ids = room.nodes
  const pts = ids.map((id) => nodes[id])
  const sgn = Math.sign(signedArea(pts)) || 1
  const lines = ids.map((id, i) => {
    const j = (i + 1) % ids.length
    const [x1, y1] = pts[i], [x2, y2] = pts[j]
    const w = wallBetween(id, ids[j])
    const h = w ? w.thick / 2 : 0
    const L = Math.hypot(x2 - x1, y2 - y1) || 1
    const dx = (x2 - x1) / L, dy = (y2 - y1) / L
    const nx = -dy * sgn, ny = dx * sgn
    return { px: x1 + nx * h, py: y1 + ny * h, dx, dy }
  })
  return ids.map((_, i) => {
    const p = lines[(i + ids.length - 1) % ids.length], q = lines[i]
    const cross = p.dx * q.dy - p.dy * q.dx
    if (Math.abs(cross) < 1e-6) return [q.px, q.py] as Pt
    const t = ((q.px - p.px) * q.dy - (q.py - p.py) * q.dx) / cross
    return [p.px + p.dx * t, p.py + p.dy * t] as Pt
  })
}

export const areaM2 = (p: Pt[]) => Math.abs(signedArea(p)) / PX_PER_M / PX_PER_M

const inPoly = (p: Pt, poly: Pt[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Net room areas; added inner walls take up floor space, which is subtracted from the room they stand in. */
export function roomAreas(nodes: Record<string, Pt>, custom: Wall[] = []) {
  return rooms.map((r) => {
    const poly = insetRoom(r, nodes)
    let a = areaM2(poly)
    for (const w of custom) {
      const [ax, ay] = nodes[w.a] ?? [0, 0], [bx, by] = nodes[w.b] ?? [0, 0]
      if (inPoly([(ax + bx) / 2, (ay + by) / 2], poly)) a -= (Math.hypot(bx - ax, by - ay) * w.thick) / PX_PER_M / PX_PER_M
    }
    return { room: r, area: a }
  })
}

/** Openings the user changed (per wall id). Anything not listed here comes from the flat's definition. */
export let openingOv: Record<string, Opening[]> = {}
export function setOpeningOv(o: Record<string, Opening[]>) { openingOv = o }

/** Door state overrides (open/closed, hinge, swing side) synced from the store. */
export type DoorCfg = { state?: 0 | 1 | 2; hinge?: 'a' | 'b'; swing?: 1 | -1 }
export let doorStateOv: Record<string, DoorCfg> = {}
export function setDoorStateOv(d: Record<string, DoorCfg>) { doorStateOv = d }

/** Default side (+1 or -1 along wall normal) a door swings into: smaller of the two rooms it joins, or into the flat for the entrance. */
export function defaultDoorSwing(w: Wall, o: Opening, nodes: Record<string, Pt>): 1 | -1 {
  const A = nodes[w.a], B = nodes[w.b]
  if (!A || !B) return 1
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
  const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = -uy, ny = ux
  const s = (o.from + o.to) / 2, off = w.thick / 2 + 0.5 * PX_PER_M
  const polys = rooms.map((r) => { const poly = insetRoom(r, nodes); return { poly, area: areaM2(poly) } })
  const at = (sg: number): Pt => [A[0] + ux * s + nx * sg * off, A[1] + uy * s + ny * sg * off]
  const rp = polys.find((q) => inPoly(at(1), q.poly)), rn = polys.find((q) => inPoly(at(-1), q.poly))
  if (rp && !rn) return 1
  if (rn && !rp) return -1
  if (rp && rn) return rp.area <= rn.area ? 1 : -1
  return 1
}

/** Effective swing direction (+1 / -1 along wall normal) of a door, respecting user overrides. */
export function doorSwing(w: Wall, o: Opening, nodes: Record<string, Pt>, ov: Record<string, DoorCfg> = doorStateOv): 1 | -1 {
  const key = w.id + ':' + (o.i ?? 0)
  return ov[key]?.swing ?? defaultDoorSwing(w, o, nodes)
}

/** Openings of a wall as absolute distances (px) from node a. A "doorway" wall gets a 90 cm door in the middle. */
export function openingsOf(w: Wall, nodes: Record<string, Pt>): Opening[] {
  const [ax, ay] = nodes[w.a], [bx, by] = nodes[w.b]
  const L = Math.hypot(bx - ax, by - ay)
  if (w.door && !openingOv[w.id]) {
    const half = 0.45 * PX_PER_M
    if (L < 1.3 * PX_PER_M) return []
    return [{ from: L / 2 - half, to: L / 2 + half, sill: 0, top: 2.05, kind: 'door', i: 0 }]
  }
  return (openingOv[w.id] ?? w.openings ?? []).map((o, i) => {
    const from = o.end === 'b' ? L - o.to : o.from, to = o.end === 'b' ? L - o.from : o.to
    return { ...o, from: Math.max(0, from), to: Math.min(L, to), end: undefined, i }
  })
}

/** Snap a point (px) to the nearest existing node, else to the nearest wall centre line. */
export function snapPoint(x: number, y: number, nodes: Record<string, Pt>, all: Wall[], skip: string[] = []): Pt {
  const R = 14
  let best: Pt | null = null, bd = R
  for (const [id, p] of Object.entries(nodes)) {
    if (skip.includes(id)) continue
    const d = Math.hypot(p[0] - x, p[1] - y)
    if (d < bd) { bd = d; best = p }
  }
  if (best) return best
  for (const w of all) {
    if (skip.includes(w.id)) continue
    const [ax, ay] = nodes[w.a], [bx, by] = nodes[w.b]
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, py - y)
    if (d < bd) { bd = d; best = [px, py] }
  }
  return best ?? [x, y]
}

export let STATED_TOTAL = 0
export function totalArea(nodes: Record<string, Pt>, custom: Wall[] = []) {
  const a = roomAreas(nodes, custom)
  const living = a.filter((x) => !x.room.skip).reduce((s, x) => s + (x.room.countsFull ? x.area : x.area * 0.5), 0)
  const gross = a.filter((x) => !x.room.skip).reduce((s, x) => s + x.area, 0)
  return { living, gross }
}

export type FlatDef = {
  id: string; name: string; image: string; imgW: number; imgH: number; pxPerM: number
  nodes: Record<string, Pt>; walls: Wall[]; rooms: Room[]; editable: Record<string, Editable>
  statedTotal: number
  start: { pos: Pt; look: Pt } // walking start / look-at, px
  furniture: import('./store').Furn[]
  /** Where the developer's plan draws main items (px). Auto-furnish keeps them there, fitted to the rooms. */
  hints?: Partial<Record<import('./catalog').FType, Pt>>
}
export let flat: FlatDef
export function activateFlat(f: FlatDef) {
  flat = f
  PX_PER_M = f.pxPerM
  initialNodes = f.nodes
  walls = f.walls
  rooms = f.rooms
  editable = f.editable
  STATED_TOTAL = f.statedTotal
}
