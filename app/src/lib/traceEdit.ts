// Editing helpers for the tracer: move corners / walls, merge corners, keep doors and windows attached to their walls.
import type { Pt } from '../plan'
import { projectOnSeg, netFace, faces, inPoly, type Face, type TraceState } from './library'

export type Attach = { id: string; wall: string; t: number }

/** Which wall each opening sits in and how far along it (0..1). */
export function attachOpenings(t: TraceState, maxD: number): Attach[] {
  const out: Attach[] = []
  for (const o of t.openings) {
    let best: { wall: string; t: number; d: number } | null = null
    for (const w of t.walls) { const pr = projectOnSeg(o.at, t.nodes[w.a], t.nodes[w.b]); if (!best || pr.d < best.d) best = { wall: w.id, t: pr.t, d: pr.d } }
    if (best && best.d <= maxD) out.push({ id: o.id, wall: best.wall, t: best.t })
  }
  return out
}

/** Put the openings back on their walls after the walls moved. */
export function reattach(t: TraceState, at: Attach[]): TraceState {
  if (!at.length) return t
  const m = new Map(at.map((a) => [a.id, a]))
  return {
    ...t,
    openings: t.openings.map((o) => {
      const a = m.get(o.id), w = a && t.walls.find((x) => x.id === a.wall)
      if (!a || !w) return o
      const A = t.nodes[w.a], B = t.nodes[w.b]
      return { ...o, at: [A[0] + (B[0] - A[0]) * a.t, A[1] + (B[1] - A[1]) * a.t] as Pt }
    }),
  }
}

export const moveNodes = (t: TraceState, to: Record<string, Pt>): TraceState => ({ ...t, nodes: { ...t.nodes, ...to } })

/** Merge node `from` into node `to` (walls that collapse or duplicate are dropped). */
export function mergeNodes(t: TraceState, from: string, to: string): TraceState {
  if (from === to) return t
  const seen = new Set<string>()
  const walls = t.walls.flatMap((w) => {
    const a = w.a === from ? to : w.a, b = w.b === from ? to : w.b
    const key = a < b ? a + '|' + b : b + '|' + a
    if (a === b || seen.has(key)) return []
    seen.add(key)
    return [{ ...w, a, b }]
  })
  const nodes = { ...t.nodes }
  delete nodes[from]
  return { ...t, nodes, walls }
}

/** Nearest other node within r, else null. */
export function nodeNear(t: TraceState, p: Pt, r: number, skip?: string): string | null {
  let best: string | null = null, bd = r
  for (const [id, n] of Object.entries(t.nodes)) { if (id === skip) continue; const d = Math.hypot(n[0] - p[0], n[1] - p[1]); if (d < bd) { bd = d; best = id } }
  return best
}

/** Line a dragged point up with the x / y of other corners (guides) when it is close. */
export function alignTo(t: TraceState, p: Pt, tol: number, skip: Set<string>): { p: Pt; gx: number | null; gy: number | null } {
  let gx: number | null = null, gy: number | null = null, bx = tol, by = tol
  for (const [id, n] of Object.entries(t.nodes)) {
    if (skip.has(id)) continue
    if (Math.abs(n[0] - p[0]) < bx) { bx = Math.abs(n[0] - p[0]); gx = n[0] }
    if (Math.abs(n[1] - p[1]) < by) { by = Math.abs(n[1] - p[1]); gy = n[1] }
  }
  return { p: [gx ?? p[0], gy ?? p[1]], gx, gy }
}

/** Remove corners that no wall uses any more. */
export function pruneNodes(t: TraceState): TraceState {
  const used = new Set(t.walls.flatMap((w) => [w.a, w.b]))
  const nodes: Record<string, Pt> = {}
  for (const [k, v] of Object.entries(t.nodes)) if (used.has(k)) nodes[k] = v
  return { ...t, nodes }
}

/** Make a room's clear inside width (axis 0) or length (axis 1) exactly `targetM` without touching the other rooms: the room's OUTSIDE wall moves (only the corners on that side of the room),
 *  so the neighbours keep their size. Only when neither side is an outside wall, everything past the middle of the room slides instead. Doors and windows stay in their walls. */
export function resizeRoom(t: TraceState, f: Face, axis: 0 | 1, targetM: number, pxm: number): TraceState {
  const nf = netFace(t, f, pxm)
  if (!nf.poly.length || !(targetM > 0.3)) return t
  const nv = nf.poly.map((p) => p[axis]), delta = targetM * pxm - (Math.max(...nv) - Math.min(...nv))
  if (Math.abs(delta) < 0.3) return t
  const cv = f.poly.map((p) => p[axis]), lo = Math.min(...cv), hi = Math.max(...cv), mid = (lo + hi) / 2, tol = Math.max(2, pxm * 0.03)
  const outerE = new Set<string>()
  for (const q of faces(t)) if (q.outer) for (let i = 0; i < q.nodes.length; i++) { const a = q.nodes[i], b = q.nodes[(i + 1) % q.nodes.length]; outerE.add(a + '|' + b); outerE.add(b + '|' + a) }
  const sideOuter = (v: number) => {
    let n = 0
    for (let i = 0; i < f.nodes.length; i++) {
      const j = (i + 1) % f.nodes.length
      if (Math.abs(f.poly[i][axis] - v) < tol && Math.abs(f.poly[j][axis] - v) < tol) { n++; if (!outerE.has(f.nodes[i] + '|' + f.nodes[j])) return false }
    }
    return n > 0
  }
  const hiOut = sideOuter(hi), loOut = sideOuter(lo)
  const at = attachOpenings(t, pxm * 0.6)
  const shift = (p: Pt, d: number): Pt => (axis === 0 ? [p[0] + d, p[1]] : [p[0], p[1] + d])
  let sh: (p: Pt) => Pt, nodes: Record<string, Pt>
  if (hiOut || loOut) {
    const side = hiOut ? hi : lo, d = hiOut ? delta : -delta
    const mine = new Set(f.nodes.filter((_, i) => Math.abs(f.poly[i][axis] - side) < tol))
    nodes = {}
    for (const [k, p] of Object.entries(t.nodes)) nodes[k] = mine.has(k) ? shift(p, d) : p
    // marks inside this room, on the moving half, follow the wall
    sh = (p) => (inPoly(p, f.poly) && (hiOut ? p[axis] > mid : p[axis] < mid) ? shift(p, d) : p)
  } else {
    sh = (p) => (p[axis] > mid ? shift(p, delta) : p)
    nodes = {}
    for (const [k, p] of Object.entries(t.nodes)) nodes[k] = sh(p)
  }
  const fixtures = Object.fromEntries(Object.entries(t.fixtures ?? {}).map(([k, p]) => [k, sh(p as Pt)])) as typeof t.fixtures
  return reattach({ ...t, nodes, fixtures, rooms: t.rooms.map((r) => ({ ...r, at: sh(r.at) })), openings: t.openings.map((o) => ({ ...o, at: sh(o.at) })) }, at)
}
