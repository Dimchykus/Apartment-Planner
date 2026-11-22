import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { m, PX_PER_M, editable, snapPoint, rooms, insetRoom, type Pt } from './plan'
import { useStore, useAllWalls, getAllWalls, CATALOG, type Furn } from './store'
import { sizeOf } from './catalog'
import { useUI } from './ui/uiStore'
import { misplaced, overflowZones, type OverflowZone } from './autofurnish'
import { Model, FurnOpacity, FurnFinish } from './Models'

const UNIT_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const _ray = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _hit = new THREE.Vector3()
const _wallPlane = new THREE.Plane()
const _tmpN = new THREE.Vector3()
const _tmpP = new THREE.Vector3()
const noRaycast = () => {}

/** Distinct furniture ids hit by a ray, ordered front-to-back by actual mesh intersection distance. */
function hitFurnIds(intersections: THREE.Intersection[]): string[] {
  const ids: string[] = []
  for (const hit of intersections) {
    let o: THREE.Object3D | null = hit.object
    while (o) {
      const id = o.userData?.furnId as string | undefined
      if (id) { if (!ids.includes(id)) ids.push(id); break }
      o = o.parent
    }
  }
  return ids
}

const snap = (v: number, g = 0.05) => Math.round(v / g) * g
const snap1 = (v: number) => Math.round(v * 100) / 100

type Seg = [number, number, number, number]

/** Interior wall face segments (metres) for magnetic wall snapping. */
function wallSegments(): Seg[] {
  const st = useStore.getState()
  const segs: Seg[] = []
  for (const r of rooms) {
    if (r.skip) continue
    const poly = insetRoom(r, st.nodes)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      segs.push([m(a[0]), m(a[1]), m(b[0]), m(b[1])])
    }
  }
  for (const w of st.customWalls) {
    const a = st.nodes[w.a], b = st.nodes[w.b]
    if (!a || !b) continue
    const ax = m(a[0]), az = m(a[1]), bx = m(b[0]), bz = m(b[1])
    const L = Math.hypot(bx - ax, bz - az)
    if (L < 0.01) continue
    const nx = -(bz - az) / L * (m(w.thick) / 2), nz = (bx - ax) / L * (m(w.thick) / 2)
    segs.push([ax + nx, az + nz, bx + nx, bz + nz])
    segs.push([ax - nx, az - nz, bx - nx, bz - nz])
  }
  return segs
}

/**
 * Magnetic snap for moving furniture:
 * - Presses flush (0 cm) against walls within 14 cm, while still allowing pass-through if dragged further.
 * - Presses flush (0 cm) against touching items within 9 cm.
 * - Aligns edges / centres to other items within 5 cm (pink guides).
 */
function snapFurn(id: string, rawX: number, rawZ: number, axis: 'free' | 'x' | 'y' | 'z'): { x: number; z: number; guide: { x?: number; z?: number } | null } {
  const st = useStore.getState(), me = st.furniture.find((q) => q.id === id)
  if (!me) return { x: snap1(rawX), z: snap1(rawZ), guide: null }
  const ext = (f: Furn) => {
    const s = sizeOf(f), c = Math.abs(Math.cos(f.rot)), si = Math.abs(Math.sin(f.rot))
    return { hx: (s.w * c + s.d * si) / 2, hz: (s.w * si + s.d * c) / 2 }
  }
  const a = ext(me), s = sizeOf(me)
  const WALL_SNAP = 0.14, ITEM_SNAP = 0.09, ALIGN_SNAP = 0.05
  let bestDx = WALL_SNAP, bestDz = WALL_SNAP
  let snapX: number | null = null, snapZ: number | null = null
  let gx: number | undefined, gz: number | undefined

  const segs = wallSegments()
  const diagSegs: Seg[] = []
  for (const seg of segs) {
    const [ax, az, bx, bz] = seg
    if (Math.abs(ax - bx) < 0.01) {
      if (axis === 'y') continue
      const wx = (ax + bx) / 2, lo = Math.min(az, bz) - 0.05, hi = Math.max(az, bz) + 0.05
      if (rawZ + a.hz >= lo && rawZ - a.hz <= hi) {
        const dL = Math.abs((rawX - a.hx) - wx)
        if (dL < bestDx) { bestDx = dL; snapX = wx + a.hx }
        const dR = Math.abs((rawX + a.hx) - wx)
        if (dR < bestDx) { bestDx = dR; snapX = wx - a.hx }
      }
    } else if (Math.abs(az - bz) < 0.01) {
      if (axis === 'x') continue
      const wz = (az + bz) / 2, lo = Math.min(ax, bx) - 0.05, hi = Math.max(ax, bx) + 0.05
      if (rawX + a.hx >= lo && rawX - a.hx <= hi) {
        const dT = Math.abs((rawZ - a.hz) - wz)
        if (dT < bestDz) { bestDz = dT; snapZ = wz + a.hz }
        const dB = Math.abs((rawZ + a.hz) - wz)
        if (dB < bestDz) { bestDz = dB; snapZ = wz - a.hz }
      }
    } else {
      diagSegs.push(seg)
    }
  }

  // Contact snap against neighbouring items (flush touching)
  let bestCDx = Math.min(ITEM_SNAP, bestDx), bestCDz = Math.min(ITEM_SNAP, bestDz)
  for (const o of st.furniture) {
    if (o.id === id || o.group === id) continue
    const b = ext(o)
    if (axis !== 'y' && rawZ + a.hz > o.z - b.hz - 0.02 && rawZ - a.hz < o.z + b.hz + 0.02) {
      const txL = o.x + b.hx + a.hx, dL = Math.abs(rawX - txL)
      if (dL < bestCDx) { bestCDx = dL; snapX = txL; gx = o.x + b.hx }
      const txR = o.x - b.hx - a.hx, dR = Math.abs(rawX - txR)
      if (dR < bestCDx) { bestCDx = dR; snapX = txR; gx = o.x - b.hx }
    }
    if (axis !== 'x' && rawX + a.hx > o.x - b.hx - 0.02 && rawX - a.hx < o.x + b.hx + 0.02) {
      const tzT = o.z + b.hz + a.hz, dT = Math.abs(rawZ - tzT)
      if (dT < bestCDz) { bestCDz = dT; snapZ = tzT; gz = o.z + b.hz }
      const tzB = o.z - b.hz - a.hz, dB = Math.abs(rawZ - tzB)
      if (dB < bestCDz) { bestCDz = dB; snapZ = tzB; gz = o.z - b.hz }
    }
  }

  // Edge / centre alignment with other items (only on axes not already snapped to a wall/contact)
  let bx = ALIGN_SNAP, bz = ALIGN_SNAP
  for (const o of st.furniture) {
    if (o.id === id || o.group === id) continue
    const b = ext(o)
    if (snapX === null && axis !== 'y') {
      for (const p of [rawX - a.hx, rawX, rawX + a.hx]) {
        for (const q of [o.x - b.hx, o.x, o.x + b.hx]) {
          const d = Math.abs(p - q)
          if (d < bx) { bx = d; snapX = rawX + (q - p); gx = q }
        }
      }
    }
    if (snapZ === null && axis !== 'x') {
      for (const p of [rawZ - a.hz, rawZ, rawZ + a.hz]) {
        for (const q of [o.z - b.hz, o.z, o.z + b.hz]) {
          const d = Math.abs(p - q)
          if (d < bz) { bz = d; snapZ = rawZ + (q - p); gz = q }
        }
      }
    }
  }

  let nx = snapX !== null ? snapX : snap1(rawX)
  let nz = snapZ !== null ? snapZ : snap1(rawZ)

  // Angled / diagonal walls (flush snap along wall normal, pass-through past WALL_SNAP)
  if (axis === 'free' && diagSegs.length) {
    const ux = Math.cos(me.rot), uz = -Math.sin(me.rot)
    const vx = Math.sin(me.rot), vz = Math.cos(me.rot)
    let bestDiag = WALL_SNAP, pushX = 0, pushZ = 0
    for (const [ax, az, bx, bz] of diagSegs) {
      const L = Math.hypot(bx - ax, bz - az)
      if (L < 0.05) continue
      const tx = (bx - ax) / L, tz = (bz - az) / L
      const wnx = -tz, wnz = tx
      const radN = (s.w / 2) * Math.abs(ux * wnx + uz * wnz) + (s.d / 2) * Math.abs(vx * wnx + vz * wnz)
      const radT = (s.w / 2) * Math.abs(ux * tx + uz * tz) + (s.d / 2) * Math.abs(vx * tx + vz * tz)
      const proj = (nx - ax) * tx + (nz - az) * tz
      if (proj < -radT || proj > L + radT) continue
      const dist = (nx - ax) * wnx + (nz - az) * wnz
      const gap = Math.abs(Math.abs(dist) - radN)
      if (gap < bestDiag) {
        bestDiag = gap
        const delta = Math.sign(dist || 1) * radN - dist
        pushX = wnx * delta; pushZ = wnz * delta
      }
    }
    if (bestDiag < WALL_SNAP) { nx += pushX; nz += pushZ }
  }

  return { x: nx, z: nz, guide: gx !== undefined || gz !== undefined ? { x: gx, z: gz } : null }
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

/** Window-level ray-plane drag handler: zero 3D scene raycasting during drag, rAF-coalesced for smooth movement. */
export function DragPlane() {
  const drag = useStore((s) => s.drag)
  const { camera, gl } = useThree()

  useEffect(() => {
    if (!drag) return
    let raf = 0
    let lastEv: PointerEvent | null = null

    const process = (ev: PointerEvent) => {
      const st = useStore.getState()
      const d = st.drag
      if (!d) return
      const axis = st.axis
      const wv = useUI.getState().wallView

      if (d.kind === 'furn' && axis === 'z' && !wv) {
        st.patchFurn(d.id, { y: Math.max(0, Math.min(2.4, snap1((d.sy ?? 0) + ((d.cy ?? 0) - ev.clientY) * 0.006))) })
        return
      }

      const rect = gl.domElement.getBoundingClientRect()
      _ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      _ray.setFromCamera(_ndc, camera)

      let plane = FLOOR_PLANE
      if (d.kind === 'furn' && wv) {
        _tmpN.set(wv.n[0], 0, wv.n[1])
        _tmpP.set(wv.a[0], 0, wv.a[1])
        _wallPlane.setFromNormalAndCoplanarPoint(_tmpN, _tmpP)
        plane = _wallPlane
      }
      if (!_ray.ray.intersectPlane(plane, _hit)) return

      if (d.kind !== 'furn') {
        const x = snap(_hit.x + d.dx), z = snap(_hit.z + d.dz)
        if (d.kind === 'node') st.moveNode(d.id, x, z); else st.moveWall(d.id, x, z)
        return
      }

      if (wv) {
        const L = Math.hypot(wv.b[0] - wv.a[0], wv.b[1] - wv.a[1]) || 1
        const ux = (wv.b[0] - wv.a[0]) / L, uz = (wv.b[1] - wv.a[1]) / L
        const f = st.furniture.find((q) => q.id === d.id)
        if (!f) return
        const off = (d.sx! - wv.a[0]) * wv.n[0] + (d.sz! - wv.a[1]) * wv.n[1]
        const t = (_hit.x - wv.a[0]) * ux + (_hit.z - wv.a[1]) * uz + d.dx
        if (axis !== 'z') st.moveFurn(d.id, snap1(wv.a[0] + ux * t + wv.n[0] * off), snap1(wv.a[1] + uz * t + wv.n[1] * off))
        if (axis !== 'x' && (f.y !== undefined || CATALOG[f.type].h < 0.5 || f.type === 'shelf' || f.type === 'tv')) {
          st.patchFurn(d.id, { y: Math.max(0, Math.min(2.4, snap1(_hit.y + d.dz))) })
        }
        return
      }

      let rawX = _hit.x + d.dx, rawZ = _hit.z + d.dz
      if (axis === 'x') rawZ = d.sz!
      else if (axis === 'y') rawX = d.sx!
      const res = snapFurn(d.id, rawX, rawZ, axis)
      st.setGuide(res.guide)
      st.moveFurn(d.id, res.x, res.z)
    }

    const onMove = (ev: PointerEvent) => {
      lastEv = ev
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          if (lastEv) { const e = lastEv; lastEv = null; process(e) }
        })
      }
    }
    const onUp = () => {
      if (!useStore.getState().drag?.carry) {
        useStore.getState().setDrag(null)
        useStore.getState().setGuide(null)
      }
    }
    const onDown = (ev: PointerEvent) => {
      if (useStore.getState().drag?.carry && ev.target === gl.domElement) endCarry(false)
    }

    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointerdown', onDown)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointerdown', onDown)
    }
  }, [drag, camera, gl])

  return null
}

/** Alignment guide lines shown while moving furniture. */
export function Guides() {
  const g = useStore((s) => s.guide)
  const drag = useStore((s) => s.drag)
  if (!g || !drag) return null
  return (
    <group>
      {g.x !== undefined && <mesh position={[g.x, 0.03, 6]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}><planeGeometry args={[0.015, 40]} /><meshBasicMaterial color="#ff2d95" depthTest={false} transparent opacity={0.9} /></mesh>}
      {g.z !== undefined && <mesh position={[6, 0.03, g.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}><planeGeometry args={[40, 0.015]} /><meshBasicMaterial color="#ff2d95" depthTest={false} transparent opacity={0.9} /></mesh>}
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
    useStore.getState().selectOpening(null)
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

const FurnItem = memo(function FurnItem({ q, on, hov, bad, editable, movable, onHover, onUnhover }: {
  q: Furn; on: boolean; hov: boolean; bad: boolean; editable: boolean; movable: boolean
  onHover: (id: string) => void; onUnhover: (id: string) => void
}) {
  const c = { ...CATALOG[q.type], ...sizeOf(q) }
  const base = CATALOG[q.type], sy = c.h / base.h
  const stretch = q.type === 'wardrobe' || q.type === 'kitchen' ? [1, sy, c.d / base.d] : [c.w / base.w, sy, c.d / base.d]
  return (
    <group userData={{ furnId: q.id }} position={[q.x, q.y ?? 0, q.z]} rotation={[0, q.rot, 0]}
      onPointerOver={editable ? (e) => { e.stopPropagation(); onHover(q.id) } : undefined}
      onPointerOut={editable ? (e) => { e.stopPropagation(); onUnhover(q.id) } : undefined}
      onPointerDown={editable ? (e) => {
        e.stopPropagation()
        const st = useStore.getState()
        const ids = hitFurnIds(e.intersections)
        let pickId = ids[0] ?? q.id
        // If multiple items overlap along the click ray, clicking again cycles through them
        if (ids.length > 1 && (!movable || e.nativeEvent.altKey)) {
          const idx = st.selected ? ids.indexOf(st.selected) : -1
          if (idx >= 0) pickId = ids[(idx + 1) % ids.length]
        }
        st.select(pickId)
        if (movable) {
          const target = st.furniture.find((f) => f.id === pickId) ?? q
          const wv = useUI.getState().wallView
          if (wv) {
            _tmpN.set(wv.n[0], 0, wv.n[1])
            _tmpP.set(wv.a[0], 0, wv.a[1])
            _wallPlane.setFromNormalAndCoplanarPoint(_tmpN, _tmpP)
            const pt = e.ray.intersectPlane(_wallPlane, _hit) ? _hit : e.point
            const L = Math.hypot(wv.b[0] - wv.a[0], wv.b[1] - wv.a[1]) || 1
            const t0 = ((target.x - wv.a[0]) * (wv.b[0] - wv.a[0]) + (target.z - wv.a[1]) * (wv.b[1] - wv.a[1])) / L - ((pt.x - wv.a[0]) * (wv.b[0] - wv.a[0]) + (pt.z - wv.a[1]) * (wv.b[1] - wv.a[1])) / L
            st.setDrag({ kind: 'furn', id: target.id, dx: t0, dz: (target.y ?? 0) - pt.y, sx: target.x, sz: target.z, sy: target.y ?? 0, cy: e.nativeEvent.clientY })
          } else {
            // Project onto the exact same floor plane DragPlane uses -> zero parallax jump on grab
            const pt = e.ray.intersectPlane(FLOOR_PLANE, _hit) ? _hit : e.point
            st.setDrag({ kind: 'furn', id: target.id, dx: target.x - pt.x, dz: target.z - pt.z, sx: target.x, sz: target.z, sy: target.y ?? 0, cy: e.nativeEvent.clientY })
          }
        }
      } : undefined}>
      <group scale={stretch as [number, number, number]}>
        <FurnFinish.Provider value={q.finish}>
          <Model type={q.type} color={q.color ?? c.color} w={q.w} low={q.low} style={q.style} />
        </FurnFinish.Provider>
      </group>
      {bad && !on && (
        <lineSegments position={[0, c.h / 2, 0]} scale={[c.w + 0.02, c.h + 0.02, c.d + 0.02]} geometry={UNIT_EDGES} raycast={noRaycast}>
          <lineBasicMaterial color="#e5222b" depthTest={false} />
        </lineSegments>
      )}
      {hov && (
        <>
          <lineSegments position={[0, c.h / 2, 0]} scale={[c.w + 0.03, c.h + 0.03, c.d + 0.03]} geometry={UNIT_EDGES} raycast={noRaycast}>
            <lineBasicMaterial color="#2563eb" depthTest={false} transparent opacity={0.9} />
          </lineSegments>
          <Html position={[0, c.h + 0.16, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div className="lbl hover">{CATALOG[q.type].label}</div>
          </Html>
        </>
      )}
      {on && (
        <lineSegments position={[0, c.h / 2, 0]} scale={[c.w + 0.04, c.h + 0.04, c.d + 0.04]} geometry={UNIT_EDGES} raycast={noRaycast}>
          <lineBasicMaterial color="#ff8a00" depthTest={false} />
        </lineSegments>
      )}
    </group>
  )
})

/** Translucent red highlight of the exact regions where misplaced items overflow a wall, door, window, or neighbor. */
const OverflowOverlay = memo(function OverflowOverlay({ zones, showLabels }: { zones: OverflowZone[]; showLabels: boolean }) {
  if (!zones.length) return null
  return (
    <group>
      {zones.map((z, i) => {
        const shape = new THREE.Shape(z.poly.map(([x, zz]) => new THREE.Vector2(x, zz)))
        const depth = Math.max(0.06, z.y1 - z.y0)
        const cx = z.poly.reduce((s, p) => s + p[0], 0) / z.poly.length
        const cz = z.poly.reduce((s, p) => s + p[1], 0) / z.poly.length
        const ring = [...z.poly, z.poly[0]].map(([x, zz]) => [x, z.y1 + 0.018, zz] as [number, number, number])
        return (
          <group key={i}>
            <mesh position={[0, z.y1, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={9}>
              <extrudeGeometry args={[shape, { depth, bevelEnabled: false }]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={0.42} depthTest={false} side={THREE.DoubleSide} />
            </mesh>
            <Line points={ring} color="#dc2626" lineWidth={2.5} raycast={noRaycast} />
            {showLabels && (
              <Html position={[cx, z.y1 + 0.14, cz]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
                <div className="lbl overflow">{z.label}</div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
})

export const Furniture = memo(function Furniture({ editable, movable = false, showBad = editable, opacity = 1 }: { editable: boolean; movable?: boolean; showBad?: boolean; opacity?: number }) {
  const furniture = useStore((s) => s.furniture)
  const sel = useStore((s) => s.selected)
  const draggingFurn = useStore((s) => s.drag?.kind === 'furn')
  const nodes = useStore((s) => s.nodes)
  const custom = useStore((s) => s.customWalls)
  const doorState = useStore((s) => s.doorState)
  const [hovered, setHovered] = useState<string | null>(null)
  const deferredFurn = useDeferredValue(furniture)

  const badIds = useMemo(() => {
    const out = new Set<string>()
    if (!showBad) return out
    void doorState
    for (const q of deferredFurn) if (misplaced(q, nodes, custom, deferredFurn)) out.add(q.id)
    return out
  }, [showBad, deferredFurn, nodes, custom, doorState])

  // Exact overflow regions for all misplaced items (live for the selected item, deferred for others)
  const otherOverflows = useMemo(() => {
    if (!showBad) return [] as { id: string; zones: OverflowZone[] }[]
    void doorState
    const out: { id: string; zones: OverflowZone[] }[] = []
    for (const q of deferredFurn) {
      if (q.id === sel || !badIds.has(q.id)) continue
      const zs = overflowZones(q, nodes, custom, deferredFurn)
      if (zs.length) out.push({ id: q.id, zones: zs })
    }
    return out
  }, [showBad, deferredFurn, badIds, sel, nodes, custom, doorState])

  const selItem = showBad && sel ? furniture.find((q) => q.id === sel) : undefined
  const selOverflows = useMemo(
    () => { void doorState; return selItem ? overflowZones(selItem, nodes, custom, furniture) : [] },
    [selItem, nodes, custom, furniture, doorState],
  )

  const onHover = useCallback((id: string) => setHovered(id), [])
  const onUnhover = useCallback((id: string) => setHovered((h) => (h === id ? null : h)), [])

  const activeHover = editable ? hovered : null
  useEffect(() => {
    document.body.style.cursor = !editable ? '' : draggingFurn ? 'grabbing' : activeHover ? (movable ? 'grab' : 'pointer') : ''
    return () => { document.body.style.cursor = '' }
  }, [editable, activeHover, movable, draggingFurn])

  return (
    <FurnOpacity.Provider value={opacity}>
    <group>
      {furniture.map((q) => (
        <FurnItem
          key={q.id}
          q={q}
          on={editable && sel === q.id}
          hov={editable && hovered === q.id && sel !== q.id && !draggingFurn}
          bad={badIds.has(q.id)}
          editable={editable}
          movable={movable}
          onHover={onHover}
          onUnhover={onUnhover}
        />
      ))}
      {showBad && otherOverflows.map((o) => <OverflowOverlay key={o.id} zones={o.zones} showLabels={hovered === o.id && !draggingFurn} />)}
      {showBad && selOverflows.length > 0 && <OverflowOverlay zones={selOverflows} showLabels />}
    </group>
    </FurnOpacity.Provider>
  )
})

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
        if (e.key === 'Escape') { if (s.selOpening) s.selectOpening(null); else if (s.drawStart) s.setDrawStart(null); else s.setTool('move') }
        else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
          if (s.selOpening) s.removeOpening(s.selOpening.wall, s.selOpening.i)
          else if (s.selected?.[0] === 'c') s.removeWall(s.selected.slice(0, -1))
        }
        return
      }
      if (s.mode === 'openings' && !typing && (e.key === 'Delete' || e.key === 'Backspace') && s.selOpening) {
        s.removeOpening(s.selOpening.wall, s.selOpening.i)
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
