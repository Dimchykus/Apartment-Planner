import { create } from 'zustand'
import { useStore } from '../store'
import { useUI } from '../ui/uiStore'
import { DEFAULT_AI, deleteModel, diagnose, explainError, listModelInfo, pickModel, pullModel, type AISettings, type Diagnosis } from './ollama'
import { aiFurnish, type Variant } from './run'

const KEY = 'planner-ai-v1'
function load(): AISettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // settings saved before "auto" existed: forget the model so the best installed one is chosen again
    if (s.auto === undefined) { s.auto = true; delete s.model }
    return { ...DEFAULT_AI, ...s }
  } catch { return { ...DEFAULT_AI } }
}

type AIState = {
  settings: AISettings
  models: string[]
  sizes: Record<string, number>        // installed model -> bytes
  pulling: { name: string; status: string; pct: number | null } | null
  pull: (name: string) => Promise<void>
  cancelPull: () => void
  remove: (name: string) => Promise<void>
  modelError: string
  connected: boolean | null            // null = not checked yet (true = Ollama reachable and allowed)
  diag: Diagnosis | null
  checking: boolean
  testModel: () => Promise<void>
  busy: { i: number; n: number; note: string } | null
  variants: Variant[]                  // every layout the model produced (best first), kept until cleared
  applied: string | null
  error: string
  patch: (p: Partial<AISettings>) => void
  refreshModels: () => Promise<void>
  run: () => Promise<void>
  cancel: () => void
  apply: (id: string) => void
  clear: () => void
}

let ctl: AbortController | null = null
let pullCtl: AbortController | null = null
export const useAI = create<AIState>((set, get) => ({
  settings: load(), models: [], sizes: {}, pulling: null, modelError: '', connected: null, diag: null, checking: false, busy: null, variants: [], applied: null, error: '',
  patch: (p) => { set((s) => ({ settings: { ...s.settings, ...p, ...(p.model !== undefined && p.auto === undefined ? { auto: false } : {}) } })); try { localStorage.setItem(KEY, JSON.stringify(get().settings)) } catch { /* ignore */ } },
  refreshModels: async () => {
    if (get().checking) return
    set({ checking: true })
    let d = await diagnose(get().settings)
    // keep the best installed model unless the user picked one by hand
    if (d.models.length && (get().settings.auto || !d.models.includes(get().settings.model))) {
      const best = pickModel(d.models)
      if (best !== get().settings.model) { get().patch({ model: best, auto: true }); d = await diagnose(get().settings) }
    }
    set({ diag: d, models: d.models, connected: d.running && d.steps[1].ok === true, checking: false, error: '' })
    if (d.running && d.steps[1].ok === true) { try { set({ sizes: Object.fromEntries((await listModelInfo(get().settings.url)).map((m) => [m.name, m.size])) }) } catch { /* sizes are optional */ } }
  },
  testModel: async () => {
    if (get().checking) return
    set({ checking: true })
    const d = await diagnose(get().settings, { test: true })
    set({ diag: d, models: d.models, connected: d.running && d.steps[1].ok === true, checking: false })
  },
  run: async () => {
    const st = get()
    if (st.busy) return
    if (!st.diag?.ready) { await st.refreshModels(); if (!get().diag?.ready) { set({ error: 'AI is not ready yet: follow the steps above.' }); return } }
    const main = useStore.getState()
    ctl = new AbortController()
    set({ busy: { i: 0, n: get().settings.variants, note: 'starting…' }, error: '' })
    try {
      const { variants, errors } = await aiFurnish({
        settings: get().settings, nodes: main.nodes, customWalls: main.customWalls, roomKinds: main.roomKinds, criteria: main.criteria, pins: main.hintOv, signal: ctl.signal,
        onProgress: (i, n, note) => set({ busy: { i, n, note } }),
      })
      if (!variants.length) { set({ error: errors[0] ?? 'The model gave no usable layout.', busy: null }); return }
      const all = [...variants, ...get().variants].sort((a, b) => b.match - a.match).slice(0, 12)
      set({ variants: all, busy: null, error: errors.length ? errors.join(' · ') : '' })
      get().apply(variants.sort((a, b) => b.match - a.match)[0].id) // show the best new one right away
      useUI.getState().showToast(`AI made ${variants.length} layout${variants.length > 1 ? 's' : ''}: showing the best (${Math.round(Math.max(...variants.map((v) => v.match)) * 100)}% match).`)
    } catch (e) {
      set({ busy: null, error: explainError(e, get().settings.url) })
    }
  },
  cancel: () => { ctl?.abort() },
  apply: (id) => {
    const v = get().variants.find((q) => q.id === id)
    if (!v) return
    useStore.setState({ furniture: v.furniture.map((f) => ({ ...f })), selected: null })
    set({ applied: id })
  },
  clear: () => set({ variants: [], applied: null }),
  pull: async (name) => {
    if (get().pulling) return
    pullCtl = new AbortController()
    set({ pulling: { name, status: 'starting…', pct: null }, modelError: '' })
    try {
      await pullModel(get().settings.url, name, (status, pct) => set({ pulling: { name, status, pct } }), pullCtl.signal)
      useUI.getState().showToast('Installed ' + name)
    } catch (e) { set({ modelError: explainError(e, get().settings.url) }) }
    set({ pulling: null })
    await get().refreshModels()
  },
  cancelPull: () => { pullCtl?.abort() },
  remove: async (name) => {
    set({ modelError: '' })
    try { await deleteModel(get().settings.url, name); useUI.getState().showToast('Deleted ' + name) } catch (e) { set({ modelError: explainError(e, get().settings.url) }) }
    await get().refreshModels()
  },
}))
