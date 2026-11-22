import { useEffect } from 'react'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { m, PX_PER_M, editable, snapPoint, type Pt } from './plan'
import { useStore, useAllWalls, getAllWalls, CATALOG } from './store'
import { sizeOf } from './catalog'
import { useUI } from './ui/uiStore'
import { misplaced } from './autofurnish'
import { Model, FurnOpacity, FurnFinish } from './Models'

const snap = (v: number, g = 0.05) => Math.round(v / g) * g

/** Snap an item's edges / centre to the edges / centres of the other items (within 6 cm) and report the guide lines. */
function alignSnap(id: string, x: number, z: number): { x: number; z: number; guide: { x?: number; z?: number } } {
  const st = useStore.getState(), me = st.furniture.find((q) => q.id === id)
  if (!me) return { x, z, guide: {} }
  const ext = (f: typeof me) => { const s = sizeOf(f), c = Math.abs(Math.cos(f.rot)), si = Math.abs(Math.sin(f.rot)); return { hx: (s.w * c + s.d * si) / 2, hz: (s.w * si + s.d * c) / 2 } }
  const a = ext(me); let bx = 0.06, bz = 0.06, gx: number | undefined, gz: number | undefined, nx = x, nz = z
  for (const o of st.furniture) {
    if (o.id === id || o.group === id) continue
    const b = ext(o)
    for (const p of [x - a.hx, x, x + a.hx]) for (const q of [o.x - b.hx, o.x, o.x + b.hx]) if (Math.abs(p - q) < bx) { bx = Math.abs(p - q); nx = x + (q - p); gx = q }
    for (const p of [z - a.hz, z, z + a.hz]) for (const q of [o.z - b.hz, o.z, o.z + b.hz]) if (Math.abs(p - q) < bz) { bz = Math.abs(p - q); nz = z + (q - p); gz = q }
  }
  return { x: nx, z: nz, guide: { x: gx, z: gz } }
}

/** Drop a carried item (click / Enter) or put it back (Esc). */
export function endCarry(cancel: boolean) {
  const st = useStore.getState(), d = st.drag
  if (d?.carry && d.kind === 'furn') { if (cancel) { st.moveFurn(d.id, d.sx ?? 0, d.sz ?? 0); st.patchFurn(d.id, { y: d.sy || undefined }) } st.setDrag(null); st.setGuide(null) }
}
export function startCarry(id: string) {
  const st = useStore.getState(), f = st.furniture.find((q) => q.id === id)
  if (f) st.setDrag({ kind: 'furn', id, dx: 0, dz: 0, carry: true, sx: f.x, sz: f.z, sy: f.y ?? 0, cy: 0 })
}

/** Invisible plane that receives pointer moves while something is dragged: the floor, or (wall view) a vertical plane along the wall. */
export function DragPlane() {
  const drag = useStore((s) => s.drag)
  const axis = useStore((s) => s.axis)
  const wv = useUI((s) => s.wallView)
  useEffect(() => {
    const up = () => { if (!useStore.getState().drag?.carry) { useStore.getState().setDrag(null); useStore.getState().setGuide(null) } }
    addEventListener('pointerup', up)
    return () => removeEventListener('pointerup', up)
  }, [])
  if (!drag) return null
  const st = useStore.getState()
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (drag.kind !== 'furn') {
      const x = snap(e.point.x + drag.dx), z = snap(e.point.z + drag.dz)
      if (drag.kind === 'node') st.moveNode(drag.id, x, z); else st.moveWall(drag.id, x, z)
      return
    }
    if (wv) { // elevation view: slide along the wall and change the hanging height
      const L = Math.hypot(wv.b[0] - wv.a[0], wv.b[1] - wv.a[1]), ux = (wv.b[0] - wv.a[0]) / L, uz = (wv.b[1] - wv.a[1]) / L
      const f = st.furniture.find((q) => q.id === drag.id)!
      const off = (drag.sx! - wv.a[0]) * wv.n[0] + (drag.sz! - wv.a[1]) * wv.n[1]
      const t = (e.point.x - wv.a[0]) * ux + (e.point.z - wv.a[1]) * uz + drag.dx
      if (axis !== 'z') st.moveFurn(drag.id, snap(wv.a[0] + ux * t + wv.n[0] * off), snap(wv.a[1] + uz * t + wv.n[1] * off))
      if (axis !== 'x' && (f.y !== undefined || CATALOG[f.type].h < 0.5 || f.type === 'shelf' || f.type === 'tv')) st.patchFurn(drag.id, { y: Math.max(0, Math.min(2.4, snap(e.point.y + drag.dz))) })
      return
    }
    if (axis === 'z') { // height only: mouse up / down
      st.patchFurn(drag.id, { y: Math.max(0, Math.min(2.4, snap((drag.sy ?? 0) + ((drag.cy ?? 0) - e.nativeEvent.clientY) * 0.006))) })
      return
    }
    let x = snap(e.point.x + drag.dx), z = snap(e.point.z + drag.dz)
    if (axis === 'x') z = drag.sz!; else if (axis === 'y') x = drag.sx!
    const a = alignSnap(drag.id, x, z)
    if (axis !== 'y') x = a.x
    if (axis !== 'x') z = a.z
    st.setGuide({ x: axis === 'y' ? undefined : a.guide.x, z: axis === 'x' ? undefined : a.guide.z })
    st.moveFurn(drag.id, x, z)
  }
  const L = wv ? Math.hypot(wv.b[0] - wv.a[0], wv.b[1] - wv.a[1]) : 0
  return (
    <mesh
      rotation={wv ? [0, Math.atan2(wv.n[0], wv.n[1]), 0] : [-Math.PI / 2, 0, 0]}
      position={wv ? [(wv.a[0] + wv.b[0]) / 2, 1.3, (wv.a[1] + wv.b[1]) / 2] : [0, 0.002, 0]}
      onPointerMove={onMove} onPointerDown={drag.carry ? () => endCarry(false) : undefined}>
      <planeGeometry args={wv ? [Math.max(L, 4) * 3, 8] : [80, 80]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

/** Alignment guide lines shown while moving furniture. */
export function Guides() {
  const g = useStore((s) => s.guide)
  const drag = useStore((s) => s.drag)
  if (!g || !drag) return null
  return (
    <group>
      {g.x !== undefined && <mesh position={[g.x, 0.03, 6]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.015, 40]} /><meshBasicMaterial color="#ff2d95" depthTest={false} transparent opacity={0.9} /></mesh>}
      {g.z !== undefined && <mesh position={[6, 0.03, g.z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[40, 0.015]} /><meshBasicMaterial color="#ff2d95" depthTest={false} transparent opacity={0.9} /></mesh>}
    </group>
  )
}

export function WallHandles() {
  const nodes = useStore((s) => s.nodes)
  const sel = useStore((s) => s.selected)
  const tool = useStore((s) => s.tool)
  const walls = useAllWalls()
  const customIds = walls.filter((w) => w.custom).flatMap((w) => [w.a, w.b])
  const selWall = sel && sel[0] === 'c' ? sel.slice(0, -1) : null
  const handleIds = [...Object.keys(editable), ...customIds]
  const grab = (id: string, px: number, py: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    useStore.getState().select(id)
    useStore.getState().setDrag({ kind: 'node', id, dx: m(px) - e.point.x, dz: m(py) - e.point.z })
  }
  return (
    <group>
      {tool === 'move' && handleIds.map((id) => {
        const [px, py] = nodes[id]
        const mine = selWall && id.startsWith(selWall)
        return (
          <mesh key={id} position={[m(px), 0.06, m(py)]} onPointerDown={grab(id, px, py)}>
            <cylinderGeometry args={[0.16, 0.16, 0.1, 24]} />
            <meshBasicMaterial color={sel === id ? '#ff8a00' : mine ? '#ffb454' : id[0] === 'c' ? '#17b26a' : '#1e90ff'} depthTest={false} transparent opacity={0.9} />
          </mesh>
        )
      })}
      {tool === 'move' && walls.filter((w) => w.custom).map((w) => {
        const [ax, ay] = nodes[w.a], [bx, by] = nodes[w.b]
        const mx = (ax + bx) / 2, my = (ay + by) / 2
        return (
          <mesh key={'mid' + w.id} position={[m(mx), 0.06, m(my)]}
            onPointerDown={(e) => {
              e.stopPropagation()
              useStore.getState().select(w.a)
              useStore.getState().setDrag({ kind: 'wall', id: w.id, dx: m(mx) - e.point.x, dz: m(my) - e.point.z })
            }}>
            <boxGeometry args={[0.26, 0.1, 0.26]} />
            <meshBasicMaterial color={selWall === w.id ? '#ff8a00' : '#7c5cff'} depthTest={false} transparent opacity={0.9} />
          </mesh>
        )
      })}
      {walls.map((w) => {
        const [ax, ay] = nodes[w.a], [bx, by] = nodes[w.b]
        const len = Math.hypot(bx - ax, by - ay) / PX_PER_M
        return (
          <Html key={w.id} position={[m((ax + bx) / 2), 0.15, m((ay + by) / 2)]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="lbl">{len.toFixed(2)} m</div>
          </Html>
        )
      })}
      <AddWallTool />
    </group>
  )
}

/** Two clicks on the floor: start point, end point. Snaps to 5 cm, then to existing corners and walls. */
function AddWallTool() {
  const tool = useStore((s) => s.tool)
  const start = useStore((s) => s.drawStart)
  const cur = useStore((s) => s.cursor)
  const thick = useStore((s) => s.newThick)
  if (tool !== 'add') return null
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): Pt => {
    const st = useStore.getState()
    const p = snapPoint(snap(e.point.x) * PX_PER_M, snap(e.point.z) * PX_PER_M, st.nodes, getAllWalls())
    return p
  }
  let prev = null
  if (start && cur) {
    const L = Math.hypot(cur[0] - start[0], cur[1] - start[1]) / PX_PER_M
    const ang = Math.atan2(cur[1] - start[1], cur[0] - start[0])
    prev = (<>
      <mesh position={[m((start[0] + cur[0]) / 2), 1.35, m((start[1] + cur[1]) / 2)]} rotation={[0, -ang, 0]}>
        <boxGeometry args={[L, 2.7, thick / 100]} />
        <meshBasicMaterial color="#17b26a" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      <Html position={[m((start[0] + cur[0]) / 2), 2.9, m((start[1] + cur[1]) / 2)]} center style={{ pointerEvents: 'none' }}>
        <div className="lbl">{L.toFixed(2)} m</div>
      </Html>
    </>)
  }
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}
        onPointerMove={(e) => useStore.getState().setCursor(pick(e))}
        onClick={(e) => {
          const p = pick(e)
          const st = useStore.getState()
          if (!st.drawStart) st.setDrawStart(p)
          else st.addWall(st.drawStart, p)
        }}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {cur && (
        <mesh position={[m(cur[0]), 0.06, m(cur[1])]}>
          <cylinderGeometry args={[0.1, 0.1, 0.1, 16]} />
          <meshBasicMaterial color="#17b26a" depthTest={false} />
        </mesh>
      )}
      {start && (
        <mesh position={[m(start[0]), 0.06, m(start[1])]}>
          <cylinderGeometry args={[0.14, 0.14, 0.1, 16]} />
          <meshBasicMaterial color="#17b26a" depthTest={false} />
        </mesh>
      )}
      {prev}
    </>
  )
}

export function Furniture({ editable, movable = false, opacity = 1 }: { editable: boolean; movable?: boolean; opacity?: number }) {
  const furniture = useStore((s) => s.furniture)
  const sel = useStore((s) => s.selected)
  const nodes = useStore((s) => s.nodes)
  const custom = useStore((s) => s.customWalls)
  return (
    <FurnOpacity.Provider value={opacity}>
    <group>
      {furniture.map((q) => {
        const c = { ...CATALOG[q.type], ...sizeOf(q) }
        const on = editable && sel === q.id
        const bad = editable && misplaced(q, nodes, custom, furniture)
        const base = CATALOG[q.type], sy = c.h / base.h
        const stretch = q.type === 'wardrobe' || q.type === 'kitchen' ? [1, sy, c.d / base.d] : [c.w / base.w, sy, c.d / base.d]
        return (
          <group key={q.id} position={[q.x, q.y ?? 0, q.z]} rotation={[0, q.rot, 0]}
            onPointerDown={editable ? (e) => {
              e.stopPropagation()
              useStore.getState().select(q.id)
              if (movable) {
                const wv = useUI.getState().wallView
                const L = wv ? Math.hypot(wv.b[0] - wv.a[0], wv.b[1] - wv.a[1]) : 1
                const t0 = wv ? ((q.x - wv.a[0]) * (wv.b[0] - wv.a[0]) + (q.z - wv.a[1]) * (wv.b[1] - wv.a[1])) / L - ((e.point.x - wv.a[0]) * (wv.b[0] - wv.a[0]) + (e.point.z - wv.a[1]) * (wv.b[1] - wv.a[1])) / L : 0
                useStore.getState().setDrag({ kind: 'furn', id: q.id, dx: wv ? t0 : q.x - e.point.x, dz: wv ? (q.y ?? 0) - e.point.y : q.z - e.point.z, sx: q.x, sz: q.z, sy: q.y ?? 0, cy: e.nativeEvent.clientY }) // dragging only in "Move items" mode
              }
            } : undefined}>
            <group scale={stretch as [number, number, number]}>
              <FurnFinish.Provider value={q.finish}>
                <Model type={q.type} color={q.color ?? c.color} w={q.w} low={q.low} style={q.style} />
              </FurnFinish.Provider>
            </group>
            {bad && !on && (
              <lineSegments position={[0, c.h / 2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(c.w + 0.02, c.h + 0.02, c.d + 0.02)]} />
                <lineBasicMaterial color="#e5222b" depthTest={false} />
              </lineSegments>
            )}
            {on && (
              <lineSegments position={[0, c.h / 2, 0]}>
                <edgesGeometry args={[new THREE.BoxGeometry(c.w + 0.04, c.h + 0.04, c.d + 0.04)]} />
                <lineBasicMaterial color="#ff8a00" depthTest={false} />
              </lineSegments>
            )}
          </group>
        )
      })}
    </group>
    </FurnOpacity.Provider>
  )
}

export function Keys() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (useUI.getState().tracer) return // the plan tracer has its own shortcuts
      const s = useStore.getState()
      const t = e.target as HTMLElement | null
      const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && ['text', 'number', 'search'].includes(t.type))
      if ((e.ctrlKey || e.metaKey) && !typing) {
        if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); s.undo(); return }
        if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); s.redo(); return }
      }
      if (s.mode === 'walls') {
        if (e.key === 'Escape') s.drawStart ? s.setDrawStart(null) : s.setTool('move')
        else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected?.[0] === 'c') s.removeWall(s.selected.slice(0, -1))
        return
      }
      if (s.drag?.carry) { if (e.key === 'Enter') { endCarry(false); return } if (e.key === 'Escape') { endCarry(true); return } }
      if (s.mode === 'move' && !typing && !e.ctrlKey && !e.metaKey) {
        const ax = ({ KeyX: 'x', KeyY: 'y', KeyZ: 'z' } as Record<string, 'x' | 'y' | 'z'>)[e.code]
        if (ax) { s.setAxis(s.axis === ax ? 'free' : ax); return }
        if (e.key === 'Enter' && s.selected && !s.drag) { startCarry(s.selected); return }
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD' && s.selected) { e.preventDefault(); s.duplicateFurn(s.selected); return }
      if ((s.mode !== 'furniture' && s.mode !== 'move') || !s.selected || typing) return
      const f = s.furniture.find((q) => q.id === s.selected)
      if (!f) return
      if (e.key === 'Delete' || e.key === 'Backspace') s.removeFurn(f.id)
      else if (e.code === 'KeyR') s.patchFurn(f.id, { rot: f.rot + Math.PI / 2 })
      else if (e.code === 'KeyQ') s.patchFurn(f.id, { rot: f.rot - Math.PI / 12 })
      else if (e.code === 'KeyE') s.patchFurn(f.id, { rot: f.rot + Math.PI / 12 })
    }
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [])
  return null
}
