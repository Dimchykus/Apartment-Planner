// Optional: ask a local vision model (Ollama) whether each detected opening is a door or a window.
// The model only answers a short list; positions always come from the image analysis.
import type { TraceOpening } from '../lib/library'
import type { AISettings } from './ollama'

export const isVisionModel = (name: string) => /llava|vision|-vl|vl:|minicpm-v|moondream|gemma3|bakllava|granite3.2-vision|llama4/i.test(name)
export const pickVisionModel = (models: string[]) =>
  ['qwen2.5vl', 'qwen3-vl', 'llama3.2-vision', 'gemma3', 'minicpm-v', 'llava'].map((p) => models.find((m) => m.toLowerCase().startsWith(p))).find(Boolean) ?? models.find(isVisionModel)

/** A zoomed square crop around one opening, as base64 JPEG. */
async function crop(img: HTMLImageElement, o: TraceOpening, pxm: number): Promise<string> {
  const half = Math.max(70, 1.2 * o.width * pxm)
  const c = document.createElement('canvas'); c.width = c.height = 384
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, 384, 384)
  g.drawImage(img, o.at[0] - half, o.at[1] - half, half * 2, half * 2, 0, 0, 384, 384)
  return c.toDataURL('image/jpeg', 0.9).split(',')[1]
}

/** Second opinion on door / window per opening (zoomed crop each). Never trust it blindly: small local models lean towards "door". */
export async function aiReviewOpenings(s: AISettings, model: string, url: string, ops: TraceOpening[], pxm: number, onProgress?: (i: number) => void, signal?: AbortSignal): Promise<Record<string, 'door' | 'window'>> {
  const im = new Image(); im.src = url; await im.decode()
  const prompt = 'This is a zoomed crop of an architectural floor plan, centred on an opening in a wall. Is it a DOOR (drawn with a swing arc and/or a leaf line, or a plain gap) or a WINDOW (thin parallel glazing lines inside the wall thickness, no arc)? Answer with one word: door or window.'
  const out: Record<string, 'door' | 'window'> = {}
  for (let i = 0; i < ops.length; i++) {
    onProgress?.(i)
    const t = (await chat(s, model, prompt, await crop(im, ops[i], pxm), 6, signal)).toLowerCase()
    if (t.includes('window')) out[ops[i].id] = 'window'; else if (t.includes('door')) out[ops[i].id] = 'door'
  }
  return out
}

/** One chat call with a picture. No JSON mode: vision models loop forever in it. Plain text out, parsed tolerantly by the callers. */
async function chat(s: AISettings, model: string, prompt: string, img: string, maxTokens: number, signal?: AbortSignal): Promise<string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), s.timeoutSec * 1000)
  signal?.addEventListener('abort', () => ctl.abort())
  try {
    const r = await fetch(s.url.replace(/\/+$/, '') + '/api/chat', {
      method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, think: false, messages: [{ role: 'user', content: prompt, images: [img] }], options: { temperature: 0, num_ctx: 8192, num_predict: maxTokens, repeat_penalty: 1.2 } }),
    })
    if (!r.ok) throw new Error('Ollama answered ' + r.status + ': ' + (await r.text()).slice(0, 200))
    return String((await r.json()).message?.content ?? '')
  } finally { clearTimeout(timer) }
}

// ───────────── the flat's outline ─────────────
/** Ask the model where the flat is on the sheet (plans often show axes, dimensions, titles and neighbouring flats). Returns [x1,y1,x2,y2] in image pixels. */
export async function aiFindFlat(s: AISettings, model: string, url: string, w: number, h: number, signal?: AbortSignal): Promise<[number, number, number, number]> {
  const img0 = new Image(); img0.src = url; await img0.decode()
  const k = Math.min(1, 1024 / Math.max(w, h)) // the model answers in the pixels of the picture it gets
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(img0, 0, 0, c.width, c.height)
  const img = c.toDataURL('image/jpeg', 0.85).split(',')[1]
  const text = await chat(s, model, 'Locate the outer boundary of the apartment in this floor plan: the area enclosed by its exterior walls, without axis lines, dimensions, titles or neighbouring apartments. Output the bbox in JSON.', img, 300, signal)
  const m = text.match(/\[\s*"?(\d+(?:\.\d+)?)"?\s*,\s*"?(\d+(?:\.\d+)?)"?\s*,\s*"?(\d+(?:\.\d+)?)"?\s*,\s*"?(\d+(?:\.\d+)?)"?\s*\]/)
  if (!m) throw new Error('The model did not point out the flat.')
  const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map((v) => Number(v) / k)
  const bx: [number, number, number, number] = [Math.max(0, Math.min(x1, x2)), Math.max(0, Math.min(y1, y2)), Math.min(w, Math.max(x1, x2)), Math.min(h, Math.max(y1, y2))]
  if ((bx[2] - bx[0]) * (bx[3] - bx[1]) < 0.1 * w * h) throw new Error('The model pointed at a very small area.')
  return bx
}
