// Lets a local MCP server (app/mcp) read and edit the furniture of the open flat. Only runs while "Claude connection (MCP)" is switched on in the menu
// (or the page was opened with ?mcp=1), and only talks to ws://127.0.0.1 (this computer). Units: metres, rotation in degrees (0 = the item's front faces +z / south).
import { useStore } from '../store'
import { useUI } from '../ui/uiStore'
import { CATALOG, sizeOf, type FType, type Furn } from '../catalog'
import { rooms, walls as baseWalls, insetRoom, roomAreas, openingsOf, m, PX_PER_M, type Pt } from '../plan'
import { kindInfo, ROOM_KINDS } from '../roomkinds'
import { misplacedReason, defaultKind } from '../autofurnish'

const r2 = (v: number) => Math.round(v * 100) / 100
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => Math.round((((r * 180) / Math.PI) % 360 + 360) % 360)
const S = () => useStore.getState()

const roomPoly = (id: string) => { const r = rooms.find((x) => x.id === id); return r ? insetRoom(r, S().nodes).map(([x, y]) => [m(x), m(y)] as Pt) : null }
const bbox = (p: Pt[]) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), z0: Math.min(...p.map((q) => q[1])), z1: Math.max(...p.map((q) => q[1])) })
const inside = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c } return c }
const roomOf = (x: number, z: number) => rooms.find((r) => { const p = roomPoly(r.id); return p && inside([x, z], p) })?.id ?? null
const roomName = (id: string | null) => { if (!id) return null; const r = rooms.find((x) => x.id === id); const k = S().roomKinds[id]; return r ? (k ? kindInfo(k).label : r.name) : null }

const describe = (f: Furn) => {
  const sz = sizeOf(f), rid = roomOf(f.x, f.z)
  return { id: f.id, type: f.type, label: CATALOG[f.type].label, x: r2(f.x), z: r2(f.z), rotation_deg: deg(f.rot), width: r2(sz.w), depth: r2(sz.d), height: r2(sz.h), lift_y: f.y ? r2(f.y) : 0, color: f.color, style: f.style, group: f.group, room: rid, room_name: roomName(rid), problem: misplacedReason(f, S().nodes, S().customWalls, S().furniture) }
}
const need = (id: string) => { const f = S().furniture.find((q) => q.id === id); if (!f) throw new Error('No furniture with id "' + id + '". Use list_furniture.'); return f }
const roomPt = (room: string): Pt => { const p = roomPoly(room); if (!p) throw new Error('Unknown room "' + room + '". Use get_flat.'); const b = bbox(p); return [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2] }

/** Put an item against one side of a room (north = smaller z, south = larger z, west = smaller x, east = larger x), its back to the wall, facing into the room. */
function against(f: Furn, room: string, side: string, offset: number, gap: number): { x: number; z: number; rot: number } {
  const p = roomPoly(room); if (!p) throw new Error('Unknown room "' + room + '".')
  const b = bbox(p), sz = sizeOf(f), c: Pt = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]
  switch (side) {
    case 'north': return { x: c[0] + offset, z: b.z0 + gap + sz.d / 2, rot: 0 }
    case 'south': return { x: c[0] + offset, z: b.z1 - gap - sz.d / 2, rot: Math.PI }
    case 'west': return { x: b.x0 + gap + sz.d / 2, z: c[1] + offset, rot: Math.PI / 2 }
    case 'east': return { x: b.x1 - gap - sz.d / 2, z: c[1] + offset, rot: -Math.PI / 2 }
  }
  throw new Error('side must be north, south, east or west')
}

type Args = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

function patchOf(a: Args): Partial<Furn> {
  const p: Partial<Furn> = {}
  if (num(a.width) !== undefined) p.w = a.width as number
  if (num(a.depth) !== undefined) p.d = a.depth as number
  if (num(a.height) !== undefined) p.h = a.height as number
  if (num(a.lift_y) !== undefined) p.y = a.lift_y as number
  if (str(a.color)) p.color = a.color as string
  if (str(a.style)) p.style = a.style as string
  if (str(a.finish)) p.finish = a.finish as Furn['finish']
  return p
}

async function shot(view: string): Promise<string> {
  const u = useUI.getState(), was = u.on2d
  if (view === 'plan') u.setOn2d(true); else if (view === '3d') u.setOn2d(false)
  await new Promise((r) => setTimeout(r, 900))
  const c = document.querySelector('canvas'); if (!c) throw new Error('No 3D canvas on the page.')
  const d = c.toDataURL('image/jpeg', 0.85).split(',')[1]
  if (view && was !== useUI.getState().on2d) u.setOn2d(was)
  return d
}

const ops: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  get_flat: () => {
    const s = S(), areas = roomAreas(s.nodes, s.customWalls)
    return {
      flat: s.flatId, units: 'metres; x grows to the east (right on the plan), z grows to the south (down on the plan)',
      rooms: rooms.map((r) => { const p = roomPoly(r.id)!, b = bbox(p); return { id: r.id, name: roomName(r.id), kind: s.roomKinds[r.id] ?? defaultKind(r), area_m2: r2(areas.find((x) => x.room.id === r.id)?.area ?? 0), inside_bounds: { x_from: r2(b.x0), x_to: r2(b.x1), z_from: r2(b.z0), z_to: r2(b.z1) }, polygon: p.map(([x, z]) => [r2(x), r2(z)]) } }),
      doors_and_windows: [...baseWalls, ...s.customWalls].flatMap((w) => { const A = s.nodes[w.a], B = s.nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1]); return openingsOf(w, s.nodes).map((o) => { const t = (o.from + o.to) / 2 / L; return { kind: o.kind, wall: w.id, x: r2(m(A[0] + (B[0] - A[0]) * t)), z: r2(m(A[1] + (B[1] - A[1]) * t)), width: r2((o.to - o.from) / PX_PER_M), sill: o.sill, top: o.top } }) }),
      furniture_count: s.furniture.length, furniture_types: Object.entries(CATALOG).map(([k, v]) => ({ type: k, label: v.label, width: v.w, depth: v.d, height: v.h })), room_kinds: ROOM_KINDS.map((k) => k.id),
    }
  },
  list_furniture: () => S().furniture.map(describe),
  add_furniture: (a) => {
    const type = str(a.type) as FType; if (!CATALOG[type]) throw new Error('Unknown type "' + type + '". Types: ' + Object.keys(CATALOG).join(', '))
    const before = new Set(S().furniture.map((f) => f.id))
    S().addFurn(type)
    const added = S().furniture.filter((f) => !before.has(f.id)), id = S().selected ?? added[0]?.id
    if (!id) throw new Error('Could not add the item.')
    S().patchFurn(id, patchOf(a))
    placeOp(id, a, true)
    return { added: S().furniture.filter((f) => !before.has(f.id)).map(describe) }
  },
  move_furniture: (a) => { const id = str(a.id)!; need(id); placeOp(id, a, false); return describe(need(id)) },
  edit_furniture: (a) => { const id = str(a.id)!; need(id); S().patchFurn(id, patchOf(a)); return describe(need(id)) },
  remove_furniture: (a) => { const id = str(a.id)!; need(id); S().removeFurn(id); return { removed: id } },
  duplicate_furniture: (a) => { const id = str(a.id)!; need(id); const before = new Set(S().furniture.map((f) => f.id)); S().duplicateFurn(id); return S().furniture.filter((f) => !before.has(f.id)).map(describe) },
  fit_furniture: (a) => { const id = str(a.id)!; need(id); const ok = S().fitOne(id); return { fitted: ok, item: describe(need(id)) } },
  check_furniture: () => S().furniture.map(describe).filter((f) => f.problem),
  set_room_kind: (a) => { const room = str(a.room)!, kind = str(a.kind)!; if (!rooms.some((r) => r.id === room)) throw new Error('Unknown room'); S().setRoomKind(room, kind as never); return { room, kind: S().roomKinds[room] } },
  auto_furnish: (a) => { if (str(a.room)) S().furnishRoom(str(a.room)!); else S().autoFurnish(); return { furniture: S().furniture.length } },
  clear_furniture: () => { S().clearFurniture(); return { ok: true } },
  undo: () => { S().undo(); return { furniture: S().furniture.length } },
  redo: () => { S().redo(); return { furniture: S().furniture.length } },
}

/** x / z / room / side / rotation_deg handling shared by add and move. */
function placeOp(id: string, a: Args, adding: boolean) {
  const f = need(id)
  let x = num(a.x), z = num(a.z), rot = num(a.rotation_deg) !== undefined ? rad(a.rotation_deg as number) : undefined
  const room = str(a.room), side = str(a.against_wall)
  if (room && side) { const p = against(f, room, side, num(a.offset) ?? 0, num(a.gap) ?? 0.03); x = p.x; z = p.z; if (rot === undefined) rot = p.rot }
  else if (room && (x === undefined || z === undefined)) { const c = roomPt(room); x = x ?? c[0]; z = z ?? c[1] }
  if (rot !== undefined) S().patchFurn(id, { rot })
  if (x !== undefined || z !== undefined) S().moveFurn(id, x ?? f.x, z ?? f.z)
  else if (!adding && rot === undefined) throw new Error('Give x and z, a room, or rotation_deg.')
}

export function startMcpBridge(onState: (connected: boolean) => void, port = 7391) {
  let ws: WebSocket | null = null, timer = 0, stopped = false
  const connect = () => {
    ws = new WebSocket('ws://127.0.0.1:' + port)
    ws.onopen = () => { onState(true) }
    ws.onclose = () => { onState(false); if (!stopped) timer = window.setTimeout(connect, 2000) }
    ws.onerror = () => ws?.close()
    ws.onmessage = async (ev) => {
      let msg: { id: number; op: string; args?: Args }
      try { msg = JSON.parse(String(ev.data)) } catch { return }
      try {
        if (msg.op === 'screenshot') ws!.send(JSON.stringify({ id: msg.id, ok: true, image: await shot(str(msg.args?.view) ?? '') }))
        else { const f = ops[msg.op]; if (!f) throw new Error('unknown op ' + msg.op); ws!.send(JSON.stringify({ id: msg.id, ok: true, result: await f(msg.args ?? {}) })) }
      } catch (e) { ws!.send(JSON.stringify({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) })) }
    }
  }
  connect()
  return () => { stopped = true; clearTimeout(timer); ws?.close(); onState(false) }
}
