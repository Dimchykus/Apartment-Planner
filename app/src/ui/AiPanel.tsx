import { useEffect, useState } from 'react'
import { useAI } from '../ai/aiStore'
import { Icon } from './Icon'
import { presetOf, CRITERIA_PRESETS } from '../criteria'
import { useStore } from '../store'
import { useUI } from './uiStore'
import { AiConnectButton } from './AiConnect'

const pct = (v: number) => Math.round(v * 100) + '%'

const copy = (t: string) => { navigator.clipboard?.writeText(t); useUI.getState().showToast('Copied: ' + t.split(String.fromCharCode(10))[0]) }

/** Four checks with plain-language instructions for whatever is missing (so a friend on another computer can get it running). */
function SetupCheck() {
  const ai = useAI()
  const [details, setDetails] = useState(false)
  const d = ai.diag
  if (!d) return <div className="ai-status"><i /><span>Checking Ollama…</span></div>
  const failing = d.steps.find((s) => s.ok === false)
  const ready = d.ready
  const icon = (ok: boolean | null) => (ok === true ? '✓' : ok === false ? '✕' : '•')
  return (
    <div className="ai-setup">
      <div className={'ai-status ' + (ready ? 'ok' : failing ? 'bad' : '')}>
        <i />
        <span>{ready ? <>Ready · <b>{ai.settings.model}</b>{d.answerMs ? ` · answered in ${(d.answerMs / 1000).toFixed(1)} s` : ''}</> : failing ? <b>{failing.title}: needs attention</b> : 'Checking…'}</span>
        <button className="ibtn" onClick={() => ai.refreshModels()} disabled={ai.checking} title="Check again"><Icon n="redo" size={15} /></button>
      </div>
      {ready && d.models.length > 0 && (
        <label className="row">Model
          <select value={ai.settings.model} onChange={(e) => { ai.patch({ model: e.target.value }); ai.refreshModels() }}>{d.models.map((m) => <option key={m} value={m}>{m}{m === 'qwen2.5:14b' ? ' (recommended)' : ''}</option>)}</select>
        </label>
      )}
      {ready && <div className="row2"><button className="btn sm" onClick={() => ai.testModel()} disabled={ai.checking}>{ai.checking ? 'Testing…' : 'Test the model'}</button><button className="btn sm" onClick={() => setDetails(!details)}>{details ? 'Hide' : 'Show'} checks</button></div>}
      {(!ready || details) && (
        <ol className="steps-list">
          {d.steps.map((s, k) => (
            <li key={s.id} className={s.ok === true ? 'ok' : s.ok === false ? 'bad' : ''}>
              <b>{icon(s.ok)} {k + 1}. {s.title}</b>
              {s.detail && <p>{s.detail}</p>}
              {s.commands?.map((c) => (
                <div key={c.text} className="cmd"><small>{c.label}</small><code>{c.text}</code><button className="btn sm" onClick={() => copy(c.text)}><Icon n="copy" size={13} /> Copy</button></div>
              ))}
              {s.link && <a className="btn sm" href={s.link.href} target="_blank" rel="noreferrer">{s.link.text} ↗</a>}
            </li>
          ))}
        </ol>
      )}
      {!ready && d.models.length > 0 && (
        <label className="row">Use another model
          <select value={ai.settings.model} onChange={(e) => { ai.patch({ model: e.target.value }); ai.refreshModels() }}>{d.models.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
      )}
      <small className="muted">Layouts are tested with Qwen 2.5 (14B recommended, 7B for small computers). Other models may work less well.</small>
    </div>
  )
}

export function AiPanel() {
  const ai = useAI()
  const crit = useStore((s) => s.criteria)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { if (ai.diag === null) ai.refreshModels() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = ai.variants.find((v) => v.id === ai.applied)
  const best = ai.variants[0]
  const wish = CRITERIA_PRESETS.find((p) => p.id === presetOf(crit))?.label ?? 'Custom wishes'
  return (<>
    <p className="hint">A local language model (Ollama) plans each room, then the app checks every piece against the real walls, doors and windows. Each run gives different layouts; the best match for your wishes is shown first.</p>
    <SetupCheck />
    <AiConnectButton />
    <small className="muted">Wishes used: <b>{wish}</b> (change them in Furniture → Placement criteria)</small>

    {ai.busy ? (
      <div className="ai-busy">
        <div className="bar"><i style={{ width: Math.round(((ai.busy.i + 0.5) / ai.busy.n) * 100) + '%' }} /></div>
        <small>Variant {ai.busy.i + 1} of {ai.busy.n} · {ai.busy.note}</small>
        <button className="btn sm" onClick={ai.cancel}>Stop</button>
      </div>
    ) : (
      <button className="btn primary wide ai-go" onClick={ai.run} disabled={!ai.diag?.ready}>
        <Icon n="sparkles" size={16} /> Furnish with AI · {ai.settings.variants} variant{ai.settings.variants > 1 ? 's' : ''}
      </button>
    )}
    {ai.diag && !ai.diag.ready && !ai.busy && <small className="muted">Finish the setup above, then this button works.</small>}
    {ai.error && <div className="warn">⚠ {ai.error}</div>}

    {ai.variants.length > 0 && (<>
      <div className="lbl-row"><span>Layouts from the model ({ai.variants.length})</span><button className="btn sm" onClick={ai.clear}>Clear</button></div>
      <div className="variants">
        {ai.variants.map((v, i) => (
          <button key={v.id} className={'variant' + (ai.applied === v.id ? ' on' : '')} onClick={() => ai.apply(v.id)} title={v.idea}>
            <b>{i === 0 ? '★ ' : ''}{Math.round(v.match * 100)}%</b>
            <small>{v.furniture.length} items{v.filled ? ` · ${v.filled} by rules` : ''}</small>
          </button>
        ))}
      </div>
      {cur && (
        <div className="sel">
          <b>{cur === best ? '★ Best match' : 'Selected layout'} · {pct(cur.match)}</b>
          {cur.idea && <small>“{cur.idea}”</small>}
          <small>Model placed {cur.placed} items{cur.dropped ? `, ${cur.dropped} did not fit` : ''}{cur.filled ? `, ${cur.filled} essential added by rules` : ''} · {(cur.ms / 1000).toFixed(0)} s</small>
          {cur.blocked.length > 0 && <small className="conf">Narrow passage in: {cur.blocked.join(', ')}</small>}
          {cur.log.length > 0 && <button className="btn sm" onClick={() => setOpen(open === cur.id ? null : cur.id)}>{open === cur.id ? 'Hide' : 'Show'} what was adjusted ({cur.log.length})</button>}
          {open === cur.id && <ul className="ai-log">{cur.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      )}
    </>)}

    <button className="btn sm" onClick={() => setMore(!more)}>{more ? 'Hide' : 'Show'} AI settings</button>
    {more && (
      <div className="sel">
        <label className="slider">Ollama address
          <input type="text" value={ai.settings.url} onChange={(e) => ai.patch({ url: e.target.value })} onBlur={() => ai.refreshModels()} />
        </label>
        <label className="slider">Creativity {ai.settings.temperature.toFixed(1)} <small>(higher = more different layouts)</small>
          <input type="range" min={20} max={130} step={5} value={Math.round(ai.settings.temperature * 100)} onChange={(e) => ai.patch({ temperature: +e.target.value / 100 })} />
        </label>
        <label className="slider">Variants per run: {ai.settings.variants}
          <input type="range" min={1} max={6} step={1} value={ai.settings.variants} onChange={(e) => ai.patch({ variants: +e.target.value })} />
        </label>
        <label className="check"><input type="checkbox" checked={ai.settings.fillEssentials} onChange={(e) => ai.patch({ fillEssentials: e.target.checked })} /> add essentials the model forgot (bed, sofa, TV …)</label>
        <small className="muted">The setup check above tells you what is missing.</small>
      </div>
    )}
  </>)
}
