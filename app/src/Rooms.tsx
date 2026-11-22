import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { rooms, insetRoom, flat, m, PX_PER_M, areaM2 } from './plan'
import { useStore } from './store'
import { defaultKind, explainPin, probePin, type PinProbe } from './autofurnish'
import { CATALOG } from './catalog'
import { kindInfo, ZONE_ITEMS } from './roomkinds'

/** "Rooms" mode: coloured, clickable rooms (set their function) and pins for where kitchen / sofa / bed … should go. */
export function RoomsLayer() {
  const nodes = useStore((s) => s.nodes)
  const kinds = useStore((s) => s.roomKinds)
  const sel = useStore((s) => s.selRoom)
  const placing = useStore((s) => s.placing)
  const hintOv = useStore((s) => s.hintOv)
  const pins = { ...(flat.hints ?? {}), ...hintOv }
  const [probe, setProbe] = useState<{ at: [number, number]; res: PinProbe } | null>(null)
  const last = useRef(0)
  const furniture = useDeferredValue(useStore((s) => s.furniture))
  const custom = useStore((s) => s.customWalls)
  const status = useMemo(() => {
    const o: Record<string, ReturnType<typeof explainPin>> = {}
    for (const z of ZONE_ITEMS) if (pins[z.type]) o[z.type] = explainPin(z.type, pins[z.type]!, furniture, nodes, custom)
    return o
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [furniture, nodes, custom, hintOv])

  return (
    <group>
      {rooms.map((r) => {
        const poly = insetRoom(r, nodes)
        const info = kindInfo(kinds[r.id] ?? defaultKind(r))
        const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(m(x), m(y))))
        const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cy = poly.reduce((a, p) => a + p[1], 0) / poly.length
        const on = sel === r.id
        return (
          <group key={r.id}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}
              onClick={(e) => {
                e.stopPropagation()
                const st = useStore.getState()
                if (!st.placing) st.selectRoom(r.id) // while placing, the pick plane above handles the click
              }}>
              <shapeGeometry args={[shape]} />
              <meshBasicMaterial color={info.color} transparent opacity={on ? 0.6 : 0.32} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {on && <Line points={[...poly, poly[0]].map(([x, y]) => [m(x), 0.06, m(y)] as [number, number, number])} color="#111" lineWidth={3} />}
            <Html position={[m(cx), 0.1, m(cy)]} center style={{ pointerEvents: 'none' }}>
              <div className={'lbl room' + (on ? ' selroom' : '')}>{info.label}<br />{areaM2(poly).toFixed(1)} m²</div>
            </Html>
          </group>
        )
      })}
      {ZONE_ITEMS.filter((z) => pins[z.type]).map((z) => {
        const [px, py] = pins[z.type]!
        const user = !!hintOv[z.type]
        const st = status[z.type]
        const ok = !st || st.reason === null          // item stands at the pin (within 60 cm)
        const color = ok ? (user ? '#1f9d55' : '#666') : '#e08a00'
        return (
          <group key={z.type}>
            <group position={[m(px), 0.08, m(py)]}>
              <mesh><cylinderGeometry args={[0.12, 0.12, 0.1, 20]} /><meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} /></mesh>
              <Html center position={[0, 0.25, 0]} style={{ pointerEvents: 'none' }}>
                <div className={'lbl' + (ok ? '' : ' pinwarn')}>
                  {z.label}{st?.item && !ok ? ` → ${st.dist.toFixed(1)} m away: ${st.reason}` : ''}
                </div>
              </Html>
            </group>
            {st?.item && !ok && <Line points={[[m(px), 0.08, m(py)], [st.item.x, 0.08, st.item.z]]} color="#e08a00" lineWidth={2} dashed dashSize={0.15} gapSize={0.1} />}
          </group>
        )
      })}
      {placing && (
        <>
          {/* one big pick plane above everything: clicks work anywhere, whatever stands there */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}
            onPointerMove={(e) => {
              const now = performance.now()
              if (now - last.current < 40) return
              last.current = now
              const st = useStore.getState()
              if (!st.placing) return
              setProbe({ at: [e.point.x, e.point.z], res: probePin(st.placing, [e.point.x * PX_PER_M, e.point.z * PX_PER_M], st.furniture, st.nodes, st.customWalls) })
            }}
            onPointerOut={() => setProbe(null)}
            onClick={(e) => {
              e.stopPropagation()
              const st = useStore.getState()
              if (!st.placing) return
              const res = probePin(st.placing, [e.point.x * PX_PER_M, e.point.z * PX_PER_M], st.furniture, st.nodes, st.customWalls)
              if (res.status === 'no') { setProbe({ at: [e.point.x, e.point.z], res }); return } // can't go there: keep placing
              st.setHint(st.placing, [(res.spot?.x ?? e.point.x) * PX_PER_M, (res.spot?.z ?? e.point.z) * PX_PER_M])
              setProbe(null)
            }}>
            <planeGeometry args={[80, 80]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {probe && (() => {
            const col = probe.res.status === 'ok' ? '#1f9d55' : probe.res.status === 'adapt' ? '#e08a00' : '#d92d2d'
            const sp = probe.res.spot
            return (
              <group>
                <mesh position={[probe.at[0], 0.25, probe.at[1]]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.28, 0.36, 40]} /><meshBasicMaterial color={col} depthTest={false} transparent opacity={0.95} />
                </mesh>
                <mesh position={[probe.at[0], 0.24, probe.at[1]]} rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[0.28, 40]} /><meshBasicMaterial color={col} depthTest={false} transparent opacity={0.28} />
                </mesh>
                {sp && (
                  <lineSegments position={[sp.x, 0.26, sp.z]} rotation={[0, sp.rot, 0]}>
                    <edgesGeometry args={[new THREE.BoxGeometry(sp.w, 0.02, sp.d)]} /><lineBasicMaterial color={col} depthTest={false} />
                  </lineSegments>
                )}
                <Html position={[probe.at[0], 0.4, probe.at[1]]} center style={{ pointerEvents: 'none' }}>
                  <div className="lbl" style={{ background: col, maxWidth: 260, whiteSpace: 'normal', textAlign: 'center' }}>
                    {probe.res.status === 'ok' ? '✓ ' : probe.res.status === 'adapt' ? '⚠ ' : '✕ '}{CATALOG[useStore.getState().placing ?? 'sofa'].label}: {probe.res.reason}
                  </div>
                </Html>
              </group>
            )
          })()}
        </>
      )}
      {placing && <Html fullscreen style={{ pointerEvents: 'none' }}><div className="banner">Click the floor where the {ZONE_ITEMS.find((z) => z.type === placing)?.label.toLowerCase()} should go</div></Html>}
    </group>
  )
}
