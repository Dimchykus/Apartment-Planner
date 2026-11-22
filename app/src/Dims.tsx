import { Html, Line } from '@react-three/drei'
import { rooms, insetRoom, roomAreas, openingsOf, m, PX_PER_M, type Pt } from './plan'
import { useStore, useAllWalls } from './store'
import { kindInfo } from './roomkinds'
import { CATALOG, sizeOf } from './catalog'

const cm = (v: number) => Math.round(v * 100)
const Tag = ({ p, children, cls = '' }: { p: [number, number, number]; children: React.ReactNode; cls?: string }) => (
  <Html position={p} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}><div className={'lbl ' + cls}>{children}</div></Html>
)

/** "Dimensions" mode: clear wall-to-wall lengths, wall thickness, door/window sizes, room areas, furniture sizes. */
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
        return (
          <group key={r.id}>
            <Line points={[...poly, poly[0]].map(([x, y]) => [m(x), 0.03, m(y)] as [number, number, number])} color="#1e6fff" lineWidth={2} />
            {poly.map((p, i) => {
              const q = poly[(i + 1) % poly.length]
              const L = Math.hypot(q[0] - p[0], q[1] - p[1]) / PX_PER_M
              if (L < 0.25) return null
              // nudge the label towards the room centre so it doesn't sit inside the wall
              const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2
              const k = 14 / (Math.hypot(cx - mx, cy - my) || 1)
              return <Tag key={i} p={[m(mx + (cx - mx) * k), 0.05, m(my + (cy - my) * k)]} cls="dim">{cm(L)}</Tag>
            })}
            <Tag p={[m(cx), 0.05, m(cy)]} cls="room">{kinds[r.id] ? kindInfo(kinds[r.id]).label : r.name}<br />{a.toFixed(2)} m²</Tag>
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
