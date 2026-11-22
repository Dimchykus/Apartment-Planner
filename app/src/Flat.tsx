import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { rooms, CEILING, m, PX_PER_M, insetRoom, openingsOf, flat, type Wall, type Pt } from './plan'
import { useStore, useAllWalls } from './store'
import { floorTexture, floorInfo, defaultFloor, DEFAULT_WALL } from './materials'
import { Openings } from './Openings'

type Box = { cx: number; cz: number; len: number; thick: number; ang: number; y0: number; y1: number; wall: string }

/** Wall pieces between / above / below the openings of one wall (the windows and doors themselves are drawn by <Openings/>). */
function wallBoxes(w: Wall, nodes: Record<string, Pt>): Box[] {
  const [ax, ay] = nodes[w.a], [bx, by] = nodes[w.b]
  const L = Math.hypot(bx - ax, by - ay)
  if (L < 1) return []
  const ang = Math.atan2(by - ay, bx - ax)
  const ux = (bx - ax) / L, uy = (by - ay) / L
  const ext = w.thick / 2 // extend to close corners
  const mk = (s: number, e: number, y0: number, y1: number): Box => {
    const mid = (s + e) / 2
    return { cx: m(ax + ux * mid), cz: m(ay + uy * mid), len: m(e - s), thick: m(w.thick), ang, y0, y1, wall: w.id }
  }
  const ops = openingsOf(w, nodes).filter((o) => o.to - o.from > 10).sort((p, q) => p.from - q.from)
  const out: Box[] = []
  let cur = -ext
  for (const o of ops) {
    if (o.from > cur) out.push(mk(cur, o.from, 0, CEILING))
    if (o.sill > 0) out.push(mk(o.from, o.to, 0, o.sill))
    if (o.top < CEILING) out.push(mk(o.from, o.to, o.top, CEILING))
    cur = o.to
  }
  if (cur < L + ext) out.push(mk(cur, L + ext, 0, CEILING))
  return out
}

export function Flat({ ceiling, opacity = 1 }: { ceiling: boolean; opacity?: number }) {
  const solid = opacity >= 0.99
  const nodes = useStore((s) => s.nodes)
  const roomStyle = useStore((s) => s.roomStyle)
  const openings = useStore((s) => s.openings)
  const mode = useStore((s) => s.mode)
  const tool = useStore((s) => s.openingTool)
  const walls = useAllWalls()
  const sig = walls.map((w) => w.id + w.thick + (w.door ? 'd' : '')).join()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boxes = useMemo(() => walls.flatMap((w) => wallBoxes(w, nodes)), [nodes, sig, openings])

  // which room is on each side of every wall (so each side can have its own colour)
  const sides = useMemo(() => {
    const polys = rooms.map((r) => ({ id: r.id, poly: insetRoom(r, nodes).map(([x, y]) => [m(x), m(y)] as [number, number]) }))
    const inPoly = (p: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c } return c }
    const out: Record<string, [string | null, string | null]> = {}
    for (const w of walls) {
      const A = nodes[w.a], B = nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
      const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, d = w.thick / 2 + 0.25 * PX_PER_M
      const at = (sg: number): [number, number] => [m(mx - uy * sg * d), m(my + ux * sg * d)]
      const pick = (sg: number) => polys.find((q) => inPoly(at(sg), q.poly))?.id ?? null
      out[w.id] = [pick(1), pick(-1)]
    }
    return out
  }, [nodes, walls])

  const matCache = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), [])
  const wallMat = (color: string) => {
    const k = color + '|' + opacity
    let mt = matCache.get(k)
    if (!mt) { mt = new THREE.MeshStandardMaterial({ color, roughness: 0.92, transparent: !solid, opacity, depthWrite: solid }); matCache.set(k, mt) }
    return mt
  }
  const base = wallMat(DEFAULT_WALL)
  const colorOf = (room: string | null) => (room ? roomStyle[room]?.wall : roomStyle.outside?.wall) ?? DEFAULT_WALL
  const ghost = { transparent: !solid, opacity, depthWrite: solid }

  const onWallPick = (w: string) => (e: ThreeEvent<PointerEvent>) => {
    const st = useStore.getState()
    if (st.mode !== 'openings' || st.openingTool !== 'add') return
    e.stopPropagation()
    const wl = [...walls].find((q) => q.id === w)!
    const A = nodes[wl.a], B = nodes[wl.b], L = Math.hypot(B[0] - A[0], B[1] - A[1])
    const s = ((e.point.x * PX_PER_M - A[0]) * (B[0] - A[0]) + (e.point.z * PX_PER_M - A[1]) * (B[1] - A[1])) / L
    st.addOpening(w, s)
  }

  return (
    <group>
      {boxes.map((b, i) => {
        const [ra, rb] = sides[b.wall] ?? [null, null]
        return (
          <mesh key={i} position={[b.cx, (b.y0 + b.y1) / 2, b.cz]} rotation={[0, -b.ang, 0]} castShadow={solid} receiveShadow={solid} material={[base, base, base, base, wallMat(colorOf(ra)), wallMat(colorOf(rb))]}
            onPointerDown={mode === 'openings' && tool === 'add' ? onWallPick(b.wall) : undefined}>
            <boxGeometry args={[b.len, b.y1 - b.y0, b.thick]} />
          </mesh>
        )
      })}
      <Openings />
      {rooms.map((r) => {
        const shape = new THREE.Shape(insetRoom(r, nodes).map(([x, y]) => new THREE.Vector2(m(x), m(y))))
        const id = roomStyle[r.id]?.floor ?? defaultFloor(r.floor)
        return (
          <group key={r.id}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
              <shapeGeometry args={[shape]} />
              <meshStandardMaterial map={floorTexture(id)} roughness={floorInfo(id).rough} side={THREE.DoubleSide} {...ghost} />
            </mesh>
            {ceiling && (
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, 0]}>
                <shapeGeometry args={[shape]} />
                <meshStandardMaterial color="#fbfaf7" roughness={1} side={THREE.DoubleSide} {...ghost} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

export function PlanOverlay({ opacity = 0.5 }: { opacity?: number }) {
  const w = flat.imgW, h = flat.imgH
  const tex = useTexture(flat.image)
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[m(w) / 2, 0.012, m(h) / 2]} renderOrder={5}>
      <planeGeometry args={[m(w), m(h)]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}
