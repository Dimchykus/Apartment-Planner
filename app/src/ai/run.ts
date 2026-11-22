import { autoFurnish, describeRooms, materializeAI, scoreLayout, analyze, misplaced, balanced, FIXED, type AIItem, type AISpec, type RoomKind } from '../autofurnish'
import { CRITERIA_KEYS, type Criteria } from '../criteria'
import type { Furn, FType } from '../catalog'
import { flat, type Pt, type Wall } from '../plan'
import { chatJSON, parseJSON, type AISettings } from './ollama'
import { SYSTEM_PROMPT, FURNISHABLE, buildRoomPrompt, pickDirection } from './prompt'

export type Variant = {
  id: string; label: string; furniture: Furn[]; match: number; scores: Record<string, number>
  idea: string; log: string[]; ms: number; placed: number; dropped: number; filled: number; blocked: string[]
}

/** How well a layout serves the user's criteria: weighted average of the per-criterion scores, minus penalties. */
export function matchPercent(furn: Furn[], nodes: Record<string, Pt>, custom: Wall[], criteria: Criteria, dropped: number) {
  const sc = scoreLayout(furn, nodes, custom), w = balanced(criteria).eff
  let num = 0, den = 0
  for (const { key } of CRITERIA_KEYS) { num += w[key] * sc[key]; den += w[key] }
  let m = den ? num / den : 0.5
  const a = analyze(furn, nodes, custom)
  m -= 0.06 * a.blocked.length + 0.03 * dropped + 0.05 * furn.filter((f) => misplaced(f, nodes, custom, furn)).length
  return { match: Math.max(0, Math.min(1, m)), scores: sc as unknown as Record<string, number>, blocked: a.blocked }
}

const asItems = (o: unknown): { idea: string; items: AIItem[] } => {
  const d = o as { items?: unknown; idea?: unknown }
  if (!d || !Array.isArray(d.items)) throw new Error('The answer has no "items" list.')
  return { idea: typeof d.idea === 'string' ? d.idea : '', items: d.items as AIItem[] }
}

export type RunOpts = {
  settings: AISettings; nodes: Record<string, Pt>; customWalls: Wall[]; roomKinds: Record<string, RoomKind>
  criteria: Criteria; pins: Partial<Record<FType, Pt>>
  onProgress?: (i: number, n: number, note: string) => void; signal?: AbortSignal
}

/**
 * The rule-based layout only supplies what cannot move (kitchen, bathroom fixtures) and a fallback for forgotten essentials.
 * Every other decision comes from the model: one request per room and variant, so each answer is short and a 7B model stays accurate.
 */
export async function aiFurnish(o: RunOpts): Promise<{ variants: Variant[]; errors: string[] }> {
  const baseline = autoFurnish(o.nodes, o.customWalls, { kinds: o.roomKinds, hints: o.pins, criteria: o.criteria })
  const fixed = baseline.filter((f) => FIXED.includes(f.type))
  const geoms = describeRooms(o.nodes, o.customWalls, o.roomKinds, fixed)
  const todo = geoms.filter((g) => FURNISHABLE.includes(g.kind))
  const variants: Variant[] = [], errors: string[] = []
  for (let i = 0; i < o.settings.variants; i++) {
    const items: AIItem[] = [], ideas: string[] = []
    let ms = 0, ok = true
    const dir = pickDirection(i)
    for (const [k, g] of todo.entries()) {
      o.onProgress?.(i, o.settings.variants, `${g.name} (${k + 1}/${todo.length})`)
      const here = fixed.filter((f) => g.poly.length && pointIn([f.x, f.z], g.poly))
      const user = buildRoomPrompt({ room: g, fixed: here, criteria: o.criteria, hints: flat.hints ?? {}, pins: o.pins, direction: dir })
      let got: { idea: string; items: AIItem[] } | null = null, lastErr = ''
      for (let attempt = 0; attempt < 2 && !got; attempt++) {
        try {
          const r = await chatJSON(o.settings, SYSTEM_PROMPT, attempt ? user + '\n\nIMPORTANT: your previous answer was not valid JSON in the required format. Answer with ONE valid JSON object.' : user, o.signal)
          ms += r.ms
          got = asItems(parseJSON(r.text))
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') throw e
          lastErr = e instanceof Error ? e.message : String(e)
          if (/Failed to fetch|NetworkError|Ollama answered/i.test(lastErr)) throw e // not a content problem: stop
        }
      }
      if (!got) { errors.push(`Variant ${i + 1} / ${g.name}: ${lastErr}`); ok = false; continue }
      for (const it of got.items) items.push({ ...it, room: g.id })
      if (got.idea) ideas.push(got.idea)
    }
    if (!items.length && !ok) continue
    o.onProgress?.(i, o.settings.variants, 'checking the layout…')
    const spec: AISpec = { idea: ideas[0] ?? '', items }
    const res = materializeAI(spec, o.nodes, o.customWalls, fixed, o.roomKinds, baseline, o.settings.fillEssentials, geoms)
    const sc = matchPercent(res.furniture, o.nodes, o.customWalls, o.criteria, res.dropped)
    variants.push({ id: 'v' + Date.now().toString(36) + i, label: 'Variant ' + (variants.length + 1), furniture: res.furniture, match: sc.match, scores: sc.scores, idea: ideas.join(' '), log: res.log, ms, placed: res.placed, dropped: res.dropped, filled: res.filled, blocked: sc.blocked })
  }
  return { variants, errors }
}

function pointIn(p: [number, number], poly: [number, number][]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c }
  return c
}
