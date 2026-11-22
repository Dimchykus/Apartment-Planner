import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { openingsOf, m, PX_PER_M, doorSwing } from './plan'
import { useStore, useAllWalls } from './store'
import { useUI } from './ui/uiStore'
import { doorKey } from './wiring'

const FRAME = '#f6f5f1'
const LEAF = '#d9c7a8'
const DOOR_ANGLE = [0, Math.PI / 4, Math.PI / 2]

function Glass({ w, h, fancy }: { w: number; h: number; fancy: boolean }) {
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[w, h, 0.012]} />
      {fancy
        ? <meshPhysicalMaterial color="#cfe6f0" transmission={0.92} roughness={0.02} thickness={0.03} ior={1.5} transparent opacity={0.35} />
        : <meshStandardMaterial color="#bfdcea" roughness={0.1} metalness={0.2} transparent opacity={0.3} depthWrite={false} />}
    </mesh>
  )
}
const Bar = ({ p, s, c = FRAME }: { p: [number, number, number]; s: [number, number, number]; c?: string }) => (
  <mesh position={p} castShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={0.5} /></mesh>
)

function WindowMesh({ w, sill, top, thick, fancy }: { w: number; sill: number; top: number; thick: number; fancy: boolean }) {
  const h = top - sill, f = 0.05, t = Math.min(thick, 0.12)
  const bars = w > 1.45 ? Math.max(1, Math.round(w / 0.95) - 1) : 0
  return (
    <group position={[0, sill, 0]}>
      <Bar p={[-w / 2 + f / 2, h / 2, 0]} s={[f, h, t]} /><Bar p={[w / 2 - f / 2, h / 2, 0]} s={[f, h, t]} />
      <Bar p={[0, h - f / 2, 0]} s={[w, f, t]} />{sill > 0.05 && <Bar p={[0, f / 2, 0]} s={[w, f, t]} />}
      {Array.from({ length: bars }, (_, i) => <Bar key={i} p={[-w / 2 + ((i + 1) * w) / (bars + 1), h / 2, 0]} s={[0.035, h, t * 0.8]} />)}
      <Glass w={w - 2 * f} h={h - f * (sill > 0.05 ? 2 : 1)} fancy={fancy} />
      {sill > 0.3 && <Bar p={[0, -0.01, thick / 2 + 0.03]} s={[w + 0.1, 0.035, 0.1]} />}
      {sill > 0.3 && <Bar p={[0, -0.01, -thick / 2 - 0.03]} s={[w + 0.1, 0.035, 0.1]} />}
    </group>
  )
}

function DoorMesh({ w, top, thick, state, hinge, swing, glass, keyId, fancy, interactive }: { w: number; top: number; thick: number; state: 0 | 1 | 2; hinge: 'a' | 'b'; swing: 1 | -1; glass?: boolean; keyId: string; fancy: boolean; interactive: boolean }) {
  const pivot = useRef<THREE.Group>(null)
  const invalidate = useThree((s) => s.invalidate)
  const cur = useRef<number | null>(null)
  const target = DOOR_ANGLE[state]
  const lw = w - 0.07, lh = top - 0.04, t = Math.min(thick, 0.13), dir = hinge === 'a' ? 1 : -1
  useFrame((_, dt) => {
    if (cur.current === null) cur.current = target
    const d = target - cur.current
    if (Math.abs(d) > 0.002) { cur.current += d * Math.min(1, dt * 7); invalidate() } else cur.current = target
    if (pivot.current) pivot.current.rotation.y = (hinge === 'a' ? -swing : swing) * cur.current
  })
  const cycle = interactive ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); const s = useStore.getState(); const c = s.doorState[keyId]; s.setDoor(keyId, { state: (((c?.state ?? state) + 1) % 3) as 0 | 1 | 2 }) } : undefined
  return (
    <group>
      <Bar p={[-w / 2 + 0.025, top / 2, 0]} s={[0.05, top, t + 0.02]} /><Bar p={[w / 2 - 0.025, top / 2, 0]} s={[0.05, top, t + 0.02]} />
      <Bar p={[0, top - 0.025, 0]} s={[w, 0.05, t + 0.02]} />
      <group ref={pivot} position={[hinge === 'a' ? -w / 2 + 0.035 : w / 2 - 0.035, 0, 0]} userData={{ interact: { type: 'door', key: keyId } }}>
        <group position={[dir * lw / 2, lh / 2 + 0.02, 0]}>
          <mesh castShadow onClick={cycle} userData={{ interact: { type: 'door', key: keyId } }}>
            <boxGeometry args={[lw, lh, 0.04]} /><meshStandardMaterial color={LEAF} roughness={0.55} />
          </mesh>
          {glass ? (
            <mesh position={[0, 0.15, 0.001]}><boxGeometry args={[lw - 0.16, lh - 0.5, 0.045]} />
              {fancy ? <meshPhysicalMaterial color="#cfe6f0" transmission={0.9} roughness={0.05} transparent opacity={0.4} /> : <meshStandardMaterial color="#bfdcea" transparent opacity={0.35} depthWrite={false} />}
            </mesh>
          ) : (
            <>
              <mesh position={[0, lh * 0.2, 0.021]}><boxGeometry args={[lw - 0.2, lh * 0.34, 0.006]} /><meshStandardMaterial color="#cdb893" roughness={0.6} /></mesh>
              <mesh position={[0, -lh * 0.2, 0.021]}><boxGeometry args={[lw - 0.2, lh * 0.34, 0.006]} /><meshStandardMaterial color="#cdb893" roughness={0.6} /></mesh>
            </>
          )}
          {[1, -1].map((z) => (
            <mesh key={z} position={[dir * (lw / 2 - 0.07), -lh / 2 + 1.0, z * 0.04]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.012, 0.012, 0.12, 10]} /><meshStandardMaterial color="#9aa0a6" metalness={0.9} roughness={0.25} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

/** Every window and door of the flat: frames, glass, door leaves (closed / half open / open), click targets for the "Doors & windows" mode. */
export function Openings() {
  const nodes = useStore((s) => s.nodes)
  const walls = useAllWalls()
  const openings = useStore((s) => s.openings)
  const doorState = useStore((s) => s.doorState)
  const mode = useStore((s) => s.mode)
  const tool = useStore((s) => s.openingTool)
  const wallTool = useStore((s) => s.tool)
  const sel = useStore((s) => s.selOpening)
  const fancy = useUI((s) => s.quality) === 'high'
  const editing = mode === 'openings' || (mode === 'walls' && wallTool === 'move')
  const canSelect = mode === 'openings' ? tool === 'select' : mode === 'walls' && wallTool === 'move'

  return (
    <group>
      {walls.flatMap((w) => {
        const A = nodes[w.a], B = nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1])
        if (L < 1) return []
        const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, ang = Math.atan2(uy, ux), thick = m(w.thick)
        void openings
        return openingsOf(w, nodes).map((o) => {
          const i = o.i ?? 0, key = doorKey(w.id, i)
          const s = (o.from + o.to) / 2, width = m(o.to - o.from)
          const cx = m(A[0] + ux * s), cz = m(A[1] + uy * s)
          const isSel = sel?.wall === w.id && sel.i === i
          const cfg = doorState[key]
          const state = cfg?.state ?? (w.thick / PX_PER_M >= 0.21 ? 0 : 1)
          const hinge = cfg?.hinge ?? 'a'
          const swing = doorSwing(w, o, nodes, doorState)
          return (
            <group key={key} position={[cx, 0, cz]} rotation={[0, -ang, 0]}>
              {o.kind === 'window'
                ? <WindowMesh w={width} sill={o.sill} top={o.top} thick={thick} fancy={fancy} />
                : <DoorMesh w={width} top={o.top} thick={thick} state={state} hinge={hinge} swing={swing} glass={o.glass} keyId={key} fancy={fancy} interactive={mode === 'view'} />}
              {editing && (
                <>
                  <mesh position={[0, (o.sill + o.top) / 2, 0]} onPointerDown={canSelect ? (e) => { e.stopPropagation(); useStore.getState().select(null); useStore.getState().selectOpening({ wall: w.id, i }) } : undefined}>
                    <boxGeometry args={[width, o.top - o.sill, thick + 0.12]} />
                    <meshBasicMaterial color={isSel ? '#ff8a00' : '#1e90ff'} transparent opacity={isSel ? 0.28 : 0.1} depthWrite={false} />
                  </mesh>
                  {isSel && (
                    <lineSegments position={[0, (o.sill + o.top) / 2, 0]} raycast={() => {}}>
                      <edgesGeometry args={[new THREE.BoxGeometry(width + 0.02, o.top - o.sill + 0.02, thick + 0.14)]} /><lineBasicMaterial color="#ff8a00" depthTest={false} />
                    </lineSegments>
                  )}
                </>
              )}
            </group>
          )
        })
      })}
    </group>
  )
}
