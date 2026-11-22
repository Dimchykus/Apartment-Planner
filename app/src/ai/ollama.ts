// Minimal Ollama client (runs in the browser; Ollama must allow the page's origin: OLLAMA_ORIGINS).
export type AISettings = { url: string; model: string; auto: boolean; temperature: number; variants: number; fillEssentials: boolean; timeoutSec: number }
export const RECOMMENDED = 'qwen2.5:14b'
export const LIGHT_MODEL = 'qwen2.5:7b'
export const DEFAULT_AI: AISettings = { url: 'http://localhost:11434', model: RECOMMENDED, auto: true, temperature: 0.9, variants: 3, fillEssentials: true, timeoutSec: 300 }

/** Best installed model: the recommended one, then bigger Qwen models, then the light one, then any Qwen, then anything. */
export function pickModel(models: string[]): string {
  const order = [RECOMMENDED, 'qwen2.5:32b', 'qwen3:14b', 'qwen2.5:14b-instruct', LIGHT_MODEL]
  return order.find((m) => models.includes(m)) ?? models.find((m) => /qwen/i.test(m)) ?? models[0] ?? RECOMMENDED
}

const base = (u: string) => u.replace(/\/+$/, '')

export async function listModels(url: string, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(base(url) + '/api/tags', { signal })
  if (!r.ok) throw new Error('Ollama answered ' + r.status)
  const d = await r.json()
  return (d.models ?? []).map((m: { name: string }) => m.name)
}

export function explainError(e: unknown, url: string): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (e instanceof DOMException && e.name === 'AbortError') return 'Stopped.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg))
    return `Can't reach Ollama at ${url}. Make sure Ollama is running. If this app is opened from a file or another address, start Ollama with the environment variable OLLAMA_ORIGINS=* (then restart Ollama).`
  return msg
}

/** One chat completion that must answer with JSON. Different seed / temperature => different layouts. */
export async function chatJSON(s: AISettings, system: string, user: string, signal?: AbortSignal): Promise<{ text: string; ms: number }> {
  const t0 = performance.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), s.timeoutSec * 1000)
  signal?.addEventListener('abort', () => ctl.abort())
  try {
    const r = await fetch(base(s.url) + '/api/chat', {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.model, stream: false, format: 'json', think: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        options: { temperature: s.temperature, top_p: 0.95, seed: Math.floor(Math.random() * 2 ** 31), num_ctx: 12288, num_predict: 3500 },
      }),
    })
    if (!r.ok) throw new Error('Ollama answered ' + r.status + ': ' + (await r.text()).slice(0, 200))
    const d = await r.json()
    return { text: String(d.message?.content ?? ''), ms: performance.now() - t0 }
  } finally { clearTimeout(timer) }
}

/** Pull the JSON object out of an answer (models sometimes wrap it in text or <think> blocks). */
export function parseJSON(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  try { return JSON.parse(t) } catch { /* try to find the object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1))
  throw new Error('The model did not return JSON.')
}

// ───────────────────────── setup check ─────────────────────────
export type Command = { label: string; text: string }
export type SetupStep = { id: 'running' | 'allowed' | 'model' | 'answers'; ok: boolean | null; title: string; detail: string; commands?: Command[]; link?: { text: string; href: string } }
export type Diagnosis = { steps: SetupStep[]; models: string[]; ready: boolean; installed: boolean; running: boolean; version?: string; answerMs?: number }

const os = () => (/Windows/i.test(navigator.userAgent) ? 'win' : /Mac/i.test(navigator.userAgent) ? 'mac' : 'linux') as 'win' | 'mac' | 'linux'
const timeout = (ms: number) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) } }

const corsCommands = (): Command[] => ({
  win: [{ label: 'PowerShell (once), then quit Ollama from the tray icon and start it again', text: 'setx OLLAMA_ORIGINS "*"' }],
  mac: [{ label: 'Terminal (once), then quit and reopen Ollama', text: 'launchctl setenv OLLAMA_ORIGINS "*"' }],
  linux: [{ label: 'Terminal: add the line below under [Service], save, then restart', text: 'sudo systemctl edit ollama' }, { label: 'Line to add', text: '[Service]\nEnvironment="OLLAMA_ORIGINS=*"' }, { label: 'Restart', text: 'sudo systemctl restart ollama' }],
}[os()])

/**
 * Four checks, in order, each with what to do when it fails:
 *  1 Ollama is running  2 this page may talk to it (CORS)  3 the model is installed  4 the model answers.
 * "Running" uses a no-cors request, which succeeds whenever something is listening, even when the browser then blocks the reply:
 * that is how "not running" and "blocked by the browser" are told apart.
 */
export async function diagnose(s: AISettings, opts: { test?: boolean } = {}): Promise<Diagnosis> {
  const steps: SetupStep[] = [
    { id: 'running', ok: null, title: 'Ollama is running', detail: '' },
    { id: 'allowed', ok: null, title: 'This page may use Ollama', detail: '' },
    { id: 'model', ok: null, title: 'Model installed', detail: '' },
    { id: 'answers', ok: null, title: 'Model answers', detail: '' },
  ]
  const out: Diagnosis = { steps, models: [], ready: false, installed: false, running: false }
  const base = s.url.replace(/\/+$/, '')
  // 1 running?
  const t1 = timeout(4000)
  try { await fetch(base + '/api/version', { mode: 'no-cors', signal: t1.signal }); steps[0].ok = true; steps[0].detail = 'Found Ollama at ' + s.url; out.running = true } catch {
    steps[0].ok = false
    steps[0].detail = "Nothing answers at " + s.url + ". Ollama is either not installed or not running."
    steps[0].commands = [{ label: 'Already installed? Start it (a llama icon appears in the tray / menu bar) or run', text: 'ollama serve' }]
    steps[0].link = { text: 'Install Ollama (free)', href: 'https://ollama.com/download' }
    return out
  } finally { t1.done() }
  // 2 allowed?
  const t2 = timeout(4000)
  try {
    const r = await fetch(base + '/api/version', { signal: t2.signal }); const v = await r.json().catch(() => ({}))
    out.version = v.version; steps[1].ok = true; steps[1].detail = v.version ? 'Ollama ' + v.version : 'OK'
  } catch {
    steps[1].ok = false
    steps[1].detail = "Ollama is running, but the browser is not allowed to talk to it from this page (" + (location.origin === 'null' ? 'a file opened from your disk' : location.origin) + "). Ollama only trusts pages on the same computer's localhost by default. Allow all pages once and restart Ollama:"
    steps[1].commands = corsCommands()
    return out
  } finally { t2.done() }
  // 3 installed?
  const t3 = timeout(6000)
  try {
    const r = await fetch(base + '/api/tags', { signal: t3.signal })
    out.models = ((await r.json()).models ?? []).map((m: { name: string }) => m.name)
  } catch { /* leave empty */ } finally { t3.done() }
  out.installed = out.models.includes(s.model)
  if (out.installed) { steps[2].ok = true; steps[2].detail = s.model + (s.model === RECOMMENDED ? ' (recommended)' : s.model === LIGHT_MODEL ? ' (light: a bigger one plans better)' : '') }
  else {
    steps[2].ok = false
    steps[2].detail = out.models.length ? `"${s.model}" is not installed. Installed: ${out.models.join(', ')}. Install the recommended model (about 9 GB download, needs about 12 GB of free memory) or pick one of yours above.` : 'No model is installed yet. Install the recommended one (about 9 GB download, needs about 12 GB of free memory):'
    steps[2].commands = [{ label: 'Recommended', text: 'ollama pull ' + RECOMMENDED }, { label: 'Light version for computers with 8 GB of memory (about 5 GB)', text: 'ollama pull ' + LIGHT_MODEL }]
    return out
  }
  // 4 answers?
  if (!opts.test) { steps[3].ok = null; steps[3].detail = 'Not tested yet'; out.ready = true; return out }
  const t4 = timeout(180000), t0 = performance.now()
  try {
    const r = await fetch(base + '/api/chat', { method: 'POST', signal: t4.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: s.model, stream: false, think: false, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], options: { num_predict: 6, temperature: 0 } }) })
    if (!r.ok) throw new Error((await r.text()).slice(0, 200))
    out.answerMs = performance.now() - t0; steps[3].ok = true; steps[3].detail = 'Answered in ' + (out.answerMs / 1000).toFixed(1) + ' s (includes loading the model)'; out.ready = true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps[3].ok = false
    steps[3].detail = /memory|alloc|oom/i.test(msg) ? 'The computer ran out of memory loading ' + s.model + '. Close other programs or use the light model.' : /abort/i.test(msg) ? 'No answer after 3 minutes. The model may be too big for this computer: try the light model.' : 'The model did not answer: ' + msg
    steps[3].commands = [{ label: 'Try the light model', text: 'ollama pull ' + LIGHT_MODEL }]
  } finally { t4.done() }
  return out
}
