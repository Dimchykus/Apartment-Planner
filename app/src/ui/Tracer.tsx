import { useEffect, useMemo, useRef, useState } from 'react'
import { useUI, isTouch } from './uiStore'
import { Icon } from './Icon'
import {
  ROOM_TYPES, roomType, emptyTrace, addWall, removeWall, faces, faceAt, netFaceArea, netFace, interiorPoint, projectOnSeg, loadImage, buildFlat, newFlatId,
  type TraceState, type UserFlat, type RoomTypeId, type Face,
} from '../lib/library'
import { getUserFlat, saveUserFlat, bakeAppEdits } from '../lib/libraryActions'
import { detectPlan, type Detected } from '../lib/detect'
import { attachOpenings, reattach, moveNodes, mergeNodes, nodeNear, alignTo, pruneNodes, resizeRoom, type Attach } from '../lib/traceEdit'
import { useAI } from '../ai/aiStore'
import { aiReviewOpenings, aiFindFlat, pickVisionModel } from '../ai/visionPlan'
import type { FType } from '../catalog'
import type { Pt } from '../plan'

type Step = 'image' | 'scale' | 'walls' | 'openings' | 'rooms' | 'fixtures' | 'save'
const STEPS: { id: Step; label: string }[] = [
  { id: 'image', label: 'Plan image' }, { id: 'scale', label: 'Scale' }, { id: 'walls', label: 'Walls' },
  { id: 'openings', label: 'Doors & windows' }, { id: 'rooms', label: 'Rooms' }, { id: 'fixtures', label: 'Kitchen & bath' }, { id: 'save', label: 'Save' },
]
const FIX: { type: FType; label: string; letter: string }[] = [
  { type: 'kitchen', label: 'Kitchen run', letter: 'K' }, { type: 'bathtub', label: 'Bathtub', letter: 'B' }, { type: 'shower', label: 'Shower', letter: 'S' },
  { type: 'wc', label: 'Toilet', letter: 'T' }, { type: 'vanity', label: 'Sink / vanity', letter: 'V' }, { type: 'washer', label: 'Washing machine', letter: 'W' },
]
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

type Rec = Pick<UserFlat, 'id' | 'name' | 'image' | 'imgW' | 'imgH' | 'trace' | 'created'>

export function Tracer() {
  const tr = useUI((s) => s.tracer)
  const close = useUI((s) => s.closeTracer)
  const showToast = useUI((s) => s.showToast)
  const editing = tr?.id ?? null

  const [rec, setRec] = useState<Rec>(() => {
    const ex0 = editing ? getUserFlat(editing) : null
    const ex = ex0 ? bakeAppEdits(ex0) : null // in-app edits of doors / windows / inner walls are part of what is traced
    return ex ? { id: ex.id, name: ex.name, image: ex.image, imgW: ex.imgW, imgH: ex.imgH, trace: ex.trace, created: ex.created } : { id: newFlatId(), name: 'My flat', image: '', imgW: 0, imgH: 0, trace: emptyTrace(), created: Date.now() }
  })
  const [step, setStep] = useState<Step>(editing ? 'walls' : 'image')
  const [tool, setTool] = useState<string>('draw')
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<Pt | null>(null)
  const [start, setStart] = useState<Pt | null>(null)           // wall chain start
  const [scalePts, setScalePts] = useState<Pt[]>([])
  const [scaleM, setScaleM] = useState('3')
  const [past, setPast] = useState<TraceState[]>([])
  const [future, setFuture] = useState<TraceState[]>([])
  const [selRoom, setSelRoom] = useState<string | null>(null)
  const [fix, setFix] = useState<FType>('kitchen')
  const [opW, setOpW] = useState({ door: '0.9', window: '1.2' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [detBusy, setDetBusy] = useState<'' | 'walls' | 'openings' | 'ai'>('')
  const [det, setDet] = useState<Detected | null>(null) // last wall reading (with the other reading as `alt`)
  const [selOp, setSelOp] = useState<string | null>(null)
  const [aiFlags, setAiFlags] = useState<Record<string, 'door' | 'window'>>({}) // openings where the AI disagrees with the detected type
  const [guide, setGuide] = useState<{ gx: number | null; gy: number | null } | null>(null)
  const detRef = useRef<{ key: string; data: Detected } | null>(null)
  const tried = useRef({ walls: false, openings: false })
  type Item = { kind: 'node'; id: string; base: TraceState; attach: Attach[]; pushed: boolean }
    | { kind: 'wall'; id: string; start: Pt; base: TraceState; attach: Attach[]; pushed: boolean }
    | { kind: 'op'; id: string; base: TraceState; pushed: boolean }
  const item = useRef<Item | null>(null)
  const ai = useAI()
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; pan: boolean } | null>(null)
  const pinch = useRef<{ d: number; k: number } | null>(null)

  const t = rec.trace
  const traceRef = useRef(t)
  traceRef.current = t
  const setTrace = (next: TraceState, push = true) => {
    const cur = traceRef.current
    if (push) { setPast((p) => [...p.slice(-80), cur]); setFuture([]) }
    traceRef.current = next // handlers that run before React re-renders still see the newest trace
    setRec((r) => ({ ...r, trace: next }))
  }
  const undo = () => { const p = past[past.length - 1]; if (!p) return; setFuture((f) => [...f, traceRef.current]); setPast(past.slice(0, -1)); traceRef.current = p; setRec((r) => ({ ...r, trace: p })); setStart(null) }
  const redo = () => { const n = future[future.length - 1]; if (!n) return; setPast((p) => [...p, traceRef.current]); setFuture(future.slice(0, -1)); traceRef.current = n; setRec((r) => ({ ...r, trace: n })) }

  const allFaces = useMemo(() => faces(t), [t])
  const inner = allFaces.filter((f) => !f.outer)
  const outerEdges = useMemo(() => {
    const s = new Set<string>()
    for (const f of allFaces.filter((q) => q.outer)) for (let i = 0; i < f.nodes.length; i++) { const a = f.nodes[i], b = f.nodes[(i + 1) % f.nodes.length]; s.add(a + '|' + b); s.add(b + '|' + a) }
    return s
  }, [allFaces])
  const pxm = t.pxPerM ?? 0

  // ── view helpers
  const fit = () => {
    const el = wrap.current
    if (!el || !rec.imgW) return
    const w = el.clientWidth, h = el.clientHeight, k = Math.min(w / rec.imgW, h / rec.imgH) * 0.96
    setView({ k, x: (w - rec.imgW * k) / 2, y: (h - rec.imgH * k) / 2 })
  }
  useEffect(() => { fit() }, [rec.imgW, rec.imgH]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => fit(); addEventListener('resize', f); return () => removeEventListener('resize', f) }) // eslint-disable-line react-hooks/exhaustive-deps

  const toImg = (cx: number, cy: number): Pt => {
    const r = svg.current!.getBoundingClientRect()
    return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k]
  }
  const zoomAt = (cx: number, cy: number, f: number) => {
    const r = svg.current!.getBoundingClientRect()
    const px = cx - r.left, py = cy - r.top
    setView((v) => { const k = Math.min(12, Math.max(0.08, v.k * f)); return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k } })
  }
  const snapR = 12 / view.k

  // ── snapping for the wall tool
  const snapWall = (p: Pt, from: Pt | null, shift: boolean): Pt => {
    let best: Pt | null = null, bd = snapR
    for (const n of Object.values(t.nodes)) { const d = dist(n, p); if (d < bd) { bd = d; best = n } }
    if (best) return best
    for (const w of t.walls) { const pr = projectOnSeg(p, t.nodes[w.a], t.nodes[w.b]); if (pr.d < snapR * 0.7) return pr.pt }
    if (from && !shift) { // straight lines: snap to horizontal / vertical when almost there
      const dx = Math.abs(p[0] - from[0]), dy = Math.abs(p[1] - from[1])
      if (dy < dx * 0.08) return [p[0], from[1]]
      if (dx < dy * 0.08) return [from[0], p[1]]
    }
    return p
  }

  // ── pointer handling
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }
      drag.current = null
      return
    }
    if (e.button === 0 && tool === 'edit' && (step === 'walls' || step === 'openings')) {
      const p = toImg(e.clientX, e.clientY), tt = traceRef.current, ad = Math.max(10, 0.6 * (pxm || 40))
      if (step === 'walls') {
        const nid = nodeNear(tt, p, snapR * 1.8)
        if (nid) { item.current = { kind: 'node', id: nid, base: tt, attach: attachOpenings(tt, ad), pushed: false }; return }
        let best: { id: string; d: number } | null = null
        for (const w of tt.walls) { const d = projectOnSeg(p, tt.nodes[w.a], tt.nodes[w.b]).d; if (d < Math.max(snapR * 1.3, wallW(w.a, w.b, w.thick) / 2) && (!best || d < best.d)) best = { id: w.id, d } }
        if (best) { item.current = { kind: 'wall', id: best.id, start: p, base: tt, attach: attachOpenings(tt, ad), pushed: false }; return }
      } else {
        const hit = tt.openings.map((o) => ({ o, d: dist(o.at, p) })).filter((x) => x.d < Math.max(snapR * 1.8, x.o.width * pxm * 0.6)).sort((a, b) => a.d - b.d)[0]
        if (hit) { setSelOp(hit.o.id); item.current = { kind: 'op', id: hit.o.id, base: tt, pushed: false }; return }
        setSelOp(null)
      }
    }
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, pan: e.button === 1 || e.button === 2 || tool === 'pan' || step === 'image' }
  }
  const onMove = (e: React.PointerEvent) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      const target = pinch.current.k * (d / pinch.current.d)
      zoomAt(cx, cy, target / view.k)
      return
    }
    const it = item.current
    if (it) {
      const p = toImg(e.clientX, e.clientY), A = it.base
      if (!it.pushed) { it.pushed = true; setPast((q) => [...q.slice(-80), A]); setFuture([]) }
      let next = A
      if (it.kind === 'node') {
        const al = e.shiftKey ? { p, gx: null, gy: null } : alignTo(A, p, snapR * 0.8, new Set([it.id]))
        setGuide({ gx: al.gx, gy: al.gy })
        next = reattach(moveNodes(A, { [it.id]: al.p }), it.attach)
      } else if (it.kind === 'wall') {
        const w = A.walls.find((x) => x.id === it.id)!, a0 = A.nodes[w.a], b0 = A.nodes[w.b]
        const raw: Pt = [a0[0] + p[0] - it.start[0], a0[1] + p[1] - it.start[1]]
        const al = e.shiftKey ? { p: raw, gx: null, gy: null } : alignTo(A, raw, snapR * 0.8, new Set([w.a, w.b]))
        setGuide({ gx: al.gx, gy: al.gy })
        const sx = al.p[0] - a0[0], sy = al.p[1] - a0[1]
        next = reattach(moveNodes(A, { [w.a]: [a0[0] + sx, a0[1] + sy], [w.b]: [b0[0] + sx, b0[1] + sy] }), it.attach)
      } else {
        let best: { pt: Pt; d: number } | null = null
        for (const w of A.walls) { const pr = projectOnSeg(p, A.nodes[w.a], A.nodes[w.b]); if (!best || pr.d < best.d) best = { pt: pr.pt, d: pr.d } }
        if (best) next = { ...A, openings: A.openings.map((o) => (o.id === it.id ? { ...o, at: best!.pt } : o)) }
      }
      setTrace(next, false)
      setHover(p)
      return
    }
    const d = drag.current
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true
      if (d.moved && (d.pan || e.buttons === 4)) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
      else if (d.moved && !d.pan) { /* dragging in a drawing tool: pan too, so a finger can move the plan */ setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy })) }
    }
    setHover(toImg(e.clientX, e.clientY))
  }
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) pinch.current = null
    const it = item.current
    if (it) {
      item.current = null; setGuide(null)
      if (it.kind === 'node' && it.pushed) {
        const cur = traceRef.current, pos = cur.nodes[it.id], other = pos && nodeNear(cur, pos, snapR * 1.2, it.id)
        if (other) setTrace(pruneNodes(mergeNodes(cur, it.id, other)), false)
      }
      return
    }
    const d = drag.current
    drag.current = null
    if (d && !d.moved && e.button === 0) click(toImg(e.clientX, e.clientY), e.shiftKey)
    if (e.button === 2) setStart(null)
  }

  // ── clicks
  const click = (p: Pt, shift: boolean) => {
    const t = traceRef.current
    if (step === 'scale') { setScalePts((s) => (s.length >= 2 ? [p] : [...s, p])); return }
    if (step === 'walls') {
      if (tool === 'erase') {
        let best: { id: string; d: number } | null = null
        for (const w of t.walls) { const d = projectOnSeg(p, t.nodes[w.a], t.nodes[w.b]).d; if (d < snapR * 1.2 && (!best || d < best.d)) best = { id: w.id, d } }
        if (best) setTrace(removeWall(t, best.id))
        return
      }
      if (tool !== 'draw' && tool !== 'divider') return
      const q = snapWall(p, start, shift)
      if (!start) { setStart(q); return }
      if (dist(start, q) < snapR * 0.5) { setStart(null); return }
      setTrace(addWall(t, start, q, snapR, tool === 'divider'))
      setStart(q)
      return
    }
    if (step === 'openings') {
      if (tool === 'erase') {
        const hit = t.openings.map((o) => ({ o, d: dist(o.at, p) })).filter((x) => x.d < Math.max(snapR * 1.5, x.o.width * pxm * 0.6)).sort((a, b) => a.d - b.d)[0]
        if (hit) setTrace({ ...t, openings: t.openings.filter((o) => o.id !== hit.o.id) })
        return
      }
      let best: { pt: Pt; d: number } | null = null
      for (const w of t.walls) { if (w.divider) continue; const pr = projectOnSeg(p, t.nodes[w.a], t.nodes[w.b]); if (!best || pr.d < best.d) best = { pt: pr.pt, d: pr.d } }
      if (!best || best.d > snapR * 2) { showToast('Click on a wall (a room divider is open: no door there).'); return }
      if (tool === 'pan' || tool === 'edit') { setSelOp(null); return }
      const kind = tool === 'window' ? 'window' : 'door'
      const width = Math.max(0.4, parseFloat(opW[kind]) || (kind === 'door' ? 0.9 : 1.2))
      setTrace({ ...t, openings: [...t.openings, { id: 'o' + Date.now().toString(36) + t.openings.length, at: best.pt, kind, width }] })
      return
    }
    if (step === 'rooms') {
      const hitRoom = t.rooms.find((r) => dist(r.at, p) < snapR * 2.5)
      if (hitRoom) { setSelRoom(hitRoom.id); return }
      const f = faceAt(t, p)
      if (!f) { showToast('Click inside a closed room (all its walls must be drawn).'); return }
      if (t.rooms.some((r) => faceAt(t, r.at) === f || (faceAt(t, r.at) && Math.abs(faceAt(t, r.at)!.area - f.area) < 1e-6))) { showToast('That room is already marked.'); return }
      const id = 'r' + Date.now().toString(36)
      const first = t.rooms.length === 0
      setTrace({ ...t, rooms: [...t.rooms, { id, at: p, type: (first ? 'open' : 'bedroom') as RoomTypeId }] })
      setSelRoom(id)
      return
    }
    if (step === 'fixtures') { setTrace({ ...t, fixtures: { ...t.fixtures, [fix]: p } }); return }
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (start) setStart(null); else close() }
      else if (e.key === 'Enter') setStart(null)
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo() }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const w = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15) }
    el.addEventListener('wheel', w, { passive: false })
    return () => el.removeEventListener('wheel', w)
  })
  useEffect(() => { setStart(null); setScalePts([]); setSelOp(null); setTool(step === 'walls' ? (traceRef.current.walls.length ? 'edit' : 'draw') : step === 'openings' ? (traceRef.current.openings.length ? 'edit' : 'door') : 'pan') }, [step])

  // ── automatic reading of the plan
  const getDet = async (): Promise<Detected> => {
    const key = rec.image.length + ':' + rec.image.slice(-40) + ':' + t.pxPerM
    if (detRef.current?.key === key) return detRef.current.data
    const data = await detectPlan(rec.image, rec.imgW, rec.imgH, t.pxPerM!)
    detRef.current = { key, data }
    return data
  }
  const applyWalls = (d: Detected, note: string) => {
    setTrace({ ...traceRef.current, nodes: d.nodes, walls: d.walls, outerThick: d.outerThick, innerThick: d.innerThick })
    setDet(d)
    setTool('edit')
    showToast(note)
  }
  const kindName = (m: Detected['method']) => (m === 'outline' ? 'thin double-line walls' : 'solid walls')
  const switchReader = () => { if (det?.alt) applyWalls({ ...det.alt, alt: { ...det, alt: undefined } }, `Read again as ${kindName(det.alt.method)}: ${det.alt.walls.length} wall pieces.`) }
  const autoWalls = async () => {
    if (!rec.image || !t.pxPerM || detBusy) return
    setDetBusy('walls'); setErr('')
    try {
      const d = await getDet()
      if (d.walls.length < 3) { setErr('Could not find walls on this picture. Draw them by hand, or try a cleaner, higher-contrast plan.'); return }
      applyWalls(d, `Found ${d.walls.length} wall pieces (${kindName(d.method)}). Drag corners or walls to fix anything that is off.`)
    } catch { setErr('Could not analyse the picture.') } finally { setDetBusy('') }
  }
  const autoOpenings = async () => {
    if (!rec.image || !t.pxPerM || detBusy) return
    if (!traceRef.current.walls.length) { setErr('Add the walls first (previous step).'); return }
    setDetBusy('openings'); setErr('')
    try {
      const d = det ?? (await getDet()), cur = traceRef.current, maxD = Math.max(10, 0.5 * t.pxPerM)
      const ops = d.openings.flatMap((o) => {
        let best: { pt: Pt; d: number } | null = null
        for (const w of cur.walls) { const pr = projectOnSeg(o.at, cur.nodes[w.a], cur.nodes[w.b]); if (!best || pr.d < best.d) best = { pt: pr.pt, d: pr.d } }
        return best && best.d <= maxD ? [{ ...o, at: best.pt }] : []
      })
      if (!ops.length) { setErr('No doors or windows found. Add them with the Door / Window tools.'); return }
      setTrace({ ...cur, openings: ops })
      setTool('edit')
      showToast(`Found ${ops.filter((o) => o.kind === 'door').length} doors and ${ops.filter((o) => o.kind === 'window').length} windows. Click one to move, resize or change it.`)
    } catch { setErr('Could not analyse the picture.') } finally { setDetBusy('') }
  }
  const visionModel = ai.connected ? pickVisionModel(ai.models) : undefined
  const aiCheck = async () => {
    const cur = traceRef.current
    if (!visionModel || !cur.openings.length || !t.pxPerM || detBusy) return
    setDetBusy('ai'); setErr('')
    try {
      const kinds = await aiReviewOpenings(ai.settings, visionModel, rec.image, cur.openings, t.pxPerM)
      const flags: Record<string, 'door' | 'window'> = {}
      for (const o of cur.openings) if (kinds[o.id] && kinds[o.id] !== o.kind) flags[o.id] = kinds[o.id]
      setAiFlags(flags)
      const n = Object.keys(flags).length
      showToast(n ? `AI disagrees on ${n} of ${cur.openings.length}: they are circled in orange. Click one to see its opinion.` : 'AI agrees with every detected type.')
    } catch (e) { setErr(e instanceof Error && e.name === 'AbortError' ? 'The AI took too long.' : 'AI check failed: ' + (e instanceof Error ? e.message : String(e))) } finally { setDetBusy('') }
  }
  const aiStatus = (
    <div className="tr-room sel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <small>
        {ai.checking ? 'Checking for local AI…'
          : ai.connected ? 'Connected, but no vision model is installed. Download one in the AI window.'
          : 'Local AI is not connected.'}
      </small>
      <div className="row2">
        <button className="btn" disabled={ai.checking} onClick={() => ai.refreshModels()}><Icon n="redo" size={15} /> Recheck</button>
        <button className="btn primary" onClick={() => useUI.getState().setAiModal(true)}><Icon n="sparkles" size={15} /> Connect / models…</button>
      </div>
    </div>
  )
  const aiWalls = async () => {
    if (!visionModel || !t.pxPerM || detBusy) return
    setDetBusy('ai'); setErr('')
    try {
      let box: [number, number, number, number] | undefined
      try { box = await aiFindFlat(ai.settings, visionModel, rec.image, rec.imgW, rec.imgH) } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') throw e }
      const d = await detectPlan(rec.image, rec.imgW, rec.imgH, t.pxPerM, box)
      if (d.walls.length < 3) { setErr('Even with the AI marking the flat, no walls could be read from this picture Draw them with the Draw tool.'); return }
      applyWalls(d, box ? `AI found the flat; read ${d.walls.length} wall pieces inside it. Fix what is off.` : `AI did not find the flat, so the whole picture was read: ${d.walls.length} wall pieces.`)
    } catch (e) { setErr(e instanceof Error && e.name === 'AbortError' ? 'The AI took too long.' : 'AI failed: ' + (e instanceof Error ? e.message : String(e))) } finally { setDetBusy('') }
  }
  useEffect(() => {
    if (!rec.image || !t.pxPerM) return
    if (step === 'walls' && ai.connected === null) ai.refreshModels()
    if (step === 'walls' && !traceRef.current.walls.length && !tried.current.walls) { tried.current.walls = true; autoWalls() }
    if (step === 'openings' && !traceRef.current.openings.length && traceRef.current.walls.length && !tried.current.openings) { tried.current.openings = true; autoOpenings() }
    if (step === 'openings' && ai.connected === null) ai.refreshModels()
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions
  const pickImage = async (file: File | undefined | null) => {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const im = await loadImage(file)
      setRec((r) => ({ ...r, image: im.url, imgW: im.w, imgH: im.h, name: r.name === 'My flat' ? file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My flat' : r.name }))
      setStep('scale')
    } catch { setErr('Could not read that image. Try a PNG or JPG.') }
    setBusy(false)
  }
  const applyScale = () => {
    const m = parseFloat(scaleM.replace(',', '.'))
    if (scalePts.length < 2 || !(m > 0)) { setErr('Click two points on the plan, then type the real distance between them.'); return }
    setErr('')
    setTrace({ ...t, pxPerM: dist(scalePts[0], scalePts[1]) / m })
    setStep('walls')
  }

  const result = useMemo(() => (rec.image && t.pxPerM ? buildFlat({ ...rec, trace: t }) : null), [rec, t])
  const roomsArea = result && 'def' in result ? result.netTotal : 0
  const save = () => {
    setErr('')
    const e = saveUserFlat({ ...rec, name: rec.name.trim() || 'My flat', updated: Date.now() }, { switchTo: true, migrate: !!editing })
    if (e) { setErr(e); return }
    showToast('Flat saved: ' + (rec.name.trim() || 'My flat'))
    close()
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step)
  const canNext = step === 'image' ? !!rec.image : step === 'scale' ? !!t.pxPerM : step === 'walls' ? t.walls.length >= 3 : step === 'rooms' ? t.rooms.length > 0 : true
  const wallW = (a: string, b: string, own?: number) => (own ?? (outerEdges.has(a + '|' + b) ? t.outerThick : t.innerThick)) / 100 * (pxm || 40)
  const handDrawn = step === 'image' || tool === 'pan'

  const roomOfFace = (f: Face) => t.rooms.find((r) => { const q = faceAt(t, r.at); return q && Math.abs(q.area - f.area) < 1e-6 })

  return (
    <div className="tr">
      <div className="tr-top">
        <button className="ibtn" onClick={close} title="Close (Esc)"><Icon n="x" /></button>
        <input className="tr-name" value={rec.name} onChange={(e) => setRec((r) => ({ ...r, name: e.target.value }))} aria-label="Flat name" />
        <div className="tr-steps">
          {STEPS.map((s, i) => (
            <button key={s.id} className={'tr-step' + (s.id === step ? ' on' : '') + (i < stepIdx ? ' done' : '')} disabled={i > 0 && !rec.image} onClick={() => setStep(s.id)}>
              <b>{i < stepIdx ? '✓' : i + 1}</b><span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="tr-tools">
          <button className="ibtn" disabled={!past.length} onClick={undo} title="Undo"><Icon n="undo" /></button>
          <button className="ibtn" disabled={!future.length} onClick={redo} title="Redo"><Icon n="redo" /></button>
          <button className="ibtn" onClick={() => zoomAt(wrap.current!.getBoundingClientRect().left + wrap.current!.clientWidth / 2, wrap.current!.getBoundingClientRect().top + wrap.current!.clientHeight / 2, 1.3)} title="Zoom in"><Icon n="plus" /></button>
          <button className="ibtn" onClick={fit} title="Fit to window"><Icon n="full" /></button>
        </div>
      </div>

      <div className="tr-main">
        <div className="tr-canvas" ref={wrap}>
          {!rec.image && step === 'image' ? (
            <label className="tr-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickImage(e.dataTransfer.files[0]) }}>
              <Icon n="upload" size={40} />
              <b>{busy ? 'Reading…' : 'Drop your floor plan here, or tap to choose a file'}</b>
              <span>A photo, screenshot or scan of the plan (PNG / JPG). Top-down drawing works best.</span>
              <input type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
            </label>
          ) : (
            <svg ref={svg} className={'tr-svg' + (handDrawn ? ' grab' : '')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} onContextMenu={(e) => e.preventDefault()} onDoubleClick={() => setStart(null)}>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                <image href={rec.image} width={rec.imgW} height={rec.imgH} />
                {/* rooms */}
                {inner.map((f, i) => {
                  const r = roomOfFace(f)
                  const hot = step === 'rooms' && hover && !r && faceAt(t, hover) === f
                  if (!r && !hot) return null
                  const ty = r ? roomType(r.type) : null
                  return <polygon key={i} points={f.poly.map((p) => p.join(',')).join(' ')} fill={ty?.color ?? '#1e6fff'} opacity={r ? (selRoom === r.id ? 0.5 : 0.32) : 0.25} />
                })}
                {t.rooms.map((r) => <text key={r.id} x={r.at[0]} y={r.at[1]} textAnchor="middle" fontSize={13 / view.k} fontWeight={700} fill="#111" stroke="#fff" strokeWidth={3 / view.k} paintOrder="stroke" onClick={() => setSelRoom(r.id)}>{roomType(r.type).name}</text>)}
                {/* walls */}
                {t.walls.map((w) => (
                  <line key={w.id} x1={t.nodes[w.a][0]} y1={t.nodes[w.a][1]} x2={t.nodes[w.b][0]} y2={t.nodes[w.b][1]} stroke={w.divider ? '#7b2cbf' : outerEdges.has(w.a + '|' + w.b) ? '#1d3557' : '#e63946'} strokeWidth={w.divider ? 3 / view.k : Math.max(wallW(w.a, w.b, w.thick), 2.5 / view.k)} strokeDasharray={w.divider ? `${8 / view.k} ${5 / view.k}` : undefined} strokeLinecap="butt" opacity={w.divider ? 0.95 : 0.78} />
                ))}
                {Object.entries(t.nodes).map(([id, n]) => <circle key={id} cx={n[0]} cy={n[1]} r={(step === 'walls' && tool === 'edit' ? 5.5 : 3.5) / view.k} fill={step === 'walls' && tool === 'edit' ? '#ffd23f' : '#fff'} stroke="#111" strokeWidth={1 / view.k} />)}
                {guide?.gx != null && <line x1={guide.gx} x2={guide.gx} y1={0} y2={rec.imgH} stroke="#1e6fff" strokeWidth={1 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`} />}
                {guide?.gy != null && <line y1={guide.gy} y2={guide.gy} x1={0} x2={rec.imgW} stroke="#1e6fff" strokeWidth={1 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`} />}
                {/* openings */}
                {t.openings.map((o) => {
                  let best: { a: Pt; b: Pt; d: number } | null = null
                  for (const w of t.walls) { const A = t.nodes[w.a], B = t.nodes[w.b], d = projectOnSeg(o.at, A, B).d; if (!best || d < best.d) best = { a: A, b: B, d } }
                  if (!best) return null
                  const L = dist(best.a, best.b) || 1, ux = (best.b[0] - best.a[0]) / L, uy = (best.b[1] - best.a[1]) / L, h = ((o.width * (pxm || 40)) / 2)
                  return <g key={o.id}>
                    {aiFlags[o.id] && aiFlags[o.id] !== o.kind && <circle cx={o.at[0]} cy={o.at[1]} r={Math.max(h + 8 / view.k, 14 / view.k)} fill="none" stroke="#ff8a00" strokeWidth={3 / view.k} strokeDasharray={`${5 / view.k} ${3 / view.k}`} />}
                    {selOp === o.id && <line x1={o.at[0] - ux * h} y1={o.at[1] - uy * h} x2={o.at[0] + ux * h} y2={o.at[1] + uy * h} stroke="#1e6fff" strokeWidth={Math.max(14 / view.k, 12)} strokeLinecap="round" opacity={0.35} />}
                    <line x1={o.at[0] - ux * h} y1={o.at[1] - uy * h} x2={o.at[0] + ux * h} y2={o.at[1] + uy * h} stroke={o.kind === 'door' ? '#b5651d' : '#0f8a8a'} strokeWidth={Math.max(6 / view.k, 5)} strokeLinecap="round" />
                  </g>
                })}
                {/* fixtures */}
                {FIX.filter((f) => t.fixtures[f.type]).map((f) => { const p = t.fixtures[f.type]!; return (<g key={f.type}><circle cx={p[0]} cy={p[1]} r={9 / view.k} fill="#e08a00" stroke="#fff" strokeWidth={2 / view.k} /><text x={p[0]} y={p[1] + 4 / view.k} textAnchor="middle" fontSize={11 / view.k} fontWeight={800} fill="#fff">{f.letter}</text></g>) })}
                {/* scale line */}
                {scalePts.length > 0 && <>
                  {scalePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={6 / view.k} fill="#e08a00" />)}
                  {scalePts.length === 2 && <line x1={scalePts[0][0]} y1={scalePts[0][1]} x2={scalePts[1][0]} y2={scalePts[1][1]} stroke="#e08a00" strokeWidth={3 / view.k} />}
                </>}
                {/* wall preview */}
                {step === 'walls' && (tool === 'draw' || tool === 'divider') && hover && <circle cx={snapWall(hover, start, false)[0]} cy={snapWall(hover, start, false)[1]} r={5 / view.k} fill="#1e6fff" opacity={0.7} />}
                {step === 'walls' && start && hover && (() => { const q = snapWall(hover, start, false); return (<>
                  <line x1={start[0]} y1={start[1]} x2={q[0]} y2={q[1]} stroke="#1e6fff" strokeWidth={Math.max(wallW('', ''), 2.5 / view.k)} opacity={0.5} />
                  {pxm > 0 && <text x={(start[0] + q[0]) / 2} y={(start[1] + q[1]) / 2 - 8 / view.k} textAnchor="middle" fontSize={12 / view.k} fontWeight={700} fill="#1e6fff" stroke="#fff" strokeWidth={3 / view.k} paintOrder="stroke">{(dist(start, q) / pxm).toFixed(2)} m</text>}
                </>) })()}
              </g>
            </svg>
          )}
        </div>

        <aside className="tr-panel">
          <div className="tr-help">
            {step === 'image' && <><h3>1. Upload your plan</h3><p>Choose a picture of the floor plan. It stays on your device.</p></>}
            {step === 'scale' && <><h3>2. Set the scale</h3><p>Click <b>two points</b> on the plan whose real distance you know (a wall length, a door width, or a printed dimension). Then type that distance.</p></>}
            {step === 'walls' && <><h3>3. Trace the walls</h3><p>{isTouch ? 'Tap corner after corner' : 'Click corner after corner'} to draw walls (they snap to corners and walls and split by themselves). {isTouch ? 'Tap “Finish line” to end a line.' : <><b>Esc</b>, double-click or right-click ends the line.</>} Draw the outer walls first, then the inner ones. {isTouch ? 'Pinch to zoom, drag to move the plan.' : 'Wheel to zoom.'}</p></>}
            {step === 'openings' && <><h3>4. Doors &amp; windows</h3><p>Choose a type and click on a wall. A door in an outer wall is treated as the flat entrance.</p></>}
            {step === 'rooms' && <><h3>5. Mark the rooms</h3><p>Click inside each closed room and choose what it is. Rooms need all their walls drawn.</p></>}
            {step === 'fixtures' && <><h3>6. Kitchen &amp; bathroom (optional)</h3><p>Kitchen and bathroom fixtures cannot move in a real flat. Click where your plan shows them, and furniture will keep them there.</p></>}
            {step === 'save' && <><h3>7. Save</h3><p>Name the flat and create it. You can come back and edit it any time from <b>My flats</b>.</p></>}
          </div>

          {step === 'scale' && (
            <div className="tr-box">
              <label>Real distance between the 2 points (m)
                <input type="text" inputMode="decimal" value={scaleM} onChange={(e) => setScaleM(e.target.value)} />
              </label>
              <button className="btn primary" onClick={applyScale}>Apply scale</button>
              {t.pxPerM && <small>Current scale: {t.pxPerM.toFixed(1)} px per metre · the picture is about {(rec.imgW / t.pxPerM).toFixed(1)} × {(rec.imgH / t.pxPerM).toFixed(1)} m</small>}
            </div>
          )}
          {step === 'walls' && (
            <div className="tr-box">
              <button className="btn primary" disabled={!!detBusy || !t.pxPerM} onClick={autoWalls}><Icon n="sparkles" size={15} /> {detBusy === 'walls' ? 'Reading the plan…' : t.walls.length ? 'Re-detect walls (replaces)' : 'Detect walls automatically'}</button>
              {det?.alt && <button className="btn" disabled={!!detBusy} onClick={switchReader} title="Walls are drawn either as filled blocks or as two thin lines with hatching"><Icon n="redo" size={15} /> Not right? Read as {kindName(det.alt.method)}</button>}
              <button className="btn" disabled={!!detBusy || !visionModel} onClick={aiWalls} title={visionModel ? 'Local AI model: ' + visionModel : 'Needs Ollama with a vision model'}><Icon n="sparkles" size={15} /> {detBusy === 'ai' ? 'AI is looking…' : 'Detect walls (AI finds the flat)'}</button>
              {!visionModel && aiStatus}
              <div className="seg">
                <button className={tool === 'edit' ? 'on' : ''} onClick={() => setTool('edit')}><Icon n="cursor" size={15} /> Edit</button>
                <button className={tool === 'draw' ? 'on' : ''} onClick={() => setTool('draw')}><Icon n="edit" size={15} /> Draw</button>
                <button className={tool === 'divider' ? 'on' : ''} onClick={() => setTool('divider')} title="A line that only separates two rooms (no wall is built): e.g. the hall from an open kitchen-living room"><Icon n="layers" size={15} /> Divider</button>
                <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')}><Icon n="trash" size={15} /> Erase</button>
                <button className={tool === 'pan' ? 'on' : ''} onClick={() => setTool('pan')}><Icon n="hand" size={15} /> Move</button>
              </div>
              <div className="two">
                <label>Outer wall (cm)<input type="number" min={5} max={80} value={t.outerThick} onChange={(e) => setTrace({ ...t, outerThick: +e.target.value || 25, walls: t.walls.map(({ thick: _t, ...w }) => w) }, false)} /></label>
                <label>Inner wall (cm)<input type="number" min={5} max={50} value={t.innerThick} onChange={(e) => setTrace({ ...t, innerThick: +e.target.value || 12, walls: t.walls.map(({ thick: _t, ...w }) => w) }, false)} /></label>
              </div>
              {(tool === 'divider' || t.walls.some((w) => w.divider)) && <label>Room divider width (cm)<input type="number" min={0} max={60} value={t.dividerThick ?? 0} title="0 = the two rooms meet at the line. A width takes that strip off both rooms' area (no wall is built)." onChange={(e) => setTrace({ ...t, dividerThick: Math.max(0, +e.target.value || 0) }, false)} /></label>}
              {tool === 'divider' && <small>Click two points to draw a room divider (dashed): it splits an open room in two, so each gets its own type and m². No wall is built along it. Start and end on existing walls or corners.</small>}
              {tool === 'edit' && <small>Drag a yellow corner or a wall to move it (it lines up with other corners; hold Shift to turn that off). Drop a corner on another one to join them.</small>}
              {start && <button className="btn" onClick={() => setStart(null)}><Icon n="check" size={15} /> Finish line</button>}
              <small>{t.walls.some((w) => w.thick) ? 'Each wall has its own measured thickness (typing above sets all walls). ' : ''}{t.walls.filter((w) => !w.divider).length} wall pieces{t.walls.some((w) => w.divider) ? ' + ' + t.walls.filter((w) => w.divider).length + ' divider(s)' : ''} · <span style={{ color: '#1d3557' }}>■</span> outer <span style={{ color: '#e63946' }}>■</span> inner</small>
            </div>
          )}
          {step === 'openings' && (
            <div className="tr-box">
              <button className="btn primary" disabled={!!detBusy || !t.walls.length} onClick={autoOpenings}><Icon n="sparkles" size={15} /> {detBusy === 'openings' ? 'Reading the plan…' : t.openings.length ? 'Re-detect doors & windows (replaces)' : 'Detect doors & windows automatically'}</button>
              {visionModel && <button className="btn" disabled={!!detBusy || !t.openings.length} onClick={aiCheck} title={'Local AI model: ' + visionModel}><Icon n="sparkles" size={15} /> {detBusy === 'ai' ? 'AI is looking…' : 'Second opinion on door / window types (AI)'}</button>}
              {!visionModel && aiStatus}
              <div className="seg">
                <button className={tool === 'edit' ? 'on' : ''} onClick={() => setTool('edit')}><Icon n="cursor" size={15} /> Edit</button>
                <button className={tool === 'door' ? 'on' : ''} onClick={() => setTool('door')}><Icon n="door" size={15} /> Door</button>
                <button className={tool === 'window' ? 'on' : ''} onClick={() => setTool('window')}><Icon n="window" size={15} /> Window</button>
                <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')}><Icon n="trash" size={15} /> Erase</button>
                <button className={tool === 'pan' ? 'on' : ''} onClick={() => setTool('pan')}><Icon n="hand" size={15} /> Move</button>
              </div>
              <div className="two">
                <label>Door width (m)<input type="text" inputMode="decimal" value={opW.door} onChange={(e) => setOpW({ ...opW, door: e.target.value })} /></label>
                <label>Window width (m)<input type="text" inputMode="decimal" value={opW.window} onChange={(e) => setOpW({ ...opW, window: e.target.value })} /></label>
              </div>
              {(() => {
                const so = t.openings.find((o) => o.id === selOp)
                if (!so || step !== 'openings') return tool === 'edit' && t.openings.length > 0 ? <small>Click a door or window to select it, drag it along the wall to move it.</small> : null
                const upd = (p: Partial<typeof so>) => setTrace({ ...t, openings: t.openings.map((o) => (o.id === so.id ? { ...o, ...p } : o)) }, false)
                return (
                  <div className="tr-room sel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="seg">
                      <button className={so.kind === 'door' ? 'on' : ''} onClick={() => setTrace({ ...t, openings: t.openings.map((o) => (o.id === so.id ? { ...o, kind: 'door', sill: undefined, top: undefined } : o)) })}><Icon n="door" size={15} /> Door</button>
                      <button className={so.kind === 'window' ? 'on' : ''} onClick={() => setTrace({ ...t, openings: t.openings.map((o) => (o.id === so.id ? { ...o, kind: 'window', sill: undefined, top: undefined } : o)) })}><Icon n="window" size={15} /> Window</button>
                    </div>
                    {aiFlags[so.id] && aiFlags[so.id] !== so.kind && (
                      <div className="warn" style={{ margin: 0 }}>AI thinks this is a <b>{aiFlags[so.id]}</b>. <button className="btn sm" onClick={() => { setTrace({ ...t, openings: t.openings.map((o) => (o.id === so.id ? { ...o, kind: aiFlags[so.id], sill: undefined, top: undefined } : o)) }); setAiFlags(({ [so.id]: _, ...r }) => r) }}>Switch to {aiFlags[so.id]}</button></div>
                    )}
                    <label>Width (m)<input type="number" step="0.05" min="0.3" max="6" value={so.width} onChange={(e) => upd({ width: Math.max(0.3, +e.target.value || so.width) })} /></label>
                    <button className="btn" onClick={() => { setTrace({ ...t, openings: t.openings.filter((o) => o.id !== so.id) }); setSelOp(null) }}><Icon n="trash" size={15} /> Delete</button>
                  </div>
                )
              })()}
              <small>{t.openings.filter((o) => o.kind === 'door').length} doors · {t.openings.filter((o) => o.kind === 'window').length} windows</small>
            </div>
          )}
          {step === 'rooms' && (
            <div className="tr-box">
              {t.rooms.length === 0 && <small>No rooms yet. Click inside a room on the plan.</small>}
              {t.rooms.map((r) => {
                const f = faceAt(t, r.at)
                return (
                  <div key={r.id} className={'tr-room' + (selRoom === r.id ? ' sel' : '')} onClick={() => setSelRoom(r.id)}>
                    <span className="dot" style={{ background: roomType(r.type).color }} />
                    <select value={r.type} onChange={(e) => setTrace({ ...t, rooms: t.rooms.map((q) => (q.id === r.id ? { ...q, type: e.target.value as RoomTypeId } : q)) })}>
                      {ROOM_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                    <small title="Floor area inside the walls">{f && pxm ? netFaceArea(t, f, pxm).toFixed(2) : '?'} m²</small>
                    <input type="number" step="0.01" placeholder="stated m²" title="Area printed on the plan (optional)" value={r.stated ?? ''} onChange={(e) => setTrace({ ...t, rooms: t.rooms.map((q) => (q.id === r.id ? { ...q, stated: e.target.value ? +e.target.value : undefined } : q)) }, false)} />
                    <button className="ibtn" onClick={(e) => { e.stopPropagation(); setTrace({ ...t, rooms: t.rooms.filter((q) => q.id !== r.id) }) }} title="Remove"><Icon n="trash" size={15} /></button>
                  </div>
                )
              })}
              {pxm > 0 && (() => {
                const open = inner.filter((f) => !t.rooms.some((r) => faceAt(t, r.at) === f || Math.abs((faceAt(t, r.at)?.area ?? 1e12) - f.area) < 1e-6))
                if (!open.length) return null
                return (
                  <div className="tr-open">
                    <small><b>Not marked yet</b>: click inside the area on the plan, or use the button. If one area is really two rooms (open plan), draw a divider in the Walls step.</small>
                    {open.map((f, i) => (
                      <button key={i} className="btn sm" onClick={() => { const id = 'r' + Date.now().toString(36) + i; setTrace({ ...t, rooms: [...t.rooms, { id, at: interiorPoint(f.poly), type: (t.rooms.length === 0 ? 'open' : 'hall') as RoomTypeId }] }); setSelRoom(id) }}>
                        Mark area of {netFaceArea(t, f, pxm).toFixed(2)} m²
                      </button>
                    ))}
                  </div>
                )
              })()}
              {inner.length > 0 && <small>{inner.length} closed area(s) found · {t.rooms.length} marked</small>}
              {t.walls.some((w) => w.divider) && (
                <label className="tr-divw" title="0 = the two rooms meet at the divider line. A width takes that strip off both rooms' area (no wall is built).">Room divider width (cm)
                  <input type="number" min={0} max={60} value={t.dividerThick ?? 0} onChange={(e) => setTrace({ ...t, dividerThick: Math.max(0, +e.target.value || 0) }, false)} />
                </label>
              )}
              {pxm && t.rooms.length > 0 && (
                <div className="tr-cards">
                  {t.rooms.map((r) => {
                    const f = faceAt(t, r.at)
                    if (!f) return <div key={r.id} className="tr-card"><b>{roomType(r.type).label}</b> <small>not inside a closed area</small></div>
                    const nf = netFace(t, f, pxm), xs = nf.poly.map((p) => p[0]), ys = nf.poly.map((p) => p[1])
                    const th = f.nodes.map((a, i) => { const b = f.nodes[(i + 1) % f.nodes.length]; const w = t.walls.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)); return w?.divider ? (t.dividerThick ?? 0) : w?.thick ?? t.innerThick })
                    const d = r.stated ? (nf.area - r.stated) / r.stated : null
                    return (
                      <div key={r.id} className={'tr-card' + (selRoom === r.id ? ' sel' : '')} onClick={() => setSelRoom(r.id)}>
                        <div className="tc-head">
                          <b>{roomType(r.type).label}</b>
                          <span className="tc-net" title="Floor area inside the walls">{nf.area.toFixed(2)} m²</span>
                          {d != null && <span className={'tc-d ' + (Math.abs(d) > 0.04 ? 'bad' : 'ok')}>{(d > 0 ? '+' : '') + (d * 100).toFixed(1)}% vs {r.stated}</span>}
                        </div>
                        <div className="tc-size" onClick={(e) => e.stopPropagation()}>
                          <span>Inside</span>
                          {([0, 1] as const).map((ax) => {
                            const val = Math.round(((ax === 0 ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)) / pxm) * 100)
                            return <span key={ax}>{ax ? '×' : ''}<input key={val} type="number" className="szin" defaultValue={val} title={ax ? 'Inside length, cm (type to adjust the walls)' : 'Inside width, cm (type to adjust the walls)'}
                              onBlur={(e) => { const v = +e.target.value; if (v > 30 && v !== val) setTrace(resizeRoom(t, f, ax, v / 100, pxm)) }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /></span>
                          })}
                          <span>cm</span>
                          {r.stated ? <button className="btn sm" title="Keep the width and change the length so the room gets exactly the stated m²" onClick={() => { const wM = (Math.max(...xs) - Math.min(...xs)) / pxm; setTrace(resizeRoom(t, f, 1, r.stated! / wM, pxm)) }}>Fit to stated m²</button> : null}
                        </div>
                        <small className="tc-sub">Centre lines {(Math.abs(f.area) / pxm / pxm).toFixed(2)} m² · walls {Math.min(...th)}–{Math.max(...th)} cm</small>
                      </div>
                    )
                  })}
                </div>
              )}
              {pxm && t.walls.length > 0 && (() => {
                const outerE = new Set<string>()
                for (const q of allFaces) if (q.outer) for (let i = 0; i < q.nodes.length; i++) { const a = q.nodes[i], b = q.nodes[(i + 1) % q.nodes.length]; outerE.add(a + '|' + b); outerE.add(b + '|' + a) }
                const len = (w: { a: string; b: string }) => Math.hypot(t.nodes[w.a][0] - t.nodes[w.b][0], t.nodes[w.a][1] - t.nodes[w.b][1]) / pxm
                const th = (w: { a: string; b: string; thick?: number }, o: boolean) => w.thick ?? (o ? t.outerThick : t.innerThick)
                const real = t.walls.filter((w) => !w.divider)
                const ow = real.filter((w) => outerE.has(w.a + '|' + w.b)), iw = real.filter((w) => !outerE.has(w.a + '|' + w.b))
                const sum = (a: number[]) => a.reduce((x, y) => x + y, 0), avg = (a: number[]) => (a.length ? sum(a) / a.length : 0)
                const marked = t.rooms.flatMap((r) => { const f = faceAt(t, r.at); return f ? [{ r, f, net: netFaceArea(t, f, pxm), gross: Math.abs(f.area) / pxm / pxm }] : [] })
                const markedF = new Set(marked.map((x) => x.f))
                const unmarked = inner.filter((f) => !markedF.has(f) && !marked.some((x) => Math.abs(x.f.area - f.area) < 1e-6))
                const net = sum(marked.map((x) => x.net)), gross = sum(marked.map((x) => x.gross))
                const netCounted = sum(marked.map((x) => x.net * (x.r.type === 'loggia' ? 0.5 : 1)))
                const stated = sum(marked.map((x) => x.r.stated ?? 0)), statedN = marked.filter((x) => x.r.stated).length
                const env = allFaces.filter((f) => f.outer).reduce((m, f) => Math.max(m, Math.abs(f.area)), 0) / pxm / pxm
                const doors = t.openings.filter((o) => o.kind === 'door'), wins = t.openings.filter((o) => o.kind === 'window')
                const row = (k: string, v: string) => <tr key={k}><td>{k}</td><td>{v}</td></tr>
                return (
                  <details className="tr-stats" open>
                    <summary>All data &amp; statistics</summary>
                    <table className="tr-table"><tbody>
                      {row('Scale', pxm.toFixed(2) + ' px/m' + (t.pxPerM ? '' : ''))}
                      {row('Plan covers', ((Math.max(...Object.values(t.nodes).map((n) => n[0])) - Math.min(...Object.values(t.nodes).map((n) => n[0]))) / pxm).toFixed(2) + ' × ' + ((Math.max(...Object.values(t.nodes).map((n) => n[1])) - Math.min(...Object.values(t.nodes).map((n) => n[1]))) / pxm).toFixed(2) + ' m (walls)')}
                      {row('Outer envelope area', env.toFixed(2) + ' m² (to wall centre lines)')}
                      {row('Rooms marked / closed areas', marked.length + ' / ' + inner.length)}
                      {row('Net floor area, all marked', net.toFixed(2) + ' m²')}
                      {row('Net, loggias × 0.5', netCounted.toFixed(2) + ' m²')}
                      {row('Gross (centre lines), marked', gross.toFixed(2) + ' m²')}
                      {row('Stated on plan (' + statedN + ' rooms)', statedN ? stated.toFixed(2) + ' m²' : '–')}
                      {row('Walls take', (env && net ? Math.max(0, env - net) : 0).toFixed(2) + ' m² (envelope − net rooms)')}
                      {row('Outer walls', ow.length + ' · ' + sum(ow.map(len)).toFixed(1) + ' m · ' + avg(ow.map((w) => th(w, true))).toFixed(0) + ' cm avg')}
                      {row('Inner walls', iw.length + ' · ' + sum(iw.map(len)).toFixed(1) + ' m · ' + avg(iw.map((w) => th(w, false))).toFixed(0) + ' cm avg')}
                      {row('Doors', doors.length + ' · ' + sum(doors.map((o) => o.width)).toFixed(1) + ' m total · ' + avg(doors.map((o) => o.width)).toFixed(2) + ' m avg')}
                      {row('Windows', wins.length + ' · ' + sum(wins.map((o) => o.width)).toFixed(1) + ' m total · ' + avg(wins.map((o) => o.width)).toFixed(2) + ' m avg')}
                      {row('Shortest wall', real.length ? Math.min(...real.map(len)).toFixed(2) + ' m' : '–')}
                      {unmarked.length > 0 && row('Closed areas not marked', unmarked.map((f) => netFaceArea(t, f, pxm).toFixed(1) + ' m²').join(', '))}
                    </tbody></table>
                  </details>
                )
              })()}
              {(() => {
                if (!pxm) return null
                const rows = t.rooms.flatMap((r) => { const f = faceAt(t, r.at); return f && r.stated && r.stated > 0 ? [{ net: netFaceArea(t, f, pxm), stated: r.stated }] : [] })
                if (!rows.length) return <small>Type the m² printed on the plan in each room's box to check the scale and walls.</small>
                const sn = rows.reduce((s, x) => s + x.net, 0), ss = rows.reduce((s, x) => s + x.stated, 0), diff = (sn - ss) / ss
                const ok = Math.abs(diff) <= 0.04
                const k = Math.sqrt(ss / sn) // linear factor that would make the total match
                return (
                  <div className={'tr-check ' + (ok ? 'ok' : 'bad')}>
                    <b>{ok ? '✓ Areas match the plan' : '⚠ Areas do not match the plan'}</b>
                    <small>{sn.toFixed(1)} m² traced vs {ss.toFixed(1)} m² stated ({diff > 0 ? '+' : ''}{(diff * 100).toFixed(1)}%)</small>
                    {!ok && <small>{Math.abs(diff) > 0.12 ? 'Likely the scale (step 2): ' : 'Check wall thickness or misplaced walls. If every room is off by the same %, the scale: '}it should be about {(pxm / k).toFixed(1)} px/m (now {pxm.toFixed(1)}).</small>}
                    {!ok && <button className="btn" onClick={() => setTrace({ ...t, pxPerM: Math.round((pxm / k) * 100) / 100 })}>Set scale to {(pxm / k).toFixed(1)} px/m</button>}
                  </div>
                )
              })()}
            </div>
          )}
          {step === 'fixtures' && (
            <div className="tr-box">
              <div className="chips">
                {FIX.map((f) => <button key={f.type} className={'chip' + (fix === f.type ? ' on' : '')} onClick={() => setFix(f.type)}>{f.label}{t.fixtures[f.type] ? ' ●' : ''}</button>)}
              </div>
              <small>Pick an item, then click where the plan shows it. Skip this if you are unsure.</small>
              <button className="btn" onClick={() => setTrace({ ...t, fixtures: {} })}>Clear all</button>
            </div>
          )}
          {step === 'save' && (
            <div className="tr-box">
              <label>Name<input type="text" value={rec.name} onChange={(e) => setRec((r) => ({ ...r, name: e.target.value }))} /></label>
              {result && 'def' in result && (
                <ul className="tr-sum">
                  <li><b>{result.def.rooms.length}</b> rooms · <b>{roomsArea.toFixed(1)} m²</b> (loggia counted ×0.5)</li>
                  <li><b>{t.openings.filter((o) => o.kind === 'door').length}</b> doors · <b>{t.openings.filter((o) => o.kind === 'window').length}</b> windows</li>
                  {result.problems.map((p) => <li key={p} className="bad">⚠ {p}</li>)}
                </ul>
              )}
              {result && 'error' in result && <div className="warn">⚠ {result.error}</div>}
              {!result && <div className="warn">⚠ Upload an image and set the scale first.</div>}
              <button className="btn primary" disabled={!result || 'error' in result} onClick={save}><Icon n="check" size={16} /> {editing ? 'Save changes' : 'Create flat'}</button>
            </div>
          )}
          {err && <div className="warn">⚠ {err}</div>}

          <div className="tr-nav">
            <button className="btn" disabled={stepIdx === 0} onClick={() => setStep(STEPS[stepIdx - 1].id)}><Icon n="left" size={15} /> Back</button>
            {step !== 'save' && <button className="btn primary" disabled={!canNext} onClick={() => setStep(STEPS[stepIdx + 1].id)}>Next <Icon n="right" size={15} /></button>}
          </div>
        </aside>
      </div>
    </div>
  )
}
