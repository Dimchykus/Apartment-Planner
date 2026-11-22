import { create } from 'zustand'
import { rooms, walls as baseWalls, constrainNode, snapPoint, PX_PER_M, activateFlat, m, initialNodes, openingsOf, setOpeningOv, type Pt, type Wall, type Opening } from './plan'
import { FLATS } from './flats'
import { autoFurnish, inRoom, fitFurn, misplaced, misplacedReason, allowedKinds, type RoomKind } from './autofurnish'
import { DEFAULT_CRITERIA, type Criteria } from './criteria'
import { CATALOG, type FType, type Furn } from './catalog'
import type { FloorId } from './materials'
import { autoElectrics, lightKey, type Light, type Switch, type LightGroup } from './wiring'
import { OPENING_PRESETS, fitOpening, type PresetId } from './openingTools'
import { useUI } from './ui/uiStore'

export { CATALOG }
export type { FType, Furn }

export type Mode = 'view' | 'walk' | 'fly' | 'walls' | 'furniture' | 'move' | 'dims' | 'rooms' | 'style' | 'openings'
export type DoorSt = { state: 0 | 1 | 2; hinge?: 'a' | 'b'; swing?: 1 | -1 } // 0 closed, 1 half open, 2 open
export type RoomStyle = { wall?: string; floor?: FloorId }
export type Tool = 'move' | 'add'

const f = (id: string, type: FType, x: number, z: number, rot = 0): Furn => ({ id, type, x, z, rot })
/** Everything Ctrl+Z can bring back. */
export type Snap = { nodes: Record<string, Pt>; customWalls: Wall[]; furniture: Furn[]; roomKinds: Record<string, RoomKind>; hintOv: Partial<Record<FType, Pt>>; criteria: Criteria; openings: Record<string, Opening[]>; doorState: Record<string, DoorSt>; roomStyle: Record<string, RoomStyle> }

type State = {
  openings: Record<string, Opening[]>            // openings the user changed, per wall id
  doorState: Record<string, DoorSt>              // key: wallId:index
  roomStyle: Record<string, RoomStyle>           // per room id; 'outside' = exterior walls
  lights: Light[]
  switches: Switch[]
  lightOv: Record<string, boolean>               // roomId:group -> on / off (absent = automatic by time of day)
  selOpening: { wall: string; i: number } | null
  openingTool: 'select' | 'add'
  openingPreset: PresetId
  setDoor: (key: string, p: Partial<DoorSt>) => void
  setAllDoors: (state: 0 | 1 | 2) => void
  setRoomStyle: (room: string, p: Partial<RoomStyle>) => void
  styleAll: (p: Partial<RoomStyle>) => void
  selectOpening: (o: { wall: string; i: number } | null) => void
  setOpeningTool: (t: 'select' | 'add') => void
  setOpeningPreset: (p: PresetId) => void
  addOpening: (wall: string, atPx: number, preset?: PresetId) => boolean
  editOpening: (wall: string, i: number, p: { width?: number; sill?: number; top?: number; centre?: number; kind?: 'window' | 'door'; glass?: boolean }) => void
  removeOpening: (wall: string, i: number) => void
  toggleLight: (room: string, group: LightGroup) => void
  setLightsAll: (on: boolean | undefined) => void
  regenElectrics: () => void
  past: Snap[]
  future: Snap[]
  undo: () => void
  redo: () => void
  flatId: string
  switchFlat: (id: string) => void
  roomKinds: Record<string, RoomKind>
  criteria: Criteria
  setCriteria: (c: Criteria) => void
  hintOv: Partial<Record<FType, Pt>>
  selRoom: string | null
  notice: string | null
  setNotice: (n: string | null) => void
  placing: FType | null
  selectRoom: (id: string | null) => void
  setRoomKind: (id: string, k: RoomKind) => void
  furnishRoom: (id: string) => void
  startPlacing: (t: FType | null) => void
  setHint: (t: FType, p: Pt | null) => void
  clearHints: () => void
  nodes: Record<string, Pt>
  furniture: Furn[]
  mode: Mode
  selected: string | null
  customWalls: Wall[]
  tool: Tool
  drawStart: Pt | null
  cursor: Pt | null
  newThick: number // cm
  newDoor: boolean
  drag: { kind: 'node' | 'furn' | 'wall'; id: string; dx: number; dz: number } | null
  setMode: (m: Mode) => void
  select: (id: string | null) => void
  setDrag: (d: State['drag']) => void
  setTool: (t: Tool) => void
  setDrawStart: (p: Pt | null) => void
  setCursor: (p: Pt | null) => void
  setNew: (p: { newThick?: number; newDoor?: boolean }) => void
  addWall: (a: Pt, b: Pt) => void
  removeWall: (id: string) => void
  patchWall: (id: string, p: Partial<Wall>) => void
  moveWall: (id: string, mx: number, mz: number) => void
  moveNode: (id: string, x: number, z: number) => void
  moveFurn: (id: string, x: number, z: number) => void
  patchFurn: (id: string, p: Partial<Furn>) => void
  addFurn: (t: FType) => void
  removeFurn: (id: string) => void
  resetWalls: () => void
  autoFurnish: () => void
  topView: number
  goTop: () => void
  clearFurniture: () => void
  fitOne: (id: string) => boolean
  fixAll: () => number
}

const KEY = 'planner-v2'
type FlatSave = { nodes?: Record<string, Pt>; furniture?: Furn[]; customWalls?: Wall[]; roomKinds?: Record<string, RoomKind>; hintOv?: Partial<Record<FType, Pt>>; criteria?: Criteria; openings?: Record<string, Opening[]>; doorState?: Record<string, DoorSt>; roomStyle?: Record<string, RoomStyle>; lightOv?: Record<string, boolean> }
type Save = { current?: string; flats?: Record<string, FlatSave> }

function loadSave(): Save {
  try {
    if (location.hash.startsWith('#s=')) {
      const d = JSON.parse(decodeURIComponent(atob(location.hash.slice(3))))
      if (d.flatId) return { current: d.flatId, flats: { [d.flatId]: d } }
    }
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
const save: Save = loadSave()
save.flats ??= {}

/** State of one flat: original shell + saved edits (outer walls are locked, so saved positions of locked nodes are ignored). */
function flatState(id: string) {
  const def = FLATS.find((q) => q.id === id) ?? FLATS[0]
  activateFlat(def)
  const sv = save.flats?.[def.id] ?? {}
  const nodes: Record<string, Pt> = structuredClone(def.nodes)
  const customWalls: Wall[] = sv.customWalls ?? []
  for (const k of Object.keys(def.editable)) if (sv.nodes?.[k]) nodes[k] = sv.nodes[k]
  for (const w of customWalls) for (const k of [w.a, w.b]) if (sv.nodes?.[k]) nodes[k] = sv.nodes[k]
  const roomKinds = sv.roomKinds ?? {}, hintOv = sv.hintOv ?? {}, criteria = { ...DEFAULT_CRITERIA, ...(sv.criteria ?? {}) }
  const openings = sv.openings ?? {}, doorState = sv.doorState ?? {}, roomStyle = sv.roomStyle ?? {}, lightOv = sv.lightOv ?? {}
  setOpeningOv(openings) // before furnishing: furniture keeps clear of the (edited) windows and doors
  const furniture = sv.furniture ?? autoFurnish(nodes, customWalls, { kinds: roomKinds, hints: hintOv, criteria })
  const el = autoElectrics(nodes, customWalls, furniture, roomKinds, (k) => doorState[k] ?? {})
  return { flatId: def.id, nodes, customWalls, roomKinds, hintOv, criteria, furniture, openings, doorState, roomStyle, lightOv, lights: el.lights, switches: el.switches, selOpening: null as { wall: string; i: number } | null }
}
const start = flatState(save.current ?? FLATS[0].id)

export const useStore = create<State>((set) => ({
  ...start,
  openingTool: 'select',
  openingPreset: 'window',
  setDoor: (key, p) => set((s) => ({ doorState: { ...s.doorState, [key]: { ...(s.doorState[key] ?? { state: 1 as const }), ...p } } })),
  setAllDoors: (state) => set((s) => {
    const next = { ...s.doorState }
    for (const w of [...baseWalls, ...s.customWalls]) for (const o of openingsOf(w, s.nodes)) if (o.kind === 'door') { const k = w.id + ':' + (o.i ?? 0); next[k] = { ...next[k], state } }
    return { doorState: next }
  }),
  setRoomStyle: (room, p) => set((s) => ({ roomStyle: { ...s.roomStyle, [room]: { ...s.roomStyle[room], ...p } } })),
  styleAll: (p) => set((s) => { const next = { ...s.roomStyle }; for (const r of rooms) next[r.id] = { ...next[r.id], ...p }; return { roomStyle: next } }),
  selectOpening: (selOpening) => set({ selOpening }),
  setOpeningTool: (openingTool) => set({ openingTool }),
  setOpeningPreset: (openingPreset) => set({ openingPreset }),
  addOpening: (wall, atPx, preset) => {
    const s = useStore.getState(), w = [...baseWalls, ...s.customWalls].find((q) => q.id === wall)
    const pr = OPENING_PRESETS.find((q) => q.id === (preset ?? s.openingPreset))
    if (!w || !pr) return false
    const A = s.nodes[w.a], B = s.nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1])
    const cur = openingsOf(w, s.nodes).map((o) => { const c = { ...o }; delete c.i; return c as Opening })
    const width = (pr.width === 'wall' ? (L - 0.3 * PX_PER_M) / PX_PER_M : pr.width) * PX_PER_M
    const fit = fitOpening(L, PX_PER_M, cur, { from: atPx - width / 2, to: atPx + width / 2 }, null)
    if (!fit) { useUI.getState().showToast('There is no room for that on this wall piece.'); return false }
    const o: Opening = { from: fit.from, to: fit.to, sill: pr.sill, top: pr.top, kind: pr.kind, ...(pr.glass ? { glass: true } : {}) }
    set({ openings: { ...s.openings, [wall]: [...cur, o] }, selOpening: { wall, i: cur.length } })
    useStore.getState().regenElectrics()
    return true
  },
  editOpening: (wall, i, p) => {
    const s = useStore.getState(), w = [...baseWalls, ...s.customWalls].find((q) => q.id === wall)
    if (!w) return
    const A = s.nodes[w.a], B = s.nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1])
    const cur = openingsOf(w, s.nodes).map((o) => { const c = { ...o }; delete c.i; return c as Opening })
    const o = cur[i]
    if (!o) return
    const width = p.width !== undefined ? p.width * PX_PER_M : o.to - o.from
    const centre = p.centre !== undefined ? p.centre * PX_PER_M : (o.from + o.to) / 2
    const fit = fitOpening(L, PX_PER_M, cur, { from: centre - width / 2, to: centre + width / 2 }, i)
    if (!fit) return
    let sill = p.sill ?? o.sill, top = p.top ?? o.top
    top = Math.min(2.65, Math.max(top, sill + 0.3)); sill = Math.max(0, Math.min(sill, top - 0.3))
    const next = [...cur]; next[i] = { ...o, ...fit, sill, top, ...(p.kind ? { kind: p.kind } : {}), ...(p.glass !== undefined ? { glass: p.glass } : {}) }
    set({ openings: { ...s.openings, [wall]: next } })
    useStore.getState().regenElectrics()
  },
  removeOpening: (wall, i) => {
    const s = useStore.getState(), w = [...baseWalls, ...s.customWalls].find((q) => q.id === wall)
    if (!w) return
    const cur = openingsOf(w, s.nodes).map((o) => { const c = { ...o }; delete c.i; return c as Opening })
    cur.splice(i, 1)
    set({ openings: { ...s.openings, [wall]: cur }, selOpening: null })
    useStore.getState().regenElectrics()
  },
  toggleLight: (room, group) => set((s) => {
    const env = useUI.getState().env, auto = env === 'night' || env === 'sunset'
    const k = lightKey(room, group)
    return { lightOv: { ...s.lightOv, [k]: !(s.lightOv[k] ?? auto) } }
  }),
  setLightsAll: (on) => set((s) => { if (on === undefined) return { lightOv: {} }; const next: Record<string, boolean> = {}; for (const l of s.lights) next[lightKey(l.room, l.group)] = on; return { lightOv: next } }),
  regenElectrics: () => set((s) => { const el = autoElectrics(s.nodes, s.customWalls, s.furniture, s.roomKinds, (k) => s.doorState[k] ?? {}); return { lights: el.lights, switches: el.switches } }),
  past: [],
  future: [],
  undo: () => {
    const st = useStore.getState(), p = st.past[st.past.length - 1]
    if (!p) return
    applying = true
    set({ ...p, past: st.past.slice(0, -1), future: [...st.future, snapOf(st)], selected: null, drag: null, selOpening: null })
    setOpeningOv(p.openings); useStore.getState().regenElectrics()
    applying = false; lastPush = 0
  },
  redo: () => {
    const st = useStore.getState(), n = st.future[st.future.length - 1]
    if (!n) return
    applying = true
    set({ ...n, future: st.future.slice(0, -1), past: [...st.past, snapOf(st)], selected: null, drag: null, selOpening: null })
    setOpeningOv(n.openings); useStore.getState().regenElectrics()
    applying = false; lastPush = 0
  },
  switchFlat: (id) => {
    const s0 = useStore.getState()
    if (s0.flatId !== id) save.flats![s0.flatId] = { nodes: s0.nodes, furniture: s0.furniture, customWalls: s0.customWalls, roomKinds: s0.roomKinds, hintOv: s0.hintOv, criteria: s0.criteria, openings: s0.openings, doorState: s0.doorState, roomStyle: s0.roomStyle, lightOv: s0.lightOv }
    set({ ...flatState(id), past: [], future: [], mode: 'view', selected: null, selRoom: null, placing: null, tool: 'move', drawStart: null, drag: null })
  },
  selRoom: null,
  notice: null,
  setNotice: (notice) => set({ notice }),
  placing: null,
  selectRoom: (selRoom) => set({ selRoom, placing: null }),
  setCriteria: (criteria) => {
    set({ criteria })
    if (useUI.getState().rulesOnCriteria) useStore.getState().autoFurnish() // optional: instant offline re-furnish; by default the AI button applies the new wishes
  },
  setRoomKind: (id, k) => {
    const room = rooms.find((r) => r.id === id), allowed = room && allowedKinds(room, useStore.getState().nodes)
    if (allowed && !allowed.includes(k)) return // kitchen zone and bathroom are fixed by the building's plumbing
    set((s) => ({ roomKinds: { ...s.roomKinds, [id]: k } }))
    useStore.getState().furnishRoom(id) // switching a room's function re-furnishes it right away
  },
  furnishRoom: (id) => set((s) => {
    const items = autoFurnish(s.nodes, s.customWalls, { kinds: s.roomKinds, hints: s.hintOv, only: id, criteria: s.criteria })
    return { furniture: [...s.furniture.filter((f) => !inRoom(f, id, s.nodes)), ...items], selected: null }
  }),
  startPlacing: (placing) => set({ placing }),
  setHint: (t, p) => {
    set((s) => {
      const hintOv = { ...s.hintOv }
      if (p) hintOv[t] = p; else delete hintOv[t]
      return { hintOv, placing: null }
    })
    const before = useStore.getState().furniture
    useStore.getState().autoFurnish() // the layout follows the pin right away
    // tell the user what the pin cost the neighbours
    const after = useStore.getState().furniture
    const count = (l: Furn[]) => l.reduce<Record<string, number>>((m, f) => { m[f.type] = (m[f.type] ?? 0) + 1; return m }, {})
    const b = count(before), a = count(after), lost: string[] = [], gained: string[] = []
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (k === t || k === 'chair') continue
      const d = (a[k] ?? 0) - (b[k] ?? 0)
      if (d < 0) lost.push(CATALOG[k as FType].label.toLowerCase() + (d < -1 ? ' ×' + -d : ''))
      else if (d > 0) gained.push(CATALOG[k as FType].label.toLowerCase() + (d > 1 ? ' ×' + d : ''))
    }
    const parts = [p ? CATALOG[t].label + ' pinned: the other items were re-arranged around it.' : CATALOG[t].label + ' pin removed.']
    if (lost.length) parts.push('No room left for: ' + lost.join(', ') + '.')
    if (gained.length) parts.push('Now also fits: ' + gained.join(', ') + '.')
    useStore.getState().setNotice(parts.join(' '))
  },
  clearHints: () => { set({ hintOv: {}, placing: null, notice: null }); useStore.getState().autoFurnish() },
  tool: 'move',
  drawStart: null,
  cursor: null,
  newThick: 10,
  newDoor: false,
  mode: 'view',
  selected: null,
  drag: null,
  setMode: (mode) => set({ mode, selected: null, selRoom: null, placing: null, tool: 'move', drawStart: null }),
  setTool: (tool) => set({ tool, drawStart: null, cursor: null, selected: null }),
  setDrawStart: (drawStart) => set({ drawStart }),
  setCursor: (cursor) => set({ cursor }),
  setNew: (p) => set(p),
  addWall: (a, b) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.3 * PX_PER_M) return
    const id = 'c' + Math.random().toString(36).slice(2, 7)
    set((s) => ({
      nodes: { ...s.nodes, [id + 'a']: a, [id + 'b']: b },
      customWalls: [...s.customWalls, { id, a: id + 'a', b: id + 'b', thick: (s.newThick / 100) * PX_PER_M, door: s.newDoor, custom: true }],
      drawStart: null, selected: id + 'a',
    }))
  },
  removeWall: (id) => set((s) => {
    const w = s.customWalls.find((q) => q.id === id)
    if (!w) return {}
    const nodes = { ...s.nodes }; delete nodes[w.a]; delete nodes[w.b]
    return { nodes, customWalls: s.customWalls.filter((q) => q.id !== id), selected: null }
  }),
  patchWall: (id, p) => set((s) => ({ customWalls: s.customWalls.map((q) => (q.id === id ? { ...q, ...p } : q)) })),
  moveWall: (id, mx, mz) => set((s) => {
    const w = s.customWalls.find((q) => q.id === id)
    if (!w) return {}
    const [ax, ay] = s.nodes[w.a], [bx, by] = s.nodes[w.b]
    const dx = mx * PX_PER_M - (ax + bx) / 2, dy = mz * PX_PER_M - (ay + by) / 2
    return { nodes: { ...s.nodes, [w.a]: [ax + dx, ay + dy], [w.b]: [bx + dx, by + dy] } }
  }),
  select: (selected) => set({ selected }),
  setDrag: (drag) => set({ drag }),
  moveNode: (id, x, z) => set((s) => {
    if (id[0] === 'c') {
      const all = [...baseWalls, ...s.customWalls]
      const p = snapPoint(x * PX_PER_M, z * PX_PER_M, s.nodes, all, [id, id.slice(0, -1)])
      return { nodes: { ...s.nodes, [id]: p } }
    }
    const p = constrainNode(id, x * PX_PER_M, z * PX_PER_M, s.nodes)
    return p ? { nodes: { ...s.nodes, [id]: p } } : {}
  }),
  // items that belong to a leader (chairs -> table, nightstand -> bed ...) travel with it
  moveFurn: (id, x, z) => set((s) => {
    const f = s.furniture.find((q) => q.id === id)
    if (!f) return {}
    const dx = x - f.x, dz = z - f.z
    return { furniture: s.furniture.map((q) => (q.id === id ? { ...q, x, z } : q.group === id ? { ...q, x: q.x + dx, z: q.z + dz } : q)) }
  }),
  patchFurn: (id, p) => set((s) => {
    const f = s.furniture.find((q) => q.id === id)
    if (!f) return {}
    const dr = p.rot !== undefined ? p.rot - f.rot : 0
    return {
      furniture: s.furniture.map((q) => {
        if (q.id === id) return { ...q, ...p }
        if (q.group !== id || !dr) return q
        const ox = q.x - f.x, oz = q.z - f.z // followers turn around the leader
        return { ...q, x: f.x + ox * Math.cos(dr) + oz * Math.sin(dr), z: f.z - ox * Math.sin(dr) + oz * Math.cos(dr), rot: q.rot + dr }
      }),
    }
  }),
  addFurn: (type) => {
    const id = 'f' + Math.random().toString(36).slice(2, 7)
    set((s) => {
      const ps = Object.values(s.nodes)
      const cx = ps.reduce((a, p) => a + p[0], 0) / ps.length, cy = ps.reduce((a, p) => a + p[1], 0) / ps.length
      const item = f(id, type, m(cx), m(cy))
      if (type === 'shelf') item.y = 1.5
      if (type === 'tv') item.y = 0.9
      return { furniture: [...s.furniture, item], selected: id }
    })
  },
  removeFurn: (id) => set((s) => ({ furniture: s.furniture.filter((q) => q.id !== id && q.group !== id), selected: null })),
  resetWalls: () => set({ nodes: structuredClone(initialNodes), customWalls: [], selected: null, drawStart: null }),
  autoFurnish: () => set((s) => ({ furniture: autoFurnish(s.nodes, s.customWalls, { kinds: s.roomKinds, hints: s.hintOv, criteria: s.criteria }), selected: null })),
  topView: 0,
  goTop: () => set((s) => ({ topView: s.topView + 1 })),
  clearFurniture: () => set({ furniture: [], selected: null }),
  fitOne: (id) => {
    const s = useStore.getState(), f = s.furniture.find((q) => q.id === id)
    const r = f && fitFurn(f, s.furniture, s.nodes, s.customWalls)
    if (!f || !r) return false
    const dr = r.rot - f.rot
    set({
      furniture: s.furniture.map((q) => {
        if (q.id === id) return r
        if (q.group !== id) return q
        const ox = q.x - f.x, oz = q.z - f.z // the group moves with its leader
        return { ...q, x: r.x + ox * Math.cos(dr) + oz * Math.sin(dr), z: r.z - ox * Math.sin(dr) + oz * Math.cos(dr), rot: q.rot + dr }
      }),
    })
    return true
  },
  fixAll: () => {
    let fixed = 0
    for (const f of useStore.getState().furniture) {
      const s = useStore.getState(), cur = s.furniture.find((q) => q.id === f.id)!
      if (!misplaced(cur, s.nodes, s.customWalls, s.furniture)) continue
      if (s.hintOv[cur.type]) continue // the user pinned this item on purpose: leave it where they put it
      if (useStore.getState().fitOne(f.id)) { fixed++; continue }
      // dependants that can't be placed next to their table / bed are pointless: remove them
      const why = misplacedReason(cur, s.nodes, s.customWalls, s.furniture)
      if (why && (why.startsWith('a chair') || why.startsWith('a nightstand'))) { useStore.getState().removeFurn(f.id); fixed++ }
    }
    return fixed
  },
}))

useStore.subscribe((s, prev) => { if (s.openings !== prev.openings) setOpeningOv(s.openings) })
// lights and switches follow the furniture (kitchen spots, bedside lamps, switches never behind a wardrobe)
let electricsTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  const changed = s.furniture !== prev.furniture || s.nodes !== prev.nodes || s.customWalls !== prev.customWalls || s.roomKinds !== prev.roomKinds || s.flatId !== prev.flatId
  if (!changed && !(prev.drag && !s.drag)) return
  if (s.drag) return
  clearTimeout(electricsTimer)
  electricsTimer = setTimeout(() => useStore.getState().regenElectrics(), 150)
})

// Undo history: every change to walls / furniture / rooms / criteria is recorded automatically.
// A whole drag counts as one step, and a burst of slider changes on one item is merged.
const SNAP_KEYS = ['nodes', 'customWalls', 'furniture', 'roomKinds', 'hintOv', 'criteria', 'openings', 'doorState', 'roomStyle'] as const
function snapOf(s: State): Snap { return { nodes: s.nodes, customWalls: s.customWalls, furniture: s.furniture, roomKinds: s.roomKinds, hintOv: s.hintOv, criteria: s.criteria, openings: s.openings, doorState: s.doorState, roomStyle: s.roomStyle } }
let applying = false, dragPending = false, lastPush = 0
useStore.subscribe((s, prev) => {
  if (applying) return
  if (!prev.drag && s.drag) dragPending = true
  if (!s.drag) dragPending = false
  if (!SNAP_KEYS.some((k) => s[k] !== prev[k])) return
  if (s.drag) { if (!dragPending) return; dragPending = false }
  else {
    const onlyFurn = SNAP_KEYS.every((k) => k === 'furniture' || s[k] === prev[k]) && s.furniture.length === prev.furniture.length
    if (onlyFurn && Date.now() - lastPush < 500) { lastPush = Date.now(); return }
  }
  lastPush = Date.now()
  useStore.setState((st) => ({ past: [...st.past.slice(-99), snapOf(prev)], future: [] }))
})

useStore.subscribe((s) => {
  save.flats![s.flatId] = { nodes: s.nodes, furniture: s.furniture, customWalls: s.customWalls, roomKinds: s.roomKinds, hintOv: s.hintOv, criteria: s.criteria, openings: s.openings, doorState: s.doorState, roomStyle: s.roomStyle, lightOv: s.lightOv }
  try { localStorage.setItem(KEY, JSON.stringify({ current: s.flatId, flats: save.flats })) } catch { /* ignore */ }
})

export function shareLink() {
  const { flatId, nodes, furniture, customWalls, roomKinds, hintOv, criteria, openings, doorState, roomStyle, lightOv } = get()
  return location.origin + location.pathname + '#s=' + btoa(encodeURIComponent(JSON.stringify({ flatId, nodes, furniture, customWalls, roomKinds, hintOv, criteria, openings, doorState, roomStyle, lightOv })))
}
const get = useStore.getState

export const getAllWalls = (): Wall[] => [...baseWalls, ...useStore.getState().customWalls]
export const useAllWalls = (): Wall[] => {
  const c = useStore((s) => s.customWalls)
  return [...baseWalls, ...c]
}

/** Forget the saved layout of one flat (used when its geometry was rebuilt or the flat was deleted). */
export function forgetFlatSave(id: string) {
  if (save.flats) delete save.flats[id]
  try { localStorage.setItem(KEY, JSON.stringify({ current: useStore.getState().flatId, flats: save.flats })) } catch { /* ignore */ }
}
