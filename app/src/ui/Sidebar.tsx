import { useRef, type ReactNode } from 'react'
import { useUI, isTouch } from './uiStore'
import { Icon } from './Icon'
import { useStore, shareLink, CATALOG, type FType } from '../store'
import { FLATS, BUILTIN_IDS } from '../flats'
import { ENVS } from '../Outside'
import { roomAreas, totalArea, STATED_TOTAL, PX_PER_M, rooms as planRooms } from '../plan'
import { kindInfo } from '../roomkinds'
import { misplaced } from '../autofurnish'
import { CriteriaPanel, SpaceSummary, RoomsPanel, FurnPanel } from './Panels'
import { StylePanel, OpeningsPanel, DoorLightControls } from './StylePanels'
import { AiPanel } from './AiPanel'
import { useAI } from '../ai/aiStore'
import { startCarry } from '../Editor'
import { describeRooms } from '../autofurnish'
import { duplicateFlat, deleteUserFlat, exportFlat, importFlatFile, exportProject, importProject, renameUserFlat, isUserFlat } from '../lib/libraryActions'

/** Collapsible section of the side menu. */
export function Card({ id, title, icon, dflt = true, badge, children }: { id: string; title: string; icon: string; dflt?: boolean; badge?: ReactNode; children: ReactNode }) {
  const open = useUI((s) => s.cards[id] ?? dflt)
  const toggle = useUI((s) => s.toggleCard)
  return (
    <section className={'card' + (open ? ' open' : '')}>
      <button className="card-h" onClick={() => toggle(id, dflt)} aria-expanded={open}>
        <Icon n={icon} size={16} /><span>{title}</span>{badge}<Icon n="down" size={16} />
      </button>
      {open && <div className="card-b">{children}</div>}
    </section>
  )
}

const MODE_TITLES: Record<string, [string, string]> = {
  view: ['Look around', 'orbit'], walk: ['Walk through', 'walk'], fly: ['Free flight', 'fly'], walls: ['Walls', 'walls'], furniture: ['Furniture', 'box'],
  move: ['Move items', 'move'], rooms: ['Rooms & zones', 'rooms'], dims: ['Dimensions', 'ruler'], style: ['Walls & floors', 'palette'], openings: ['Doors & windows', 'door'],
}

/** Perspective / orthographic camera for the Orbit view. */
function ProjectionSwitch() {
  const u = useUI()
  return (
    <div className="seg" role="group" aria-label="Camera">
      <button className={!u.ortho ? 'on' : ''} onClick={() => u.setOrtho(false)} title="Natural 3D view with perspective">Perspective</button>
      <button className={u.ortho ? 'on' : ''} onClick={() => u.setOrtho(true)} title="Parallel lines stay parallel: good for measuring and aligning">Orthographic</button>
    </div>
  )
}

/** Top-down plan view, or an elevation view of one wall: handy for lining things up. */
function ViewTools() {
  const s = useStore()
  const u = useUI()
  const edges = describeRooms(s.nodes, s.customWalls, s.roomKinds).flatMap((r) => r.edges.filter((e) => e.len >= 0.8).map((e) => ({ r, e })))
  const cur = u.wallView ? edges.findIndex(({ e }) => u.wallView!.label === e.i + '|' + e.from.join()) : -1
  return (
    <div className="sel">
      <b>Align</b>
      <div className="seg">
        <button className={!u.on2d && !u.wallView ? 'on' : ''} onClick={() => { u.setWallView(null); u.setOn2d(false) }}>3D</button>
        <button className={u.on2d && !u.wallView ? 'on' : ''} onClick={() => { u.setWallView(null); u.setOn2d(true) }}>2D plan</button>
        <button className={u.wallView ? 'on' : ''} onClick={() => { const f = edges[0]; if (f) u.setWallView({ a: f.e.from, b: f.e.to, n: f.e.normal, label: f.e.i + '|' + f.e.from.join() }) }}>Wall</button>
      </div>
      {u.wallView && (
        <select value={cur} onChange={(e) => { const f = edges[+e.target.value]; if (f) u.setWallView({ a: f.e.from, b: f.e.to, n: f.e.normal, label: f.e.i + '|' + f.e.from.join() }) }}>
          {edges.map(({ r, e }, k) => <option key={k} value={k}>{r.name.replace(/ \(.*\)/, '')} · wall {e.i + 1} · {e.len} m</option>)}
        </select>
      )}
    </div>
  )
}

function ModePanel() {
  const s = useStore()
  const on2d = useUI((u) => u.on2d)
  const sel = s.furniture.find((f) => f.id === s.selected)
  const selWall = s.selected?.[0] === 'c' ? s.customWalls.find((w) => w.id === s.selected!.slice(0, -1)) : undefined
  const mode = s.mode
  const touch = isTouch
  const tip = (t: React.ReactNode) => <p className="hint">{t}</p>
  if (mode === 'view') return (<>{!on2d && <ProjectionSwitch />}{tip(<>{on2d ? 'Top-down plan. ' : ''}{touch ? 'One finger turns, two zoom.' : 'Drag = turn · right-drag = move · wheel = zoom.'}</>)}</>)
  if (mode === 'walk') return tip(touch ? 'Stick = walk, drag = look.' : <>Click to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · <kbd>E</kbd> use · <kbd>Esc</kbd> release.</>)
  if (mode === 'fly') return tip(touch ? 'Stick = fly, ▲▼ = up / down.' : <>Click to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly · <kbd>Space</kbd>/<kbd>C</kbd> up / down · wheel = speed.</>)
  if (mode === 'dims') return tip('Lengths in cm. Blue = clear wall length, grey = thickness, brown / teal = doors / windows.')
  if (mode === 'rooms') return <RoomsPanel />
  if (mode === 'style') return <StylePanel />
  if (mode === 'openings') return (<><OpeningsPanel /><ViewTools /></>)
  if (mode === 'move') return (<>
    <div className="sel">
      <b>Move</b>
      <div className="seg four">
        {([['free', 'Free'], ['x', 'X'], ['y', 'Y'], ['z', 'Z height']] as const).map(([k, l]) => <button key={k} className={s.axis === k ? 'on' : ''} onClick={() => s.setAxis(s.axis === k && k !== 'free' ? 'free' : k)} title={k === 'free' ? 'Any direction' : 'Key ' + k.toUpperCase()}>{l}</button>)}
      </div>
      <button className="btn" disabled={!sel} onClick={() => sel && startCarry(sel.id)} title="Enter">Pick up (Enter) · click or Enter drops · Esc cancels</button>
    </div>
    <ViewTools />
    {!useUI.getState().on2d && !useUI.getState().wallView && <ProjectionSwitch />}
    {tip(<>Drag an item · pink lines = aligned with another item · <kbd>R</kbd> turn · <kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd> lock axis · <kbd>Ctrl</kbd>+<kbd>D</kbd> copy</>)}
    {sel && <FurnPanel sel={sel} />}
  </>)
  if (mode === 'walls') return (<>
    <div className="seg">
      <button className={s.tool === 'move' ? 'on' : ''} onClick={() => s.setTool('move')}>Move</button>
      <button className={s.tool === 'add' ? 'on' : ''} onClick={() => s.setTool('add')}><Icon n="plus" size={14} /> Add wall</button>
    </div>
    {s.tool === 'add' && (<>
      {tip('Click start, then end. Esc cancels.')}
      <div className="two">
        <label>Thickness<select value={s.newThick} onChange={(e) => s.setNew({ newThick: +e.target.value })}>{[8, 10, 12, 20].map((t) => <option key={t} value={t}>{t} cm</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={s.newDoor} onChange={(e) => s.setNew({ newDoor: e.target.checked })} /> doorway</label>
      </div>
    </>)}
    {selWall && (
      <div className="sel">
        <b>Added wall</b>
        <div className="two">
          <select value={Math.round((selWall.thick / PX_PER_M) * 100)} onChange={(e) => s.patchWall(selWall.id, { thick: (+e.target.value / 100) * PX_PER_M })}>
            {[8, 10, 12, 20].map((t) => <option key={t} value={t}>{t} cm</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={!!selWall.door} onChange={(e) => s.patchWall(selWall.id, { door: e.target.checked })} /> doorway</label>
        </div>
        <button className="btn danger" onClick={() => s.removeWall(selWall.id)}><Icon n="trash" size={15} /> Delete wall</button>
      </div>
    )}
    {tip('Outer walls are locked. Drag the blue handles; purple square moves a whole added wall.')}
    <button className="btn" onClick={s.resetWalls}>Reset walls</button>
  </>)
  // furniture
  const bad = s.furniture.filter((f) => misplaced(f, s.nodes, s.customWalls, s.furniture)).length
  return (<>
    <select className="wide" value="" onChange={(e) => e.target.value && s.addFurn(e.target.value as FType)}>
      <option value="">+ Add furniture…</option>
      {(Object.keys(CATALOG) as FType[]).map((t) => <option key={t} value={t}>{CATALOG[t].label}</option>)}
    </select>
    {sel ? <FurnPanel sel={sel} /> : tip('Click an item to edit it. Use Move to drag.')}
    {bad > 0 && <div className="warn">⚠ {bad} item(s) don't fit <button className="btn sm" onClick={() => s.fixAll()}>Fix all</button></div>}
    <div className="row2"><button className="btn primary" onClick={() => useAI.getState().run()} disabled={!!useAI.getState().busy}><Icon n="sparkles" size={15} /> AI furnish</button><button className="btn" onClick={s.autoFurnish} title="Instant, always the same result">Offline rules</button></div>
    <button className="btn wide" onClick={s.clearFurniture}>Clear all</button>
    <CriteriaPanel />
    <SpaceSummary />
  </>)
}

function Overview() {
  const s = useStore()
  const areas = roomAreas(s.nodes, s.customWalls)
  const tot = totalArea(s.nodes, s.customWalls)
  const diff = STATED_TOTAL ? tot.living - STATED_TOTAL : 0
  return (<>
    <div className="big">
      <span>{tot.living.toFixed(2)}<small> m²</small></span>
      <em>total area, loggia ×0.5{STATED_TOTAL ? <> · plan says {STATED_TOTAL} <b className={Math.abs(diff) > 1.5 ? 'bad' : 'ok'}>({diff >= 0 ? '+' : ''}{diff.toFixed(1)})</b></> : null}</em>
    </div>
    <table className="areas">
      <tbody>
        {areas.map(({ room, area }) => (
          <tr key={room.id}><td>{s.roomKinds[room.id] ? kindInfo(s.roomKinds[room.id]).label : room.name}</td><td>{area.toFixed(1)}{room.stated ? <i> / {room.stated.toFixed(1)}</i> : null}</td></tr>
        ))}
      </tbody>
    </table>
    <small className="muted">net area without walls{planRooms.some((r) => r.stated) ? ' / figure on the plan' : ''} · full loggia: {tot.gross.toFixed(1)} m²</small>
  </>)
}

function Scene() {
  const u = useUI()
  const s = useStore()
  return (<>
    <label className="row">Time of day
      <select value={u.env} onChange={(e) => u.setEnv(e.target.value as typeof u.env)}>{ENVS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
    </label>
    <div className="lbl-row"><span>Orbit camera</span></div>
    <ProjectionSwitch />
    <label className="row">Graphics
      <select value={u.quality} onChange={(e) => u.setQuality(e.target.value as typeof u.quality)}>
        <option value="low">Fast (phones, old PCs)</option><option value="med">Balanced</option><option value="high">Best looking</option>
      </select>
    </label>
    <DoorLightControls />
    {u.on2d && <label className="check"><input type="checkbox" checked={u.ceiling2d} onChange={(e) => u.setCeiling2d(e.target.checked)} /> Show the ceiling in the 2D view</label>}
    <div className="row2">
      <button className="btn" onClick={s.goTop}>Top view</button>
      <button className={'btn' + (u.overlay ? ' on' : '')} onClick={() => { u.setOverlay(!u.overlay); if (!u.overlay) u.setOn2d(true) }}><Icon n="image" size={15} /> Plan overlay</button>
    </div>
    {u.overlay && (
      <label className="slider">3D flat opacity {Math.round(u.flatOpacity * 100)}%
        <input type="range" min={0} max={100} value={Math.round(u.flatOpacity * 100)} onChange={(e) => u.setFlatOpacity(+e.target.value / 100)} />
        <small>0% = only your plan · 100% = only the 3D flat</small>
      </label>
    )}
  </>)
}

function Library() {
  const u = useUI()
  const s = useStore()
  useUI((x) => x.flatsVersion)
  const file = useRef<HTMLInputElement>(null)
  return (<>
    <div className="flats">
      {FLATS.map((f) => {
        const mine = isUserFlat(f.id)
        return (
          <div key={f.id} className={'flat' + (f.id === s.flatId ? ' on' : '')}>
            <button className="flat-main" onClick={() => f.id !== s.flatId && s.switchFlat(f.id)} title="Open this flat">
              <b>{f.name.replace(/ · .*$/, '')}</b>
              <small>{BUILTIN_IDS.has(f.id) ? 'example · ' : ''}{f.statedTotal ? f.statedTotal + ' m²' : ''} · {f.rooms.filter((r) => !r.skip).length} rooms</small>
            </button>
            <div className="flat-act">
              {mine && <button className="ibtn" title="Edit the plan" onClick={() => u.openTracer(f.id)}><Icon n="edit" size={15} /></button>}
              {mine && <button className="ibtn" title="Rename" onClick={() => { const n = prompt('Flat name', f.name); if (n) renameUserFlat(f.id, n) }}><Icon n="menu" size={15} /></button>}
              <button className="ibtn" title="Make an editable copy in My flats" onClick={() => { const id = duplicateFlat(f.id); if (id) u.showToast('Copy created. Use the pencil to edit its walls and rooms.') }}><Icon n="copy" size={15} /></button>
              {mine && <button className="ibtn" title="Export to a file" onClick={() => exportFlat(f.id)}><Icon n="download" size={15} /></button>}
              {mine && <button className="ibtn danger" title="Delete" onClick={() => { if (confirm('Delete "' + f.name + '"? This cannot be undone.')) deleteUserFlat(f.id) }}><Icon n="trash" size={15} /></button>}
            </div>
          </div>
        )
      })}
    </div>
    <button className="btn primary wide" onClick={() => u.openTracer(null)}><Icon n="plus" size={16} /> New flat from a plan image</button>
    <button className="btn wide" onClick={() => file.current?.click()}><Icon n="upload" size={15} /> Import a flat file</button>
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFlatFile(f); e.target.value = '' }} />
    <small className="muted">Your flats are kept in this browser. Export a flat to send it to a friend.</small>
  </>)
}

function Share() {
  const u = useUI()
  const f = useRef<HTMLInputElement>(null)
  return (<>
    <div className="row2">
      <button className="btn" onClick={() => { navigator.clipboard?.writeText(shareLink()); u.showToast('Link copied: it contains your current layout.') }}><Icon n="copy" size={15} /> Copy link</button>
      <button className="btn" onClick={() => document.dispatchEvent(new Event('planner-screenshot'))}><Icon n="camera" size={15} /> Screenshot</button>
    </div>
    <div className="row2">
      <button className="btn" onClick={exportProject}><Icon n="download" size={15} /> Export project</button>
      <button className="btn" onClick={() => f.current?.click()}><Icon n="upload" size={15} /> Import project</button>
    </div>
    <input ref={f} type="file" accept=".json,application/json" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) importProject(x); e.target.value = '' }} />
    <small className="muted">"Copy link" works when the app is on a web address. Export / import works everywhere and includes your own flats.</small>
  </>)
}

export const EDIT_MODES = ['walls', 'furniture', 'move', 'rooms', 'style', 'openings', 'dims']
const narrow = () => typeof window !== 'undefined' && window.innerWidth < 760

/** The part of the menu that is the same in every mode: flat, overview, scene, my flats, share. */
function GeneralCards() {
  const s = useStore()
  const editing = EDIT_MODES.includes(s.mode)
  return (<>
    {!editing && <Card id="controls" title="How to move around" icon="orbit"><ModePanel /></Card>}
    <Card id="overview" title="Overview" icon="home"><Overview /></Card>
    <Card id="scene" title="Scene & view" icon="sun" dflt={false}><Scene /></Card>
    <Card id="flats" title="My flats" icon="layers" dflt={false} badge={<em className="pill">{FLATS.length}</em>}><Library /></Card>
    <Card id="share" title="Share & backup" icon="share" dflt={false}><Share /></Card>
  </>)
}

/** Tools that only make sense in the current edit mode. */
function ToolCards() {
  const s = useStore()
  return (<>
    {s.mode === 'furniture' && <Card id="ai" title="AI furnish (Ollama)" icon="sparkles"><AiPanel /></Card>}
    <ModePanel />
  </>)
}

export function Sidebar() {
  const u = useUI()
  const s = useStore()
  useUI((x) => x.flatsVersion)
  const hasTools = EDIT_MODES.includes(s.mode)
  const phone = narrow()
  const tab = phone && hasTools ? u.sheetTab : 'general'
  const [title] = MODE_TITLES[s.mode] ?? ['Tools']
  return (
    <aside className={'side' + (u.menuOpen ? '' : ' closed') + (u.sheetFull ? ' full' : '')} aria-label="Menu">
      <header className="side-h">
        <div className="logo"><Icon n="home" size={18} /></div>
        <div className="side-t"><b>Flat Planner</b><small>3D layouts for your new home</small></div>
        <button className="ibtn" onClick={() => u.setMenuOpen(false)} title="Hide menu (H)"><Icon n="left" /></button>
      </header>
      <button className="grab-handle" aria-label="Expand or collapse" onClick={() => u.setSheetFull(!u.sheetFull)}><i /></button>
      {phone && hasTools && (
        <div className="seg tabs">
          <button className={tab === 'general' ? 'on' : ''} onClick={() => u.setSheetTab('general')}>General</button>
          <button className={tab === 'tools' ? 'on' : ''} onClick={() => u.setSheetTab('tools')}>{title}</button>
        </div>
      )}
      {tab === 'general' && (
        <div className="flat-pick">
          <select value={s.flatId} onChange={(e) => s.switchFlat(e.target.value)} aria-label="Flat">
            <optgroup label="Examples">{FLATS.filter((f) => BUILTIN_IDS.has(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
            {FLATS.some((f) => !BUILTIN_IDS.has(f.id)) && <optgroup label="My flats">{FLATS.filter((f) => !BUILTIN_IDS.has(f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>}
          </select>
        </div>
      )}
      <div className="side-body">{tab === 'general' ? <GeneralCards /> : <ToolCards />}</div>
    </aside>
  )
}

/** Right-hand panel: only for the edit modes (Walls, Furniture, Move, Rooms, Style, Doors, Sizes). On phones these tools are a tab of the bottom sheet. */
export function ToolPanel() {
  const u = useUI()
  const s = useStore()
  const [title, icon] = MODE_TITLES[s.mode] ?? ['Tools', 'sliders']
  if (!EDIT_MODES.includes(s.mode) || narrow()) return null
  return (
    <aside className={'side tools' + (u.toolsOpen ? '' : ' closed')} aria-label={title}>
      <header className="side-h">
        <div className="logo tool"><Icon n={icon} size={18} /></div>
        <div className="side-t"><b>{title}</b><small>tools for this mode</small></div>
        <button className="ibtn" onClick={() => u.setToolsOpen(false)} title="Hide tools"><Icon n="right" /></button>
      </header>
      <div className="side-body"><ToolCards /></div>
    </aside>
  )
}

/** Small button that brings the tool panel back after it was hidden. */
export function ToolsTab() {
  const u = useUI()
  const mode = useStore((s) => s.mode)
  if (!EDIT_MODES.includes(mode) || u.toolsOpen || narrow()) return null
  const [title, icon] = MODE_TITLES[mode] ?? ['Tools', 'sliders']
  return <button className="fab-tools" onClick={() => u.setToolsOpen(true)} title="Show tools"><Icon n={icon} size={18} /><span>{title}</span></button>
}
