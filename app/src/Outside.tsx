import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Sky, Stars } from '@react-three/drei'
import { useUI } from './ui/uiStore'

export type EnvId = 'day' | 'sunset' | 'night' | 'off'
export const ENVS: { id: EnvId; label: string }[] = [
  { id: 'day', label: 'Day' }, { id: 'sunset', label: 'Sunset' }, { id: 'night', label: 'Night' }, { id: 'off', label: 'Plain (no outside)' },
]

export const ENV_SETTINGS: Record<EnvId, {
  sun: [number, number, number]; sunColor: string; sunI: number; envI: number; fog: string; sky: { turbidity: number; rayleigh: number; mie: number }; indoor: number; stars: boolean
}> = {
  day: { sun: [0.55, 0.75, -0.35], sunColor: '#fff1dc', sunI: 2.6, envI: 0.7, fog: '#cfe3f5', sky: { turbidity: 5, rayleigh: 1.3, mie: 0.004 }, indoor: 0, stars: false },
  sunset: { sun: [0.9, 0.12, 0.45], sunColor: '#ff9a55', sunI: 2.2, envI: 0.35, fog: '#f1c6a6', sky: { turbidity: 10, rayleigh: 3, mie: 0.01 }, indoor: 0.4, stars: false },
  night: { sun: [0.2, -0.3, 0.2], sunColor: '#6f86c8', sunI: 0.12, envI: 0.12, fog: '#0a1020', sky: { turbidity: 0.5, rayleigh: 0.1, mie: 0.001 }, indoor: 1, stars: true },
  off: { sun: [0.55, 0.75, -0.35], sunColor: '#fff1dc', sunI: 2.6, envI: 0.7, fog: '#dfe6ee', sky: { turbidity: 5, rayleigh: 1.3, mie: 0.004 }, indoor: 0, stars: false },
}

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

function windowTexture(lit: boolean, seed: number) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128
  const g = c.getContext('2d')!, r = rng(seed)
  g.fillStyle = lit ? '#000' : '#b9b4ab'; g.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = r() < 0.35
    g.fillStyle = lit ? (on ? '#ffd890' : '#000') : on ? '#8fb2c8' : '#4d6577'
    g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')!, r = rng(7)
  g.fillStyle = '#6a8a55'; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2500; i++) { g.fillStyle = `hsl(${85 + r() * 30},${30 + r() * 20}%,${28 + r() * 18}%)`; g.fillRect(r() * 256, r() * 256, 3, 3) }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Sun light aimed at the flat so shadows follow the chosen time of day. */
export const SunLight = memo(function SunLight({ env, cx, cz, quality = 'med' }: { env: EnvId; cx: number; cz: number; quality?: 'low' | 'med' | 'high' }) {
  const e = ENV_SETTINGS[env]
  const ref = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => { target.position.set(cx, 0, cz); target.updateMatrixWorld(); if (ref.current) ref.current.target = target }, [cx, cz, target])
  const d = new THREE.Vector3(...e.sun).normalize().multiplyScalar(28)
  const sm = quality === 'high' ? 3072 : quality === 'med' ? 2048 : 1024
  return (
    <>
      <primitive object={target} />
      <directionalLight ref={ref} castShadow position={[cx + d.x, Math.max(d.y, 2.5), cz + d.z]} intensity={e.sunI} color={e.sunColor}
        shadow-mapSize={[sm, sm]} shadow-bias={-0.0004}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={90} />
    </>
  )
})

const CAR_COLORS = ['#e5e7eb', '#9ca3af', '#374151', '#1e3a5f', '#991b1b', '#2f5233', '#d6c7b2', '#18181b', '#3b6ea5']

/** Stylized parked car (4.4 × 1.85 m) resting at y = 0 in local coords. Front is +z. */
function Car({ x, z, y, rot, color, lit }: { x: number; z: number; y: number; rot: number; color: string; lit: boolean }) {
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      {/* lower body */}
      <mesh position={[0, 0.52, 0]}><boxGeometry args={[1.82, 0.56, 4.35]} /><meshStandardMaterial color={color} metalness={0.45} roughness={0.35} /></mesh>
      {/* cabin / greenhouse */}
      <mesh position={[0, 1.02, -0.18]}><boxGeometry args={[1.56, 0.48, 2.25]} /><meshStandardMaterial color={color} metalness={0.45} roughness={0.35} /></mesh>
      {/* windshield + side glass */}
      <mesh position={[0, 1.02, -0.18]}><boxGeometry args={[1.59, 0.36, 2.02]} /><meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.15} /></mesh>
      <mesh position={[0, 1.02, -0.18]}><boxGeometry args={[1.44, 0.36, 2.28]} /><meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.15} /></mesh>
      {/* 4 wheels */}
      {[[-0.86, 1.32], [0.86, 1.32], [-0.86, -1.32], [0.86, -1.32]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.32, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.32, 0.32, 0.22, 14]} />
          <meshStandardMaterial color="#18181b" roughness={0.85} />
        </mesh>
      ))}
      {/* headlights & taillights */}
      {[-0.64, 0.64].map((lx) => (
        <mesh key={'h' + lx} position={[lx, 0.55, 2.18]}><boxGeometry args={[0.32, 0.14, 0.03]} /><meshStandardMaterial color="#fff9db" emissive="#fff3b0" emissiveIntensity={lit ? 1.5 : 0} /></mesh>
      ))}
      {[-0.64, 0.64].map((lx) => (
        <mesh key={'t' + lx} position={[lx, 0.55, -2.18]}><boxGeometry args={[0.34, 0.12, 0.03]} /><meshStandardMaterial color="#b91c1c" emissive="#ef4444" emissiveIntensity={lit ? 1.2 : 0} /></mesh>
      ))}
    </group>
  )
}

/** Sky, street level, building shaft for chosen floor, parking lot with cars, neighbouring buildings, trees. */
export const Outside = memo(function Outside({ env, cx, cz, fw, fh }: { env: EnvId; cx: number; cz: number; fw: number; fh: number }) {
  const e = ENV_SETTINGS[env]
  const grass = useMemo(grassTexture, [])
  const night = env === 'night'
  const lit = night || env === 'sunset'
  const q = useUI((s) => s.quality)
  const floor = useUI((s) => s.floor)
  const totalFloors = useUI((s) => s.totalFloors)
  const parking = useUI((s) => s.parking)
  const ground = -((floor - 1) * 3 + 0.3)
  const nB = q === 'high' ? 16 : q === 'med' ? 10 : 6, nT = q === 'high' ? 60 : q === 'med' ? 34 : 14

  const shaftTex = useMemo(() => {
    const tex = windowTexture(false, 77), litTex = windowTexture(true, 77)
    const floorsBelow = Math.max(1, floor - 1)
    for (const t of [tex, litTex]) t.repeat.set(Math.max(2, Math.round((fw + 1.2) / 3.5)), Math.max(1, floorsBelow / 2))
    return { tex, litTex }
  }, [fw, floor])

  const buildings = useMemo(() => {
    const r = rng(42), out: { x: number; z: number; w: number; d: number; h: number; tint: string; tex: THREE.Texture; lit: THREE.Texture }[] = []
    const baseH = Math.max(6, totalFloors * 3)
    for (let i = 0; i < nB; i++) {
      const ang = (i / nB) * Math.PI * 2 + r() * 0.3, rad = 32 + r() * 38
      const w = 12 + r() * 12, d = 12 + r() * 12, h = Math.max(6, baseH * (0.65 + r() * 0.75))
      const tex = windowTexture(false, 100 + i), litT = windowTexture(true, 100 + i)
      for (const t of [tex, litT]) t.repeat.set(w / 4, h / 4)
      out.push({ x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad, w, d, h, tint: ['#d9d2c5', '#c9ced3', '#cdbfae', '#b9c2c9', '#d6c9c0'][i % 5], tex, lit: litT })
    }
    return out
  }, [cx, cz, nB, totalFloors])

  // Parking bays and cars arranged cleanly around all 4 sides of the building
  const parkW = fw + 15, parkD = fh + 15
  const { stripes, cars, lamps } = useMemo(() => {
    const r = rng(123)
    const st: { x: number; z: number; w: number; d: number }[] = []
    const cs: { x: number; z: number; rot: number; color: string }[] = []
    const bay = 2.75
    const fillChance = q === 'high' ? 0.78 : q === 'med' ? 0.58 : 0.35

    // North & South parking rows (cars perpendicular to the building)
    const nCols = Math.max(2, Math.floor((fw + 6) / bay))
    const startX = cx - ((nCols - 1) * bay) / 2
    for (const side of [-1, 1]) {
      const rowZ = cz + side * (fh / 2 + 4.8)
      for (let i = 0; i <= nCols; i++) {
        st.push({ x: startX - bay / 2 + i * bay, z: rowZ, w: 0.1, d: 4.8 })
      }
      for (let i = 0; i < nCols; i++) {
        if (r() < fillChance) {
          const jitter = (r() - 0.5) * 0.16
          const faceOut = r() < 0.5 ? 0 : Math.PI
          cs.push({ x: startX + i * bay + jitter, z: rowZ, rot: (side === 1 ? 0 : Math.PI) + faceOut, color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)] })
        }
      }
    }

    // East & West parking rows
    const nRows = Math.max(2, Math.floor((fh + 2) / bay))
    const startZ = cz - ((nRows - 1) * bay) / 2
    for (const side of [-1, 1]) {
      const colX = cx + side * (fw / 2 + 4.8)
      for (let i = 0; i <= nRows; i++) {
        st.push({ x: colX, z: startZ - bay / 2 + i * bay, w: 4.8, d: 0.1 })
      }
      for (let i = 0; i < nRows; i++) {
        if (r() < fillChance) {
          const jitter = (r() - 0.5) * 0.16
          const faceOut = r() < 0.5 ? 0 : Math.PI
          cs.push({ x: colX, z: startZ + i * bay + jitter, rot: (side === 1 ? Math.PI / 2 : -Math.PI / 2) + faceOut, color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)] })
        }
      }
    }

    const lp = [
      [cx - parkW / 2 + 1.2, cz - parkD / 2 + 1.2],
      [cx + parkW / 2 - 1.2, cz - parkD / 2 + 1.2],
      [cx - parkW / 2 + 1.2, cz + parkD / 2 - 1.2],
      [cx + parkW / 2 - 1.2, cz + parkD / 2 - 1.2],
    ] as [number, number][]
    return { stripes: st, cars: cs, lamps: lp }
  }, [cx, cz, fw, fh, parkW, parkD, q])

  const trees = useMemo(() => {
    const r = rng(9), out: { x: number; z: number; s: number; t: number }[] = []
    const clearX = parking ? parkW / 2 + 2.2 : fw / 2 + 5
    const clearZ = parking ? parkD / 2 + 2.2 : fh / 2 + 5
    for (let i = 0; i < nT; i++) {
      const a = r() * Math.PI * 2, rad = 12 + r() * 34
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad
      if (Math.abs(x - cx) < clearX && Math.abs(z - cz) < clearZ) continue // keep clear of building & parking
      out.push({ x, z, s: 0.8 + r() * 0.9, t: r() })
    }
    return out
  }, [cx, cz, fw, fh, parkW, parkD, parking, nT])

  const shaftH = Math.max(0.24, -ground - 0.04)

  return (
    <group>
      <fog attach="fog" args={[e.fog, 70, 330]} />
      <color attach="background" args={[e.fog]} />
      <Sky distance={3000} sunPosition={[e.sun[0] * 1000, e.sun[1] * 1000, e.sun[2] * 1000]} turbidity={e.sky.turbidity} rayleigh={e.sky.rayleigh} mieCoefficient={e.sky.mie} mieDirectionalG={0.8} />
      {e.stars && <Stars radius={900} depth={60} count={4000} factor={6} fade />}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, ground, cz]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial map={grass} roughness={1} color={night ? '#3a4a40' : '#ffffff'} />
      </mesh>
      {/* the lower floors under our flat */}
      <mesh position={[cx, ground + shaftH / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[fw + 1.2, shaftH, fh + 1.2]} />
        {floor > 1
          ? <meshStandardMaterial color="#cfc8bb" map={shaftTex.tex} roughness={0.88} emissive="#ffffff" emissiveMap={shaftTex.litTex} emissiveIntensity={night ? 1.2 : env === 'sunset' ? 0.35 : 0} />
          : <meshStandardMaterial color="#b5afa5" roughness={0.92} />}
      </mesh>

      {/* parking lot, bay markings, cars, and streetlights around the building */}
      {parking && (
        <group>
          {/* asphalt parking apron */}
          <mesh position={[cx, ground + 0.03, cz]} receiveShadow>
            <boxGeometry args={[parkW, 0.06, parkD]} />
            <meshStandardMaterial color={night ? '#20242a' : '#3b4048'} roughness={0.92} />
          </mesh>
          {/* concrete sidewalk ring around building */}
          <mesh position={[cx, ground + 0.075, cz]} receiveShadow>
            <boxGeometry args={[fw + 3.4, 0.09, fh + 3.4]} />
            <meshStandardMaterial color={night ? '#5a5f66' : '#c7c4bc'} roughness={0.9} />
          </mesh>
          {/* white parking bay lines */}
          {stripes.map((s, i) => (
            <mesh key={i} position={[s.x, ground + 0.064, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[s.w, s.d]} />
              <meshBasicMaterial color="#e5e7eb" transparent opacity={0.8} />
            </mesh>
          ))}
          {/* parked cars */}
          {cars.map((c, i) => <Car key={i} x={c.x} z={c.z} y={ground + 0.06} rot={c.rot} color={c.color} lit={lit} />)}
          {/* corner streetlamps */}
          {lamps.map(([lx, lz], i) => (
            <group key={i} position={[lx, ground + 0.06, lz]}>
              <mesh position={[0, 2.6, 0]}><cylinderGeometry args={[0.06, 0.09, 5.2, 10]} /><meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} /></mesh>
              <mesh position={[0, 5.25, 0]}><sphereGeometry args={[0.2, 12, 10]} /><meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={lit ? 2.5 : 0.1} /></mesh>
            </group>
          ))}
        </group>
      )}

      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, ground + b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.tint} map={b.tex} roughness={0.85}
            emissive="#ffffff" emissiveMap={b.lit} emissiveIntensity={night ? 1.4 : env === 'sunset' ? 0.4 : 0} />
        </mesh>
      ))}
      {trees.map((t, i) => (
        <group key={i} position={[t.x, ground, t.z]} scale={t.s}>
          <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.18, 0.26, 2.4, 8]} /><meshStandardMaterial color="#5b4630" roughness={1} /></mesh>
          <mesh position={[0, 4.2, 0]}><icosahedronGeometry args={[2.1, 1]} /><meshStandardMaterial color={t.t < 0.5 ? '#4d7a3c' : '#5f8a45'} roughness={1} flatShading /></mesh>
          <mesh position={[0.4, 5.6, 0.2]}><icosahedronGeometry args={[1.4, 1]} /><meshStandardMaterial color={t.t < 0.5 ? '#5a8742' : '#5a8742'} roughness={1} flatShading /></mesh>
        </group>
      ))}
    </group>
  )
})
