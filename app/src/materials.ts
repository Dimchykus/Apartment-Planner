import * as THREE from 'three'

// Floor finishes (procedural textures: nothing to download) and wall colours.
export type FloorId = 'parquet' | 'herringbone' | 'laminate' | 'darkwood' | 'tile' | 'tileWarm' | 'marble' | 'concrete' | 'carpet' | 'stone'
export const FLOORS: { id: FloorId; label: string; swatch: string; repeat: number; rough: number }[] = [
  { id: 'parquet', label: 'Oak parquet', swatch: '#b98a58', repeat: 0.9, rough: 0.5 },
  { id: 'herringbone', label: 'Herringbone', swatch: '#a97c4e', repeat: 0.7, rough: 0.5 },
  { id: 'laminate', label: 'Light laminate', swatch: '#d9c3a0', repeat: 0.9, rough: 0.55 },
  { id: 'darkwood', label: 'Dark walnut', swatch: '#5b3d28', repeat: 0.9, rough: 0.45 },
  { id: 'tile', label: 'Grey tile', swatch: '#c3c8cd', repeat: 1.6, rough: 0.35 },
  { id: 'tileWarm', label: 'Warm tile', swatch: '#d8cbb8', repeat: 1.6, rough: 0.35 },
  { id: 'marble', label: 'White marble', swatch: '#eceae6', repeat: 0.8, rough: 0.2 },
  { id: 'concrete', label: 'Microcement', swatch: '#a4a6a8', repeat: 0.5, rough: 0.8 },
  { id: 'carpet', label: 'Soft carpet', swatch: '#cfc6bb', repeat: 1.2, rough: 1 },
  { id: 'stone', label: 'Dark stone', swatch: '#6f6a64', repeat: 1.6, rough: 0.5 },
]
export const floorInfo = (id: string) => FLOORS.find((f) => f.id === id) ?? FLOORS[0]

/** Wall colours offered in the UI. */
export const WALL_COLORS = ['#f1ede6', '#ffffff', '#e8dcc8', '#d9e2d2', '#cfdde8', '#e9d3cf', '#e6d9ee', '#f2e3a8', '#b7c4b0', '#8aa0b5', '#6f7f8f', '#4a4f57']
export const DEFAULT_WALL = '#f1ede6'

const rnd = (() => { let s = 1234567; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296) })()

function canvas(n = 512) { const c = document.createElement('canvas'); c.width = c.height = n; return { c, g: c.getContext('2d')! } }

function planks(hue: number, sat: number, light: number, spread: number, w = 64, l = 256, grout = 'rgba(30,15,5,0.5)') {
  const { c, g } = canvas()
  for (let row = 0; row < 512 / w; row++) for (let col = -1; col < 3; col++) {
    const x = col * l + (row % 2) * (l / 2)
    g.fillStyle = `hsl(${hue + rnd() * 5},${sat + rnd() * 8}%,${light + (rnd() - 0.5) * spread}%)`
    g.fillRect(x, row * w, l, w)
    for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(60,35,15,${rnd() * 0.1})`; const y = row * w + rnd() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (rnd() - 0.5) * 3); g.stroke() }
    g.strokeStyle = grout; g.lineWidth = 1.5; g.strokeRect(x, row * w, l, w)
  }
  return c
}
function herringbone() {
  const { c, g } = canvas()
  const w = 32, l = 96
  g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 512, 512)
  for (let i = -8; i < 20; i++) for (let j = -8; j < 20; j++) {
    const x = i * w, y = j * w
    for (const dir of [0, 1]) {
      g.save(); g.translate(x + (dir ? l / 2 : 0), y + (dir ? 0 : l / 2)); g.rotate(dir ? Math.PI / 4 : -Math.PI / 4)
      g.fillStyle = `hsl(${30 + rnd() * 6},${38 + rnd() * 10}%,${36 + rnd() * 16}%)`
      g.fillRect(-l / 2, -w / 2, l, w - 1); g.strokeStyle = 'rgba(30,15,5,.45)'; g.strokeRect(-l / 2, -w / 2, l, w - 1)
      g.restore()
    }
  }
  return c
}
function tiles(base: string, grout: string, n = 4, variance = 7) {
  const { c, g } = canvas()
  g.fillStyle = grout; g.fillRect(0, 0, 512, 512)
  const s = 512 / n
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = `color-mix(in srgb, ${base}, black ${rnd() * variance}%)`
    g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6)
  }
  return c
}
function marble() {
  const { c, g } = canvas()
  g.fillStyle = '#efede9'; g.fillRect(0, 0, 512, 512)
  for (let k = 0; k < 26; k++) {
    g.strokeStyle = `rgba(120,120,130,${0.08 + rnd() * 0.18})`; g.lineWidth = 0.6 + rnd() * 1.6
    g.beginPath(); let x = rnd() * 512, y = rnd() * 512; g.moveTo(x, y)
    for (let s = 0; s < 9; s++) { x += (rnd() - 0.3) * 90; y += (rnd() - 0.3) * 90; g.lineTo(x, y) }
    g.stroke()
  }
  g.strokeStyle = 'rgba(90,90,90,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke()
  return c
}
function noise(base: [number, number, number], amp: number, speck = 5000, size = 2) {
  const { c, g } = canvas()
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < speck; i++) { const v = (rnd() - 0.5) * amp; g.fillStyle = `rgb(${base.map((b) => Math.max(0, Math.min(255, b + v))).join(',')})`; g.fillRect(rnd() * 512, rnd() * 512, size, size) }
  return c
}

const cache = new Map<string, THREE.CanvasTexture>()
export function floorTexture(id: FloorId): THREE.CanvasTexture {
  const hit = cache.get(id)
  if (hit) return hit
  const src = {
    parquet: () => planks(30, 38, 42, 14),
    herringbone,
    laminate: () => planks(34, 40, 72, 8, 80, 300, 'rgba(120,90,60,.35)'),
    darkwood: () => planks(24, 35, 24, 8),
    tile: () => tiles('#c9cdd1', '#8d9296'),
    tileWarm: () => tiles('#dccfbc', '#a89c8a', 4, 5),
    marble,
    concrete: () => noise([164, 166, 168], 26, 9000, 3),
    carpet: () => noise([205, 197, 186], 30, 16000, 2),
    stone: () => tiles('#6f6a64', '#3d3a36', 3, 14),
  }[id]()
  const t = new THREE.CanvasTexture(src)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.repeat.set(floorInfo(id).repeat, floorInfo(id).repeat)
  cache.set(id, t)
  return t
}

/** Floor of a room when the user has not chosen one (from the room's own type). */
export const defaultFloor = (f: 'parquet' | 'tile' | 'loggia'): FloorId => (f === 'tile' ? 'tile' : f === 'loggia' ? 'stone' : 'parquet')
