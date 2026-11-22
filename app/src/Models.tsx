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
    <mesh position={[0, 0.38, 0]} scale={[0.5, 1, 0.3]} castShadow receiveShadow><cylinderGeometry args={[1, 1, 0.04, 48]} /><meshStandardMaterial color={color} roughness={0.4} /></mesh>
    <mesh position={[0, 0.18, 0]} scale={[0.075, 1, 0.045]} castShadow><cylinderGeometry args={[1, 1, 0.36, 20]} /><meshStandardMaterial color="#222" roughness={0.5} /></mesh>
  </>)
  return (<>
    <B p={[0, 0.38, 0]} s={[1.0, 0.04, 0.6]} c={color} r={0.015} rough={0.4} />
    <B p={[0, 0.15, 0]} s={[0.85, 0.03, 0.45]} c={color} r={0.01} />
    {[[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].map(([x, z], i) => <B key={i} p={[x, 0.19, z]} s={[0.04, 0.38, 0.04]} c="#222" />)}
  </>)
}

function DiningTable({ color, style }: P & { style?: string }) {
  if (style === 'round') return (<>
    {/* drawn as an ellipse of the default 140×80 footprint, so the size stretch turns it into a true circle when width = depth */}
    <mesh position={[0, 0.74, 0]} scale={[0.7, 1, 0.4]} castShadow receiveShadow><cylinderGeometry args={[1, 1, 0.04, 64]} /><meshStandardMaterial color={color} roughness={0.45} /></mesh>
    <mesh position={[0, 0.37, 0]} scale={[0.07, 1, 0.04]} castShadow><cylinderGeometry args={[1, 1, 0.72, 24]} /><meshStandardMaterial color="#2b2b2d" metalness={0.5} roughness={0.4} /></mesh>
    <mesh position={[0, 0.02, 0]} scale={[0.29, 1, 0.166]} castShadow><cylinderGeometry args={[1, 1, 0.04, 36]} /><meshStandardMaterial color="#2b2b2d" metalness={0.5} roughness={0.4} /></mesh>
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
function Bookcase({ color, style }: P & { style?: string }) {
  const bk = ['#b5584a', '#3f6f8f', '#d9b44a', '#5c7f5a', '#8a6a9a', '#d8d2c6']
  // open rack: four corner posts and shelf boards, no back and no sides: everything can be reached from any side
  if (style === 'open') return (<>
    {[[-0.38, -0.135], [0.38, -0.135], [-0.38, 0.135], [0.38, 0.135]].map(([x, z], i) => <B key={i} p={[x, 1.0, z]} s={[0.08, 2.0, 0.03]} c={METAL} r={0.004} metal={0.7} rough={0.35} />)}
    {[0.02, 0.45, 0.85, 1.25, 1.65, 1.985].map((y) => <B key={y} p={[0, y, 0]} s={[0.8, 0.03, 0.3]} c={color} r={0.004} rough={0.55} />)}
    <B p={[0, 0.5, 0]} s={[0.3, 0.06, 0.2]} c={bk[0]} r={0.004} rough={0.85} />
    <B p={[0, 0.56, 0]} s={[0.26, 0.05, 0.18]} c={bk[1]} r={0.004} rough={0.85} />
    <mesh position={[0, 0.98, 0]} castShadow><cylinderGeometry args={[0.1, 0.07, 0.2, 18]} /><meshStandardMaterial color="#d8d2c6" roughness={0.5} /></mesh>
    <B p={[0, 1.34, 0]} s={[0.34, 0.12, 0.2]} c="#b08a5a" r={0.02} rough={0.9} />
    <B p={[0, 1.74, 0]} s={[0.12, 0.12, 0.1]} c={bk[3]} r={0.004} rough={0.85} />
  </>)
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
function Desk({ color, style }: P & { style?: string }) {
  const monitor = (x: number, a: number) => (
    <group key={x} position={[x, 0.76, -0.17]} rotation={[0, a, 0]}>
      <B p={[0, 0.008, 0.02]} s={[0.2, 0.015, 0.15]} c="#222429" r={0.005} metal={0.4} rough={0.4} />
      <B p={[0, 0.14, 0]} s={[0.04, 0.28, 0.03]} c="#222429" r={0.008} metal={0.4} rough={0.4} />
      <B p={[0, 0.28, 0.018]} s={[0.56, 0.33, 0.022]} c="#181a1f" r={0.007} rough={0.35} />
      <B p={[0, 0.28, 0.031]} s={[0.53, 0.3, 0.004]} c="#1e293b" r={0.002} rough={0.12} metal={0.15} />
    </group>
  )
  return (<>
    <B p={[0, 0.74, 0]} s={[1.4, 0.04, 0.65]} c={color} r={0.01} />
    {[[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]].map(([x, z], i) => <B key={i} p={[x, 0.36, z]} s={[0.04, 0.72, 0.04]} c="#333" />)}
    {style !== 'plain' && (<>
      {/* two workstation monitors */}
      {monitor(-0.3, 0.14)}
      {monitor(0.3, -0.14)}
      {/* keyboard + mouse + desk pad */}
      <B p={[-0.04, 0.763, 0.12]} s={[0.78, 0.004, 0.3]} c="#2a2d34" r={0.002} rough={0.95} />
      <B p={[-0.08, 0.775, 0.13]} s={[0.42, 0.018, 0.13]} c="#1f2126" r={0.005} rough={0.5} />
      <B p={[0.24, 0.775, 0.13]} s={[0.06, 0.026, 0.1]} c="#1f2126" r={0.018} rough={0.4} />
      {/* PC tower under the right side of the desk */}
      <group position={[0.46, 0.24, -0.02]}>
        <B p={[0, 0, 0]} s={[0.21, 0.48, 0.44]} c="#1c1e24" r={0.01} metal={0.35} rough={0.4} />
        <B p={[0, 0.14, 0.222]} s={[0.17, 0.012, 0.006]} c="#3b82f6" r={0.002} />
        <B p={[0, -0.06, 0.222]} s={[0.15, 0.22, 0.006]} c="#272a32" r={0.004} />
      </group>
    </>)}
  </>)
}

/** UREVO Foldi 3S foldable smart treadmill (65 × 131 × 120 cm unfolded, 17 cm folded). Front motor hood is at -z. */
function Treadmill({ color, style }: P & { style?: string }) {
  const folded = style === 'folded'
  return (<>
    {/* main deck frame */}
    <B p={[0, 0.065, 0]} s={[0.65, 0.09, 1.31]} c={color} r={0.02} rough={0.45} metal={0.25} />
    {/* running belt (42 × 108 cm) */}
    <B p={[0, 0.112, 0.07]} s={[0.44, 0.014, 1.06]} c="#141518" r={0.004} rough={0.92} />
    {/* side foot rails */}
    {[-0.275, 0.275].map((x) => <B key={x} p={[x, 0.114, 0.07]} s={[0.08, 0.016, 1.06]} c="#343840" r={0.005} rough={0.6} />)}
    {/* front motor hood + LED display strip */}
    <B p={[0, 0.115, -0.54]} s={[0.62, 0.08, 0.22]} c={color} r={0.025} rough={0.35} metal={0.2} />
    <B p={[0, 0.156, -0.53]} s={[0.26, 0.006, 0.07]} c="#0d1117" r={0.003} rough={0.15} />
    <Glow p={[0, 0.16, -0.53]} s={[0.16, 0.003, 0.022]} c="#38bdf8" i={1.2} />
    {/* rubber feet */}
    {[[-0.27, -0.58], [0.27, -0.58], [-0.27, 0.58], [0.27, 0.58]].map(([x, z], i) => <B key={i} p={[x, 0.012, z]} s={[0.06, 0.024, 0.06]} c="#111" />)}
    {!folded && (<>
      {/* folding upright posts */}
      {[-0.29, 0.29].map((x) => (
        <group key={x} position={[x, 0.62, -0.46]} rotation={[0.14, 0, 0]}>
          <B p={[0, 0, 0]} s={[0.042, 1.02, 0.05]} c={color} r={0.012} metal={0.4} rough={0.35} />
        </group>
      ))}
      {/* top handrail + integrated workstation / tablet bar */}
      <B p={[0, 1.12, -0.37]} s={[0.64, 0.045, 0.16]} c={color} r={0.015} rough={0.4} />
      <B p={[0, 1.148, -0.36]} s={[0.32, 0.01, 0.09]} c="#111419" r={0.004} rough={0.2} />
      <Glow p={[0, 1.155, -0.36]} s={[0.14, 0.004, 0.025]} c="#e2e8f0" i={1.0} />
      {/* side armrests */}
      {[-0.29, 0.29].map((x) => <B key={'a' + x} p={[x, 1.08, -0.25]} s={[0.045, 0.04, 0.26]} c="#2f333a" r={0.015} rough={0.6} />)}
    </>)}
  </>)
}

/** Light-emitting bit (screens, RGB strips, fans). */
const Glow = ({ p, s, c, i = 1.4, rot }: { p: [number, number, number]; s: [number, number, number]; c: string; i?: number; rot?: [number, number, number] }) => {
  const op = useContext(FurnOpacity)
  return <mesh position={p} rotation={rot}><boxGeometry args={s} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={i} toneMapped={false} transparent={op < 0.99} opacity={op} /></mesh>
}
const BLACK = '#0f1013'

/** Desk with two monitors on stands, keyboard, mouse, desk mat, a PC tower with lit fans under the right side and RGB strips. Back (monitors) is at -z, the player sits on the +z side. */
function GamingDesk({ color }: P) {
  const monitor = (x: number, a: number) => (
    <group key={x} position={[x, 0.76, -0.2]} rotation={[0, a, 0]}>
      <B p={[0, 0.008, 0.02]} s={[0.24, 0.016, 0.17]} c={BLACK} r={0.006} metal={0.4} rough={0.4} />
      <B p={[0, 0.15, 0]} s={[0.05, 0.3, 0.03]} c={BLACK} r={0.01} metal={0.4} rough={0.4} />
      <B p={[0, 0.3, 0.02]} s={[0.62, 0.36, 0.025]} c={BLACK} r={0.008} rough={0.35} />
      <Glow p={[0, 0.3, 0.036]} s={[0.59, 0.33, 0.004]} c="#2a63ff" i={0.9} />
      <Glow p={[0.08, 0.34, 0.039]} s={[0.3, 0.12, 0.002]} c="#9b5cff" i={1.1} />
    </group>
  )
  return (<>
    <B p={[0, 0.74, 0]} s={[1.6, 0.04, 0.75]} c={color} r={0.012} rough={0.5} />
    {[-0.72, 0.72].map((x) => <B key={x} p={[x, 0.36, 0]} s={[0.05, 0.72, 0.66]} c={BLACK} r={0.01} metal={0.5} rough={0.4} />)}
    <B p={[0, 0.45, -0.3]} s={[1.38, 0.3, 0.02]} c={BLACK} r={0.005} />
    <Glow p={[0, 0.712, 0.368]} s={[1.5, 0.008, 0.008]} c="#8a3cff" i={1.8} />
    <Glow p={[0, 0.712, -0.368]} s={[1.5, 0.008, 0.008]} c="#2dd4ff" i={1.4} />
    <B p={[0, 0.7635, 0.1]} s={[0.95, 0.004, 0.38]} c="#17181d" r={0.002} rough={0.95} />
    {monitor(-0.32, 0.2)}{monitor(0.32, -0.2)}
    <B p={[-0.08, 0.78, 0.14]} s={[0.44, 0.02, 0.14]} c={BLACK} r={0.006} rough={0.5} />
    <Glow p={[-0.08, 0.791, 0.14]} s={[0.4, 0.002, 0.1]} c="#ff3d81" i={0.8} />
    <B p={[0.28, 0.78, 0.14]} s={[0.065, 0.03, 0.11]} c={BLACK} r={0.02} rough={0.4} />
    <group position={[0.5, 0.25, 0.02]}>
      <B p={[0, 0, 0]} s={[0.22, 0.5, 0.46]} c={BLACK} r={0.012} metal={0.3} rough={0.4} />
      <B p={[-0.112, 0, 0]} s={[0.006, 0.44, 0.4]} c="#1b2430" r={0.003} rough={0.1} />
      {[0.12, -0.04, -0.2].map((y) => <mesh key={y} position={[0, y, 0.232]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.05, 0.007, 8, 24]} /><meshStandardMaterial color="#8a3cff" emissive="#8a3cff" emissiveIntensity={1.8} toneMapped={false} /></mesh>)}
    </group>
  </>)
}

/** Racing-style gaming chair: tall back with side wings and headrest, armrests, five-star base on wheels. Front is +z. */
function GamingChair({ color }: P) {
  const BODY = '#1b1c20'
  return (<>
    <B p={[0, 0.5, 0.02]} s={[0.56, 0.1, 0.54]} c={BODY} r={0.04} rough={0.8} />
    {[-0.29, 0.29].map((x) => <B key={x} p={[x, 0.56, 0.0]} s={[0.07, 0.12, 0.5]} c={color} r={0.03} rough={0.8} />)}
    <group position={[0, 0.9, -0.25]} rotation={[-0.16, 0, 0]}>
      <B p={[0, 0, 0]} s={[0.5, 0.74, 0.1]} c={BODY} r={0.05} rough={0.8} />
      {[-0.27, 0.27].map((x) => <B key={x} p={[x, -0.05, 0.03]} s={[0.07, 0.56, 0.14]} c={color} r={0.03} rough={0.8} />)}
      <B p={[0, 0.5, 0.02]} s={[0.28, 0.17, 0.09]} c={BODY} r={0.05} rough={0.9} />
      <B p={[0, 0.5, 0.07]} s={[0.26, 0.04, 0.02]} c={color} r={0.01} />
      <B p={[0, -0.05, 0.057]} s={[0.04, 0.5, 0.012]} c={color} r={0.004} />
    </group>
    {[-0.33, 0.33].map((x) => (
      <group key={x}>
        <B p={[x, 0.66, 0.03]} s={[0.07, 0.04, 0.32]} c={BODY} r={0.015} />
        <B p={[x, 0.58, 0.05]} s={[0.03, 0.16, 0.04]} c={METAL} metal={0.8} rough={0.3} />
      </group>
    ))}
    <B p={[0, 0.34, 0]} s={[0.07, 0.24, 0.07]} c={METAL} r={0.02} metal={0.8} rough={0.3} />
    {[0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2
      return (
        <group key={i} rotation={[0, a, 0]}>
          <B p={[0, 0.1, 0.17]} s={[0.04, 0.025, 0.34]} c={BODY} r={0.01} metal={0.4} />
          <mesh position={[0, 0.04, 0.33]} castShadow><sphereGeometry args={[0.035, 12, 10]} /><meshStandardMaterial color="#222" roughness={0.6} /></mesh>
        </group>
      )
    })}
  </>)
}

/** L-shaped sectional sofa (2.5 × 1.7 m). Back is at -z, chaise extends forward (+z) on right or left. */
function LSofa({ color, style }: P & { style?: string }) {
  const sgn = style === 'left' ? -1 : 1
  return (<>
    {/* main 3-seat section along the back (-z) */}
    <B p={[0, 0.2, -0.38]} s={[2.5, 0.28, 0.94]} c={color} r={0.05} />
    <B p={[0, 0.58, -0.74]} s={[2.5, 0.6, 0.22]} c={color} r={0.08} />
    {/* chaise lounge extending forward on sgn side */}
    <B p={[sgn * 0.78, 0.2, 0.45]} s={[0.94, 0.28, 0.8]} c={color} r={0.05} />
    <B p={[sgn * 0.78, 0.42, 0.42]} s={[0.78, 0.16, 0.78]} c={color} r={0.06} rough={0.95} />
    {/* armrests */}
    <B p={[-sgn * 1.17, 0.42, -0.38]} s={[0.16, 0.3, 0.88]} c={color} r={0.06} />
    <B p={[sgn * 1.17, 0.42, 0.0]} s={[0.16, 0.3, 1.55]} c={color} r={0.06} />
    {/* seat + back cushions */}
    {[-0.78, 0, 0.78].map((x) => <B key={x} p={[x, 0.42, -0.32]} s={[0.74, 0.16, 0.68]} c={color} r={0.07} rough={0.95} />)}
    {[-0.78, 0, 0.78].map((x) => <B key={'b' + x} p={[x, 0.65, -0.58]} s={[0.72, 0.42, 0.16]} c={color} r={0.07} rough={0.95} />)}
    {/* feet */}
    {[[-1.12, -0.76], [1.12, -0.76], [-1.12, 0.02], [sgn * 0.4, 0.78], [sgn * 1.12, 0.78]].map(([x, z], i) => (
      <B key={i} p={[x, 0.04, z]} s={[0.05, 0.08, 0.05]} c="#222" />
    ))}
  </>)
}

function Ottoman({ color, style }: P & { style?: string }) {
  const op = useContext(FurnOpacity)
  if (style === 'round') return (<>
    <mesh position={[0, 0.22, 0]} castShadow={op >= 0.99} receiveShadow={op >= 0.99}><cylinderGeometry args={[0.35, 0.35, 0.36, 32]} /><meshStandardMaterial color={color} roughness={0.9} transparent={op < 0.99} opacity={op} /></mesh>
    <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.3, 0.3, 0.04, 24]} /><meshStandardMaterial color="#2b2b2d" roughness={0.5} /></mesh>
  </>)
  return (<>
    <B p={[0, 0.24, 0]} s={[0.7, 0.34, 0.7]} c={color} r={0.07} rough={0.92} />
    {[[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].map(([x, z], i) => <B key={i} p={[x, 0.04, z]} s={[0.04, 0.08, 0.04]} c="#222" />)}
  </>)
}

function OfficeChair({ color }: P) {
  return (<>
    <B p={[0, 0.48, 0.02]} s={[0.5, 0.08, 0.48]} c={color} r={0.04} rough={0.85} />
    <B p={[0, 0.82, -0.22]} s={[0.46, 0.56, 0.06]} c={color} r={0.04} rough={0.9} />
    {[-0.28, 0.28].map((x) => (
      <group key={x}>
        <B p={[x, 0.64, 0.0]} s={[0.05, 0.03, 0.28]} c="#222" r={0.01} />
        <B p={[x, 0.56, 0.0]} s={[0.03, 0.16, 0.03]} c={METAL} metal={0.8} rough={0.3} />
      </group>
    ))}
    <B p={[0, 0.28, 0]} s={[0.06, 0.32, 0.06]} c={METAL} r={0.02} metal={0.8} rough={0.3} />
    {[0, 1, 2, 3, 4].map((i) => (
      <group key={i} rotation={[0, (i / 5) * Math.PI * 2, 0]}>
        <B p={[0, 0.09, 0.15]} s={[0.035, 0.025, 0.3]} c="#222" r={0.008} />
        <mesh position={[0, 0.035, 0.29]} castShadow><sphereGeometry args={[0.03, 10, 8]} /><meshStandardMaterial color="#1a1a1d" roughness={0.6} /></mesh>
      </group>
    ))}
  </>)
}

function CornerDesk({ color, style }: P & { style?: string }) {
  const sgn = style === 'left' ? -1 : 1
  return (<>
    {/* main desk top along -z */}
    <B p={[0, 0.74, -0.375]} s={[1.6, 0.04, 0.65]} c={color} r={0.01} />
    {/* side return along sgn side */}
    <B p={[sgn * 0.5, 0.74, 0.325]} s={[0.6, 0.04, 0.75]} c={color} r={0.01} />
    {[[-0.75, -0.65], [0.75, -0.65], [-sgn * 0.75, -0.1], [sgn * 0.75, 0.65], [sgn * 0.24, 0.65]].map(([x, z], i) => (
      <B key={i} p={[x, 0.36, z]} s={[0.045, 0.72, 0.045]} c="#2d2f33" metal={0.4} rough={0.4} />
    ))}
  </>)
}

function KitchenIsland({ color }: P) {
  return (<>
    <B p={[0, 0.44, -0.06]} s={[1.54, 0.86, 0.68]} c={color} r={0.01} />
    <B p={[0, 0.9, 0]} s={[1.6, 0.04, 0.85]} c="#3b3d42" r={0.008} rough={0.3} />
    {[-0.48, 0, 0.48].map((x) => <B key={x} p={[x, 0.44, -0.405]} s={[0.46, 0.76, 0.012]} c={color} r={0.004} rough={0.45} />)}
    {[-0.48, 0, 0.48].map((x) => <B key={'h' + x} p={[x, 0.72, -0.42]} s={[0.14, 0.015, 0.02]} c={METAL} metal={0.9} rough={0.25} />)}
  </>)
}

function FloorLamp({ color, style }: P & { style?: string }) {
  if (style === 'arc') return (<>
    <mesh position={[0, 0.03, -0.1]} castShadow><cylinderGeometry args={[0.16, 0.18, 0.06, 24]} /><meshStandardMaterial color="#2b2b2e" metalness={0.5} roughness={0.3} /></mesh>
    <B p={[0, 0.82, -0.1]} s={[0.025, 1.56, 0.025]} c={METAL} metal={0.85} rough={0.25} />
    <B p={[0, 1.62, 0.03]} s={[0.025, 0.025, 0.28]} c={METAL} metal={0.85} rough={0.25} />
    <mesh position={[0, 1.48, 0.15]} castShadow><sphereGeometry args={[0.14, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6]} /><meshStandardMaterial color={color} emissive="#ffdfa8" emissiveIntensity={0.45} roughness={0.4} /></mesh>
  </>)
  return (<>
    <mesh position={[0, 0.025, 0]} castShadow><cylinderGeometry args={[0.15, 0.17, 0.05, 24]} /><meshStandardMaterial color="#2b2b2e" metalness={0.5} roughness={0.35} /></mesh>
    <B p={[0, 0.78, 0]} s={[0.024, 1.5, 0.024]} c={METAL} metal={0.85} rough={0.25} />
    <mesh position={[0, 1.52, 0]} castShadow><cylinderGeometry args={[0.14, 0.2, 0.34, 24, 1, true]} /><meshStandardMaterial color={color} emissive="#ffe2b0" emissiveIntensity={0.35} roughness={0.8} side={2} /></mesh>
  </>)
}

function Plant({ color }: P) {
  return (<>
    <mesh position={[0, 0.18, 0]} castShadow receiveShadow><cylinderGeometry args={[0.18, 0.14, 0.36, 20]} /><meshStandardMaterial color="#c9b8a3" roughness={0.75} /></mesh>
    <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.165, 0.165, 0.02, 16]} /><meshStandardMaterial color="#4a3828" roughness={1} /></mesh>
    <B p={[0, 0.62, 0]} s={[0.035, 0.55, 0.035]} c="#5a432c" r={0.01} />
    <mesh position={[0, 0.96, 0]} castShadow><icosahedronGeometry args={[0.24, 1]} /><meshStandardMaterial color={color} roughness={0.85} flatShading /></mesh>
    <mesh position={[0.11, 1.14, 0.06]} castShadow><icosahedronGeometry args={[0.16, 1]} /><meshStandardMaterial color={color} roughness={0.85} flatShading /></mesh>
    <mesh position={[-0.1, 1.08, -0.07]} castShadow><icosahedronGeometry args={[0.15, 1]} /><meshStandardMaterial color={color} roughness={0.85} flatShading /></mesh>
  </>)
}

function Rug({ color, style }: P & { style?: string }) {
  const op = useContext(FurnOpacity)
  if (style === 'round') return (
    <mesh position={[0, 0.01, 0]} receiveShadow><cylinderGeometry args={[0.7, 0.7, 0.018, 40]} /><meshStandardMaterial color={color} roughness={0.98} transparent={op < 0.99} opacity={op} /></mesh>
  )
  return <B p={[0, 0.01, 0]} s={[2.0, 0.018, 1.4]} c={color} r={0.006} rough={0.98} />
}

function Mirror({ color, style }: P & { style?: string }) {
  if (style === 'round') return (<>
    <mesh position={[0, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.35, 0.35, 0.03, 32]} /><meshStandardMaterial color="#2b2b2d" metalness={0.6} roughness={0.35} /></mesh>
    <mesh position={[0, 0.7, 0.016]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.32, 0.32, 0.008, 32]} /><meshStandardMaterial color={color} metalness={0.95} roughness={0.06} /></mesh>
  </>)
  return (<>
    <B p={[0, 0.7, 0]} s={[0.7, 1.4, 0.03]} c="#2b2b2d" r={0.008} metal={0.5} rough={0.35} />
    <B p={[0, 0.7, 0.017]} s={[0.64, 1.34, 0.008]} c={color} r={0.003} metal={0.95} rough={0.06} />
  </>)
}

function Ac({ color }: P) {
  return (<>
    <B p={[0, 0.15, 0]} s={[0.9, 0.28, 0.22]} c={color} r={0.03} rough={0.35} />
    <B p={[0, 0.06, 0.105]} s={[0.8, 0.05, 0.012]} c="#cfd4da" r={0.005} />
    <B p={[0.34, 0.17, 0.112]} s={[0.08, 0.03, 0.005]} c="#1e293b" r={0.002} />
  </>)
}

/** Framed picture, hung on a wall (bottom edge at the item's lift height). Front is +z. */
function Painting({ color }: P) {
  return (<>
    <B p={[0, 0.25, 0]} s={[0.7, 0.5, 0.035]} c={color} r={0.006} rough={0.5} />
    <B p={[0, 0.25, 0.019]} s={[0.62, 0.42, 0.004]} c="#efe8da" r={0.002} rough={0.95} />
    <B p={[0, 0.1, 0.023]} s={[0.62, 0.14, 0.004]} c="#3f6f8f" r={0.002} rough={0.9} />
    <B p={[-0.12, 0.2, 0.023]} s={[0.34, 0.12, 0.004]} c="#5c7f5a" r={0.002} rough={0.9} />
    <mesh position={[0.16, 0.34, 0.024]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 0.004, 28]} /><meshStandardMaterial color="#e08a3c" roughness={0.9} /></mesh>
  </>)
}

/** Glass vase with a bunch of flowers. */
function Flowers({ color }: P) {
  const blooms: [number, number, number, string][] = [[0, 0.5, 0, '#e8579a'], [-0.06, 0.44, 0.03, '#f4c542'], [0.06, 0.45, -0.02, '#f2f2f2'], [0.02, 0.4, 0.06, '#e8579a'], [-0.04, 0.4, -0.05, '#f4c542']]
  return (<>
    <mesh position={[0, 0.1, 0]} castShadow><cylinderGeometry args={[0.06, 0.045, 0.2, 20]} /><meshStandardMaterial color={color} roughness={0.15} metalness={0.1} transparent opacity={0.8} /></mesh>
    {blooms.map(([x, y, z, c], i) => (
      <group key={i}>
        <mesh position={[x * 0.5, (y + 0.1) / 2, z * 0.5]} rotation={[z * 0.8, 0, -x * 0.8]}><cylinderGeometry args={[0.004, 0.004, y - 0.1, 5]} /><meshStandardMaterial color="#4f7a4a" roughness={0.9} /></mesh>
        <mesh position={[x, y, z]} castShadow><sphereGeometry args={[0.04, 12, 10]} /><meshStandardMaterial color={c} roughness={0.8} /></mesh>
      </group>
    ))}
    <mesh position={[0.05, 0.3, 0]} rotation={[0, 0, -0.5]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color="#4f7a4a" roughness={0.9} flatShading /></mesh>
  </>)
}

export function Model({ type, color, w, low, style }: { type: FType; color: string; w?: number; low?: boolean; style?: string }) {
  switch (type) {
    case 'sofa': return <Sofa color={color} style={style} />
    case 'lSofa': return <LSofa color={color} style={style} />
    case 'armchair': return <Armchair color={color} />
    case 'ottoman': return <Ottoman color={color} style={style} />
    case 'coffeeTable': return <CoffeeTable color={color} style={style} />
    case 'diningTable': return <DiningTable color={color} style={style} />
    case 'chair': return <Chair color={color} style={style} />
    case 'officeChair': return <OfficeChair color={color} />
    case 'gamingChair': return <GamingChair color={color} />
    case 'bed': return <Bed color={color} style={style} />
    case 'nightstand': return <Nightstand color={color} />
    case 'wardrobe': return <Wardrobe color={color} w={w} style={style} />
    case 'tvUnit': return <TvUnit color={color} />
    case 'kitchen': return <Kitchen color={color} w={w} low={low} />
    case 'kitchenIsland': return <KitchenIsland color={color} />
    case 'fridge': return <Fridge color={color} />
    case 'bathtub': return <Bathtub color={color} />
    case 'wc': return <Wc color={color} />
    case 'vanity': return <Vanity color={color} />
    case 'washer': return <Washer color={color} />
    case 'shower': return <Shower color={color} />
    case 'shelf': return <Shelf color={color} />
    case 'tv': return <Tv color={color} />
    case 'mirror': return <Mirror color={color} style={style} />
    case 'ac': return <Ac color={color} />
    case 'bookcase': return <Bookcase color={color} style={style} />
    case 'dresser': return <Dresser color={color} />
    case 'shoeCabinet': return <ShoeCabinet color={color} />
    case 'desk': return <Desk color={color} style={style} />
    case 'cornerDesk': return <CornerDesk color={color} style={style} />
    case 'painting': return <Painting color={color} />
    case 'flowers': return <Flowers color={color} />
    case 'gamingDesk': return <GamingDesk color={color} />
    case 'treadmill': return <Treadmill color={color} style={style} />
    case 'floorLamp': return <FloorLamp color={color} style={style} />
    case 'plant': return <Plant color={color} />
    case 'rug': return <Rug color={color} style={style} />
  }
}
