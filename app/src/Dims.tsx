import { Html, Line } from '@react-three/drei'
import { rooms, insetRoom, roomAreas, openingsOf, m, PX_PER_M, type Pt, type Wall } from './plan'
import { useStore, useAllWalls, type Furn } from './store'
import { kindInfo } from './roomkinds'
import { CATALOG, sizeOf } from './catalog'

const cm = (v: number) => Math.round(v * 100)
const noRaycast = () => {}

const Tag = ({ p, children, cls = '' }: { p: [number, number, number]; children: React.ReactNode; cls?: string }) => (
  <Html position={p} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}><div className={'lbl ' + cls}>{children}</div></Html>
)

/** Clear width × depth (m) of a room polygon (in px). */
export function roomSize(poly: Pt[]): { w: number; d: number } {
  if (!poly.length) return { w: 0, d: 0 }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of poly) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return { w: (x1 - x0) / PX_PER_M, d: (y1 - y0) / PX_PER_M }
}

const inPolyM = (px: number, pz: number, poly: [number, number][]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > pz !== yj > pz && px < ((xj - xi) * (pz - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

type Seg = [number, number, number, number]

/** Ray O + t*D (t > 0) vs segment AB (u in [0, 1]). Returns t or Infinity. */
function raySeg(ox: number, oz: number, dx: number, dz: number, [ax, az, bx, bz]: Seg): number {
  const sx = bx - ax, sz = bz - az
  const den = dx * sz - dz * sx
  if (Math.abs(den) < 1e-8) return Infinity
  const qx = ax - ox, qz = az - oz
  const t = (qx * sz - qz * sx) / den
  if (t <= 1e-4) return Infinity
  const u = (qx * dz - qz * dx) / den
  return u >= -1e-4 && u <= 1 + 1e-4 ? t : Infinity
}

export type WallDist = { side: 'left' | 'right' | 'front' | 'back'; dist: number; from: [number, number]; to: [number, number] }

/** Distance from each of the 4 sides of an item to the nearest interior wall face (metres). */
export function itemWallDistances(q: Furn, nodes: Record<string, Pt>, customWalls: Wall[]): WallDist[] {
  const s = sizeOf(q)
  const roomPolys = rooms.filter((r) => !r.skip).map((r) => insetRoom(r, nodes).map(([x, y]) => [m(x), m(y)] as [number, number]))
  const host = roomPolys.find((poly) => inPolyM(q.x, q.z, poly))
  const segs: Seg[] = []
  const addPoly = (poly: [number, number][]) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      segs.push([a[0], a[1], b[0], b[1]])
    }
  }
  if (host) addPoly(host)
  else for (const poly of roomPolys) addPoly(poly)

  for (const w of customWalls) {
    const a = nodes[w.a], b = nodes[w.b]
    if (!a || !b) continue
    const ax = m(a[0]), az = m(a[1]), bx = m(b[0]), bz = m(b[1])
    const L = Math.hypot(bx - ax, bz - az)
    if (L < 0.01) continue
    const nx = -(bz - az) / L * (m(w.thick) / 2), nz = (bx - ax) / L * (m(w.thick) / 2)
    segs.push([ax + nx, az + nz, bx + nx, bz + nz])
    segs.push([ax - nx, az - nz, bx - nx, bz - nz])
    segs.push([ax + nx, az + nz, ax - nx, az - nz])
    segs.push([bx + nx, bz + nz, bx - nx, bz - nz])
  }

  const ux = Math.cos(q.rot), uz = -Math.sin(q.rot)
  const vx = Math.sin(q.rot), vz = Math.cos(q.rot)
  const dirs: { side: WallDist['side']; dx: number; dz: number; half: number }[] = [
    { side: 'right', dx: ux, dz: uz, half: s.w / 2 },
    { side: 'left', dx: -ux, dz: -uz, half: s.w / 2 },
    { side: 'front', dx: vx, dz: vz, half: s.d / 2 },
    { side: 'back', dx: -vx, dz: -vz, half: s.d / 2 },
  ]
  const out: WallDist[] = []
  for (const d of dirs) {
    let best = Infinity
    for (const seg of segs) {
      const t = raySeg(q.x, q.z, d.dx, d.dz, seg)
      if (t < best) best = t
    }
    if (!Number.isFinite(best)) continue
    const dist = Math.max(0, best - d.half)
    out.push({
      side: d.side,
      dist,
      from: [q.x + d.dx * d.half, q.z + d.dz * d.half],
      to: [q.x + d.dx * Math.max(best, d.half), q.z + d.dz * Math.max(best, d.half)],
    })
  }
  return out
}

/** Live distance lines + cm tags from the selected furniture item to the surrounding walls. */
export function ItemWallDims() {
  const sel = useStore((s) => s.selected)
  const furniture = useStore((s) => s.furniture)
  const nodes = useStore((s) => s.nodes)
  const custom = useStore((s) => s.customWalls)
  const q = sel ? furniture.find((f) => f.id === sel) : undefined
  if (!q) return null
  const dists = itemWallDistances(q, nodes, custom)
  const y = (q.y ?? 0) + 0.06
  return (
    <group>
      {dists.map((d) => {
        if (d.dist < 0.01) return null
        const mx = (d.from[0] + d.to[0]) / 2
        const mz = (d.from[1] + d.to[1]) / 2
        return (
          <group key={d.side}>
            <Line
              points={[[d.from[0], y, d.from[1]], [d.to[0], y, d.to[1]]]}
              color="#f97316"
              lineWidth={2}
              dashed
              dashSize={0.08}
              gapSize={0.05}
              raycast={noRaycast}
            />
            <Tag p={[mx, y + 0.04, mz]} cls="gap">{cm(d.dist)} cm</Tag>
          </group>
        )
      })}
    </group>
  )
}

/** "Dimensions" mode: clear wall-to-wall lengths, wall thickness, door/window sizes, room sizes & areas, furniture sizes. */
export function Dimensions() {
  const nodes = useStore((s) => s.nodes)
  const custom = useStore((s) => s.customWalls)
  const furniture = useStore((s) => s.furniture)
  const walls = useAllWalls()
  const kinds = useStore((s) => s.roomKinds)
  const areas = roomAreas(nodes, custom)

  return (
    <group>
      {rooms.map((r) => {
        const poly: Pt[] = insetRoom(r, nodes)
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
        const a = areas.find((x) => x.room.id === r.id)!.area
        const sz = roomSize(poly)
        return (
          <group key={r.id}>
            <Line points={[...poly, poly[0]].map(([x, y]) => [m(x), 0.03, m(y)] as [number, number, number])} color="#1e6fff" lineWidth={2} raycast={noRaycast} />
            {poly.map((p, i) => {
              const q = poly[(i + 1) % poly.length]
              const L = Math.hypot(q[0] - p[0], q[1] - p[1]) / PX_PER_M
              if (L < 0.25) return null
              // nudge the label towards the room centre so it doesn't sit inside the wall
              const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2
              const k = 14 / (Math.hypot(cx - mx, cy - my) || 1)
              return <Tag key={i} p={[m(mx + (cx - mx) * k), 0.05, m(my + (cy - my) * k)]} cls="dim">{cm(L)}</Tag>
            })}
            <Tag p={[m(cx), 0.05, m(cy)]} cls="room">
              {kinds[r.id] ? kindInfo(kinds[r.id]).label : r.name}
              <br />{sz.w.toFixed(2)} × {sz.d.toFixed(2)} m · {a.toFixed(2)} m²
            </Tag>
          </group>
        )
      })}
      {walls.map((w) => {
        const [ax, ay] = nodes[w.a], [bx, by] = nodes[w.b]
        const L = Math.hypot(bx - ax, by - ay)
        const mx = (ax + bx) / 2, my = (ay + by) / 2
        return (
          <group key={w.id}>
            <Tag p={[m(mx), 2.8, m(my)]} cls="wall">wall {cm(w.thick / PX_PER_M)} cm</Tag>
            {openingsOf(w, nodes).map((o, i) => {
              const f = (o.end === 'b' ? L - o.to : o.from), t = (o.end === 'b' ? L - o.from : o.to)
              const mid = (f + t) / 2 / L
              const px = ax + (bx - ax) * mid, py = ay + (by - ay) * mid
              const wd = (t - f) / PX_PER_M
              return (
                <Tag key={i} p={[m(px), (o.sill + o.top) / 2, m(py)]} cls={o.kind}>
                  {o.kind} {cm(wd)}×{cm(o.top - o.sill)}{o.sill > 0 ? ` · sill ${cm(o.sill)}` : ''}
                </Tag>
              )
            })}
          </group>
        )
      })}
      {furniture.map((q) => {
        const s = sizeOf(q)
        return <Tag key={q.id} p={[q.x, (q.y ?? 0) + s.h + 0.25, q.z]} cls="item">{CATALOG[q.type].label} {cm(s.w)}×{cm(s.d)}×{cm(s.h)}{q.y ? ` · at ${cm(q.y)}` : ''}</Tag>
      })}
    </group>
  )
}
