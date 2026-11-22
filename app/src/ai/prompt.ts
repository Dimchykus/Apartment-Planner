import { CATALOG, type FType, type Furn } from '../catalog'
import type { Criteria } from '../criteria'
import { AI_ALLOWED, type RoomGeom, type RoomKind } from '../autofurnish'
import { PX_PER_M, type Pt } from '../plan'

export const FURNISHABLE: RoomKind[] = ['open', 'living', 'kitchen', 'bedroom', 'office', 'storage']

const KIND_TEXT: Record<RoomKind, string> = {
  open: 'open-plan kitchen + living + dining room (the kitchen run is fixed and already placed: you furnish the living and dining part)',
  living: 'living room', kitchen: 'kitchen (the kitchen run is already placed: add a dining table)', bedroom: 'bedroom',
  bath: 'bathroom', office: 'home office / study', storage: 'storage room / loggia', none: 'room without a function',
}
const GUIDE: Partial<Record<RoomKind, string>> = {
  open: 'Sofa and TV face each other across the living part (TV on a span on the opposite side from the sofa, or a wall TV). Put the dining table on an open spot near the kitchen run. Do not block the paths between the doors.',
  living: 'Sofa and TV face each other across the room (TV on a span opposite the sofa). Armchair and coffee table make a seating group.',
  kitchen: 'The dining table goes on an open spot close to the kitchen run.',
  bedroom: 'The bed stands with its HEAD against a wall and free floor at its foot, ideally not under a window. The wardrobe goes on a different wall. Nightstands come with the bed.',
  office: 'The desk goes on a span, ideally near a window; a chair comes with it automatically.',
  storage: 'Use the walls for storage: bookcases and shelves.',
}
const TALL: FType[] = ['wardrobe', 'bookcase', 'shoeCabinet', 'tvUnit']

/** What each criterion means for a layout, in words a language model follows. */
export function criteriaText(c: Criteria): string {
  const tier = (v: number) => (v >= 0.8 ? 'TOP PRIORITY' : v >= 0.55 ? 'important' : 'nice to have')
  const rule = {
    plan: "Stay close to where the developer's plan draws each item (listed below if known).",
    space: 'Keep as much FREE FLOOR as possible: everything against walls and in corners, choose the SMALLER sizes (sofa 1.6–1.8 m, bed 1.4 m, table 1.0–1.2 m), no coffee table, no armchair.',
    comfort: 'Use the LARGER sizes (sofa 2.2–2.6 m, bed 1.6–1.8 m, dining table 1.6 m or more), add an armchair and a coffee table, leave room in front of everything.',
    light: 'Nothing tall in front of a window. Desk and dining table next to a window.',
    storage: 'Maximise storage: the widest wardrobe that fits (2.4–3 m), a second wardrobe or bookcases, a chest of drawers in the bedroom.',
    privacy: 'The bed on the wall farthest from the entrance, out of sight from the entrance door.',
    office: 'Add a work desk (with chair) in the room with the best daylight, away from the kitchen.',
    utilization: 'Use EVERY free stretch of wall for something useful (shoe cabinet by the entrance, bookcases, chest of drawers, armchair), but keep a 60 cm walking path between the doors.',
  }
  const lines = (Object.keys(rule) as (keyof Criteria)[]).filter((k) => c[k] >= 0.3).sort((a, b) => c[b] - c[a]).map((k) => `- [${tier(c[k])}, ${Math.round(c[k] * 100)}%] ${rule[k]}`)
  const conflicts = []
  if (c.space >= 0.5 && c.comfort >= 0.5) conflicts.push('FREE FLOOR and COMFORT conflict: use middle sizes.')
  if (c.plan >= 0.6 && (c.light >= 0.8 || c.privacy >= 0.8)) conflicts.push('If the plan position breaks LIGHT or PRIVACY, the criterion with the higher percentage wins.')
  return (lines.join('\n') || '- No special wishes: a sensible, balanced layout.') + (conflicts.length ? '\nConflicts: ' + conflicts.join(' ') : '')
}

const DIRECTIONS = [
  'Design idea for this variant: the most obvious, classical arrangement.',
  'Design idea for this variant: put the large pieces on the longest free walls and keep the middle of the room open.',
  'Design idea for this variant: use the less obvious wall for the main piece (bed or sofa), e.g. the opposite side from where most people would put it.',
  'Design idea for this variant: group things into a cosy zone (sofa + armchair + coffee table; bed + wardrobe close together).',
  'Design idea for this variant: put the dining table or desk next to a window and arrange the rest around it.',
  'Design idea for this variant: symmetrical and tidy: centre the bed / sofa on its wall.',
]
export const pickDirection = (i: number) => DIRECTIONS[(i + Math.floor(Math.random() * DIRECTIONS.length)) % DIRECTIONS.length]

export const SYSTEM_PROMPT = `You are an experienced interior designer. You furnish ONE room of a flat from an exact plan.
Answer ONLY with one JSON object. No text around it.

You choose WHERE each piece of furniture goes, using the places listed for the room:
- WALL SPANS (S1, S2 …): stretches of wall where an item can stand with its back to the wall. Each span has a length. An item's width must fit inside the span; two items can share a span only if their widths add up to less than its length (put one at "start" and the other at "end").
  Tall items (wardrobe, bookcase, shoeCabinet, tvUnit) may only stand in a span that has a "tall OK" range. Low items (bed, sofa, desk, dresser, armchair) may use any span.
- OPEN SPOTS (P1, P2 …): free floor for free-standing items (diningTable, armchair, coffeeTable). The number is the free radius around the spot in metres.

JSON format (the ids below are only an example of the format, use the real ones of this room):
{"idea":"one short sentence","items":[
 {"type":"<item>","span":"S<n>","place":"start|center|end","w":<width in metres>},
 {"type":"diningTable","spot":"P<n>","turn":0,"w":1.4,"chairs":4}
]}
Extra fields: bed -> "nightstands":2 ; sofa -> "coffeeTable":true ; tv/shelf -> "y":<height>.
Do not output chairs or nightstands (they come with the table / bed). One bed, one sofa, one dining table at most.`

const r2 = (n: number) => +n.toFixed(2)
const fmtRange = (a: [number, number][]) => (a.length ? a.map(([p, q]) => `${p.toFixed(2)}–${q.toFixed(2)}`).join(' and ') : 'none')

export function buildRoomPrompt(p: { room: RoomGeom; fixed: Furn[]; criteria: Criteria; hints: Partial<Record<FType, Pt>>; pins: Partial<Record<FType, Pt>>; direction: string }): string {
  const r = p.room, c = p.criteria
  const L: string[] = []
  L.push(`ROOM ${r.id} "${r.name}", ${r.area} m². Function: ${KIND_TEXT[r.kind]}.`)
  const req = { open: 'sofa, TV unit (or wall tv), dining table', living: 'sofa, TV unit (or wall tv)', kitchen: 'dining table', bedroom: 'bed, wardrobe', office: 'desk', storage: 'bookcase', bath: '', none: '' }[r.kind]
  if (req) L.push(`MUST contain: ${req}.`)
  const opt: string[] = []
  if (['open', 'living'].includes(r.kind)) { if (c.comfort >= 0.3 || c.utilization >= 0.3) opt.push('armchair'); if (!(c.space >= 0.6 && c.comfort < 0.4)) opt.push('coffeeTable (with the sofa)'); if (c.utilization >= 0.3) opt.push('shoeCabinet near the entrance'); if (c.storage >= 0.3 || c.utilization >= 0.3) opt.push('bookcase'); if (c.office >= 0.4) opt.push('desk') }
  if (r.kind === 'bedroom') { if (c.storage >= 0.3 || c.utilization >= 0.3) opt.push('dresser', 'second wardrobe or bookcase'); if (c.office >= 0.4) opt.push('desk') }
  opt.push('shelf (wall-mounted, y 1.4–1.9, above a sofa or bed)')
  L.push(`Optional (add what fits the wishes below): ${opt.join(', ')}.`)
  L.push('Allowed item types here: ' + AI_ALLOWED[r.kind].join(', ') + '.')
  if (GUIDE[r.kind]) L.push('Guidance: ' + GUIDE[r.kind])
  L.push(`Room outline x ${r2(Math.min(...r.poly.map((q) => q[0])))}–${r2(Math.max(...r.poly.map((q) => q[0])))}, z ${r2(Math.min(...r.poly.map((q) => q[1])))}–${r2(Math.max(...r.poly.map((q) => q[1])))} (x east, z south).`)

  L.push('\nWALL SPANS:')
  for (const s of r.spans) {
    const e = r.edges[s.wall]
    const tall = TALL.length ? fmtRange(s.tall.map(([a, b]) => [a - s.from, b - s.from] as [number, number])) : ''
    L.push(`  ${s.id}: length ${s.len} m, faces ${s.faces}, tall OK ${tall === 'none' ? 'none' : 'at ' + tall + ' m from the span start'}${s.windowNear ? ', window in this wall' : ''}${s.doorNear ? ', a door is close' : ''}${e.doors.length && false ? '' : ''}`)
  }
  if (!r.spans.length) L.push('  (none)')
  L.push('\nOPEN SPOTS:')
  for (const s of r.spots) L.push(`  ${s.id}: free radius ${s.free} m, at (${s.x}, ${s.z})`)
  if (!r.spots.length) L.push('  (none: no free-standing items here)')
  const mine = p.fixed
  if (mine.length) L.push('\nALREADY IN THIS ROOM (fixed, keep clear): ' + mine.map((f) => f.type).join(', '))

  const pin = Object.entries(p.pins).filter(([, pt]) => pt && r.poly.length && inside(pt as Pt, r.poly))
  if (pin.length) L.push('\nUSER PINS (mandatory: use the span or spot closest to the point): ' + pin.map(([t, pt]) => `${t} near (${r2(pt![0] / PX_PER_M)}, ${r2(pt![1] / PX_PER_M)})`).join('; '))
  const hint = Object.entries(p.hints).filter(([t, pt]) => !(t in p.pins) && pt && inside(pt as Pt, r.poly) && ['sofa', 'tvUnit', 'bed', 'wardrobe', 'diningTable', 'desk'].includes(t))
  if (hint.length && c.plan >= 0.3) L.push("\nThe developer's plan shows: " + hint.map(([t, pt]) => `${t} around (${r2(pt![0] / PX_PER_M)}, ${r2(pt![1] / PX_PER_M)})`).join('; '))
  L.push('\nSTANDARD WIDTHS (m): ' + (['sofa', 'armchair', 'tvUnit', 'bed', 'wardrobe', 'desk', 'bookcase', 'dresser', 'shoeCabinet', 'diningTable', 'coffeeTable'] as FType[]).map((t) => `${t} ${CATALOG[t].w}`).join(', ') + '.')
  L.push('\nWISHES OF THE OWNER (in order of importance):\n' + criteriaText(c))
  L.push('\n' + p.direction)
  L.push('\nOutput the JSON for this room.')
  return L.join('\n')
}

function inside(pt: Pt, poly: [number, number][]) {
  const x = pt[0] / PX_PER_M, z = pt[1] / PX_PER_M
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > z !== yj > z && x < ((xj - xi) * (z - yi)) / (yj - yi) + xi) c = !c }
  return c
}
