import { useState } from 'react'
import { useStore } from '../store'
import { useUI } from './uiStore'
import { Icon } from './Icon'
import { rooms as planRooms, openingsOf, PX_PER_M, walls as baseWalls } from '../plan'
import { FLOORS, WALL_COLORS, DEFAULT_WALL, defaultFloor, type FloorId } from '../materials'
import { OPENING_PRESETS } from '../openingTools'
import { doorKey } from '../wiring'
import { kindInfo } from '../roomkinds'
import { defaultKind } from '../autofurnish'

const cm = (v: number) => Math.round(v * 100)

/** Three-position door switch. */
export function DoorSwitch({ value, onChange }: { value: 0 | 1 | 2; onChange: (v: 0 | 1 | 2) => void }) {
  return (
    <div className="seg three" role="group" aria-label="Door position">
      {(['Closed', 'Half open', 'Open'] as const).map((l, i) => (
        <button key={l} className={value === i ? 'on' : ''} onClick={() => onChange(i as 0 | 1 | 2)} aria-pressed={value === i}>{l}</button>
      ))}
    </div>
  )
}

/** Doors + lights controls that belong to the whole flat (used in the Scene card and the Doors & windows panel). */
export function DoorLightControls() {
  const s = useStore()
  const states = (() => { const out = new Set<number>(); for (const w of [...baseWalls, ...s.customWalls]) for (const o of openingsOf(w, s.nodes)) if (o.kind === 'door') out.add(s.doorState[doorKey(w.id, o.i ?? 0)]?.state ?? (w.thick / PX_PER_M >= 0.21 ? 0 : 1)); return out })()
  const all = (states.size === 1 ? [...states][0] : -1) as number
  const ov = Object.values(s.lightOv)
  const lightMode = ov.length === 0 ? 'auto' : ov.every((v) => v) ? 'on' : ov.every((v) => !v) ? 'off' : 'mixed'
  return (<>
    <div className="lbl-row"><span>All doors</span></div>
    <div className="seg three">
      {(['Closed', 'Half open', 'Open'] as const).map((l, i) => <button key={l} className={all === i ? 'on' : ''} onClick={() => s.setAllDoors(i as 0 | 1 | 2)}>{l}</button>)}
    </div>
    <div className="lbl-row"><span>Lights</span></div>
    <div className="seg three">
      <button className={lightMode === 'auto' ? 'on' : ''} onClick={() => s.setLightsAll(undefined)} title="On at sunset and night, off in daylight">Auto</button>
      <button className={lightMode === 'on' ? 'on' : ''} onClick={() => s.setLightsAll(true)}>All on</button>
      <button className={lightMode === 'off' ? 'on' : ''} onClick={() => s.setLightsAll(false)}>All off</button>
    </div>
    <small className="muted">Click a switch or door in the 3D view (<kbd>E</kbd> when walking).</small>
  </>)
}

export function StylePanel() {
  const s = useStore()
  const [target, setTarget] = useState<string>(planRooms.find((r) => !r.skip)?.id ?? 'outside')
  const exterior = target === 'outside'
  const st = s.roomStyle[target] ?? {}
  const room = planRooms.find((r) => r.id === target)
  const curFloor = (st.floor ?? (room ? defaultFloor(room.floor) : 'parquet')) as FloorId
  const curWall = st.wall ?? DEFAULT_WALL
  const apply = (p: { wall?: string; floor?: FloorId }) => (target === '*' ? s.styleAll(p) : s.setRoomStyle(target, p))
  return (<>
    <p className="hint">Pick a room, then a colour and a floor.</p>
    <div className="chips">
      {planRooms.filter((r) => !r.skip).map((r) => (
        <button key={r.id} className={target === r.id ? 'on' : ''} onClick={() => setTarget(r.id)}>
          <span className="sw" style={{ background: s.roomStyle[r.id]?.wall ?? DEFAULT_WALL, margin: '0 5px 0 0', width: 12, height: 12 }} />
          {s.roomKinds[r.id] ? kindInfo(s.roomKinds[r.id]).label : r.name.replace(/ \(.*\)/, '')}{defaultKind(r) === 'none' && !s.roomKinds[r.id] ? '' : ''}
        </button>
      ))}
      <button className={target === 'outside' ? 'on' : ''} onClick={() => setTarget('outside')}>Exterior walls</button>
      <button className={target === '*' ? 'on' : ''} onClick={() => setTarget('*')}>All rooms</button>
    </div>
    <div className="sel">
      <b>Wall colour</b>
      <div>
        {WALL_COLORS.map((c) => <span key={c} className={'sw' + (curWall === c ? ' pick' : '')} style={{ background: c }} onClick={() => apply({ wall: c })} title={c} />)}
        <input type="color" value={curWall} onChange={(e) => apply({ wall: e.target.value })} title="Any colour" />
      </div>
      {!exterior && target !== '*' && <button className="btn sm" onClick={() => { const next = { ...s.roomStyle[target] }; delete next.wall; s.setRoomStyle(target, { wall: undefined }); void next }}>Reset colour</button>}
    </div>
    {!exterior && (
      <div className="sel">
        <b>Floor</b>
        <div className="floors">
          {FLOORS.map((f) => (
            <button key={f.id} className={'floor' + (target !== '*' && curFloor === f.id ? ' on' : '')} onClick={() => apply({ floor: f.id })} title={f.label}>
              <i style={{ background: f.swatch }} /><span>{f.label}</span>
            </button>
          ))}
        </div>
        {target !== '*' && <button className="btn sm" onClick={() => s.styleAll({ floor: curFloor })}>Use this floor in every room</button>}
        {target !== '*' && <button className="btn sm" onClick={() => s.styleAll({ wall: curWall })}>Use this colour in every room</button>}
      </div>
    )}
  </>)
}

export function OpeningsPanel() {
  const s = useStore()
  const u = useUI()
  const sel = s.selOpening
  const w = sel ? [...baseWalls, ...s.customWalls].find((q) => q.id === sel.wall) : undefined
  const o = w && sel ? openingsOf(w, s.nodes).find((q) => q.i === sel.i) : undefined
  const A = w ? s.nodes[w.a] : null, B = w ? s.nodes[w.b] : null
  const L = A && B ? Math.hypot(B[0] - A[0], B[1] - A[1]) : 0
  const key = w && sel ? doorKey(w.id, sel.i) : ''
  const door = s.doorState[key]
  const dState = (door?.state ?? (w && w.thick / PX_PER_M >= 0.21 ? 0 : 1)) as 0 | 1 | 2
  void u
  return (<>
    <p className="hint">Click a window or door to edit it, or choose Add and click a wall.</p>
    <div className="seg">
      <button className={s.openingTool === 'select' ? 'on' : ''} onClick={() => s.setOpeningTool('select')}><Icon n="cursor" size={14} /> Select</button>
      <button className={s.openingTool === 'add' ? 'on' : ''} onClick={() => s.setOpeningTool('add')}><Icon n="plus" size={14} /> Add</button>
    </div>
    {s.openingTool === 'add' && (<>
      <div className="chips">
        {OPENING_PRESETS.map((p) => <button key={p.id} className={s.openingPreset === p.id ? 'on' : ''} onClick={() => s.setOpeningPreset(p.id)}>{p.label}</button>)}
      </div>
      <p className="hint">Click a wall to place it.</p>
    </>)}
    {o && w && (
      <div className="sel">
        <b>{o.kind === 'door' ? (o.glass ? 'Glazed door' : 'Door') : o.sill < 0.3 && o.top - o.sill > 2 ? 'Full-height glazing' : 'Window'}</b>
        {o.kind === 'door' && <DoorSwitch value={dState} onChange={(v) => s.setDoor(key, { state: v })} />}
        {o.kind === 'door' && (
          <div className="row2">
            <button className="btn sm" onClick={() => s.setDoor(key, { hinge: (door?.hinge ?? 'a') === 'a' ? 'b' : 'a' })}>↔ Flip hinge</button>
            <button className="btn sm" onClick={() => s.setDoor(key, { swing: (door?.swing ?? 1) === 1 ? -1 : 1 })}>⤾ Swing other way</button>
          </div>
        )}
        <label className="slider">Width {cm((o.to - o.from) / PX_PER_M)} cm
          <input type="range" min={30} max={Math.round((L / PX_PER_M) * 100 - 30)} step={5} value={cm((o.to - o.from) / PX_PER_M)} onChange={(e) => s.editOpening(w.id, sel!.i, { width: +e.target.value / 100 })} />
        </label>
        <label className="slider">Position {((o.from + o.to) / 2 / PX_PER_M).toFixed(2)} m along the wall
          <input type="range" min={0} max={Math.round((L / PX_PER_M) * 100)} step={5} value={Math.round(((o.from + o.to) / 2 / PX_PER_M) * 100)} onChange={(e) => s.editOpening(w.id, sel!.i, { centre: +e.target.value / 100 })} />
        </label>
        {o.kind === 'window' && (<>
          <label className="slider">Sill height {cm(o.sill)} cm
            <input type="range" min={0} max={160} step={5} value={cm(o.sill)} onChange={(e) => s.editOpening(w.id, sel!.i, { sill: +e.target.value / 100 })} />
          </label>
          <label className="slider">Top {cm(o.top)} cm
            <input type="range" min={90} max={265} step={5} value={cm(o.top)} onChange={(e) => s.editOpening(w.id, sel!.i, { top: +e.target.value / 100 })} />
          </label>
        </>)}
        {o.kind === 'door' && (
          <label className="check"><input type="checkbox" checked={!!o.glass} onChange={(e) => s.editOpening(w.id, sel!.i, { glass: e.target.checked })} /> glazed leaf</label>
        )}
        <div className="row2">
          <button className="btn sm" onClick={() => s.editOpening(w.id, sel!.i, o.kind === 'door' ? { kind: 'window', sill: 0.9, top: 2.1 } : { kind: 'door', sill: 0, top: 2.05 })}>{o.kind === 'door' ? 'Make window' : 'Make door'}</button>
          <button className="btn sm danger" onClick={() => s.removeOpening(w.id, sel!.i)}><Icon n="trash" size={14} /> Remove</button>
        </div>
      </div>
    )}
    <div className="sel"><b>Whole flat</b><DoorLightControls /></div>
    <button className="btn" onClick={s.regenElectrics}>Re-place lights &amp; switches</button>
  </>)
}
