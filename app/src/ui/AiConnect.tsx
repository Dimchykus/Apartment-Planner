// One window for the local AI (Ollama): connect, reconnect, status test, download and delete models. Opened from any screen: useUI.getState().setAiModal(true).
import { useEffect, useState } from 'react'
import { useAI } from '../ai/aiStore'
import { useUI } from './uiStore'
import { Icon } from './Icon'
import { MODEL_CATALOG, fmtSize } from '../ai/ollama'
import { isVisionModel } from '../ai/visionPlan'

const copy = (t: string) => { navigator.clipboard?.writeText(t); useUI.getState().showToast('Copied') }

export function AiConnect() {
  const open = useUI((s) => s.aiModal)
  const close = () => useUI.getState().setAiModal(false)
  const ai = useAI()
  const [addr, setAddr] = useState(ai.settings.url)
  const [confirm, setConfirm] = useState<string | null>(null)
  useEffect(() => { if (open) { setAddr(useAI.getState().settings.url); setConfirm(null); if (!useAI.getState().diag) useAI.getState().refreshModels() } }, [open])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') useUI.getState().setAiModal(false) }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [open])
  if (!open) return null

  const d = ai.diag
  const failing = d?.steps.find((s) => s.ok === false)
  const state = ai.checking ? 'checking' : ai.connected ? 'ok' : 'bad'
  const connect = () => { ai.patch({ url: addr.trim() || 'http://localhost:11434' }); ai.refreshModels() }
  const installed = new Set(ai.models)
  const busy = !!ai.pulling

  return (
    <div className="modal ai-modal" onClick={close}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Local AI">
        <button className="ibtn modal-x" onClick={close} aria-label="Close"><Icon n="x" /></button>
        <h2>Local AI</h2>
        <p className="lead">Runs on your computer with Ollama. Used to furnish rooms and to read floor-plan pictures. Nothing is sent to the internet.</p>

        <div className={'ai-status ' + (state === 'ok' ? 'ok' : state === 'bad' ? 'bad' : '')}>
          <i />
          <span>
            {state === 'checking' ? 'Checking…' : state === 'ok' ? <>Connected{d?.version ? ' · Ollama ' + d.version : ''} · {ai.models.length} model{ai.models.length === 1 ? '' : 's'} installed</> : <b>Not connected</b>}
            {state === 'ok' && d?.answerMs ? <small className="muted"> · test answered in {(d.answerMs / 1000).toFixed(1)} s</small> : null}
          </span>
        </div>

        <label className="slider">Ollama address
          <input type="text" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} spellCheck={false} />
        </label>
        <div className="row2">
          <button className="btn primary" disabled={ai.checking} onClick={connect}><Icon n="check" size={15} /> Connect</button>
          <button className="btn" disabled={ai.checking} onClick={() => ai.refreshModels()}><Icon n="redo" size={15} /> Reconnect</button>
          <button className="btn" disabled={ai.checking || !ai.connected || !ai.models.length} onClick={() => ai.testModel()} title="Ask the selected model a test question"><Icon n="sparkles" size={15} /> Status test</button>
        </div>

        {state === 'bad' && failing && (
          <div className="warn">
            <b>{failing.title}</b>
            <p style={{ margin: '4px 0' }}>{failing.detail}</p>
            {failing.commands?.map((c) => <div key={c.text} className="cmd"><small>{c.label}</small><code>{c.text}</code><button className="btn sm" onClick={() => copy(c.text)}><Icon n="copy" size={13} /> Copy</button></div>)}
            {failing.link && <a className="btn sm" href={failing.link.href} target="_blank" rel="noreferrer">{failing.link.text} ↗</a>}
          </div>
        )}
        {d?.steps[3].ok === false && state === 'ok' && <div className="warn">⚠ {d.steps[3].detail}</div>}

        {ai.connected && (<>
          <h3>Installed models</h3>
          {!ai.models.length && <small className="muted">None yet. Download one below.</small>}
          <div className="ai-models">
            {ai.models.map((m) => {
              const vis = isVisionModel(m)
              return (
                <div key={m} className="ai-model">
                  <div>
                    <b>{m}</b> <span className={'tag ' + (vis ? 'v' : 't')}>{vis ? 'reads pictures' : 'text'}</span>
                    <small className="muted">{ai.sizes[m] ? ' · ' + fmtSize(ai.sizes[m]) : ''}{!vis && ai.settings.model === m ? ' · used for furniture layouts' : ''}</small>
                  </div>
                  {!vis && ai.settings.model !== m && <button className="btn sm" onClick={() => { ai.patch({ model: m }); ai.refreshModels() }}>Use</button>}
                  {confirm === m
                    ? <button className="btn sm danger" disabled={busy} onClick={() => { setConfirm(null); ai.remove(m) }}>Really delete?</button>
                    : <button className="ibtn" disabled={busy} title="Delete this model from the computer" onClick={() => setConfirm(m)}><Icon n="trash" size={15} /></button>}
                </div>
              )
            })}
          </div>

          <h3>Download a model</h3>
          <div className="ai-models">
            {MODEL_CATALOG.map((m) => {
              const here = installed.has(m.name) || [...installed].some((x) => x.split(':')[0] === m.name.split(':')[0] && x === m.name)
              const mine = ai.pulling?.name === m.name
              return (
                <div key={m.name} className="ai-model">
                  <div>
                    <b>{m.label}</b> <span className={'tag ' + (m.kind === 'vision' ? 'v' : 't')}>{m.kind === 'vision' ? 'reads pictures' : 'text'}</span> <small className="muted">· {m.size}</small>
                    <small className="muted" style={{ display: 'block' }}>{m.note}</small>
                    {mine && <div className="bar"><i style={{ width: Math.round((ai.pulling!.pct ?? 0) * 100) + '%' }} /></div>}
                    {mine && <small className="muted">{ai.pulling!.status}{ai.pulling!.pct != null ? ' · ' + Math.round(ai.pulling!.pct * 100) + '%' : ''}</small>}
                  </div>
                  {here ? <small className="muted">installed</small>
                    : mine ? <button className="btn sm" onClick={ai.cancelPull}>Stop</button>
                    : <button className="btn sm" disabled={busy} onClick={() => ai.pull(m.name)}><Icon n="download" size={13} /> Download</button>}
                </div>
              )
            })}
          </div>
          <small className="muted">Big files: a download can take several minutes. Stopping keeps what was already downloaded.</small>
          {ai.modelError && <div className="warn">⚠ {ai.modelError}</div>}
        </>)}
      </div>
    </div>
  )
}

/** Small "AI connection…" button for any panel. */
export function AiConnectButton({ label = 'AI connection & models' }: { label?: string }) {
  const connected = useAI((s) => s.connected)
  return (
    <button className="btn sm" onClick={() => useUI.getState().setAiModal(true)}>
      <span className={'dotc ' + (connected ? 'ok' : connected === false ? 'bad' : '')} /> {label}
    </button>
  )
}
