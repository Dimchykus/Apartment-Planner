import { useEffect, useMemo, useRef, useState } from 'react'
import { useUI, isTouch } from './uiStore'
import { Icon } from './Icon'
import {
  ROOM_TYPES, roomType, emptyTrace, addWall, removeWall, faces, faceAt, projectOnSeg, loadImage, buildFlat, newFlatId,
  type TraceState, type UserFlat, type RoomTypeId, type Face,
} from '../lib/library'
import { getUserFlat, saveUserFlat } from '../lib/libraryActions'
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
    const ex = editing ? getUserFlat(editing) : null
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
      if (tool !== 'draw') return
      const q = snapWall(p, start, shift)
      if (!start) { setStart(q); return }
      if (dist(start, q) < snapR * 0.5) { setStart(null); return }
      setTrace(addWall(t, start, q, snapR))
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
      for (const w of t.walls) { const pr = projectOnSeg(p, t.nodes[w.a], t.nodes[w.b]); if (!best || pr.d < best.d) best = { pt: pr.pt, d: pr.d } }
      if (!best || best.d > snapR * 2) { showToast('Click on a wall.'); return }
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
  useEffect(() => { setStart(null); setScalePts([]); setTool(step === 'walls' ? 'draw' : step === 'openings' ? 'door' : 'pan') }, [step])

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
    const e = saveUserFlat({ ...rec, name: rec.name.trim() || 'My flat', updated: Date.now() }, { switchTo: true })
    if (e) { setErr(e); return }
    showToast('Flat saved: ' + (rec.name.trim() || 'My flat'))
    close()
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step)
  const canNext = step === 'image' ? !!rec.image : step === 'scale' ? !!t.pxPerM : step === 'walls' ? t.walls.length >= 3 : step === 'rooms' ? t.rooms.length > 0 : true
  const wallW = (a: string, b: string) => (outerEdges.has(a + '|' + b) ? t.outerThick : t.innerThick) / 100 * (pxm || 40)
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
                  <line key={w.id} x1={t.nodes[w.a][0]} y1={t.nodes[w.a][1]} x2={t.nodes[w.b][0]} y2={t.nodes[w.b][1]} stroke={outerEdges.has(w.a + '|' + w.b) ? '#1d3557' : '#e63946'} strokeWidth={Math.max(wallW(w.a, w.b), 2.5 / view.k)} strokeLinecap="butt" opacity={0.78} />
                ))}
                {Object.entries(t.nodes).map(([id, n]) => <circle key={id} cx={n[0]} cy={n[1]} r={3.5 / view.k} fill="#fff" stroke="#111" strokeWidth={1 / view.k} />)}
                {/* openings */}
                {t.openings.map((o) => {
                  let best: { a: Pt; b: Pt; d: number } | null = null
                  for (const w of t.walls) { const A = t.nodes[w.a], B = t.nodes[w.b], d = projectOnSeg(o.at, A, B).d; if (!best || d < best.d) best = { a: A, b: B, d } }
                  if (!best) return null
                  const L = dist(best.a, best.b) || 1, ux = (best.b[0] - best.a[0]) / L, uy = (best.b[1] - best.a[1]) / L, h = ((o.width * (pxm || 40)) / 2)
                  return <line key={o.id} x1={o.at[0] - ux * h} y1={o.at[1] - uy * h} x2={o.at[0] + ux * h} y2={o.at[1] + uy * h} stroke={o.kind === 'door' ? '#b5651d' : '#0f8a8a'} strokeWidth={Math.max(6 / view.k, 5)} strokeLinecap="round" />
                })}
                {/* fixtures */}
                {FIX.filter((f) => t.fixtures[f.type]).map((f) => { const p = t.fixtures[f.type]!; return (<g key={f.type}><circle cx={p[0]} cy={p[1]} r={9 / view.k} fill="#e08a00" stroke="#fff" strokeWidth={2 / view.k} /><text x={p[0]} y={p[1] + 4 / view.k} textAnchor="middle" fontSize={11 / view.k} fontWeight={800} fill="#fff">{f.letter}</text></g>) })}
                {/* scale line */}
                {scalePts.length > 0 && <>
                  {scalePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={6 / view.k} fill="#e08a00" />)}
                  {scalePts.length === 2 && <line x1={scalePts[0][0]} y1={scalePts[0][1]} x2={scalePts[1][0]} y2={scalePts[1][1]} stroke="#e08a00" strokeWidth={3 / view.k} />}
                </>}
                {/* wall preview */}
                {step === 'walls' && tool === 'draw' && hover && <circle cx={snapWall(hover, start, false)[0]} cy={snapWall(hover, start, false)[1]} r={5 / view.k} fill="#1e6fff" opacity={0.7} />}
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
              <div className="seg">
                <button className={tool === 'draw' ? 'on' : ''} onClick={() => setTool('draw')}><Icon n="edit" size={15} /> Draw</button>
                <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')}><Icon n="trash" size={15} /> Erase</button>
                <button className={tool === 'pan' ? 'on' : ''} onClick={() => setTool('pan')}><Icon n="hand" size={15} /> Move</button>
              </div>
              <div className="two">
                <label>Outer wall (cm)<input type="number" min={5} max={80} value={t.outerThick} onChange={(e) => setTrace({ ...t, outerThick: +e.target.value || 25 }, false)} /></label>
                <label>Inner wall (cm)<input type="number" min={5} max={50} value={t.innerThick} onChange={(e) => setTrace({ ...t, innerThick: +e.target.value || 12 }, false)} /></label>
              </div>
              {start && <button className="btn" onClick={() => setStart(null)}><Icon n="check" size={15} /> Finish line</button>}
              <small>{t.walls.length} wall pieces · <span style={{ color: '#1d3557' }}>■</span> outer <span style={{ color: '#e63946' }}>■</span> inner</small>
            </div>
          )}
          {step === 'openings' && (
            <div className="tr-box">
              <div className="seg">
                <button className={tool === 'door' ? 'on' : ''} onClick={() => setTool('door')}><Icon n="door" size={15} /> Door</button>
                <button className={tool === 'window' ? 'on' : ''} onClick={() => setTool('window')}><Icon n="window" size={15} /> Window</button>
                <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')}><Icon n="trash" size={15} /> Erase</button>
                <button className={tool === 'pan' ? 'on' : ''} onClick={() => setTool('pan')}><Icon n="hand" size={15} /> Move</button>
              </div>
              <div className="two">
                <label>Door width (m)<input type="text" inputMode="decimal" value={opW.door} onChange={(e) => setOpW({ ...opW, door: e.target.value })} /></label>
                <label>Window width (m)<input type="text" inputMode="decimal" value={opW.window} onChange={(e) => setOpW({ ...opW, window: e.target.value })} /></label>
              </div>
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
                    <small>{f && pxm ? (Math.abs(f.area) / pxm / pxm).toFixed(1) : '?'} m²</small>
                    <input type="number" step="0.01" placeholder="stated m²" title="Area printed on the plan (optional)" value={r.stated ?? ''} onChange={(e) => setTrace({ ...t, rooms: t.rooms.map((q) => (q.id === r.id ? { ...q, stated: e.target.value ? +e.target.value : undefined } : q)) }, false)} />
                    <button className="ibtn" onClick={(e) => { e.stopPropagation(); setTrace({ ...t, rooms: t.rooms.filter((q) => q.id !== r.id) }) }} title="Remove"><Icon n="trash" size={15} /></button>
                  </div>
                )
              })}
              {inner.length > 0 && <small>{inner.length} closed area(s) found · {t.rooms.length} marked</small>}
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
