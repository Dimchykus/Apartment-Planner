import { useDeferredValue, useMemo, useState } from 'react'
import { ROOM_KINDS, ZONE_ITEMS, kindInfo } from '../roomkinds'
import { defaultKind, misplacedReason, blockingDoor, allowedKinds, analyze, scoreLayout, balanced, conflicts, type RoomKind } from '../autofurnish'
import { CRITERIA_KEYS, CRITERIA_PRESETS, presetOf } from '../criteria'
import { rooms as planRooms, doorSwing } from '../plan'
import { useStore, CATALOG, type Furn } from '../store'
import { useUI } from './uiStore'
import { PRESETS, STYLES, FINISHES, sizeOf, isWallMounted } from '../catalog'
import { itemWallDistances } from '../Dims'

export const SWATCHES = ['#e9e5de', '#8d8f93', '#3a3532', '#b08a5a', '#7a5a3a', '#8aa0b5', '#6f8f72', '#b5584a', '#d8d2c6']

/** Rooms mode panel: pick a room, set its function, pin where main items go. */
export function RoomsPanel() {
  const s = useStore()
  const room = planRooms.find((r) => r.id === s.selRoom)
  const kind = room ? (s.roomKinds[room.id] ?? defaultKind(room)) : null
  return (
    <>
      <small>Click a room (or pick it here) and choose what it is.</small>
      <div className="chips">
        {planRooms.map((r) => (
          <button key={r.id} className={s.selRoom === r.id ? 'on' : ''} onClick={() => s.selectRoom(r.id)}>
            <span className="sw" style={{ background: kindInfo(s.roomKinds[r.id] ?? defaultKind(r)).color, margin: '0 4px 0 0', width: 10, height: 10 }} />
            {s.roomKinds[r.id] ? kindInfo(s.roomKinds[r.id]).label : r.name}
          </button>
        ))}
      </div>
      {room && kind && (
        <div className="sel">
          <b>{room.name}</b>
          {(() => {
            const allowed = allowedKinds(room, s.nodes)
            const opts = ROOM_KINDS.filter((k) => !allowed || allowed.includes(k.id))
            return (<>
              <label className="row">Function
                <select value={kind} disabled={!!allowed && allowed.length === 1} onChange={(e) => s.setRoomKind(room.id, e.target.value as RoomKind)}>
                  {opts.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </label>
              {allowed && <small>🔒 {allowed.length === 1 ? 'Wet room' : 'Kitchen zone'}: fixed by the building's plumbing.</small>}
            </>)
          })()}
          <div><button onClick={() => s.furnishRoom(room.id)}>Re-furnish this room</button></div>
        </div>
      )}
      {s.notice && <div className="warn" style={{ background: '#e8f1ff', borderColor: '#7aa7e8', color: '#123' }}>ℹ {s.notice} <button onClick={() => s.setNotice(null)}>OK</button></div>}
      <CriteriaPanel />
      <SpaceSummary />
      <small>Pin: choose an item, then click the floor. <b style={{color:'#1f9d55'}}>Green</b> fits, <b style={{color:'#e08a00'}}>orange</b> adapts, <b style={{color:'#d92d2d'}}>red</b> impossible.</small>
      <div className="chips">
        {ZONE_ITEMS.map((z) => (
          <button key={z.type} className={s.placing === z.type ? 'on' : ''} onClick={() => s.startPlacing(s.placing === z.type ? null : z.type)}>
            {z.label}{s.hintOv[z.type] ? ' ●' : ''}
          </button>
        ))}
      </div>
      <div>
        <button onClick={s.clearHints}>Reset pins</button>
        <button onClick={s.autoFurnish}>Furnish whole flat</button>
      </div>
    </>
  )
}

/** How furniture is placed. Changing it furnishes the whole flat again; kitchen and bathroom fixtures never move. */
export function CriteriaPanel() {
  const s = useStore()
  const cur = presetOf(s.criteria)
  const ui = useUI()
  const rulesNow = ui.rulesOnCriteria
  const [open, setOpen] = useState(false)
  const furniture = useDeferredValue(s.furniture)
  const score = useMemo(() => scoreLayout(furniture, s.nodes, s.customWalls), [furniture, s.nodes, s.customWalls])
  const { scale } = balanced(s.criteria)
  const warn = conflicts(s.criteria)
  return (
    <div className="sel">
      <label className="row">Placement criteria
        <select value={cur} onChange={(e) => { const p = CRITERIA_PRESETS.find((q) => q.id === e.target.value); if (p) s.setCriteria({ ...p.c }) }}>
          {cur === 'custom' && <option value="custom">Custom</option>}
          {CRITERIA_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <small>🔒 Kitchen and bathroom stay where the building's plumbing is.</small>
      <small>These wishes steer <b>✨ AI furnish</b>. {rulesNow ? 'The offline rules also re-furnish on every change.' : 'Press AI furnish to apply them.'}</small>
      <label className="check"><input type="checkbox" checked={rulesNow} onChange={(e) => ui.setRulesOnCriteria(e.target.checked)} /> also re-furnish instantly with the offline rules</label>
      <div className="scores" title="How well the current layout meets each criterion (0-100%), measured on the layout itself. The marker shows your slider.">
        {CRITERIA_KEYS.map((k) => (
          <div key={k.key} className="score">
            <span>{k.label}</span>
            <div className="bar"><i style={{ width: Math.round(score[k.key] * 100) + '%', opacity: 0.35 + 0.65 * s.criteria[k.key] }} /><b style={{ left: Math.round(s.criteria[k.key] * 100) + '%' }} /></div>
            <em>{Math.round(score[k.key] * 100)}%</em>
          </div>
        ))}
      </div>
      {scale < 0.999 && <small>⚖ Many criteria are high: weights are balanced (×{scale.toFixed(2)}) so they share the layout instead of fighting.</small>}
      {warn.map((w) => <small key={w} className="conf">↔ {w}</small>)}
      <button onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Fine-tune'} criteria</button>
      {open && CRITERIA_KEYS.map((k) => (
        <label key={k.key} className="slider" title={k.hint}>{k.label} {Math.round(s.criteria[k.key] * 100)}%
          <input type="range" min={0} max={100} step={10} value={Math.round(s.criteria[k.key] * 100)}
            onChange={(e) => s.setCriteria({ ...s.criteria, [k.key]: +e.target.value / 100 })} />
        </label>
      ))}
    </div>
  )
}

/** What the current layout gives you: floor used, storage, seats, beds, desks and whether every room stays walkable. */
export function SpaceSummary() {
  const s = useStore()
  const furniture = useDeferredValue(s.furniture)
  const a = useMemo(() => analyze(furniture, s.nodes, s.customWalls), [furniture, s.nodes, s.customWalls])
  return (
    <div className="sel">
      <b>Space use</b>
      <small>Floor used {a.usedPct.toFixed(0)}% · free {(100 - a.usedPct).toFixed(0)}% · storage {a.storageM3.toFixed(1)} m³</small>
      <small>Seats {a.seats} · sleeps {a.sleeps} · work desks {a.desks}</small>
      {a.blocked.length
        ? <div className="warn">⚠ Narrow passage (&lt; 60 cm) between doors in: {a.blocked.join(', ')}</div>
        : <small>✓ Free 60 cm passages between all doors</small>}
    </div>
  )
}

export function Slider({ label, v, min, max, on }: { label: string; v: number; min: number; max: number; on: (x: number) => void }) {
  return (
    <label className="slider">{label} {v} cm
      <input type="range" min={min} max={max} step={5} value={Math.min(max, Math.max(min, v))} onChange={(e) => on(+e.target.value / 100)} />
    </label>
  )
}

/** Variant picker for the selected piece of furniture: size preset, style, finish, exact size, colour. */
export function FurnPanel({ sel }: { sel: Furn }) {
  const nodes = useStore((s) => s.nodes)
  const customWalls = useStore((s) => s.customWalls)
  const furniture = useStore((s) => s.furniture)
  const doorState = useStore((s) => s.doorState)
  const setDoor = useStore((s) => s.setDoor)
  const patchFurn = useStore((s) => s.patchFurn)
  const fitOne = useStore((s) => s.fitOne)
  const duplicateFurn = useStore((s) => s.duplicateFurn)
  const removeFurn = useStore((s) => s.removeFurn)
  const deferredFurn = useDeferredValue(furniture)
  const deferredSel = useDeferredValue(sel)
  const cat = CATALOG[sel.type]
  const size = sizeOf(sel)
  const presets = PRESETS[sel.type]
  const styles = STYLES[sel.type]
  const patch = (p: Partial<Furn>) => patchFurn(sel.id, p)
  const [fitMsg, setFitMsg] = useState('')
  const reason = useMemo(() => { void doorState; return misplacedReason(deferredSel, nodes, customWalls, deferredFurn) }, [deferredSel, nodes, customWalls, deferredFurn, doorState])
  const blockedDoor = useMemo(() => { void doorState; return reason === 'blocks a door' ? blockingDoor(deferredSel, nodes, customWalls) : null }, [reason, deferredSel, nodes, customWalls, doorState])
  const cmv = (v: number) => Math.round(v * 100)
  const wide = sel.type === 'kitchen' || sel.type === 'wardrobe'
  const range = (base: number, lo: number, hi: number): [number, number] => [Math.round(Math.max(0.2, base * lo) * 100), Math.round(base * hi * 100)]
  const [wMin, wMax] = wide ? [60, 450] : sel.type === 'shelf' ? [30, 240] : range(cat.w, 0.5, 2)
  const [dMin, dMax] = range(cat.d, 0.5, 2)
  const [hMin, hMax] = range(cat.h, 0.5, 1.6)
  const presetIdx = presets?.findIndex((p) => Math.abs(p.w - size.w) < 0.005 && Math.abs(p.d - size.d) < 0.005 && (p.h === undefined || Math.abs(p.h - size.h) < 0.005)) ?? -1
  const wallDists = useMemo(() => itemWallDistances(deferredSel, nodes, customWalls), [deferredSel, nodes, customWalls])
  return (
    <div className="sel">
      <b>{cat.label}</b> <small>{cmv(size.w)}×{cmv(size.d)}×{cmv(size.h)} cm</small>
      {wallDists.length > 0 && (
        <small>To walls: {wallDists.map((d) => `${d.side} ${cmv(d.dist)}`).join(' · ')} cm</small>
      )}
      {reason && (
        <div className="warn">⚠ {reason}
          <div className="row2">
            <button onClick={() => setFitMsg(fitOne(sel.id) ? 'Moved to fit.' : "Couldn't fit by nudging. Try moving or resizing it.")}>Fit to space</button>
            {blockedDoor && (
              <button onClick={() => setDoor(blockedDoor.key, { swing: doorSwing(blockedDoor.wall, blockedDoor.opening, nodes, doorState) === 1 ? -1 : 1 })}>⤾ Flip door side</button>
            )}
          </div>
          {fitMsg && <small>{fitMsg}</small>}
        </div>
      )}
      {presets && (
        <label className="row">Size
          <select value={presetIdx} onChange={(e) => { const p = presets[+e.target.value]; if (p) patch({ w: p.w, d: p.d, h: p.h }) }}>
            {presetIdx < 0 && <option value={-1}>Custom</option>}
            {presets.map((p, k) => <option key={p.label} value={k}>{p.label} ({cmv(p.w)}×{cmv(p.d)})</option>)}
          </select>
        </label>
      )}
      {styles && (
        <label className="row">Type
          <select value={sel.style ?? styles[0].id} onChange={(e) => patch({ style: e.target.value })}>
            {styles.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      )}
      <label className="row">Finish
        <select value={sel.finish ?? ''} onChange={(e) => patch({ finish: (e.target.value || undefined) as Furn['finish'] })}>
          <option value="">Default</option>
          {FINISHES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      <Slider label="Width" v={cmv(size.w)} min={wMin} max={wMax} on={(x) => patch({ w: x })} />
      <Slider label="Depth" v={cmv(size.d)} min={dMin} max={dMax} on={(x) => patch({ d: x })} />
      {!isWallMounted(sel.type) && sel.type !== 'rug' && <Slider label="Height" v={cmv(size.h)} min={hMin} max={hMax} on={(x) => patch({ h: x })} />}
      {isWallMounted(sel.type) && <Slider label="Mounted at" v={cmv(sel.y ?? (sel.type === 'ac' ? 2.25 : sel.type === 'shelf' ? 1.5 : sel.type === 'towelWarmer' ? 1.0 : 0.9))} min={20} max={240} on={(x) => patch({ y: x })} />}
      <div>
        {SWATCHES.map((c) => <span key={c} className="sw" style={{ background: c }} onClick={() => patch({ color: c })} />)}
        <input type="color" value={sel.color ?? cat.color} onChange={(e) => patch({ color: e.target.value })} title="Any colour" />
      </div>
      <div>
        <button onClick={() => patch({ rot: sel.rot + Math.PI / 2 })}>Rotate</button>
        <button onClick={() => patch({ w: undefined, d: undefined, h: undefined, style: undefined, finish: undefined, color: undefined })}>Reset</button>
        <button onClick={() => duplicateFurn(sel.id)} title="Ctrl+D">Duplicate</button>
        <button onClick={() => removeFurn(sel.id)}>Remove</button>
      </div>
    </div>
  )
}

