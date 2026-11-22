// Automatic reading of a floor-plan picture: finds the walls (thick dark strokes) and the doors / windows (gaps in them).
// Pure image processing, runs in the browser: threshold -> remove thin lines -> skeleton -> graph -> straighten -> bridge gaps.
import type { Pt } from '../plan'
import { detectOutlined } from './detectOutline'
import { faces, projectOnSeg, type TraceState, type TraceWall, type TraceOpening } from './library'

export type Detected = {
  nodes: Record<string, Pt>
  walls: TraceWall[]
  openings: TraceOpening[]
  outerThick: number // cm
  innerThick: number // cm
  method: 'solid' | 'outline' // thick filled walls, or double lines with hatching
  alt?: Detected // the same plan read the other way (to switch when the first guess is wrong)
}

const MAXSIDE = 1100
const hyp = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ───────────── morphology (chamfer distance) ─────────────
/** For every foreground pixel: distance to the nearest background pixel (0 on the background). */
function distance(mask: Uint8Array, w: number, h: number): Float32Array {
  const o = new Float32Array(w * h)
  for (let i = 0; i < o.length; i++) o[i] = mask[i] ? 1e9 : 0
  const D = Math.SQRT2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!o[i]) continue
    let v = o[i]
    if (x > 0) v = Math.min(v, o[i - 1] + 1)
    if (y > 0) { v = Math.min(v, o[i - w] + 1); if (x > 0) v = Math.min(v, o[i - w - 1] + D); if (x < w - 1) v = Math.min(v, o[i - w + 1] + D) }
    o[i] = v
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x
    if (!o[i]) continue
    let v = o[i]
    if (x < w - 1) v = Math.min(v, o[i + 1] + 1)
    if (y < h - 1) { v = Math.min(v, o[i + w] + 1); if (x < w - 1) v = Math.min(v, o[i + w + 1] + D); if (x > 0) v = Math.min(v, o[i + w - 1] + D) }
    o[i] = v
  }
  return o
}
const invert = (m: Uint8Array) => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o }
const dilate = (m: Uint8Array, w: number, h: number, r: number) => { const d = distance(invert(m), w, h), o = new Uint8Array(m.length); for (let i = 0; i < o.length; i++) o[i] = d[i] <= r ? 1 : 0; return o }
const erode = (m: Uint8Array, w: number, h: number, r: number) => { const d = distance(m, w, h), o = new Uint8Array(m.length); for (let i = 0; i < o.length; i++) o[i] = d[i] > r ? 1 : 0; return o }

// ───────────── Zhang–Suen thinning ─────────────
function thin(src: Uint8Array, w: number, h: number): Uint8Array {
  const m = Uint8Array.from(src)
  for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0 }
  for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0 }
  const del: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (!m[i]) continue
        const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1]
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (B < 2 || B > 6) continue
        const A = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) + (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0)
        if (A !== 1) continue
        if (pass === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue } else if (p2 * p4 * p8 || p2 * p6 * p8) continue
        del.push(i)
      }
      for (const i of del) m[i] = 0
      if (del.length) changed = true
    }
  }
  return m
}

// ───────────── graph ─────────────
type GN = { p: Pt }
type GE = { a: number; b: number; t: number; raw: Pt[] } // t = wall thickness in px, raw = pixel path from a to b
export type Op = { at: Pt; width: number; cov: number; kind?: 'window' } // px
type Graph = { N: GN[]; E: (GE | null)[] }

function rdp(pts: Pt[], eps: number): number[] {
  const keep = new Set<number>([0, pts.length - 1])
  const rec = (s: number, e: number) => {
    let md = 0, mi = -1
    const a = pts[s], b = pts[e], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / L
      if (d > md) { md = d; mi = i }
    }
    if (mi >= 0 && md > eps) { keep.add(mi); rec(s, mi); rec(mi, e) }
  }
  if (pts.length > 2) rec(0, pts.length - 1)
  return [...keep].sort((x, y) => x - y)
}

function buildGraph(sk: Uint8Array, dt: Float32Array, w: number, h: number, eps: number): Graph {
  const OFF = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1] // N NE E SE S SW W NW
  const FOUR = [0, 2, 4, 6]
  const isNode = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (!sk[i]) continue
    let count = 0, cn = 0
    for (let k = 0; k < 8; k++) { const v = sk[i + OFF[k]], u = sk[i + OFF[(k + 7) % 8]]; count += v; if (v && !u) cn++ }
    if (count === 1 || cn >= 3) isNode[i] = 1
  }
  const nodeId = new Int32Array(w * h).fill(-1)
  const clusters: number[][] = []
  for (let i = 0; i < isNode.length; i++) {
    if (!isNode[i] || nodeId[i] >= 0) continue
    const c = clusters.length, st = [i], list: number[] = []
    nodeId[i] = c
    while (st.length) { const p = st.pop()!; list.push(p); for (const o of OFF) { const q = p + o; if (isNode[q] && nodeId[q] < 0) { nodeId[q] = c; st.push(q) } } }
    clusters.push(list)
  }
  const N: GN[] = [], E: (GE | null)[] = []
  const cen = (list: number[]): Pt => { let sx = 0, sy = 0; for (const p of list) { sx += p % w; sy += (p / w) | 0 } return [sx / list.length, sy / list.length] }
  clusters.forEach((l) => N.push({ p: cen(l) }))
  const visited = new Uint8Array(w * h)
  const pix = (i: number): Pt => [i % w, (i / w) | 0]

  const addChain = (a: number, b: number, idxs: number[]) => {
    const raw: Pt[] = [N[a].p, ...idxs.map(pix), N[b].p]
    let ts = 0; for (const i of idxs) ts += dt[i]
    const t = idxs.length ? (2 * ts) / idxs.length : 2 * (dt[Math.round(N[a].p[1]) * w + Math.round(N[a].p[0])] || 2)
    if (a === b) {
      if (raw.length < 8) return
      const m = N.push({ p: raw[raw.length >> 1] }) - 1, mid = raw.length >> 1
      addChain2(a, m, raw.slice(0, mid + 1), t); addChain2(m, b, raw.slice(mid), t)
      return
    }
    addChain2(a, b, raw, t)
  }
  const addChain2 = (a: number, b: number, raw: Pt[], t: number) => {
    const keep = rdp(raw, eps)
    let prev = a
    for (let k = 1; k < keep.length; k++) {
      const last = k === keep.length - 1
      const cur = last ? b : N.push({ p: raw[keep[k]] }) - 1
      if (cur !== prev) E.push({ a: prev, b: cur, t, raw: raw.slice(keep[k - 1], keep[k] + 1) })
      prev = cur
    }
  }
  const walk = (c: number, start: number) => {
    const idxs = [start]
    visited[start] = 1
    let cur = start, end = -1
    for (let guard = 0; guard < 200000; guard++) {
      let next = -1, hit = -1
      for (const k of [...FOUR, 1, 3, 5, 7]) {
        const n = cur + OFF[k]
        if (!sk[n]) continue
        if (nodeId[n] >= 0) { if (nodeId[n] !== c || idxs.length > 2) hit = nodeId[n]; continue }
        if (!visited[n] && next < 0) next = n
      }
      if (hit >= 0) { end = hit; break }
      if (next < 0) break
      visited[next] = 1; idxs.push(next); cur = next
    }
    if (end >= 0) addChain(c, end, idxs)
  }
  for (let c = 0; c < clusters.length; c++) for (const p of clusters[c]) for (const o of OFF) {
    const q = p + o
    if (sk[q] && nodeId[q] < 0 && !visited[q]) walk(c, q)
  }
  // closed rings with no junction at all
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || visited[i] || nodeId[i] >= 0) continue
    if (OFF.some((o) => visited[i + o] || nodeId[i + o] >= 0)) continue
    const c = N.push({ p: pix(i) }) - 1
    nodeId[i] = c; visited[i] = 1
    const nb = OFF.map((o) => i + o).find((q) => sk[q] && !visited[q])
    if (nb !== undefined) walk(c, nb)
  }
  return { N, E }
}

const live = (g: Graph) => g.E.filter((e): e is GE => !!e)
function degrees(g: Graph) { const d = new Array<number>(g.N.length).fill(0); for (const e of live(g)) { d[e.a]++; d[e.b]++ } return d }
const elen = (g: Graph, e: GE) => hyp(g.N[e.a].p, g.N[e.b].p)

/** Merge nodes closer than `thr` (px) into one. */
function mergeClose(g: Graph, thr: (i: number) => number) {
  const par = g.N.map((_, i) => i)
  const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])))
  for (let i = 0; i < g.N.length; i++) for (let j = i + 1; j < g.N.length; j++) if (hyp(g.N[i].p, g.N[j].p) < Math.min(thr(i), thr(j))) par[find(j)] = find(i)
  const sum = new Map<number, { x: number; y: number; n: number }>()
  g.N.forEach((n, i) => { const r = find(i), s = sum.get(r) ?? { x: 0, y: 0, n: 0 }; s.x += n.p[0]; s.y += n.p[1]; s.n++; sum.set(r, s) })
  for (const [r, s] of sum) g.N[r] = { p: [s.x / s.n, s.y / s.n] }
  const seen = new Set<string>()
  g.E = g.E.map((e) => {
    if (!e) return null
    const a = find(e.a), b = find(e.b), key = a < b ? a + '_' + b : b + '_' + a
    if (a === b || seen.has(key)) return null
    seen.add(key)
    return { ...e, a, b }
  })
}

function removeSpurs(g: Graph) {
  for (let pass = 0; pass < 3; pass++) {
    const deg = degrees(g)
    let any = false
    g.E = g.E.map((e) => {
      if (!e) return null
      const ends = (deg[e.a] === 1 ? 1 : 0) + (deg[e.b] === 1 ? 1 : 0), far = deg[e.a] === 1 ? deg[e.b] : deg[e.a]
      if (ends === 1 && far >= 3 && elen(g, e) < e.t * 0.75 + 2) { any = true; return null }
      return e
    })
    if (!any) break
  }
}

function dropSmallParts(g: Graph, minLen: number) {
  const par = g.N.map((_, i) => i)
  const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])))
  for (const e of live(g)) par[find(e.a)] = find(e.b)
  const total = new Map<number, number>()
  for (const e of live(g)) total.set(find(e.a), (total.get(find(e.a)) ?? 0) + elen(g, e))
  g.E = g.E.map((e) => (e && (total.get(find(e.a)) ?? 0) >= minLen ? e : null))
}

/** Make near-horizontal / near-vertical walls exactly so, and line up walls that are almost on the same line. */
function straighten(g: Graph, snapPx: number) {
  const axis = (k: 0 | 1) => {
    const par = g.N.map((_, i) => i)
    const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])))
    for (const e of live(g)) {
      const A = g.N[e.a].p, B = g.N[e.b].p, L = hyp(A, B)
      if (L < 4) continue
      if (Math.abs(A[k] - B[k]) < L * 0.09) par[find(e.a)] = find(e.b) // k=0: x equal -> vertical wall
    }
    const grp = new Map<number, number[]>()
    g.N.forEach((_, i) => { const r = find(i); (grp.get(r) ?? grp.set(r, []).get(r)!).push(i) })
    // only groups with an actual wall take part; lone nodes keep their value
    const items = [...grp.values()].map((m) => ({ m, v: m.reduce((s, i) => s + g.N[i].p[k], 0) / m.length })).sort((x, y) => x.v - y.v)
    let cluster: typeof items = []
    const flush = () => {
      if (!cluster.length) return
      const tot = cluster.reduce((s, c) => s + c.m.length, 0), v = cluster.reduce((s, c) => s + c.v * c.m.length, 0) / tot
      for (const c of cluster) for (const i of c.m) g.N[i] = { p: k === 0 ? [v, g.N[i].p[1]] : [g.N[i].p[0], v] }
      cluster = []
    }
    for (const it of items) { if (cluster.length && it.v - cluster[cluster.length - 1].v > snapPx) flush(); if (it.m.length > 1 || cluster.length) cluster.push(it); else cluster = [] }
    flush()
  }
  axis(0); axis(1)
}

function mergeStraight(g: Graph) {
  for (let guard = 0; guard < 2000; guard++) {
    const deg = degrees(g)
    let did = false
    for (let i = 0; i < g.N.length && !did; i++) {
      if (deg[i] !== 2) continue
      const es = g.E.map((e, idx) => ({ e, idx })).filter((x) => x.e && (x.e.a === i || x.e.b === i)) as { e: GE; idx: number }[]
      if (es.length !== 2) continue
      const o1 = es[0].e.a === i ? es[0].e.b : es[0].e.a, o2 = es[1].e.a === i ? es[1].e.b : es[1].e.a
      if (o1 === o2) continue
      const P = g.N[i].p, A = g.N[o1].p, B = g.N[o2].p
      const ux = A[0] - P[0], uy = A[1] - P[1], vx = B[0] - P[0], vy = B[1] - P[1]
      const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)
      if (cos > -0.985) continue
      if (g.E.some((e) => e && ((e.a === o1 && e.b === o2) || (e.a === o2 && e.b === o1)))) continue
      const l1 = Math.hypot(ux, uy), l2 = Math.hypot(vx, vy)
      g.E[es[0].idx] = { a: o1, b: o2, t: (es[0].e.t * l1 + es[1].e.t * l2) / (l1 + l2), raw: [] }
      g.E[es[1].idx] = null
      did = true
    }
    if (!did) break
  }
}

// ───────────── windows drawn as white insets inside the wall mass ─────────────
/** Enclosed, small, elongated white areas with wall on both long sides = windows. Returns them and a mask to fill (so the wall stays one piece). */
function findInsetWindows(closed: Uint8Array, wallMass: Uint8Array, w: number, h: number, pxm: number): { ops: Op[]; fill: Uint8Array } {
  const lab = new Int32Array(w * h).fill(-1)
  const comps: { px: number[]; border: boolean }[] = []
  const st: number[] = []
  for (let s0 = 0; s0 < lab.length; s0++) {
    if (closed[s0] || lab[s0] >= 0) continue
    const c = comps.length, px: number[] = []
    let border = false
    lab[s0] = c; st.push(s0)
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p / w) | 0
      px.push(p)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !closed[q] && lab[q] < 0) { lab[q] = c; st.push(q) }
    }
    comps.push({ px: px.length > 2.6 * pxm * pxm ? [] : px, border })
  }
  const cand = new Uint8Array(w * h)
  for (const c of comps) if (!c.border) for (const p of c.px) cand[p] = 1
  const grown = dilate(cand, w, h, 3)
  const gl = new Int32Array(w * h).fill(-1)
  const groups: number[][] = []
  for (let s0 = 0; s0 < gl.length; s0++) {
    if (!grown[s0] || gl[s0] >= 0) continue
    const c = groups.length, px: number[] = []
    gl[s0] = c; st.push(s0)
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p / w) | 0
      if (cand[p]) px.push(p)
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && grown[q] && gl[q] < 0) { gl[q] = c; st.push(q) }
    }
    groups.push(px)
  }
  const ops: Op[] = [], fill = new Uint8Array(w * h)
  const wall = (x: number, y: number) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < h && wallMass[y * w + x] === 1 }
  for (const px of groups) {
    if (px.length < 6) continue
    let mx = 0, my = 0
    for (const p of px) { mx += p % w; my += (p / w) | 0 }
    mx /= px.length; my /= px.length
    let sxx = 0, syy = 0, sxy = 0
    for (const p of px) { const dx = (p % w) - mx, dy = ((p / w) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang)
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9
    for (const p of px) { const dx = (p % w) - mx, dy = ((p / w) | 0) - my, a = dx * ux + dy * uy, b = -dx * uy + dy * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b) }
    const major = a1 - a0 + 1, minor = b1 - b0 + 1
    if (major < 0.45 * pxm || major > 3.2 * pxm || minor > 0.45 * pxm || major < 2 * minor) continue
    // wall mass on both long sides along the whole length
    let ok = 0, n = 0
    const cx = mx + ((a0 + a1) / 2) * ux, cy = my + ((a0 + a1) / 2) * uy
    for (let a = a0 + 2; a <= a1 - 2; a += 2) {
      n++
      const bx = mx + a * ux, by = my + a * uy
      const side = (pos: boolean) => [2, 4, 6].some((o) => { const off = pos ? b1 + o : b0 - o; return wall(bx - uy * off, by + ux * off) })
      if (side(true) && side(false)) ok++
    }
    if (!n || ok / n < 0.6) continue
    // fill the hole and everything between its fragments
    const hw = major / 2 + 1, hh = minor / 2 + 3
    const r = Math.ceil(Math.hypot(hw, hh))
    for (let y = Math.max(0, Math.round(cy) - r); y <= Math.min(h - 1, Math.round(cy) + r); y++) for (let x = Math.max(0, Math.round(cx) - r); x <= Math.min(w - 1, Math.round(cx) + r); x++) {
      const dx = x - cx, dy = y - cy
      if (Math.abs(dx * ux + dy * uy) <= hw && Math.abs(-dx * uy + dy * ux) <= hh) fill[y * w + x] = 1
    }
    ops.push({ at: [cx, cy], width: major, cov: 1, kind: 'window' })
  }
  return { ops, fill }
}

// ───────────── the whole pipeline ─────────────
type Core = { g: Graph; ops: Op[]; thickShare: number }

function detectCore(gray: Uint8Array, w: number, h: number, pxm: number, T: number): Core {
  const dark = new Uint8Array(w * h)
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < T ? 1 : 0
  const minT = Math.max(4, 0.075 * pxm)
  const closed = erode(dilate(dark, w, h, 2), w, h, 2) // hatching and small breaks inside walls
  const open0 = dilate(erode(closed, w, h, minT / 2), w, h, minT / 2)
  const inset = findInsetWindows(closed, open0, w, h, pxm)
  for (let i = 0; i < closed.length; i++) if (inset.fill[i]) closed[i] = 1
  const core = erode(closed, w, h, minT / 2)
  const opened = dilate(core, w, h, minT / 2) // thin lines (furniture, text, dimension lines) are gone
  const dt = distance(opened, w, h)
  const sk = thin(opened, w, h)
  const g = buildGraph(sk, dt, w, h, Math.max(2, minT * 0.5))
  mergeClose(g, (i) => { let t = 6; for (const e of live(g)) if (e.a === i || e.b === i) t = Math.max(t, e.t * 0.7); return t })
  removeSpurs(g)
  dropSmallParts(g, 0.6 * pxm) // lettering, symbols
  const ops: Op[] = [...inset.ops]
  mergeClose(g, () => 4)
  straighten(g, 4)
  mergeClose(g, () => 3)
  mergeStraight(g)
  removeSpurs(g)
  mergeStraight(g)

  // ── gaps in walls: doors and windows. Bridge facing wall ends; the gap becomes an opening.
  const band = (p: Pt, q: Pt, half: number) => { // how much of the gap shows ink inside the wall's footprint (window glazing lines)
    const L = hyp(p, q), n = Math.max(1, Math.ceil(L)), ux = (q[0] - p[0]) / (L || 1), uy = (q[1] - p[1]) / (L || 1)
    let hits = 0
    for (let s = 0; s <= n; s++) {
      for (let o = -half; o <= half; o++) {
        const x = Math.round(p[0] + ux * (L * s) / n - uy * o), y = Math.round(p[1] + uy * (L * s) / n + ux * o)
        if (x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x]) { hits++; break }
      }
    }
    return hits / (n + 1)
  }
  const outwardDir = (i: number): { d: Pt; r: number; e: GE } | null => {
    const e = live(g).find((x) => x.a === i || x.b === i)
    if (!e) return null
    const r = e.t / 2
    const raw = e.a === i ? e.raw : [...e.raw].reverse()
    const P = g.N[i].p
    let Q: Pt | null = null
    if (raw.length >= 2) Q = raw[Math.min(raw.length - 1, Math.round(r * 2 + 4))]
    if (!Q || hyp(P, Q) < 2) Q = g.N[e.a === i ? e.b : e.a].p
    const L = hyp(P, Q)
    if (L < 1) return null
    return { d: [(P[0] - Q[0]) / L, (P[1] - Q[1]) / L], r, e }
  }
  const maxGap = 3.2 * pxm, minOpen = 0.5 * pxm
  const darkAt = (x: number, y: number) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < w && y < h && opened[y * w + x] === 1 }
  {
    // From every loose wall end, look along the wall through the picture: the gap is where the dark mass stops and starts again.
    const deg = degrees(g)
    const ends = g.N.map((_, i) => i).filter((i) => deg[i] === 1)
    const pairs = new Set<string>()
    for (const i of ends) {
      const A = outwardDir(i)
      if (!A || elen(g, A.e) < 0.3 * pxm) continue
      const P = g.N[i].p, at = (s: number): Pt => [P[0] + A.d[0] * s, P[1] + A.d[1] * s]
      let s1 = 0
      while (s1 < A.e.t * 2 + 6 && darkAt(...at(s1))) s1++
      let hit = -1
      for (let u = s1 + 1; u <= maxGap; u++) if (darkAt(...at(u)) && darkAt(...at(u + 1)) && darkAt(...at(u + 2))) { hit = u; break }
      if (hit < 0) continue
      const q = at(hit)
      // what the ray met: a corner / end of a wall, or the side of a wall
      let node = -1, nd = Infinity
      g.N.forEach((n, j) => {
        if (j === i || deg[j] === 0) return
        let tt = 6; for (const e of live(g)) if (e.a === j || e.b === j) tt = Math.max(tt, e.t)
        const d = hyp(n.p, q)
        if (d < 0.8 * tt + 3 && d < nd) { nd = d; node = j }
      })
      let target = node
      if (target < 0) {
        let be: GE | null = null, bd = Infinity, bt = 0
        for (const e of live(g)) {
          if (e.a === i || e.b === i) continue
          const pr = projectOnSeg(q, g.N[e.a].p, g.N[e.b].p)
          if (pr.d < 0.8 * e.t + 3 && pr.d < bd && pr.t > 0.02 && pr.t < 0.98) { bd = pr.d; be = e; bt = pr.t }
        }
        if (!be) continue
        const C = g.N[be.a].p, D = g.N[be.b].p
        target = g.N.push({ p: [C[0] + (D[0] - C[0]) * bt, C[1] + (D[1] - C[1]) * bt] }) - 1
        const k = g.E.indexOf(be)
        g.E[k] = { a: be.a, b: target, t: be.t, raw: [] }
        g.E.push({ a: target, b: be.b, t: be.t, raw: [] })
      }
      const key = i < target ? i + '_' + target : target + '_' + i
      if (pairs.has(key) || g.E.some((e) => e && ((e.a === i && e.b === target) || (e.a === target && e.b === i)))) continue
      pairs.add(key)
      g.E.push({ a: i, b: target, t: A.e.t, raw: [] })
      const width = hit - s1
      if (width >= minOpen) {
        const p1 = at(s1)
        ops.push({ at: [(p1[0] + q[0]) / 2, (p1[1] + q[1]) / 2], width, cov: band(p1, q, Math.max(1, Math.round(A.e.t / 2) - 1)) })
      }
    }
  }
  dropSmallParts(g, 1.2 * pxm)
  mergeClose(g, () => 3)
  mergeStraight(g)
  let nd = 0, no = 0
  for (let i = 0; i < dark.length; i++) { nd += dark[i]; no += opened[i] }
  return { g, ops, thickShare: no / (nd || 1) }
}

/** Graph -> wall list, openings classified by what wall they are in. */
function finish(core: Core, pxm: number, k: number): Detected {
  const { g, ops } = core
  const es = live(g)
  const used = [...new Set(es.flatMap((e) => [e.a, e.b]))]
  const nodes: Record<string, Pt> = {}
  const nid = new Map<number, string>()
  used.forEach((n, i) => { nid.set(n, 'dn' + (i + 1)); nodes[nid.get(n)!] = [g.N[n].p[0] / k, g.N[n].p[1] / k] })
  const walls: TraceWall[] = es.map((e, i) => ({ id: 'dw' + (i + 1), a: nid.get(e.a)!, b: nid.get(e.b)! }))
  const thick = new Map(walls.map((w, i) => [w.id, es[i].t / k]))
  return classify(nodes, walls, thick, ops, pxm, k, 'solid')
}

/** Walls (full-image pixels) + gaps -> outer / inner thickness and doors / windows. */
export function classify(nodes0: Record<string, Pt>, walls0: TraceWall[], thick: Map<string, number>, ops: Op[], pxm: number, k: number, method: Detected['method']): Detected {
  const pxmFull = pxm / k
  let nodes = nodes0, walls = walls0
  ;({ nodes, walls } = dropOpenWalls(nodes, walls, pxmFull))
  const trace: TraceState = { pxPerM: pxmFull, nodes, walls, openings: [], rooms: [], fixtures: {}, outerThick: 25, innerThick: 12 }
  const outerEdges = new Set<string>()
  for (const f of faces(trace).filter((q) => q.outer)) for (let i = 0; i < f.nodes.length; i++) { const a = f.nodes[i], b = f.nodes[(i + 1) % f.nodes.length]; outerEdges.add(a + '|' + b); outerEdges.add(b + '|' + a) }
  const med = (v: number[], d: number) => (v.length ? v.sort((x, y) => x - y)[v.length >> 1] : d)
  const outerT: number[] = [], innerT: number[] = []
  for (const w of walls) (outerEdges.has(w.a + '|' + w.b) ? outerT : innerT).push((thick.get(w.id)! / pxmFull) * 100)
  const outerThick = Math.round(Math.min(60, Math.max(10, med(outerT, 25)))), innerThick = Math.round(Math.min(40, Math.max(6, med(innerT, 12))))

  const openings: TraceOpening[] = []
  for (const o of ops) {
    const at: Pt = [o.at[0] / k, o.at[1] / k]
    let best: { w: TraceWall; pt: Pt; d: number } | null = null
    for (const w of walls) { const pr = projectOnSeg(at, nodes[w.a], nodes[w.b]); if (!best || pr.d < best.d) best = { w, pt: pr.pt, d: pr.d } }
    if (!best || best.d > 0.5 * pxmFull) continue
    const widthM = o.width / pxm, outer = outerEdges.has(best.w.a + '|' + best.w.b)
    const kind: 'door' | 'window' = o.kind ?? (outer && (o.cov > 0.5 || widthM > 1.4) ? 'window' : 'door')
    openings.push({ id: 'do' + (openings.length + 1), at: best.pt, kind, width: Math.round(Math.min(4, Math.max(0.5, widthM)) * 100) / 100 })
  }
  // every wall keeps its own measured thickness (cm)
  const own = walls.map((w) => ({ ...w, thick: Math.round(Math.min(60, Math.max(8, ((thick.get(w.id) ?? 0) / pxmFull) * 100))) || undefined }))
  return { nodes, walls: own, openings, outerThick, innerThick, method }
}

/** Keep only walls that border a closed area. What is left over is cut off by the edge of the picture: neighbouring flats, stairwells, loose marks. */
function dropOpenWalls(nodes: Record<string, Pt>, walls: TraceWall[], pxm: number): { nodes: Record<string, Pt>; walls: TraceWall[] } {
  const t: TraceState = { pxPerM: pxm, nodes, walls, openings: [], rooms: [], fixtures: {}, outerThick: 25, innerThick: 12 }
  const keep = new Set<string>()
  for (const f of faces(t)) {
    if (f.outer) continue
    for (let i = 0; i < f.nodes.length; i++) { const a = f.nodes[i], b = f.nodes[(i + 1) % f.nodes.length]; keep.add(a + '|' + b); keep.add(b + '|' + a) }
  }
  const kept = walls.filter((w) => keep.has(w.a + '|' + w.b))
  const len = (ws: TraceWall[]) => ws.reduce((q, w) => q + hyp(nodes[w.a], nodes[w.b]), 0)
  if (kept.length < 4 || len(kept) < 0.7 * len(walls)) return { nodes, walls } // most walls open: the picture is probably not closing its rooms, so do not guess
  const used = new Set(kept.flatMap((w) => [w.a, w.b]))
  return { nodes: Object.fromEntries(Object.entries(nodes).filter(([id]) => used.has(id))), walls: kept }
}

/** `region` [x1,y1,x2,y2] in image pixels: ignore everything outside (e.g. axes, dimensions, neighbouring flats). */
export async function detectPlan(url: string, imgW: number, imgH: number, pxPerM: number, region?: [number, number, number, number]): Promise<Detected> {
  const img = new Image()
  img.src = url
  await img.decode()
  const grayAt = (k: number) => {
    const w = Math.round(imgW * k), h = Math.round(imgH * k)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h)
    g.drawImage(img, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const gray = new Uint8Array(w * h)
    for (let i = 0; i < gray.length; i++) gray[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114
    if (region) {
      const pad = 0.02 * Math.max(imgW, imgH), [x1, y1, x2, y2] = region.map((v, i) => (i < 2 ? v - pad : v + pad) * k)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < x1 || x > x2 || y < y1 || y > y2) gray[y * w + x] = 255
    }
    return { gray, w, h }
  }
  await new Promise((r) => setTimeout(r, 30)) // let the "working" state paint first
  const k = Math.min(1, MAXSIDE / Math.max(imgW, imgH))
  const A = grayAt(k)
  const solid = detectCore(A.gray, A.w, A.h, pxPerM * k, 135)
  const res = finish(solid, pxPerM * k, k)
  // thin double-line walls (CAD style) are another reader: use whichever gives more room-like closed areas
  const k2 = Math.min(1, 1700 / Math.max(imgW, imgH))
  const B = k2 === k ? A : grayAt(k2)
  const ol = detectOutlined(B.gray, B.w, B.h, pxPerM * k2)
  let outRes: Detected | null = null
  if (ol && ol.trace.walls.length >= 6) {
    const { nodes, walls } = ol.trace
    const full: Record<string, Pt> = {}
    for (const [id, p] of Object.entries(nodes)) full[id] = [p[0] / k2, p[1] / k2]
    const thick = new Map(walls.map((wl) => { const a = nodes[wl.a], b = nodes[wl.b]; return [wl.id, ol.thickAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) / k2] as const }))
    outRes = classify(full, walls.map((wl) => ({ ...wl })), thick, ol.ops, pxPerM * k2, k2, 'outline')
  }
  const sc = (r: Detected | null) => (r ? roomScore(r, pxPerM) : -1)
  const g = globalThis as { __forceOutline?: boolean; __detInfo?: unknown }
  g.__detInfo = { solid: sc(res), outline: sc(outRes), solidWalls: res.walls.length, outlineWalls: outRes?.walls.length }
  if (!outRes) return res
  // solid reading first; the double-line reader only when the solid one closes almost no rooms
  const useOutline = g.__forceOutline || sc(res) < 2
  const first = useOutline ? outRes : res, second = useOutline ? res : outRes
  return { ...first, alt: { ...second, alt: undefined } }
}

/** Square metres inside closed, room-sized areas (1.5 .. 90 m²): a wall network that really closes rooms scores high. */
function roomScore(r: Detected, pxm: number): number {
  const t: TraceState = { pxPerM: pxm, nodes: r.nodes, walls: r.walls, openings: [], rooms: [], fixtures: {}, outerThick: 25, innerThick: 12 }
  let sum = 0
  for (const f of faces(t)) if (!f.outer) { const m2 = Math.abs(f.area) / pxm / pxm; if (m2 >= 1.5 && m2 <= 90) sum += m2 }
  return sum
}
