// Ceiling lights and wall switches. Generated together with the furniture (so switches never end up behind a wardrobe),
// placed the way an electrician would: next to the door on the latch side, bathroom switch outside the bathroom, bedside switches by the bed.
import { rooms, walls as baseWalls, insetRoom, openingsOf, PX_PER_M, type Pt, type Wall, type Room } from './plan'
import { defaultKind, type RoomKind } from './autofurnish'
import { sizeOf, type Furn } from './catalog'

export type LightGroup = 'main' | 'bed'
export type Light = { id: string; room: string; kind: 'pendant' | 'spot' | 'sconce'; x: number; z: number; y: number; group: LightGroup }
export type Switch = { id: string; wall: string; s: number; side: 1 | -1; y: number; rooms: string[]; group: LightGroup; door?: string }
export type DoorCfg = { hinge?: 'a' | 'b'; swing?: 1 | -1 }

type V = [number, number]
const toM = (p: Pt): V => [p[0] / PX_PER_M, p[1] / PX_PER_M]
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1])
const inPoly = (p: V, poly: V[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const distToPoly = (p: V, poly: V[]) => {
  let best = Infinity
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t))
  })
  return best
}
/** Point of the polygon farthest from all its edges (where a ceiling light belongs). */
function pole(poly: V[]): V {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1])
  let best: V = poly[0], bd = -1
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.15) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.15) {
    if (!inPoly([x, z], poly)) continue
    const d = distToPoly([x, z], poly)
    if (d > bd) { bd = d; best = [x, z] }
  }
  return best
}
const areaOf = (poly: V[]) => Math.abs(poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0)) / 2

export const lightKey = (room: string, group: LightGroup) => room + ':' + group
export const doorKey = (wall: string, i: number) => wall + ':' + i

export function autoElectrics(nodes: Record<string, Pt>, customWalls: Wall[], furniture: Furn[], kinds: Record<string, RoomKind> = {}, door: (key: string) => DoorCfg = () => ({})): { lights: Light[]; switches: Switch[] } {
  const lights: Light[] = [], switches: Switch[] = []
  const all = [...baseWalls, ...customWalls]
  const info = rooms.filter((r) => !r.skip).map((r: Room) => {
    const poly = insetRoom(r, nodes).map(toM)
    return { r, poly, area: areaOf(poly), kind: (kinds[r.id] ?? defaultKind(r)) as RoomKind }
  })
  const roomAt = (p: V) => info.find((x) => inPoly(p, x.poly)) ?? null
  const inside = (f: Furn, x: (typeof info)[number]) => inPoly([f.x, f.z], x.poly)

  // ── ceiling lights
  let n = 0
  for (const x of info) {
    const mine = furniture.filter((f) => inside(f, x))
    const c = pole(x.poly)
    const big = x.area >= 7.5 && ['open', 'living', 'bedroom', 'office', 'kitchen'].includes(x.kind)
    lights.push({ id: 'L' + ++n, room: x.r.id, kind: big ? 'pendant' : 'spot', x: c[0], z: c[1], y: big ? 2.5 : 2.69, group: 'main' })
    if (x.area > 16) {
      const xs = x.poly.map((p) => p[0]), zs = x.poly.map((p) => p[1]); let k = 0
      for (let px = Math.min(...xs) + 0.9; px <= Math.max(...xs) && k < 6; px += 1.9) for (let pz = Math.min(...zs) + 0.9; pz <= Math.max(...zs) && k < 6; pz += 1.9) {
        if (inPoly([px, pz], x.poly) && distToPoly([px, pz], x.poly) >= 0.7 && dist([px, pz], c) >= 1.3) { lights.push({ id: 'L' + ++n, room: x.r.id, kind: 'spot', x: px, z: pz, y: 2.69, group: 'main' }); k++ }
      }
    }
    for (const k of mine.filter((f) => f.type === 'kitchen')) { // spots over the work surface
      const s = sizeOf(k), fx = Math.sin(k.rot), fz = Math.cos(k.rot), ax = Math.cos(k.rot), az = -Math.sin(k.rot)
      for (const o of s.w > 1.5 ? [-s.w / 3, 0, s.w / 3] : [0]) lights.push({ id: 'L' + ++n, room: x.r.id, kind: 'spot', x: k.x + fx * (s.d / 2 + 0.35) + ax * o, z: k.z + fz * (s.d / 2 + 0.35) + az * o, y: 2.69, group: 'main' })
    }
    for (const v of mine.filter((f) => f.type === 'vanity')) { const s = sizeOf(v); lights.push({ id: 'L' + ++n, room: x.r.id, kind: 'spot', x: v.x + Math.sin(v.rot) * (s.d / 2 + 0.4), z: v.z + Math.cos(v.rot) * (s.d / 2 + 0.4), y: 2.69, group: 'main' }) }
    if (x.kind === 'bedroom') for (const ns of mine.filter((f) => f.type === 'nightstand')) { // wall lamp above each bedside table
      const s = sizeOf(ns)
      lights.push({ id: 'L' + ++n, room: x.r.id, kind: 'sconce', x: ns.x - Math.sin(ns.rot) * (s.d / 2 + 0.04), z: ns.z - Math.cos(ns.rot) * (s.d / 2 + 0.04), y: 1.3, group: 'bed' })
    }
  }

  // ── switches
  const tall = furniture.filter((f) => sizeOf(f).h > 1.1 && (f.y ?? 0) < 1.1 && f.type !== 'kitchen' ? true : f.type === 'kitchen' && !f.low)
  const blocked = (p: V) => tall.some((f) => {
    const s = sizeOf(f), dx = p[0] - f.x, dz = p[1] - f.z
    return Math.abs(dx * Math.cos(f.rot) - dz * Math.sin(f.rot)) < s.w / 2 + 0.12 && Math.abs(dx * Math.sin(f.rot) + dz * Math.cos(f.rot)) < s.d / 2 + 0.12
  })
  const ppm = PX_PER_M
  let sn = 0
  for (const w of all) {
    const A = nodes[w.a], B = nodes[w.b]
    const L = Math.hypot(B[0] - A[0], B[1] - A[1])
    if (L < 1) continue
    const u: V = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nrm: V = [-u[1], u[0]]
    const ops = openingsOf(w, nodes)
    const wm = w.thick / ppm
    const at = (s: number, sgn: number, off: number): V => { const p = toM([A[0] + u[0] * s, A[1] + u[1] * s]); return [p[0] + nrm[0] * sgn * off, p[1] + nrm[1] * sgn * off] }
    for (const o of ops) {
      if (o.kind !== 'door') continue
      const key = doorKey(w.id, o.i ?? 0), cfg = door(key)
      const midS = (o.from + o.to) / 2
      const rp = roomAt(at(midS, 1, wm / 2 + 0.5)), rn = roomAt(at(midS, -1, wm / 2 + 0.5))
      for (const [sgn, R, other] of [[1, rp, rn], [-1, rn, rp]] as const) {
        if (!R || R.kind === 'bath') continue // a bathroom switch lives outside the bathroom
        const ctl = other && other.kind === 'bath' ? [other.r.id] : [R.r.id] // the switch beside a bathroom door works the bathroom light
        const hinge = cfg.hinge ?? 'a'
        const off = 0.16 * ppm
        const cands = hinge === 'a' ? [o.to + off, o.from - off] : [o.from - off, o.to + off] // latch side first
        const s = cands.find((c) => c > 0.25 * ppm && c < L - 0.25 * ppm && !ops.some((q) => c > q.from - 0.1 * ppm && c < q.to + 0.1 * ppm) && !blocked(at(c, sgn, wm / 2 + 0.06)))
        if (s === undefined) continue
        switches.push({ id: 'S' + ++sn, wall: w.id, s, side: sgn as 1 | -1, y: 1.05, rooms: ctl, group: 'main', door: key })
      }
    }
  }
  // bedside switches
  for (const x of info.filter((q) => q.kind === 'bedroom')) {
    for (const ns of furniture.filter((f) => f.type === 'nightstand' && inside(f, x))) {
      const s = sizeOf(ns), back: V = [ns.x - Math.sin(ns.rot) * (s.d / 2 + 0.08), ns.z - Math.cos(ns.rot) * (s.d / 2 + 0.08)]
      let best: { w: Wall; d: number; sOnWall: number; sgn: 1 | -1 } | null = null
      for (const w of all) {
        const A = toM(nodes[w.a]), B = toM(nodes[w.b]), dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz
        const t = Math.max(0, Math.min(1, ((back[0] - A[0]) * dx + (back[1] - A[1]) * dz) / L2))
        const q: V = [A[0] + dx * t, A[1] + dz * t], d = dist(q, back) - w.thick / ppm / 2
        const nrm: V = [-dz / Math.sqrt(L2), dx / Math.sqrt(L2)]
        const sgn: 1 | -1 = (back[0] - q[0]) * nrm[0] + (back[1] - q[1]) * nrm[1] >= 0 ? 1 : -1
        if (!best || d < best.d) best = { w, d, sOnWall: t * Math.sqrt(L2) * ppm, sgn }
      }
      if (best && best.d < 0.3) switches.push({ id: 'S' + ++sn, wall: best.w.id, s: best.sOnWall, side: best.sgn, y: 0.75, rooms: [x.r.id], group: 'bed' })
    }
  }
  return { lights, switches }
}
