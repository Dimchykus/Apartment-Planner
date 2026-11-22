import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { rooms, insetRoom, m, PX_PER_M, CEILING } from './plan'
import { useStore, useAllWalls } from './store'
import { useUI } from './ui/uiStore'
import { lightKey, type Light } from './wiring'

const WARM = '#ffd9a0'

/** Is this room light group on? Automatic (on at dusk / night) until a switch has been used. */
export function useLightOn() {
  const lightOv = useStore((s) => s.lightOv)
  const env = useUI((s) => s.env)
  const auto = env === 'night' || env === 'sunset'
  return (room: string, group: 'main' | 'bed') => lightOv[lightKey(room, group)] ?? auto
}

function Fixture({ l, on }: { l: Light; on: boolean }) {
  const glow = { emissive: on ? WARM : '#000000', emissiveIntensity: on ? 2.2 : 0 }
  if (l.kind === 'pendant') return (
    <group position={[l.x, l.y, l.z]}>
      <mesh position={[0, (CEILING - l.y) / 2, 0]}><cylinderGeometry args={[0.008, 0.008, CEILING - l.y, 6]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[0.23, 0.26, 0.09, 28]} /><meshStandardMaterial color="#f4f1ea" roughness={0.6} {...glow} /></mesh>
    </group>
  )
  if (l.kind === 'sconce') return (
    <mesh position={[l.x, l.y, l.z]}><sphereGeometry args={[0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f1ede4" {...glow} /></mesh>
  )
  return <mesh position={[l.x, l.y, l.z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.055, 0.055, 0.015, 16]} /><meshStandardMaterial color="#f7f5f0" {...glow} /></mesh>
}

/** Ceiling lights (with real light when on), wall switches, and in the 2D view the lighting plan with switch wiring. */
export function Electrics({ view2d, ceiling2d }: { view2d: boolean; ceiling2d: boolean }) {
  const lights = useStore((s) => s.lights)
  const switches = useStore((s) => s.switches)
  const nodes = useStore((s) => s.nodes)
  const walls = useAllWalls()
  const mode = useStore((s) => s.mode)
  const q = useUI((s) => s.quality)
  const isOn = useLightOn()
  const wallOf = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls])

  // one real light per room (the pendant / first spot): enough to light the room, cheap enough for phones
  const sources = useMemo(() => {
    const first = new Map<string, Light>()
    for (const l of lights) if (l.group === 'main' && (!first.has(l.room) || (l.kind === 'pendant' && first.get(l.room)!.kind !== 'pendant'))) first.set(l.room, l)
    return [...first.values()]
  }, [lights])
  const maxSources = q === 'low' ? 0 : q === 'med' ? 4 : 10

  const swPos = (s: (typeof switches)[number]) => {
    const w = wallOf.get(s.wall)
    if (!w) return null
    const A = nodes[w.a], B = nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
    const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = -uy * s.side, nz = ux * s.side, off = w.thick / PX_PER_M / 2 + 0.008
    return { x: m(A[0] + ux * s.s) + nx * off, z: m(A[1] + uy * s.s) + nz * off, rot: Math.atan2(nx, nz), nx, nz }
  }
  const act = (e: { stopPropagation: () => void }, s: (typeof switches)[number]) => { e.stopPropagation(); for (const r of s.rooms) useStore.getState().toggleLight(r, s.group) }
  const clickable = mode === 'view' || mode === 'walk' || mode === 'fly'

  return (
    <group>
      {lights.map((l) => <Fixture key={l.id} l={l} on={isOn(l.room, l.group)} />)}
      {sources.slice(0, maxSources).map((l) => <pointLight key={l.id} position={[l.x, 2.3, l.z]} intensity={isOn(l.room, 'main') ? 7 : 0} distance={9} decay={2} color={WARM} />)}

      {switches.map((s) => {
        const p = swPos(s)
        if (!p) return null
        const on = s.rooms.some((r) => isOn(r, s.group))
        return (
          <group key={s.id} position={[p.x, s.y, p.z]} rotation={[0, p.rot, 0]} userData={{ interact: { type: 'switch', rooms: s.rooms, group: s.group } }}>
            <mesh castShadow onClick={clickable ? (e) => act(e, s) : undefined} userData={{ interact: { type: 'switch', rooms: s.rooms, group: s.group } }}>
              <boxGeometry args={[0.085, 0.085, 0.014]} /><meshStandardMaterial color="#fbfaf6" roughness={0.4} />
            </mesh>
            <mesh visible={false} position={[0, -0.04, 0.05]} userData={{ interact: { type: 'switch', rooms: s.rooms, group: s.group } }}><boxGeometry args={[0.3, 0.4, 0.1]} /><meshBasicMaterial /></mesh>
            <mesh position={[0, on ? 0.012 : -0.012, 0.009]}><boxGeometry args={[0.05, 0.034, 0.006]} /><meshStandardMaterial color="#ecebe5" roughness={0.4} /></mesh>
            <mesh position={[0.03, 0.03, 0.008]}><sphereGeometry args={[0.005, 8, 6]} /><meshStandardMaterial color={on ? '#ffb000' : '#999'} emissive={on ? '#ffb000' : '#000'} emissiveIntensity={on ? 2 : 0} /></mesh>
          </group>
        )
      })}

      {view2d && <LightingPlan2D ceiling={ceiling2d} />}
    </group>
  )
}

/** 2D lighting plan: ceiling light symbols, switches on the walls and thin wires from each switch to the lights it controls. */
function LightingPlan2D({ ceiling }: { ceiling: boolean }) {
  const lights = useStore((s) => s.lights)
  const switches = useStore((s) => s.switches)
  const nodes = useStore((s) => s.nodes)
  const walls = useAllWalls()
  const isOn = useLightOn()
  const Y = CEILING + 0.4
  const wallOf = new Map(walls.map((w) => [w.id, w]))
  const swXZ = (s: (typeof switches)[number]): [number, number] | null => {
    const w = wallOf.get(s.wall)
    if (!w) return null
    const A = nodes[w.a], B = nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
    return [m(A[0] + ((B[0] - A[0]) / L) * s.s), m(A[1] + ((B[1] - A[1]) / L) * s.s)]
  }
  return (
    <group>
      {ceiling && rooms.filter((r) => !r.skip).map((r) => {
        const shape = new THREE.Shape(insetRoom(r, nodes).map(([x, y]) => new THREE.Vector2(m(x), m(y))))
        return <mesh key={r.id} rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING + 0.05, 0]}><shapeGeometry args={[shape]} /><meshBasicMaterial color="#f4efe3" transparent opacity={0.72} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      })}
      {switches.map((s) => {
        const p = swXZ(s)
        if (!p) return null
        // wiring: switch -> nearest lamp -> next nearest ... (one run per room, like a real circuit)
        const left = lights.filter((l) => s.rooms.includes(l.room) && l.group === s.group)
        const pts: [number, number, number][] = [[p[0], Y, p[1]]]
        let cur: [number, number] = p
        while (left.length) {
          let bi = 0
          left.forEach((l, i) => { if (Math.hypot(l.x - cur[0], l.z - cur[1]) < Math.hypot(left[bi].x - cur[0], left[bi].z - cur[1])) bi = i })
          const [l] = left.splice(bi, 1)
          pts.push([l.x, Y, l.z]); cur = [l.x, l.z]
        }
        return pts.length > 1 ? <Line key={s.id} points={pts} color="#c0392b" lineWidth={1.2} dashed dashSize={0.12} gapSize={0.08} transparent opacity={0.8} /> : null
      })}
      {lights.map((l) => {
        const on = isOn(l.room, l.group), r = l.kind === 'pendant' ? 0.2 : l.kind === 'sconce' ? 0.09 : 0.1
        return (
          <group key={l.id} position={[l.x, Y, l.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh><ringGeometry args={[r * 0.8, r, 24]} /><meshBasicMaterial color={on ? '#d98a00' : '#444'} depthTest={false} /></mesh>
            <mesh><circleGeometry args={[r * 0.8, 24]} /><meshBasicMaterial color={on ? '#ffd24a' : '#d8d8d8'} depthTest={false} transparent opacity={0.9} /></mesh>
            {l.kind === 'pendant' && [0, 1, 2, 3].map((i) => <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]}><planeGeometry args={[r * 2.8, 0.02]} /><meshBasicMaterial color={on ? '#d98a00' : '#444'} depthTest={false} /></mesh>)}
          </group>
        )
      })}
      {switches.map((s) => {
        const p = swXZ(s)
        return p ? <mesh key={s.id} position={[p[0], Y, p[1]]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.2, 0.2]} /><meshBasicMaterial color="#c0392b" depthTest={false} /></mesh> : null
      })}
    </group>
  )
}
