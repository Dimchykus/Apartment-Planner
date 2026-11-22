import type { Opening } from './plan'

export type PresetId = 'window' | 'wide' | 'small' | 'panoramic' | 'full' | 'door' | 'french'
export const OPENING_PRESETS: { id: PresetId; label: string; kind: 'window' | 'door'; width: number | 'wall'; sill: number; top: number; glass?: boolean }[] = [
  { id: 'window', label: 'Window', kind: 'window', width: 1.2, sill: 0.9, top: 2.1 },
  { id: 'wide', label: 'Wide window', kind: 'window', width: 1.8, sill: 0.9, top: 2.1 },
  { id: 'small', label: 'Small window', kind: 'window', width: 0.6, sill: 1.4, top: 2.0 },
  { id: 'panoramic', label: 'Panoramic window', kind: 'window', width: 2.6, sill: 0.15, top: 2.4 },
  { id: 'full', label: 'Full wall glazing', kind: 'window', width: 'wall', sill: 0, top: 2.55 },
  { id: 'door', label: 'Door', kind: 'door', width: 0.9, sill: 0, top: 2.05 },
  { id: 'french', label: 'Glazed door', kind: 'door', width: 0.9, sill: 0, top: 2.2, glass: true },
]

/** Place [from, to] (px along a wall of length L) inside the wall and clear of the other openings. Returns null when there is no room. */
export function fitOpening(L: number, ppm: number, ops: Opening[], want: { from: number; to: number }, ignore: number | null): { from: number; to: number } | null {
  const margin = 0.15 * ppm
  const w = Math.min(want.to - want.from, L - 2 * margin)
  if (w < 0.3 * ppm) return null
  const others = ops.map((o, i) => ({ o, i })).filter((x) => x.i !== ignore).map((x) => [x.o.from - 0.08 * ppm, x.o.to + 0.08 * ppm] as [number, number]).sort((a, b) => a[0] - b[0])
  const centre = (want.from + want.to) / 2
  const free = (c: number) => { const f = c - w / 2, t = c + w / 2; return f >= margin && t <= L - margin && !others.some(([a, b]) => f < b && t > a) }
  const cands = [centre]
  for (const [a, b] of others) { cands.push(b + w / 2, a - w / 2) }
  cands.push(margin + w / 2, L - margin - w / 2)
  const ok = cands.map((c) => Math.max(margin + w / 2, Math.min(L - margin - w / 2, c))).filter(free).sort((p, q) => Math.abs(p - centre) - Math.abs(q - centre))[0]
  return ok === undefined ? null : { from: ok - w / 2, to: ok + w / 2 }
}
