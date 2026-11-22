// Lets a local MCP server (app/mcp) read and edit the furniture of the open flat. Only runs while "Claude connection (MCP)" is switched on in the menu
// (or the page was opened with ?mcp=1), and only talks to ws://127.0.0.1 (this computer). Units: metres, rotation in degrees (0 = the item's front faces +z / south).
import { useStore } from '../store'
import { useUI } from '../ui/uiStore'
import { CATALOG, sizeOf, type FType, type Furn } from '../catalog'
import { rooms, walls as baseWalls, editable, insetRoom, roomAreas, openingsOf, m, PX_PER_M, type Pt } from '../plan'
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


// ───────────── walls ─────────────
const allWalls = () => [...baseWalls, ...S().customWalls]
const nodeM = (id: string): Pt => { const p = S().nodes[id]; return [m(p[0]), m(p[1])] }
const wallById = (id: string) => { const w = allWalls().find((x) => x.id === id); if (!w) throw new Error('No wall "' + id + '". Use get_walls.'); return w }
const roomWallIds = (r: (typeof rooms)[number]) => r.nodes.map((a, i) => { const b = r.nodes[(i + 1) % r.nodes.length]; return allWalls().find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))?.id ?? null })
const isLocked = (id: string) => id[0] !== 'c' && !editable[id]
const moveKind = (id: string) => (id[0] === 'c' ? 'free' : editable[id]?.type ?? 'locked')
const areaOf = (room: string) => roomAreas(S().nodes, S().customWalls).find((x) => x.room.id === room)?.area ?? 0
const allAreas = () => Object.fromEntries(roomAreas(S().nodes, S().customWalls).map((x) => [x.room.id, r2(x.area)]))


/** How far a wall can be pushed sideways (metres, along its unit normal [nx, nz]): intersection of what its two ends allow. */
function sidewaysRange(id: string): { normal: Pt; min: number; max: number } {
  const w = wallById(id), A = nodeM(w.a), B = nodeM(w.b), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
  const n: Pt = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L]
  if (w.custom) return { normal: n, min: -20, max: 20 }
  let lo = -Infinity, hi = Infinity
  for (const nodeId of [w.a, w.b]) {
    const e = editable[nodeId], p = nodeM(nodeId)
    let a = 0, b = 0
    if (e?.type === 'free') {
      const box = [m(e.box[0]), m(e.box[1]), m(e.box[2]), m(e.box[3])]
      a = -Infinity; b = Infinity
      for (const k of [0, 1] as const) if (Math.abs(n[k]) > 1e-6) { const t1 = ((k ? box[1] : box[0]) - p[k]) / n[k], t2 = ((k ? box[3] : box[2]) - p[k]) / n[k]; a = Math.max(a, Math.min(t1, t2)); b = Math.min(b, Math.max(t1, t2)) }
    } else if (e?.type === 'slide') {
      const P = nodeM(e.a), Q = nodeM(e.b), d: Pt = [Q[0] - P[0], Q[1] - P[1]], ll = Math.hypot(d[0], d[1]) || 1, u: Pt = [d[0] / ll, d[1] / ll]
      const along = n[0] * u[0] + n[1] * u[1]
      if (Math.abs(Math.abs(along) - 1) < 0.05) { // the wall's normal runs along the outer wall: it can slide
        const t = (p[0] - P[0]) * u[0] + (p[1] - P[1]) * u[1], mg = m(e.margin)
        const t1 = (mg - t) / along, t2 = (ll - mg - t) / along
        a = Math.min(t1, t2); b = Math.max(t1, t2)
      }
    }
    lo = Math.max(lo, a); hi = Math.min(hi, b)
  }
  return { normal: n, min: r2(Math.min(0, lo)), max: r2(Math.max(0, hi)) }
}

/** Move both ends of a wall by (dx, dz) metres. Locked (outer) corners do not move; sliding corners stay on their outer wall. */
function shiftWall(id: string, dx: number, dz: number) {
  const w = wallById(id), before = [nodeM(w.a), nodeM(w.b)]
  if (w.custom) { const [ax, az] = before[0], [bx, bz] = before[1]; S().moveWall(id, (ax + bx) / 2 + dx, (az + bz) / 2 + dz) }
  else for (const [n, p] of [[w.a, before[0]], [w.b, before[1]]] as [string, Pt][]) S().moveNode(n, p[0] + dx, p[1] + dz)
  const after = [nodeM(w.a), nodeM(w.b)]
  return { wall: id, requested: { dx: r2(dx), dz: r2(dz) }, moved: after.map((p, i) => ({ node: i ? w.b : w.a, dx: r2(p[0] - before[i][0]), dz: r2(p[1] - before[i][1]) })) }
}

const ops: Record<string, (a: Args) => unknown | Promise<unknown>> = {
  get_flat: () => {
    const s = S(), areas = roomAreas(s.nodes, s.customWalls)
    return {
      flat: s.flatId, units: 'metres; x grows to the east (right on the plan), z grows to the south (down on the plan)',
      rooms: rooms.map((r) => { const p = roomPoly(r.id)!, b = bbox(p); return { id: r.id, name: roomName(r.id), kind: s.roomKinds[r.id] ?? defaultKind(r), area_m2: r2(areas.find((x) => x.room.id === r.id)?.area ?? 0), stated_m2: r.stated || undefined, wall_ids: roomWallIds(r), inside_bounds: { x_from: r2(b.x0), x_to: r2(b.x1), z_from: r2(b.z0), z_to: r2(b.z1) }, polygon: p.map(([x, z]) => [r2(x), r2(z)]) } }),
      doors_and_windows: [...baseWalls, ...s.customWalls].flatMap((w) => { const A = s.nodes[w.a], B = s.nodes[w.b], L = Math.hypot(B[0] - A[0], B[1] - A[1]); return openingsOf(w, s.nodes).map((o) => { const t = (o.from + o.to) / 2 / L; return { kind: o.kind, wall: w.id, x: r2(m(A[0] + (B[0] - A[0]) * t)), z: r2(m(A[1] + (B[1] - A[1]) * t)), width: r2((o.to - o.from) / PX_PER_M), sill: o.sill, top: o.top } }) }),
      furniture_count: s.furniture.length, furniture_types: Object.entries(CATALOG).map(([k, v]) => ({ type: k, label: v.label, width: v.w, depth: v.d, height: v.h })), room_kinds: ROOM_KINDS.map((k) => k.id),
    }
  },

  get_walls: () => {
    const s = S()
    const roomsOf = (wid: string) => rooms.filter((r) => roomWallIds(r).includes(wid)).map((r) => r.id)
    return {
      units: 'metres. Only inner walls can move: outer-wall corners are locked. "free" corners move anywhere inside box; "slide" corners move along the outer wall between two other corners.',
      nodes: Object.keys(s.nodes).map((id) => { const e = editable[id], p = nodeM(id); const o: Record<string, unknown> = { id, x: r2(p[0]), z: r2(p[1]), move: moveKind(id) }; if (e?.type === 'free') o.box = { x_from: r2(m(e.box[0])), x_to: r2(m(e.box[2])), z_from: r2(m(e.box[1])), z_to: r2(m(e.box[3])) }; if (e?.type === 'slide') o.slides_between = [e.a, e.b]; return o }),
      walls: allWalls().map((w) => { const A = nodeM(w.a), B = nodeM(w.b); const dx = B[0] - A[0], dz = B[1] - A[1]; return { id: w.id, a: w.a, b: w.b, thickness_cm: Math.round((w.thick / PX_PER_M) * 100), length_m: r2(Math.hypot(dx, dz)), direction: Math.abs(dz) < 0.02 ? 'horizontal (runs east-west)' : Math.abs(dx) < 0.02 ? 'vertical (runs north-south)' : 'diagonal', ...(() => { const sw = sidewaysRange(w.id); return { can_move: sw.max - sw.min > 0.02, sideways: { normal_x_z: [r2(sw.normal[0]), r2(sw.normal[1])], min_m: sw.min, max_m: sw.max } } })(), custom: !!w.custom, doorway: !!w.door, rooms: roomsOf(w.id) } }),
    }
  },
  move_node: (a) => {
    const id = str(a.id)!, x = num(a.x), z = num(a.z)
    if (!S().nodes[id]) throw new Error('No corner "' + id + '". Use get_walls.')
    if (x === undefined || z === undefined) throw new Error('Give x and z.')
    const b = nodeM(id); S().moveNode(id, x, z); const p = nodeM(id)
    return { node: id, requested: [x, z], now: [r2(p[0]), r2(p[1])], moved: Math.hypot(p[0] - b[0], p[1] - b[1]) > 0.005, locked: isLocked(id), room_areas: allAreas() }
  },
  shift_wall: (a) => { const id = str(a.id)!; return { ...shiftWall(id, num(a.dx) ?? 0, num(a.dz) ?? 0), room_areas: allAreas(), furniture_problems: S().furniture.filter((f) => misplacedReason(f, S().nodes, S().customWalls, S().furniture)).length } },
  resize_room_to_area: (a) => {
    const room = str(a.room)!, wid = str(a.wall)!, target = num(a.area_m2)
    const r = rooms.find((x) => x.id === room); if (!r) throw new Error('Unknown room "' + room + '".')
    if (!target || target < 1) throw new Error('Give area_m2 (net floor area in square metres).')
    if (!roomWallIds(r).includes(wid)) throw new Error('Wall ' + wid + ' is not one of the walls of that room. Its walls: ' + roomWallIds(r).join(', '))
    const w = wallById(wid), A = nodeM(w.a), B = nodeM(w.b), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
    const poly = roomPoly(room)!, c: Pt = [poly.reduce((q, p) => q + p[0], 0) / poly.length, poly.reduce((q, p) => q + p[1], 0) / poly.length]
    let nx = -(B[1] - A[1]) / L, nz = (B[0] - A[0]) / L // outward normal of the wall (away from the room)
    if ((((A[0] + B[0]) / 2 - c[0]) * nx + (((A[1] + B[1]) / 2 - c[1]) * nz)) < 0) { nx = -nx; nz = -nz }
    const mid = () => { const P = nodeM(w.a), Q = nodeM(w.b); return ((P[0] + Q[0]) / 2) * nx + ((P[1] + Q[1]) / 2) * nz }
    const m0 = mid()
    const sw = sidewaysRange(wid), side = nx * sw.normal[0] + nz * sw.normal[1] >= 0 ? 1 : -1 // + = outward
    const room_out = side > 0 ? sw.max : -sw.min // how far outward the wall may still go
    const room_in = side > 0 ? -sw.min : sw.max
    if (room_out < 0.02 && room_in < 0.02) throw new Error('Wall ' + wid + ' cannot be pushed sideways (its corners are locked or slide the wrong way). Pick another wall of the room: get_walls shows can_move and the allowed range.')
    const before = allAreas(), start = before[room] ?? 0
    const step = Math.min(0.1, Math.max(room_out, room_in) / 2) * (room_out >= room_in ? 1 : -1)
    const a0 = areaOf(room); shiftWall(wid, nx * step, nz * step)
    const a1 = areaOf(room), slope = (a1 - a0) / step
    if (Math.abs(slope) < 0.05) { shiftWall(wid, -nx * step, -nz * step); throw new Error('Moving wall ' + wid + ' does not change the area of ' + room + '. Pick another wall of the room.') }
    for (let i = 0; i < 3; i++) {
      const cur = areaOf(room), need = (target - cur) / slope
      if (Math.abs(target - cur) < 0.03) break
      shiftWall(wid, nx * need, nz * need) // corners clamp to what the app allows
    }
    const after = allAreas(), got = after[room] ?? 0
    return { room, wall: wid, requested_m2: target, area_before_m2: start, area_now_m2: got, wall_moved_m: Math.abs(r2(mid() - m0)), direction_of_move: (() => { const d = mid() - m0; if (Math.abs(d) < 0.005) return 'none'; return Math.abs(nx) > Math.abs(nz) ? (nx * d > 0 ? 'east' : 'west') : nz * d > 0 ? 'south' : 'north' })(), exact: Math.abs(got - target) < 0.06, room_areas_before: before, room_areas_now: after, furniture_problems: S().furniture.filter((f) => misplacedReason(f, S().nodes, S().customWalls, S().furniture)).length }
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

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mcpOps = ops // for tests
