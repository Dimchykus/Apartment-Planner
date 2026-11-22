// MCP server for the Flat Planner: Claude can read the flat and edit its furniture in the open browser tab.
// The app (opened with ?mcp=1) connects here over a local WebSocket; each tool forwards one request to it.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WebSocketServer } from 'ws'
import { z } from 'zod'

const PORT = Number(process.env.PLANNER_MCP_PORT ?? 7391)
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
let app = null, seq = 0
const pending = new Map()
wss.on('connection', (ws) => {
  app?.close(); app = ws
  ws.on('message', (d) => { try { const m = JSON.parse(String(d)); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.res(m) : p.rej(new Error(m.error)) } } catch { /* ignore */ } })
  ws.on('close', () => { if (app === ws) app = null })
})
wss.on('error', (e) => console.error('planner-mcp: cannot listen on ' + PORT + ': ' + e.message))

const call = (op, args = {}) => new Promise((res, rej) => {
  if (!app || app.readyState !== 1) return rej(new Error('The planner is not connected. Open the app and switch on "Claude connection (MCP)" in the menu (Scene & view), then try again.'))
  const id = ++seq, t = setTimeout(() => { pending.delete(id); rej(new Error('The app did not answer in time.')) }, 20000)
  pending.set(id, { res: (m) => { clearTimeout(t); res(m) }, rej: (e) => { clearTimeout(t); rej(e) } })
  app.send(JSON.stringify({ id, op, args }))
})
const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }] })
const tool = (server, name, description, shape, op = name) =>
  server.tool(name, description, shape, async (args) => { try { return text((await call(op, args)).result) } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] } } })

const server = new McpServer({ name: 'flat-planner', version: '0.1.0' })
const units = 'Metres. x grows east (right on the plan), z grows south (down on the plan). rotation_deg 0 = the front of the item faces south (+z); 90 = faces east; 180 = north; 270 = west.'
const look = {
  width: z.number().optional().describe('Width in metres'), depth: z.number().optional().describe('Depth in metres'), height: z.number().optional().describe('Height in metres'),
  lift_y: z.number().optional().describe('Height of the underside above the floor (wall shelf, TV)'), color: z.string().optional().describe('CSS colour, e.g. #8d8f93'),
  style: z.string().optional().describe('Model style, e.g. sofa: classic|modern, chair: standard|stool, bed: soft|wood|platform, wardrobe: hinged|sliding'),
  finish: z.enum(['matte', 'satin', 'gloss']).optional(),
}
const where = {
  x: z.number().optional(), z: z.number().optional(), rotation_deg: z.number().optional(),
  room: z.string().optional().describe('Room id from get_flat. Alone: the room centre.'),
  against_wall: z.enum(['north', 'south', 'east', 'west']).optional().describe('With room: put the item against that side of the room, its back to the wall, facing in'),
  offset: z.number().optional().describe('With against_wall: slide along the wall from the room middle (metres; + = east or south)'),
  gap: z.number().optional().describe('With against_wall: gap to the wall (default 0.03)'),
}

tool(server, 'get_flat', 'Rooms (id, kind, area, stated_m2 from the plan, wall_ids, bounds, polygon), doors and windows with positions, and the list of furniture types with default sizes. Call this first. ' + units, {})
tool(server, 'get_walls', 'All wall corners (id, position, whether it can move) and walls (id, length, thickness, direction, which rooms they bound, can_move). Outer walls are locked; only inner walls move. Use before changing walls.', {})
tool(server, 'shift_wall', 'Move a wall sideways by dx / dz metres (both ends; locked outer corners stay, sliding corners stay on their outer wall). Returns what actually moved, the new area of every room and how many furniture items now have a problem. ' + units, { id: z.string(), dx: z.number().optional().describe('+ = east'), dz: z.number().optional().describe('+ = south') })
tool(server, 'move_node', 'Move one wall corner to x / z (metres). Respects the app limits (outer corners locked, sliding corners stay on their wall).', { id: z.string(), x: z.number(), z: z.number() })
tool(server, 'resize_room_to_area', 'Move one wall of a room so the room gets the wanted net floor area (wall thickness taken off). The neighbour behind that wall shrinks or grows. Returns before / after areas of all rooms. Pick a wall with can_move from get_walls; get_flat lists each room wall_ids.', { room: z.string(), wall: z.string(), area_m2: z.number() })
tool(server, 'list_furniture', 'All furniture in the open layout: id, type, position, rotation, size, room, and "problem" when it does not fit (wall / door / other item in the way). ' + units, {})
tool(server, 'add_furniture', 'Add an item (types are listed by get_flat; "gamingDesk" brings its chair). Position with x/z, or room (+ against_wall). ' + units, { type: z.string(), ...where, ...look })
tool(server, 'move_furniture', 'Move and/or rotate an item (its group, such as a chair at a table, follows). ' + units, { id: z.string(), ...where })
tool(server, 'edit_furniture', 'Change size, colour, style, finish or lift of an item.', { id: z.string(), ...look })
tool(server, 'remove_furniture', 'Delete an item (and its group).', { id: z.string() })
tool(server, 'duplicate_furniture', 'Copy an item, offset a little.', { id: z.string() })
tool(server, 'fit_furniture', 'Move / resize an item that does not fit to the nearest spot where it does (the app\'s "Fit to space").', { id: z.string() })
tool(server, 'check_furniture', 'Only the items that have a problem (collide with walls, doors, windows or each other).', {})
tool(server, 'set_room_kind', 'Change what a room is (re-furnishes it). Kinds are listed by get_flat.', { room: z.string(), kind: z.string() })
tool(server, 'auto_furnish', 'Offline auto-furnish: one room, or the whole flat when room is omitted (replaces the furniture there).', { room: z.string().optional() })
tool(server, 'clear_furniture', 'Remove all furniture.', {})
tool(server, 'undo', 'Undo the last change in the app.', {})
tool(server, 'redo', 'Redo.', {})
server.tool('screenshot', 'Picture of the 3D view or the top-down plan, to check the result. view: "3d" or "plan" (default: whatever is shown).', { view: z.enum(['3d', 'plan']).optional() }, async ({ view }) => {
  try { const m = await call('screenshot', { view }); return { content: [{ type: 'image', data: m.image, mimeType: 'image/jpeg' }] } } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] } }
})

await server.connect(new StdioServerTransport())
console.error('planner-mcp: waiting for the app on ws://127.0.0.1:' + PORT)
