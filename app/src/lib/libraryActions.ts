// Everything the UI does with the user's flats: save, rename, duplicate, delete, export, import.
import { FLATS, BUILTIN_IDS } from '../flats'
import { useStore, forgetFlatSave, getFlatSave, putFlatSave } from '../store'
import { useUI } from '../ui/uiStore'
import { buildFlat, newFlatId, readUserFlats, writeUserFlats, traceFromDef, exportFlatJson, parseFlatJson, type UserFlat } from './library'

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

/** Build + store + register a user flat. Returns an error text, or null on success. */
export function saveUserFlat(rec: UserFlat, opts: { switchTo?: boolean; keepLayout?: boolean } = {}): string | null {
  const built = buildFlat(rec)
  if ('error' in built) return built.error
  const list = readUserFlats()
  const i = list.findIndex((f) => f.id === rec.id)
  const next = { ...rec, updated: Date.now() }
  if (i >= 0) list[i] = next; else list.push(next)
  const err = writeUserFlats(list)
  if (err) return err
  const j = FLATS.findIndex((f) => f.id === rec.id)
  if (j >= 0) FLATS[j] = built.def; else FLATS.push(built.def)
  if (!opts.keepLayout) forgetFlatSave(rec.id) // geometry may have changed: start from a fresh layout
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
