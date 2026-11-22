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

const GROUND = -12 // the flat is on a high floor: street level is this far below

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
  const sm = quality === 'high' ? 4096 : quality === 'med' ? 2048 : 1024
  return (
    <>
      <primitive object={target} />
      <directionalLight ref={ref} castShadow position={[cx + d.x, Math.max(d.y, 2.5), cz + d.z]} intensity={e.sunI} color={e.sunColor}
        shadow-mapSize={[sm, sm]} shadow-bias={-0.0004}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={90} />
    </>
  )
})

/** Sky, street level, neighbouring buildings, trees; warm room lights at night. */
export const Outside = memo(function Outside({ env, cx, cz, fw, fh }: { env: EnvId; cx: number; cz: number; fw: number; fh: number }) {
  const e = ENV_SETTINGS[env]
  const grass = useMemo(grassTexture, [])
  const night = env === 'night'
  const q = useUI((s) => s.quality)
  const nB = q === 'high' ? 16 : q === 'med' ? 10 : 6, nT = q === 'high' ? 60 : q === 'med' ? 34 : 14

  const buildings = useMemo(() => {
    const r = rng(42), out: { x: number; z: number; w: number; d: number; h: number; tint: string; tex: THREE.Texture; lit: THREE.Texture }[] = []
    for (let i = 0; i < nB; i++) {
      const ang = (i / nB) * Math.PI * 2 + r() * 0.3, rad = 30 + r() * 38
      const w = 12 + r() * 12, d = 12 + r() * 12, h = 20 + r() * 34
      const tex = windowTexture(false, 100 + i), lit = windowTexture(true, 100 + i)
      for (const t of [tex, lit]) t.repeat.set(w / 4, h / 4)
      out.push({ x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad, w, d, h, tint: ['#d9d2c5', '#c9ced3', '#cdbfae', '#b9c2c9', '#d6c9c0'][i % 5], tex, lit })
    }
    return out
  }, [cx, cz, nB])

  const trees = useMemo(() => {
    const r = rng(9), out: { x: number; z: number; s: number; t: number }[] = []
    for (let i = 0; i < nT; i++) {
      const a = r() * Math.PI * 2, rad = 9 + r() * 34
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad
      if (Math.abs(x - cx) < fw / 2 + 5 && Math.abs(z - cz) < fh / 2 + 5) continue // keep clear under the building
      out.push({ x, z, s: 0.8 + r() * 0.9, t: r() })
    }
    return out
  }, [cx, cz, fw, fh, nT])


  return (
    <group>
      <fog attach="fog" args={[e.fog, 70, 330]} />
      <color attach="background" args={[e.fog]} />
      <Sky distance={3000} sunPosition={[e.sun[0] * 1000, e.sun[1] * 1000, e.sun[2] * 1000]} turbidity={e.sky.turbidity} rayleigh={e.sky.rayleigh} mieCoefficient={e.sky.mie} mieDirectionalG={0.8} />
      {e.stars && <Stars radius={900} depth={60} count={4000} factor={6} fade />}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, GROUND, cz]} receiveShadow>
        <circleGeometry args={[900, 48]} />
        <meshStandardMaterial map={grass} roughness={1} color={night ? '#3a4a40' : '#ffffff'} />
      </mesh>
      {/* the lower floors under our flat */}
      <mesh position={[cx, GROUND / 2 - 0.03, cz]} castShadow receiveShadow>
        <boxGeometry args={[fw + 1.2, -GROUND - 0.06, fh + 1.2]} />
        <meshStandardMaterial color="#cfc8bb" roughness={0.9} />
      </mesh>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, GROUND + b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.tint} map={b.tex} roughness={0.85}
            emissive="#ffffff" emissiveMap={b.lit} emissiveIntensity={night ? 1.4 : env === 'sunset' ? 0.4 : 0} />
        </mesh>
      ))}
      {trees.map((t, i) => (
        <group key={i} position={[t.x, GROUND, t.z]} scale={t.s}>
          <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.18, 0.26, 2.4, 8]} /><meshStandardMaterial color="#5b4630" roughness={1} /></mesh>
          <mesh position={[0, 4.2, 0]}><icosahedronGeometry args={[2.1, 1]} /><meshStandardMaterial color={t.t < 0.5 ? '#4d7a3c' : '#5f8a45'} roughness={1} flatShading /></mesh>
          <mesh position={[0.4, 5.6, 0.2]}><icosahedronGeometry args={[1.4, 1]} /><meshStandardMaterial color={t.t < 0.5 ? '#5a8742' : '#5a8742'} roughness={1} flatShading /></mesh>
        </group>
      ))}
    </group>
  )
})
