import { useEffect } from 'react'
import { useStore, type Mode } from '../store'
import { useUI, isTouch } from './uiStore'
import { Icon } from './Icon'
import { FLATS } from '../flats'
import { resetTouchInput } from './touch'

export function takeScreenshot() {
  const c = document.querySelector('canvas')
  if (!c) return
  c.toBlob((b) => {
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = 'flat-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }, 'image/png')
}

type Item = { id: string; label: string; icon: string; active: boolean; go: () => void }

export function ModeBar() {
  const s = useStore()
  const u = useUI()
  const exitLock = () => document.exitPointerLock?.()
  const view2d = u.on2d && s.mode !== 'walk' && s.mode !== 'fly'
  const set = (m: Mode, two = false) => () => {
    exitLock(); resetTouchInput(); u.setOn2d(two); s.setMode(m)
    if ((m === 'walk' || m === 'fly') && window.innerWidth < 760) u.setMenuOpen(false) // phones: give the whole screen to the view
  }
  const groups: { name: string; items: Item[] }[] = [
    { name: 'View', items: [
      { id: 'orbit', label: 'Orbit', icon: 'orbit', active: s.mode === 'view' && !view2d, go: set('view') },
      { id: '2d', label: '2D', icon: 'plan', active: view2d && s.mode === 'view', go: () => { exitLock(); u.setOn2d(true); if (s.mode === 'walk' || s.mode === 'fly') s.setMode('view') } },
      { id: 'walk', label: 'Walk', icon: 'walk', active: s.mode === 'walk', go: set('walk') },
      { id: 'fly', label: 'Fly', icon: 'fly', active: s.mode === 'fly', go: set('fly') },
    ] },
    { name: 'Edit', items: [
      { id: 'walls', label: 'Walls', icon: 'walls', active: s.mode === 'walls', go: () => { exitLock(); s.setMode('walls') } },
      { id: 'furniture', label: 'Furniture', icon: 'box', active: s.mode === 'furniture', go: () => { exitLock(); s.setMode('furniture') } },
      { id: 'move', label: 'Move', icon: 'move', active: s.mode === 'move', go: () => { exitLock(); s.setMode('move') } },
      { id: 'rooms', label: 'Rooms', icon: 'rooms', active: s.mode === 'rooms', go: () => { exitLock(); s.setMode('rooms') } },
      { id: 'style', label: 'Style', icon: 'palette', active: s.mode === 'style', go: () => { exitLock(); s.setMode('style') } },
      { id: 'openings', label: 'Doors', icon: 'door', active: s.mode === 'openings', go: () => { exitLock(); s.setMode('openings') } },
      { id: 'dims', label: 'Sizes', icon: 'ruler', active: s.mode === 'dims', go: () => { exitLock(); s.setMode('dims') } },
    ] },
  ]
  return (
    <nav className={'modebar' + (u.menuOpen ? ' shiftL' : '') + (u.toolsOpen && ['walls', 'furniture', 'move', 'rooms', 'style', 'openings', 'dims'].includes(s.mode) ? ' shiftR' : '')} aria-label="Modes">
      {groups.map((g) => (
        <div key={g.name} className="mgroup">
          {g.items.map((i) => (
            <button key={i.id} className={'mbtn' + (i.active ? ' on' : '')} onClick={i.go} disabled={s.stage === 'setup' && ['furniture', 'move'].includes(i.id)} title={s.stage === 'setup' && ['furniture', 'move'].includes(i.id) ? 'Finish the flat setup first' : i.label} aria-pressed={i.active}>
              <Icon n={i.icon} size={19} /><span>{i.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function TopBar() {
  const s = useStore()
  const u = useUI()
  useUI((x) => x.flatsVersion)
  const name = FLATS.find((f) => f.id === s.flatId)?.name.replace(/ · .*$/, '') ?? ''
  const fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.() }
  useEffect(() => {
    const shot = () => takeScreenshot()
    document.addEventListener('planner-screenshot', shot)
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (useUI.getState().tracer) return
      if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) u.setMenuOpen(!useUI.getState().menuOpen)
      if (e.key === '?') u.setHelp(true)
    }
    addEventListener('keydown', key)
    return () => { document.removeEventListener('planner-screenshot', shot); removeEventListener('keydown', key) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {!u.menuOpen && (
        <button className="fab-menu" onClick={() => u.setMenuOpen(true)} aria-label="Show menu" title="Show menu (H)">
          <Icon n="menu" size={20} /><span>{name}</span>
        </button>
      )}
      <div className="topbar">
        <button className="ibtn glass" disabled={!s.past.length} onClick={s.undo} title="Undo (Ctrl+Z)"><Icon n="undo" /></button>
        <button className="ibtn glass" disabled={!s.future.length} onClick={s.redo} title="Redo (Ctrl+Y)"><Icon n="redo" /></button>
        <span className="sep" />
        <button className="ibtn glass" onClick={takeScreenshot} title="Save a picture"><Icon n="camera" /></button>
        {!isTouch && <button className="ibtn glass" onClick={fs} title="Full screen"><Icon n="full" /></button>}
        <button className="ibtn glass" onClick={() => u.setTheme(u.theme === 'dark' ? 'light' : 'dark')} title="Light / dark"><Icon n={u.theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="ibtn glass" onClick={() => u.setHelp(true)} title="Help (?)"><Icon n="help" /></button>
      </div>
    </>
  )
}

export function Toast() {
  const t = useUI((s) => s.toast)
  return t ? <div className="toast" role="status">{t}</div> : null
}

export function Help() {
  const u = useUI()
  if (!u.helpOpen) return null
  const touch = isTouch
  return (
    <div className="modal" onClick={() => u.setHelp(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Help">
        <button className="ibtn modal-x" onClick={() => u.setHelp(false)} aria-label="Close"><Icon n="x" /></button>
        <h2>Welcome to Flat Planner</h2>
        <p className="lead">See a flat in 3D before you buy it: walk through it, move walls, try furniture and layouts.</p>
        <div className="steps3">
          <div><b>1</b><h4>Look</h4><p>{touch ? 'Drag to rotate, pinch to zoom.' : 'Drag to rotate, wheel to zoom, right-drag to move.'} Try <b>Walk</b> and <b>Fly</b> in the bar at the bottom.</p></div>
          <div><b>2</b><h4>Furnish</h4><p>Open <b>Furniture</b> and press <b>Auto-furnish</b>. Pick a placement style (space, comfort, light …) and fine-tune.</p></div>
          <div><b>3</b><h4>Your own flat</h4><p>Menu → <b>My flats</b> → <b>New flat from a plan image</b>. Upload your plan, trace it in 2 minutes.</p></div>
        </div>
        {!touch && (
          <div className="keys">
            <h4>Keyboard</h4>
            <dl>
              <dt><kbd>H</kbd></dt><dd>show / hide the menu</dd>
              <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>undo / redo</dd>
              <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>walk / fly · <kbd>Shift</kbd> faster · <kbd>Space</kbd> / <kbd>C</kbd> up / down (fly)</dd>
              <dt><kbd>R</kbd> <kbd>Q</kbd> <kbd>E</kbd> <kbd>Del</kbd></dt><dd>rotate / remove the selected furniture</dd>
              <dt><kbd>Esc</kbd></dt><dd>release the mouse · cancel</dd>
            </dl>
          </div>
        )}
        <div className="modal-f">
          <small>Everything is saved automatically in this browser.</small>
          <button className="btn primary" onClick={() => u.setHelp(false)}>Start</button>
        </div>
      </div>
    </div>
  )
}
