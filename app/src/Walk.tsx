import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { m, openingsOf, flat, PX_PER_M } from './plan'
import { useStore, getAllWalls } from './store'
import { interactAhead } from './interact'
import { touchInput } from './ui/touch'
import { isTouch } from './ui/uiStore'

const R = 0.22
const EYE = 1.65

function blocked(x: number, z: number) {
  const nodes = useStore.getState().nodes
  for (const w of getAllWalls()) {
    // skip openings that are doors/windows? doors yes (walk through), windows block
    const A = nodes[w.a], Bn = nodes[w.b]
    const ax = m(A[0]), az = m(A[1]), bx = m(Bn[0]), bz = m(Bn[1])
    const dx = bx - ax, dz = bz - az
    const L2 = dx * dx + dz * dz
    let t = ((x - ax) * dx + (z - az) * dz) / L2
    const len = Math.sqrt(L2)
    const cl = Math.max(0, Math.min(1, t))
    const px = ax + dx * cl, pz = az + dz * cl
    if (Math.hypot(x - px, z - pz) < m(w.thick) / 2 + R) {
      // allow walking through door openings
      const along = (t * len) / m(1) // px along wall
      const pxAlong = t * Math.sqrt((Bn[0] - A[0]) ** 2 + (Bn[1] - A[1]) ** 2)
      void along
      const dst = useStore.getState().doorState
      if (openingsOf(w, nodes).some((o) => o.kind === 'door' && (dst[w.id + ':' + (o.i ?? 0)]?.state ?? (w.thick / PX_PER_M >= 0.21 ? 0 : 1)) !== 0 && pxAlong > o.from + 6 && pxAlong < o.to - 6)) continue // closed doors stop you
      return true
    }
  }
  return false
}

export function Walker() {
  const { camera, scene } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  useEffect(() => {
    const [sx, sy] = flat.start.pos, [lx, ly] = flat.start.look
    camera.position.set(m(sx), EYE, m(sy))
    camera.lookAt(m(lx), EYE, m(ly))
    const d = (e: KeyboardEvent) => { keys.current[e.code] = true; if (e.code === 'KeyE') interactAhead(camera, scene) }
    const u = (e: KeyboardEvent) => (keys.current[e.code] = false)
    addEventListener('keydown', d); addEventListener('keyup', u)
    return () => { removeEventListener('keydown', d); removeEventListener('keyup', u) }
  }, [camera, scene])

  useFrame((_, dt) => {
    const k = keys.current
    const speed = (k.ShiftLeft ? 3.2 : 1.6) * dt
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + touchInput.y
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + touchInput.x
    if (Math.abs(f) < 0.05 && Math.abs(s) < 0.05) return
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize()
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
    const mv = dir.multiplyScalar(f).add(right.multiplyScalar(s)).normalize().multiplyScalar(speed)
    const p = camera.position
    if (!blocked(p.x + mv.x, p.z)) p.x += mv.x
    if (!blocked(p.x, p.z + mv.z)) p.z += mv.z
    p.y = EYE
  })
  return isTouch ? <TouchLook /> : <PointerLockControls makeDefault />
}

/** Look around by dragging on the scene (phones / tablets have no pointer lock). */
function TouchLook() {
  const { camera, gl } = useThree()
  useEffect(() => {
    const el = gl.domElement
    camera.rotation.order = 'YXZ'
    let id = -1, lx = 0, ly = 0
    const down = (e: PointerEvent) => { if (id < 0) { id = e.pointerId; lx = e.clientX; ly = e.clientY } }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      camera.rotation.y -= (e.clientX - lx) * 0.005
      camera.rotation.x = Math.max(-1.4, Math.min(1.4, camera.rotation.x - (e.clientY - ly) * 0.005))
      lx = e.clientX; ly = e.clientY
    }
    const up = (e: PointerEvent) => { if (e.pointerId === id) id = -1 }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
  }, [camera, gl])
  return null
}

/** Free flight: no gravity, no collisions. WASD along the view direction, Space up, C down, Shift fast, mouse wheel changes speed. */
export function Flyer() {
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const speed = useRef(3)
  useEffect(() => {
    const d = (e: KeyboardEvent) => { keys.current[e.code] = true; if (e.code === 'Space' && document.pointerLockElement) e.preventDefault() }
    const u = (e: KeyboardEvent) => (keys.current[e.code] = false)
    const w = (e: WheelEvent) => { speed.current = Math.min(40, Math.max(0.5, speed.current * (e.deltaY < 0 ? 1.2 : 1 / 1.2))) }
    addEventListener('keydown', d); addEventListener('keyup', u)
    gl.domElement.addEventListener('wheel', w, { passive: true })
    return () => { removeEventListener('keydown', d); removeEventListener('keyup', u); gl.domElement.removeEventListener('wheel', w) }
  }, [gl])

  useFrame((_, dt) => {
    const k = keys.current
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + touchInput.y
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + touchInput.x
    const v = (k.Space ? 1 : 0) - (k.KeyC ? 1 : 0) + touchInput.up
    if (Math.abs(f) < 0.05 && Math.abs(s) < 0.05 && !v) return
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
    const mv = dir.multiplyScalar(f).add(right.multiplyScalar(s)).add(new THREE.Vector3(0, v, 0))
    if (mv.lengthSq() === 0) return
    mv.normalize().multiplyScalar(speed.current * (k.ShiftLeft || k.ShiftRight ? 3 : 1) * Math.min(dt, 0.1))
    camera.position.add(mv)
    camera.position.y = Math.max(-10, Math.min(400, camera.position.y)) // stay above street level
  })
  return isTouch ? <TouchLook /> : <PointerLockControls makeDefault />
}
