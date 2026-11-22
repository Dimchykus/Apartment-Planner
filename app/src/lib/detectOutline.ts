// Walls drawn the CAD way: two thin parallel lines with hatching, dots or fill between them.
// Find long straight lines, pair the parallel ones a wall-thickness apart, keep pairs with "ink" between them (hatch / fill),
// take the middle as the wall. Gaps along a wall are doors and windows. Horizontal and vertical walls only.
import type { Pt } from '../plan'
import { addWall, emptyTrace, type TraceState } from './library'
import type { Op } from './detect'

type Seg = { c: number; a: number; b: number; t: number } // across-coordinate, along-range, thickness (all px)
type Ln = { y: number; x0: number; x1: number; rows: number }

/** Horizontal walls: lines are rows. */
function horizontal(dark: Uint8Array, w: number, h: number, pxm: number): Seg[] {
  const minRun = Math.max(14, 0.35 * pxm), minSeg = Math.max(12, 0.3 * pxm)
  const dmin = Math.max(4, 0.07 * pxm), dmax = 0.45 * pxm, thinRows = Math.max(3, 0.05 * pxm)
  // 1 long dark runs per row, stacked into lines
  let open: (Ln & { ysum: number })[] = []
  const lines: (Ln & { ysum: number })[] = []
  for (let y = 0; y < h; y++) {
    const next: typeof open = []
    let x = 0
    while (x < w) {
      if (!dark[y * w + x]) { x++; continue }
      let last = x, gap = 0, x2 = x
      while (x2 < w) { if (dark[y * w + x2]) { last = x2; gap = 0 } else if (++gap > 2) break; x2++ }
      const len = last - x + 1
      if (len >= minRun) {
        const hit = open.find((l) => Math.min(l.x1, last) - Math.max(l.x0, x) >= 0.5 * Math.min(l.x1 - l.x0 + 1, len))
        if (hit) { hit.x0 = Math.min(hit.x0, x); hit.x1 = Math.max(hit.x1, last); hit.rows++; hit.ysum += y; next.push(hit); open = open.filter((l) => l !== hit) }
        else { const l = { y, x0: x, x1: last, rows: 1, ysum: y }; lines.push(l); next.push(l) }
      }
      x = last + 1
    }
    open = next
  }
  for (const l of lines) l.y = l.ysum / l.rows
  const out: Seg[] = []
  // thick solid lines are walls by themselves (black filled blocks)
  const thin: Ln[] = []
  for (const l of lines) {
    if (l.rows > thinRows && l.rows <= 0.6 * pxm && l.x1 - l.x0 >= minSeg) out.push({ c: l.y, a: l.x0, b: l.x1, t: l.rows })
    else if (l.rows <= thinRows) thin.push(l)
  }
  thin.sort((p, q) => p.y - q.y)
  // 2 column sums for the ink between two lines
  const cs = new Int32Array((h + 1) * w)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cs[(y + 1) * w + x] = cs[y * w + x] + dark[y * w + x]
  for (let i = 0; i < thin.length; i++) for (let j = i + 1; j < thin.length; j++) {
    const A = thin[i], B = thin[j], d = B.y - A.y
    if (d > dmax) break
    if (d < dmin) continue
    const ox0 = Math.max(A.x0, B.x0), ox1 = Math.min(A.x1, B.x1)
    if (ox1 - ox0 < minSeg) continue
    const top = Math.ceil(A.y + A.rows / 2) + 0, bot = Math.floor(B.y - B.rows / 2) - 0
    if (bot - top < 2) continue
    const dens = new Float32Array(ox1 - ox0 + 1)
    for (let x = ox0; x <= ox1; x++) dens[x - ox0] = (cs[(bot + 1) * w + x] - cs[top * w + x]) / (bot - top + 1)
    // box-smooth, then runs above the threshold (small breaks allowed)
    const R = 3, sm = new Float32Array(dens.length)
    for (let i2 = 0; i2 < dens.length; i2++) { let s = 0, n = 0; for (let q = Math.max(0, i2 - R); q <= Math.min(dens.length - 1, i2 + R); q++) { s += dens[q]; n++ } sm[i2] = s / n }
    let start = -1, lastOk = -1
    const lineOk = (L: Ln, x0: number, x1: number) => { // the outline is one unbroken line (axes and dimension lines are dashed or carry text)
      let n = 0
      for (let x = x0; x <= x1; x++) { const y = Math.round(L.y); if (dark[(y - 1) * w + x] || dark[y * w + x] || dark[(y + 1) * w + x]) n++ }
      return n >= 0.93 * (x1 - x0 + 1)
    }
    const steady = (x0: number, x1: number) => { // hatch / fill is everywhere between the lines, text is not
      let n = 0
      for (let x = x0; x <= x1; x++) if (dens[x - ox0] >= 0.1) n++
      return n >= 0.75 * (x1 - x0 + 1)
    }
    const flush = () => { if (start >= 0 && lastOk - start + 1 >= minSeg && lineOk(A, ox0 + start, ox0 + lastOk) && lineOk(B, ox0 + start, ox0 + lastOk) && steady(start + ox0, lastOk + ox0)) out.push({ c: (A.y + B.y) / 2, a: ox0 + start, b: ox0 + lastOk, t: d + (A.rows + B.rows) / 2 }); start = -1 }
    for (let i2 = 0; i2 < sm.length; i2++) {
      if (sm[i2] >= 0.14) { if (start < 0) start = i2; lastOk = i2 } else if (start >= 0 && i2 - lastOk > 3) flush()
    }
    flush()
  }
  return merge(out)
}

/** Overlapping pieces on (nearly) the same centre line become one. */
function merge(segs: Seg[]): Seg[] {
  const s = [...segs].sort((p, q) => p.c - q.c)
  const dead = new Set<number>()
  for (let i = 0; i < s.length; i++) {
    if (dead.has(i)) continue
    for (let j = i + 1; j < s.length; j++) {
      if (dead.has(j)) continue
      const A = s[i], B = s[j]
      if (B.c - A.c > 0.6 * Math.max(A.t, B.t) + 2) break
      const ov = Math.min(A.b, B.b) - Math.max(A.a, B.a)
      if (ov < 0.3 * Math.min(A.b - A.a, B.b - B.a)) continue
      const la = A.b - A.a, lb = B.b - B.a
      s[i] = { c: (A.c * la + B.c * lb) / (la + lb), a: Math.min(A.a, B.a), b: Math.max(A.b, B.b), t: Math.max(A.t, B.t) }
      dead.add(j); j = i // restart against the grown piece
    }
  }
  return s.filter((_, i) => !dead.has(i))
}

/** Snap wall ends onto the walls they touch (the outline of a wall ends at the face of the next one, the centre line has to reach its centre). */
function joinEnds(A: Seg[], B: Seg[]) {
  for (const s of A) for (const end of ['a', 'b'] as const) {
    const e = s[end]
    let best: Seg | null = null, bd = Infinity
    for (const p of B) {
      if (s.c < p.a - 0.6 * p.t - 3 || s.c > p.b + 0.6 * p.t + 3) continue
      const d = Math.min(Math.abs(e - (p.c - p.t / 2)), Math.abs(e - (p.c + p.t / 2)), Math.abs(e - p.c))
      if (d <= 0.45 * p.t + 3 && d < bd) { bd = d; best = p }
    }
    if (best) s[end] = best.c
  }
}

/** Collinear pieces with a gap: bridge them (the gap is a door / window). */
function bridge(segs: Seg[], pxm: number, ink: (a: number, c: number) => boolean): { segs: Seg[]; gaps: { c: number; a: number; b: number; t: number; cov: number }[] } {
  const s = [...segs].sort((p, q) => p.c - q.c || p.a - q.a)
  const out = [...s], gaps: { c: number; a: number; b: number; t: number; cov: number }[] = []
  for (let i = 0; i < s.length; i++) {
    let best: Seg | null = null
    for (let j = 0; j < s.length; j++) {
      if (i === j) continue
      const A = s[i], B = s[j]
      if (Math.abs(A.c - B.c) > 0.4 * Math.max(A.t, B.t) + 2) continue
      const g = B.a - A.b
      if (g < -2 || g > 2.5 * pxm) continue
      if (!best || B.a < best.a) best = B
    }
    if (!best) continue
    const A = s[i], g = best.a - A.b
    if (g <= 1) continue
    const c = (A.c + best.c) / 2, t = (A.t + best.t) / 2
    out.push({ c, a: A.b, b: best.a, t })
    if (g >= 0.3 * pxm) {
      let hit = 0, n = 0
      for (let x = A.b; x <= best.a; x++) { n++; for (let o = -Math.max(1, Math.round(t / 2) - 1); o <= Math.max(1, Math.round(t / 2) - 1); o++) if (ink(x, Math.round(c + o))) { hit++; break } }
      gaps.push({ c, a: A.b, b: best.a, t, cov: hit / (n || 1) })
    }
  }
  return { segs: out, gaps }
}

export type Outlined = { trace: TraceState; thickAt: (p: Pt) => number; ops: Op[] }

export function detectOutlined(gray: Uint8Array, w: number, h: number, pxm: number): Outlined | null {
  const dark = new Uint8Array(w * h), darkT = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = gray[y * w + x] < 165 ? 1 : 0; dark[y * w + x] = v; darkT[x * h + y] = v }
  let H = horizontal(dark, w, h, pxm)
  let V = horizontal(darkT, h, w, pxm) // vertical walls: the same on the transposed picture (c = x, a..b = y)
  joinEnds(H, V); joinEnds(V, H)
  const bh = bridge(H, pxm, (x, y) => x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x] === 1)
  const bv = bridge(V, pxm, (y, x) => x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x] === 1)
  H = bh.segs; V = bv.segs
  if (H.length + V.length < 4) return null
  let trace: TraceState = { ...emptyTrace(), pxPerM: pxm }
  const snap = Math.max(4, 0.12 * pxm)
  for (const s of H) trace = addWall(trace, [s.a, s.c], [s.b, s.c], snap)
  for (const s of V) trace = addWall(trace, [s.c, s.a], [s.c, s.b], snap)
  // lettering and dimension marks: small pieces that touch nothing
  {
    const par = new Map<string, string>()
    const find = (x: string): string => { const q = par.get(x) ?? x; if (q === x) return x; const r = find(q); par.set(x, r); return r }
    for (const wl of trace.walls) par.set(find(wl.a), find(wl.b))
    const len = new Map<string, number>()
    for (const wl of trace.walls) { const a = trace.nodes[wl.a], b = trace.nodes[wl.b], r = find(wl.a); len.set(r, (len.get(r) ?? 0) + Math.hypot(a[0] - b[0], a[1] - b[1])) }
    const walls = trace.walls.filter((wl) => (len.get(find(wl.a)) ?? 0) >= 1.2 * pxm)
    const used = new Set(walls.flatMap((wl) => [wl.a, wl.b]))
    trace = { ...trace, walls, nodes: Object.fromEntries(Object.entries(trace.nodes).filter(([id]) => used.has(id))) }
  }
  const all = [...H.map((s) => ({ s, h: true })), ...V.map((s) => ({ s, h: false }))]
  const thickAt = (p: Pt) => {
    let best = 0.2 * pxm, bd = Infinity
    for (const { s, h: hz } of all) {
      const along = hz ? p[0] : p[1], across = hz ? p[1] : p[0]
      if (along < s.a - 3 || along > s.b + 3) continue
      const d = Math.abs(across - s.c)
      if (d < bd) { bd = d; best = s.t }
    }
    return best
  }
  const ops: Op[] = [
    ...bh.gaps.map((g) => ({ at: [(g.a + g.b) / 2, g.c] as Pt, width: g.b - g.a, cov: g.cov })),
    ...bv.gaps.map((g) => ({ at: [g.c, (g.a + g.b) / 2] as Pt, width: g.b - g.a, cov: g.cov })),
  ]
  return { trace, thickAt, ops }
}
