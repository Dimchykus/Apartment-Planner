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
  const mode = useStore((s) => s.mode)
  const stage = useStore((s) => s.stage)
  const setMode = useStore((s) => s.setMode)
  const on2d = useUI((s) => s.on2d)
  const setOn2d = useUI((s) => s.setOn2d)
  const menuOpen = useUI((s) => s.menuOpen)
  const toolsOpen = useUI((s) => s.toolsOpen)
  const setMenuOpen = useUI((s) => s.setMenuOpen)
  const exitLock = () => document.exitPointerLock?.()
  const view2d = on2d && mode !== 'walk' && mode !== 'fly'
  const set = (m: Mode, two = false) => () => {
    exitLock(); resetTouchInput(); setOn2d(two); setMode(m)
    if ((m === 'walk' || m === 'fly') && window.innerWidth < 760) setMenuOpen(false) // phones: give the whole screen to the view
  }
  const groups: { name: string; items: Item[] }[] = [
    { name: 'View', items: [
      { id: 'orbit', label: 'Orbit', icon: 'orbit', active: mode === 'view' && !view2d, go: set('view') },
      { id: '2d', label: '2D', icon: 'plan', active: view2d && mode === 'view', go: () => { exitLock(); setOn2d(true); if (mode === 'walk' || mode === 'fly') setMode('view') } },
      { id: 'walk', label: 'Walk', icon: 'walk', active: mode === 'walk', go: set('walk') },
      { id: 'fly', label: 'Fly', icon: 'fly', active: mode === 'fly', go: set('fly') },
    ] },
    { name: 'Edit', items: [
      { id: 'openings', label: 'Openings', icon: 'door', active: mode === 'openings', go: () => { exitLock(); setMode('openings') } }, // doors and windows (walls are set in the plan tracer)
      { id: 'furniture', label: 'Furniture', icon: 'box', active: mode === 'furniture', go: () => { exitLock(); setMode('furniture') } },
      { id: 'move', label: 'Move', icon: 'move', active: mode === 'move', go: () => { exitLock(); setMode('move') } },
      { id: 'rooms', label: 'Rooms', icon: 'rooms', active: mode === 'rooms', go: () => { exitLock(); setMode('rooms') } },
      { id: 'style', label: 'Style', icon: 'palette', active: mode === 'style', go: () => { exitLock(); setMode('style') } },
      { id: 'dims', label: 'Sizes', icon: 'ruler', active: mode === 'dims', go: () => { exitLock(); setMode('dims') } },
    ] },
  ]
  return (
    <nav className={'modebar' + (menuOpen ? ' shiftL' : '') + (toolsOpen && ['walls', 'furniture', 'move', 'rooms', 'style', 'openings', 'dims'].includes(mode) ? ' shiftR' : '')} aria-label="Modes">
      {groups.map((g) => (
        <div key={g.name} className="mgroup">
          {g.items.map((i) => (
            <button key={i.id} className={'mbtn' + (i.active ? ' on' : '')} onClick={i.go} disabled={stage === 'setup' && ['furniture', 'move'].includes(i.id)} title={stage === 'setup' && ['furniture', 'move'].includes(i.id) ? 'Finish the flat setup first' : i.label} aria-pressed={i.active}>
              <Icon n={i.icon} size={19} /><span>{i.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function TopBar() {
  const flatId = useStore((s) => s.flatId)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const menuOpen = useUI((s) => s.menuOpen)
  const setMenuOpen = useUI((s) => s.setMenuOpen)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const setHelp = useUI((s) => s.setHelp)
  useUI((x) => x.flatsVersion)
  const name = FLATS.find((f) => f.id === flatId)?.name.replace(/ · .*$/, '') ?? ''
  const fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.() }
  useEffect(() => {
    const shot = () => takeScreenshot()
    document.addEventListener('planner-screenshot', shot)
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (useUI.getState().tracer) return
      if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) setMenuOpen(!useUI.getState().menuOpen)
      if (e.key === '?') setHelp(true)
    }
    addEventListener('keydown', key)
    return () => { document.removeEventListener('planner-screenshot', shot); removeEventListener('keydown', key) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {!menuOpen && (
        <button className="fab-menu" onClick={() => setMenuOpen(true)} aria-label="Show menu" title="Show menu (H)">
          <Icon n="menu" size={20} /><span>{name}</span>
        </button>
      )}
      <div className="topbar">
        <button className="ibtn glass" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Icon n="undo" /></button>
        <button className="ibtn glass" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)"><Icon n="redo" /></button>
        <span className="sep" />
        <button className="ibtn glass" onClick={takeScreenshot} title="Save a picture"><Icon n="camera" /></button>
        {!isTouch && <button className="ibtn glass" onClick={fs} title="Full screen"><Icon n="full" /></button>}
        <button className="ibtn glass" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Light / dark"><Icon n={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="ibtn glass" onClick={() => setHelp(true)} title="Help (?)"><Icon n="help" /></button>
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
