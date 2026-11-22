import { useStore } from '../store'
import { useAI } from '../ai/aiStore'
import { Icon } from './Icon'
import { useUI } from './uiStore'
import { isUserFlat } from '../lib/libraryActions'

/** Setup stage banner: walls, windows and rooms are fixed first; then furniture layouts can be made on top. */
export function StageBanner() {
  const s = useStore()
  if (s.stage === 'setup') return (
    <div className="warn" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--text)' }}>
      <b>Step 1 · Set up the flat</b>
      <small>Check the walls (Walls), windows and doors (Doors) and rooms (Rooms). The furniture tools unlock when you finish.</small>
      <button className="btn primary" onClick={() => s.setStage('design')}><Icon n="check" size={15} /> Finish setup, start furnishing</button>
    </div>
  )
  return (
    <div className="row2">
      <button className="btn" onClick={() => s.setStage('setup')} title="Walls, windows and rooms are shared by every layout; changing them may need a re-fit of the furniture"><Icon n="edit" size={15} /> Edit flat setup</button>
      {isUserFlat(s.flatId) && <button className="btn" onClick={() => useUI.getState().openTracer(s.flatId)} title="Re-open the plan tracer: walls, doors, windows, rooms and scale"><Icon n="layers" size={15} /> Open plan tracer</button>}
    </div>
  )
}

/** Furniture layouts of this flat. The setup stays the same; only the furniture differs between layouts. */
export function VersionsPanel() {
  const s = useStore()
  const ai = useAI()
  const cur = ai.variants.find((v) => v.id === ai.applied)
  return (<>
    <div className="flats">
      {s.versions.map((v) => (
        <div key={v.id} className={'flat' + (v.id === s.activeVer ? ' on' : '')}>
          <button className="flat-main" onClick={() => s.switchVersion(v.id)}><b>{v.name}</b><small>{(v.id === s.activeVer ? s.furniture : v.furniture).length} items</small></button>
          <div className="flat-act">
            <button className="ibtn" title="Rename" onClick={() => { const n = prompt('Layout name', v.name); if (n) s.renameVersion(v.id, n) }}><Icon n="edit" size={15} /></button>
            {s.versions.length > 1 && <button className="ibtn danger" title="Delete" onClick={() => confirm('Delete "' + v.name + '"?') && s.deleteVersion(v.id)}><Icon n="trash" size={15} /></button>}
          </div>
        </div>
      ))}
    </div>
    <div className="row2">
      <button className="btn" onClick={() => s.addVersion(undefined, 'copy')} title="Copy of the current layout">+ Copy of this</button>
      <button className="btn" onClick={() => s.addVersion(undefined, 'empty')}>+ Empty</button>
    </div>
    {cur && <button className="btn" onClick={() => s.saveAsVersion(cur.furniture, 'AI layout ' + Math.round(cur.match * 100) + '%')}><Icon n="sparkles" size={14} /> Keep the shown AI layout as a version</button>}
    <small className="muted">Edits are saved into the selected layout automatically. Walls, windows and rooms are shared by all layouts.</small>
  </>)
}
