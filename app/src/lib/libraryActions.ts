// Everything the UI does with the user's flats: save, rename, duplicate, delete, export, import.
import { FLATS, BUILTIN_IDS } from '../flats'
import { useStore, forgetFlatSave, getFlatSave, putFlatSave, type FlatSave } from '../store'
import { useUI } from '../ui/uiStore'
import type { FlatDef, Opening, Pt, Wall } from '../plan'
import { buildFlat, projectOnSeg, newFlatId, readUserFlats, writeUserFlats, traceFromDef, exportFlatJson, parseFlatJson, type UserFlat } from './library'

export const isUserFlat = (id: string) => !BUILTIN_IDS.has(id)
export const getUserFlat = (id: string) => readUserFlats().find((f) => f.id === id) ?? null

function download(name: string, text: string, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flat'


// ───────────── keeping the user's work when the plan is edited ─────────────
type OpPt = { key: string; kind: 'door' | 'window'; p: Pt }
/** Where every door / window of a flat is (metres) and its key in the saved door states ("wall:index"). */
function openingPoints(def: FlatDef, ov: Record<string, Opening[]> | undefined, extra: Wall[] = [], nodesOv: Record<string, Pt> = {}): OpPt[] {
  const pxm = def.pxPerM, out: OpPt[] = []
  for (const w of [...def.walls, ...extra]) {
    const A = nodesOv[w.a] ?? def.nodes[w.a], B = nodesOv[w.b] ?? def.nodes[w.b]
    if (!A || !B) continue
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
    let list: Opening[] = ov?.[w.id] ?? w.openings ?? []
    if (w.door && !ov?.[w.id] && L >= 1.3 * pxm) list = [{ from: L / 2 - 0.45 * pxm, to: L / 2 + 0.45 * pxm, sill: 0, top: 2.05, kind: 'door' }]
    list.forEach((o, i) => {
      const from = o.end === 'b' ? L - o.to : o.from, to = o.end === 'b' ? L - o.from : o.to, t = (from + to) / 2 / L
      out.push({ key: w.id + ':' + i, kind: o.kind, p: [(A[0] + (B[0] - A[0]) * t) / pxm, (A[1] + (B[1] - A[1]) * t) / pxm] })
    })
  }
  return out
}

/** Carry the saved work of a flat over to its re-traced geometry: furniture and layouts stay (they are in metres), room functions / styles / lights follow their room mark,
 *  door states follow their door. Edits to openings and walls were put into the plan itself (bakeAppEdits), so they are not carried separately. */
function migrateSave(oldDef: FlatDef, sv: FlatSave, newDef: FlatDef): FlatSave {
  const toNew = new Map(newDef.rooms.map((r) => [r.src, r.id]))
  const room = (oldId: string) => { const o = oldDef.rooms.find((r) => r.id === oldId); return o?.src ? toNew.get(o.src) ?? null : null }
  const remap = <T,>(o?: Record<string, T>) => Object.fromEntries(Object.entries(o ?? {}).flatMap(([k, v]) => { const n = room(k); return n ? [[n, v]] : [] }))
  const oldPts = openingPoints(oldDef, sv.openings, sv.customWalls, sv.nodes), newPts = openingPoints(newDef, undefined)
  const doorState: NonNullable<FlatSave['doorState']> = {}
  for (const o of oldPts) {
    const st = sv.doorState?.[o.key]
    if (!st) continue
    let best: OpPt | null = null, bd = 0.6
    for (const n of newPts) { const d = Math.hypot(n.p[0] - o.p[0], n.p[1] - o.p[1]); if (n.kind === o.kind && d < bd) { bd = d; best = n } }
    if (best) doorState[best.key] = st
  }
  return {
    furniture: sv.furniture, versions: sv.versions, activeVer: sv.activeVer, hintOv: sv.hintOv, criteria: sv.criteria, stage: sv.stage,
    roomKinds: remap(sv.roomKinds), roomStyle: remap(sv.roomStyle), doorState,
    lightOv: Object.fromEntries(Object.entries(sv.lightOv ?? {}).flatMap(([k, v]) => { const [r, g] = k.split(':'); const n = room(r); return n ? [[n + ':' + g, v]] : [] })),
  }
}

/** Opening the plan tracer for an existing flat: doors / windows edited in the app, inner walls moved there and walls added there go into the plan,
 *  so the tracer shows what the flat really looks like and saving it does not undo them. */
export function bakeAppEdits(rec: UserFlat): UserFlat {
  const def = FLATS.find((f) => f.id === rec.id), sv = getFlatSave(rec.id)
  if (!def || !sv) return rec
  const t = structuredClone(rec.trace), pxm = def.pxPerM
  const keys = Object.keys(t.nodes)
  for (const [nid, p] of Object.entries(sv.nodes ?? {})) if (def.editable[nid]) { const k = keys[Number(nid.slice(1)) - 1]; if (k) t.nodes[k] = [p[0], p[1]] } // moved inner corners
  const pos = (id: string): Pt | undefined => sv.nodes?.[id] ?? def.nodes[id]
  const extra: Wall[] = sv.customWalls ?? []
  for (const w of extra) { // walls added in the app
    const A = sv.nodes?.[w.a], B = sv.nodes?.[w.b]
    if (!A || !B) continue
    t.nodes[w.a] = [A[0], A[1]]; t.nodes[w.b] = [B[0], B[1]]
    t.walls.push({ id: 'w' + w.id, a: w.a, b: w.b, thick: Math.round((w.thick / pxm) * 100) })
  }
  const all = [...def.walls, ...extra]
  const segOf = (w: Wall): [Pt, Pt] | null => { const A = pos(w.a), B = pos(w.b); return A && B ? [A, B] : null }
  // 1. the plan's own marks on walls the user edited in the app are replaced (decided once, before anything is added)
  const edited = new Set(all.filter((w) => sv.openings?.[w.id]).map((w) => w.id))
  if (edited.size) {
    t.openings = t.openings.filter((o) => {
      let best: { id: string; d: number } | null = null
      for (const q of all) { const s2 = segOf(q); if (!s2) continue; const d = projectOnSeg(o.at, s2[0], s2[1]).d; if (!best || d < best.d) best = { id: q.id, d } }
      return !(best && edited.has(best.id) && best.d <= 0.5 * pxm)
    })
  }
  // 2. what the user made of them
  for (const w of all) {
    const ov = sv.openings?.[w.id], seg = segOf(w)
    if (!ov || !seg) continue
    const [A, B] = seg, L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
    ov.forEach((o, i) => {
      const from = o.end === 'b' ? L - o.to : o.from, to = o.end === 'b' ? L - o.from : o.to, m = (from + to) / 2 / L
      t.openings.push({ id: 'o' + Date.now().toString(36) + w.id + i, at: [A[0] + (B[0] - A[0]) * m, A[1] + (B[1] - A[1]) * m], kind: o.kind, width: (to - from) / pxm, sill: o.sill, top: o.top, ...(o.glass ? { glass: true } : {}) })
    })
  }
  return { ...rec, trace: t }
}

/** Build + store + register a user flat. Returns an error text, or null on success. */
export function saveUserFlat(rec: UserFlat, opts: { switchTo?: boolean; keepLayout?: boolean; migrate?: boolean } = {}): string | null {
  const built = buildFlat(rec)
  if ('error' in built) return built.error
  const oldDef = FLATS.find((f) => f.id === rec.id), oldSv = opts.migrate ? getFlatSave(rec.id) : undefined
  const list = readUserFlats()
  const i = list.findIndex((f) => f.id === rec.id)
  const next = { ...rec, updated: Date.now() }
  if (i >= 0) list[i] = next; else list.push(next)
  const err = writeUserFlats(list)
  if (err) return err
  const j = FLATS.findIndex((f) => f.id === rec.id)
  if (j >= 0) FLATS[j] = built.def; else FLATS.push(built.def)
  if (oldDef && oldSv) putFlatSave(rec.id, migrateSave(oldDef, oldSv, built.def)) // the plan was edited: keep what still applies
  else if (!opts.keepLayout) forgetFlatSave(rec.id) // geometry may have changed: start from a fresh layout
  useUI.getState().bumpFlats()
  if (opts.switchTo) useStore.getState().switchFlat(rec.id)
  return null
}

export function renameUserFlat(id: string, name: string) {
  const rec = getUserFlat(id)
  if (!rec || !name.trim()) return
  const err = saveUserFlat({ ...rec, name: name.trim() }, { keepLayout: true }) // a new name does not change the geometry
  if (err) useUI.getState().showToast(err)
  else if (useStore.getState().flatId === id) { /* the name is shown from FLATS; the layout keeps as is */ }
}

export function deleteUserFlat(id: string) {
  if (!isUserFlat(id)) return
  writeUserFlats(readUserFlats().filter((f) => f.id !== id))
  const j = FLATS.findIndex((f) => f.id === id)
  if (j >= 0) FLATS.splice(j, 1)
  if (useStore.getState().flatId === id) useStore.getState().switchFlat(FLATS[0].id)
  forgetFlatSave(id)
  useUI.getState().bumpFlats()
}

/** Copy any flat (built-in or yours) into "My flats" so it can be edited. The copy is exact: geometry, doors / windows, furniture, layouts, room functions, styles. */
export function duplicateFlat(id: string): string | null {
  const src = FLATS.find((f) => f.id === id)
  if (!src) return null
  const sv = getFlatSave(id) // what was changed after the flat was made (the live flat is saved on every change)
  const mine = getUserFlat(id)
  const newId = newFlatId()
  const rec: UserFlat = mine
    ? { ...structuredClone(mine), id: newId, name: mine.name + ' (copy)', created: Date.now() }
    : { id: newId, name: src.name.replace(/ · .*$/, '') + ' (copy)', created: Date.now(), updated: Date.now(), image: src.image, imgW: src.imgW, imgH: src.imgH, trace: traceFromDef(src, sv) }
  if (sv) {
    if (mine) putFlatSave(newId, sv) // same trace -> same corner / wall / room ids: the saved state fits as it is
    else {
      // built-in source: its edits are baked into the new trace (ids are renumbered), so only what does not depend on ids is carried over
      const room = (oldId: string) => { const i = src.rooms.findIndex((r) => r.id === oldId); return i >= 0 ? 'r' + (i + 1) : null }
      const remap = <T,>(o?: Record<string, T>) => Object.fromEntries(Object.entries(o ?? {}).flatMap(([k, v]) => { const n = room(k); return n ? [[n, v]] : [] }))
      putFlatSave(newId, {
        furniture: sv.furniture, versions: sv.versions, activeVer: sv.activeVer, hintOv: sv.hintOv, criteria: sv.criteria, stage: sv.stage ?? 'design',
        roomKinds: remap(sv.roomKinds), roomStyle: remap(sv.roomStyle),
        lightOv: Object.fromEntries(Object.entries(sv.lightOv ?? {}).flatMap(([k, v]) => { const [r, g] = k.split(':'); const n = room(r); return n ? [[n + ':' + g, v]] : [] })),
      })
    }
  }
  const err = saveUserFlat(rec, { switchTo: true, keepLayout: !!sv })
  if (err) { useUI.getState().showToast(err); return null }
  return rec.id
}

export function exportFlat(id: string) {
  const rec = getUserFlat(id)
  if (!rec) return
  download(slug(rec.name) + '.flat.json', exportFlatJson(rec))
}

export async function importFlatFile(file: File): Promise<void> {
  try {
    const rec = parseFlatJson(await file.text())
    const err = saveUserFlat(rec, { switchTo: true })
    useUI.getState().showToast(err ?? 'Flat imported: ' + rec.name)
  } catch (e) {
    useUI.getState().showToast(e instanceof Error ? e.message : 'Could not read that file.')
  }
}

// ───────── whole-project backup (all flats + all layouts) ─────────
export function exportProject() {
  const data = { kind: 'flat-planner-project', version: 1, userFlats: readUserFlats(), layouts: localStorage.getItem('planner-v2') ?? '{}' }
  download('flat-planner-project.json', JSON.stringify(data))
}
export async function importProject(file: File): Promise<void> {
  try {
    const d = JSON.parse(await file.text())
    if (d?.kind !== 'flat-planner-project') throw new Error('This file is not a Flat Planner project.')
    const existing = readUserFlats()
    const merged = [...existing.filter((e) => !(d.userFlats as UserFlat[]).some((n) => n.id === e.id)), ...(d.userFlats as UserFlat[])]
    const err = writeUserFlats(merged)
    if (err) throw new Error(err)
    localStorage.setItem('planner-v2', d.layouts)
    useUI.getState().showToast('Project imported. Reloading…')
    setTimeout(() => location.reload(), 600)
  } catch (e) {
    useUI.getState().showToast(e instanceof Error ? e.message : 'Could not read that file.')
  }
}
