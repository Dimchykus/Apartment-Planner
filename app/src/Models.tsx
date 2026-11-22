import { createContext, useContext } from 'react'
import { RoundedBox } from '@react-three/drei'
import type { FType } from './store'

export const FurnOpacity = createContext(1)
export const FurnFinish = createContext<string | undefined>(undefined)

type P = { color: string }
type BProps = { p: [number, number, number]; s: [number, number, number]; c: string; r?: number; rough?: number; metal?: number }
const B = ({ p, s, c, r = 0.02, rough = 0.7, metal = 0 }: BProps) => {
  const op = useContext(FurnOpacity)
  const fin = useContext(FurnFinish)
  const roughness = fin === 'matte' ? Math.max(rough, 0.88) : fin === 'gloss' ? Math.min(rough, 0.18) : fin === 'satin' ? 0.5 : rough
  return (
  <RoundedBox args={s} radius={Math.min(r, Math.min(...s) / 2.01)} smoothness={2} position={p} castShadow={op >= 0.99} receiveShadow={op >= 0.99}>
    <meshStandardMaterial color={c} roughness={roughness} metalness={metal} transparent={op < 0.99} opacity={op} depthWrite={op >= 0.99} />
  </RoundedBox>
  )
}
const WOOD = '#7a5a3a'
const METAL = '#9a9ea2'

function Sofa({ color, style }: P & { style?: string }) {
  if (style === 'modern') return (<>
    <B p={[0, 0.3, 0]} s={[2.2, 0.22, 0.95]} c={color} r={0.06} rough={0.95} />
    <B p={[0, 0.58, -0.4]} s={[2.2, 0.4, 0.14]} c={color} r={0.06} rough={0.95} />
    <B p={[-1.07, 0.45, 0]} s={[0.06, 0.2, 0.95]} c={color} r={0.03} />
    <B p={[1.07, 0.45, 0]} s={[0.06, 0.2, 0.95]} c={color} r={0.03} />
    {[-0.55, 0.55].map((x) => <B key={x} p={[x, 0.46, 0.05]} s={[1.0, 0.12, 0.75]} c={color} r={0.05} rough={1} />)}
    {[[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]].map(([x, z], i) => <B key={i} p={[x, 0.09, z]} s={[0.04, 0.18, 0.04]} c="#b08a5a" />)}
  </>)
  return (<>
    <B p={[0, 0.2, 0]} s={[2.2, 0.28, 0.95]} c={color} r={0.05} />
    <B p={[0, 0.58, -0.37]} s={[2.2, 0.6, 0.22]} c={color} r={0.08} />
    <B p={[-1.04, 0.42, 0.02]} s={[0.16, 0.3, 0.85]} c={color} r={0.06} />
    <B p={[1.04, 0.42, 0.02]} s={[0.16, 0.3, 0.85]} c={color} r={0.06} />
    {[-0.65, 0, 0.65].map((x) => <B key={x} p={[x, 0.42, 0.08]} s={[0.62, 0.16, 0.65]} c={color} r={0.07} rough={0.95} />)}
    {[-0.7, 0, 0.7].map((x) => <B key={'b' + x} p={[x, 0.65, -0.22]} s={[0.6, 0.42, 0.16]} c={color} r={0.07} rough={0.95} />)}
    {[[-1, -0.35], [1, -0.35], [-1, 0.4], [1, 0.4]].map(([x, z], i) => <B key={i} p={[x, 0.04, z]} s={[0.05, 0.08, 0.05]} c="#222" />)}
  </>)
}

function Armchair({ color }: P) {
  return (<>
    <B p={[0, 0.22, 0]} s={[0.85, 0.3, 0.85]} c={color} r={0.06} />
    <B p={[0, 0.6, -0.34]} s={[0.85, 0.55, 0.17]} c={color} r={0.07} />
    <B p={[-0.38, 0.42, 0.05]} s={[0.12, 0.28, 0.75]} c={color} r={0.05} />
    <B p={[0.38, 0.42, 0.05]} s={[0.12, 0.28, 0.75]} c={color} r={0.05} />
    <B p={[0, 0.43, 0.06]} s={[0.6, 0.14, 0.6]} c={color} r={0.06} rough={0.95} />
  </>)
}
function CoffeeTable({ color, style }: P & { style?: string }) {
  if (style === 'round') return (<>
    <mesh position={[0, 0.38, 0]} castShadow receiveShadow><cylinderGeometry args={[0.5, 0.5, 0.04, 40]} /><meshStandardMaterial color={color} roughness={0.4} /></mesh>
    <mesh position={[0, 0.18, 0]} castShadow><cylinderGeometry args={[0.06, 0.09, 0.36, 20]} /><meshStandardMaterial color="#222" roughness={0.5} /></mesh>
  </>)
  return (<>
    <B p={[0, 0.38, 0]} s={[1.0, 0.04, 0.6]} c={color} r={0.015} rough={0.4} />
    <B p={[0, 0.15, 0]} s={[0.85, 0.03, 0.45]} c={color} r={0.01} />
    {[[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].map(([x, z], i) => <B key={i} p={[x, 0.19, z]} s={[0.04, 0.38, 0.04]} c="#222" />)}
  </>)
}

function DiningTable({ color, style }: P & { style?: string }) {
  if (style === 'round') return (<>
    <mesh position={[0, 0.74, 0]} castShadow receiveShadow><cylinderGeometry args={[0.7, 0.7, 0.04, 48]} /><meshStandardMaterial color={color} roughness={0.45} /></mesh>
    <mesh position={[0, 0.37, 0]} castShadow><cylinderGeometry args={[0.07, 0.07, 0.72, 20]} /><meshStandardMaterial color="#2b2b2d" metalness={0.5} roughness={0.4} /></mesh>
    <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.28, 0.3, 0.04, 32]} /><meshStandardMaterial color="#2b2b2d" metalness={0.5} roughness={0.4} /></mesh>
  </>)
  return (<>
    <B p={[0, 0.74, 0]} s={[1.4, 0.04, 0.8]} c={color} r={0.015} rough={0.45} />
    {[[-0.62, -0.32], [0.62, -0.32], [-0.62, 0.32], [0.62, 0.32]].map(([x, z], i) => <B key={i} p={[x, 0.36, z]} s={[0.06, 0.72, 0.06]} c={color} />)}
  </>)
}

function Chair({ color, style }: P & { style?: string }) {
  if (style === 'stool') return (<>
    <mesh position={[0, 0.66, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.05, 28]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>
    {[[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].map(([x, z], i) => <B key={i} p={[x, 0.32, z]} s={[0.03, 0.64, 0.03]} c={METAL} metal={0.8} rough={0.3} />)}
    <B p={[0, 0.25, 0]} s={[0.3, 0.02, 0.3]} c={METAL} metal={0.8} rough={0.3} />
  </>)
  return (<>
    <B p={[0, 0.45, 0]} s={[0.45, 0.05, 0.45]} c={color} r={0.02} />
    <B p={[0, 0.7, -0.2]} s={[0.45, 0.42, 0.04]} c={color} r={0.02} />
    {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z], i) => <B key={i} p={[x, 0.22, z]} s={[0.03, 0.44, 0.03]} c={METAL} metal={0.8} rough={0.3} />)}
  </>)
}

function Bed({ color, style }: P & { style?: string }) {
  const platform = style === 'platform'
  return (<>
    <B p={[0, platform ? 0.12 : 0.18, 0]} s={[1.7, platform ? 0.2 : 0.3, 2.05]} c={WOOD} r={0.03} />
    <B p={[0, platform ? 0.35 : 0.52, 0.02]} s={[1.6, 0.28, 1.95]} c={color} r={0.07} rough={0.95} />
    {!platform && <B p={[0, 0.7, -0.99]} s={[1.75, 0.95, 0.07]} c={style === 'wood' ? WOOD : '#4d4a52'} r={0.04} rough={style === 'wood' ? 0.55 : 0.9} />}
    {platform && <B p={[0, 0.4, -0.99]} s={[1.75, 0.5, 0.07]} c={WOOD} r={0.03} />}
    <B p={[-0.4, platform ? 0.55 : 0.72, -0.78]} s={[0.62, 0.14, 0.38]} c="#f4f2ee" r={0.06} rough={1} />
    <B p={[0.4, platform ? 0.55 : 0.72, -0.78]} s={[0.62, 0.14, 0.38]} c="#f4f2ee" r={0.06} rough={1} />
    <B p={[0, platform ? 0.52 : 0.69, 0.4]} s={[1.62, 0.1, 1.25]} c="#8aa0b5" r={0.05} rough={1} />
  </>)
}

function Nightstand({ color }: P) {
  return (<>
    <B p={[0, 0.25, 0]} s={[0.45, 0.46, 0.4]} c={color} r={0.015} />
    <B p={[0, 0.34, 0.2]} s={[0.36, 0.14, 0.01]} c="#5d4630" />
    <B p={[0, 0.17, 0.2]} s={[0.36, 0.14, 0.01]} c="#5d4630" />
  </>)
}
function Wardrobe({ color, w = 3, style }: P & { w?: number; style?: string }) {
  const n = Math.max(2, Math.round(w / 0.5))
  const dw = w / n
  if (style === 'sliding') {
    const k = Math.max(2, Math.round(w / 0.9))
    return (<>
      <B p={[0, 1.2, 0]} s={[w, 2.4, 0.6]} c={color} r={0.01} />
      {Array.from({ length: k }, (_, i) => (
        <B key={i} p={[-w / 2 + (w / k) * (i + 0.5), 1.2, 0.3 + (i % 2) * 0.015]} s={[w / k - 0.01, 2.34, 0.014]} c={i % 2 ? '#c9c4ba' : '#9aa3a8'} r={0.004} rough={0.25} metal={i % 2 ? 0 : 0.5} />
      ))}
    </>)
  }
  return (<>
    <B p={[0, 1.2, 0]} s={[w, 2.4, 0.6]} c={color} r={0.01} />
    {Array.from({ length: n }, (_, i) => (
      <group key={i}>
        <B p={[-w / 2 + dw * (i + 0.5), 1.2, 0.305]} s={[dw - 0.012, 2.34, 0.012]} c={color} r={0.004} rough={0.45} />
        <B p={[-w / 2 + dw * (i + 0.5) + (i % 2 ? -dw / 2 + 0.05 : dw / 2 - 0.05), 1.1, 0.325]} s={[0.012, 0.28, 0.02]} c={METAL} metal={0.9} rough={0.3} />
      </group>
    ))}
  </>)
}

function TvUnit({ color }: P) {
  return (<>
    <B p={[0, 0.25, 0]} s={[1.8, 0.4, 0.4]} c={color} r={0.015} />
    <B p={[0, 0.9, 0.0]} s={[1.25, 0.72, 0.03]} c="#0b0b0d" r={0.01} rough={0.15} />
    <B p={[0, 0.5, 0.0]} s={[0.15, 0.1, 0.06]} c="#1b1b1d" />
  </>)
}
function Kitchen({ color, w = 2.9, low = false }: P & { w?: number; low?: boolean }) {
  const n = Math.max(2, Math.round(w / 0.6))
  const dw = w / n
  return (<>
    <B p={[0, 0.43, 0]} s={[w, 0.8, 0.58]} c={color} r={0.01} />
    <B p={[0, 0.88, 0.0]} s={[w + 0.02, 0.04, 0.62]} c="#35373a" r={0.005} rough={0.3} />
    {Array.from({ length: n }, (_, i) => (
      <B key={i} p={[-w / 2 + dw * (i + 0.5), 0.43, 0.295]} s={[dw - 0.01, 0.74, 0.012]} c={color} r={0.004} rough={0.4} />
    ))}
    <B p={[-w / 2 + w * 0.3, 0.9, 0.02]} s={[0.55, 0.012, 0.4]} c={METAL} metal={0.9} rough={0.25} />
    {[[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.12], [0.12, 0.12]].map(([x, z], i) => (
      <B key={i} p={[w * 0.28 + x, 0.91, z]} s={[0.17, 0.01, 0.17]} c="#111" metal={0.5} rough={0.3} r={0.07} />
    ))}
    {!low && <B p={[0, 1.75, -0.12]} s={[w, 0.7, 0.35]} c={color} r={0.01} />}
    {!low && Array.from({ length: n }, (_, i) => (
      <B key={'u' + i} p={[-w / 2 + dw * (i + 0.5), 1.75, 0.065]} s={[dw - 0.01, 0.68, 0.012]} c={color} r={0.004} rough={0.4} />
    ))}
  </>)
}
function Fridge({ color }: P) {
  return (<>
    <B p={[0, 0.93, 0]} s={[0.6, 1.85, 0.65]} c={color} r={0.03} rough={0.35} metal={0.4} />
    <B p={[0, 1.3, 0.33]} s={[0.55, 0.005, 0.01]} c="#555" />
    <B p={[-0.22, 1.5, 0.34]} s={[0.02, 0.3, 0.02]} c={METAL} metal={1} rough={0.2} />
    <B p={[-0.22, 0.9, 0.34]} s={[0.02, 0.5, 0.02]} c={METAL} metal={1} rough={0.2} />
  </>)
}
function Bathtub({ color }: P) {
  return (<>
    <B p={[0, 0.27, 0]} s={[1.7, 0.54, 0.75]} c={color} r={0.07} rough={0.2} />
    <B p={[0, 0.55, 0]} s={[1.5, 0.02, 0.55]} c="#c9d3d8" r={0.03} rough={0.1} />
    <B p={[0.78, 0.65, -0.3]} s={[0.04, 0.2, 0.04]} c={METAL} metal={1} rough={0.15} />
  </>)
}
function Wc({ color }: P) {
  return (<>
    <B p={[0, 0.2, 0.1]} s={[0.36, 0.4, 0.5]} c={color} r={0.1} rough={0.15} />
    <B p={[0, 0.7, -0.27]} s={[0.4, 0.5, 0.18]} c={color} r={0.03} rough={0.15} />
    <B p={[0, 0.42, 0.1]} s={[0.38, 0.03, 0.5]} c="#efefed" r={0.1} rough={0.2} />
  </>)
}
function Vanity({ color }: P) {
  return (<>
    <B p={[0, 0.4, 0]} s={[0.8, 0.7, 0.5]} c={color} r={0.01} />
    <B p={[0, 0.8, 0]} s={[0.82, 0.04, 0.52]} c="#f4f4f2" r={0.01} rough={0.2} />
    <B p={[0, 0.83, 0.02]} s={[0.4, 0.02, 0.3]} c="#e5ecef" r={0.05} rough={0.1} />
    <B p={[0, 0.92, -0.2]} s={[0.02, 0.18, 0.02]} c={METAL} metal={1} rough={0.15} />
    <B p={[0, 1.4, -0.24]} s={[0.7, 0.8, 0.02]} c="#dfe9ee" metal={1} rough={0.05} />
  </>)
}
function Washer({ color }: P) {
  return (<>
    <B p={[0, 0.43, 0]} s={[0.6, 0.85, 0.6]} c={color} r={0.02} rough={0.3} />
    <B p={[0, 0.42, 0.305]} s={[0.36, 0.36, 0.02]} c="#2a3138" r={0.17} rough={0.1} />
  </>)
}
function Shower({ color }: P) {
  return (<>
    <B p={[0, 0.04, 0]} s={[0.9, 0.08, 0.9]} c="#f2f2f0" r={0.02} rough={0.2} />
    <mesh position={[0, 1.0, 0.44]}><boxGeometry args={[0.9, 1.96, 0.012]} /><meshPhysicalMaterial color={color} transparent opacity={0.25} roughness={0.05} /></mesh>
    <mesh position={[0.44, 1.0, 0]}><boxGeometry args={[0.012, 1.96, 0.9]} /><meshPhysicalMaterial color={color} transparent opacity={0.25} roughness={0.05} /></mesh>
    <B p={[0, 2.0, -0.38]} s={[0.02, 0.02, 0.02]} c={METAL} metal={1} />
    <B p={[-0.2, 1.3, -0.43]} s={[0.04, 0.4, 0.04]} c={METAL} metal={1} rough={0.2} />
  </>)
}
function Shelf({ color }: P) {
  const books = ['#b5584a', '#3f6f8f', '#d9b44a', '#5c7f5a', '#8a6a9a']
  return (<>
    <B p={[0, 0.015, 0]} s={[1.2, 0.03, 0.25]} c={color} r={0.008} rough={0.55} />
    {[-0.5, 0.5].map((x) => <B key={x} p={[x, -0.06, -0.09]} s={[0.025, 0.12, 0.06]} c="#2b2b2d" metal={0.6} rough={0.4} />)}
    {books.map((c, i) => <B key={i} p={[-0.52 + i * 0.045, 0.13, -0.02]} s={[0.035, 0.2 - (i % 2) * 0.03, 0.15]} c={c} r={0.004} rough={0.8} />)}
    <B p={[0.25, 0.08, 0]} s={[0.14, 0.1, 0.14]} c="#d8d2c6" r={0.03} />
    <B p={[0.28, 0.2, 0]} s={[0.04, 0.14, 0.04]} c="#4f7a4a" r={0.015} />
  </>)
}
function Tv({ color }: P) {
  return (<>
    <B p={[0, 0.35, 0]} s={[1.2, 0.7, 0.04]} c={color} r={0.01} rough={0.2} />
    <B p={[0, 0.35, 0.021]} s={[1.17, 0.67, 0.004]} c="#05070a" r={0.004} rough={0.08} metal={0.2} />
  </>)
}
function Bookcase({ color }: P) {
  const bk = ['#b5584a', '#3f6f8f', '#d9b44a', '#5c7f5a', '#8a6a9a', '#d8d2c6']
  return (<>
    <B p={[0, 1.0, -0.14]} s={[0.8, 2.0, 0.02]} c={color} r={0.004} />
    {[-0.385, 0.385].map((x) => <B key={x} p={[x, 1.0, 0]} s={[0.03, 2.0, 0.3]} c={color} r={0.004} />)}
    {[0.015, 0.4, 0.78, 1.16, 1.54, 1.985].map((y) => <B key={y} p={[0, y, 0]} s={[0.74, 0.03, 0.3]} c={color} r={0.004} />)}
    {[0.4, 0.78, 1.16, 1.54].flatMap((y, r) => bk.map((cc, i) => (i + r) % 3 === 2 ? null : <B key={y + '-' + i} p={[-0.3 + i * 0.12, y + 0.12, -0.02]} s={[0.05, 0.2 + ((i + r) % 2) * 0.05, 0.2]} c={cc} r={0.004} rough={0.85} />))}
  </>)
}
function Dresser({ color }: P) {
  return (<>
    <B p={[0, 0.43, 0]} s={[1.0, 0.8, 0.45]} c={color} r={0.012} />
    {[0.2, 0.45, 0.7].map((y) => (
      <group key={y}>
        <B p={[0, y, 0.228]} s={[0.94, 0.22, 0.012]} c={color} r={0.004} rough={0.45} />
        <B p={[0, y, 0.245]} s={[0.12, 0.02, 0.02]} c={METAL} metal={0.9} rough={0.3} />
      </group>
    ))}
    {[[-0.45, -0.18], [0.45, -0.18], [-0.45, 0.18], [0.45, 0.18]].map(([x, z], i) => <B key={i} p={[x, 0.015, z]} s={[0.04, 0.03, 0.04]} c="#333" />)}
  </>)
}
function ShoeCabinet({ color }: P) {
  return (<>
    <B p={[0, 0.6, 0]} s={[0.9, 1.2, 0.3]} c={color} r={0.012} />
    {[0.3, 0.9].map((y) => <B key={y} p={[0, y, 0.153]} s={[0.86, 0.54, 0.012]} c={color} r={0.004} rough={0.45} />)}
    {[0.55, 0.65].map((y) => <B key={y} p={[0.38, y, 0.17]} s={[0.012, 0.08, 0.02]} c={METAL} metal={0.9} rough={0.3} />)}
  </>)
}
function Desk({ color }: P) {
  return (<>
    <B p={[0, 0.74, 0]} s={[1.4, 0.04, 0.65]} c={color} r={0.01} />
    {[[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]].map(([x, z], i) => <B key={i} p={[x, 0.36, z]} s={[0.04, 0.72, 0.04]} c="#333" />)}
  </>)
}

export function Model({ type, color, w, low, style }: { type: FType; color: string; w?: number; low?: boolean; style?: string }) {
  switch (type) {
    case 'sofa': return <Sofa color={color} style={style} />
    case 'armchair': return <Armchair color={color} />
    case 'coffeeTable': return <CoffeeTable color={color} style={style} />
    case 'diningTable': return <DiningTable color={color} style={style} />
    case 'chair': return <Chair color={color} style={style} />
    case 'bed': return <Bed color={color} style={style} />
    case 'nightstand': return <Nightstand color={color} />
    case 'wardrobe': return <Wardrobe color={color} w={w} style={style} />
    case 'tvUnit': return <TvUnit color={color} />
    case 'kitchen': return <Kitchen color={color} w={w} low={low} />
    case 'fridge': return <Fridge color={color} />
    case 'bathtub': return <Bathtub color={color} />
    case 'wc': return <Wc color={color} />
    case 'vanity': return <Vanity color={color} />
    case 'washer': return <Washer color={color} />
    case 'shower': return <Shower color={color} />
    case 'shelf': return <Shelf color={color} />
    case 'tv': return <Tv color={color} />
    case 'bookcase': return <Bookcase color={color} />
    case 'dresser': return <Dresser color={color} />
    case 'shoeCabinet': return <ShoeCabinet color={color} />
    case 'desk': return <Desk color={color} />
  }
}
