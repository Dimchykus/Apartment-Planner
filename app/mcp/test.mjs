import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { launch } from '../scripts/cdp.mjs'
import { writeFileSync } from 'node:fs'
const client = new Client({ name: 'test', version: '0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['server.mjs'], cwd: import.meta.dirname }))
const b = await launch({ width: 1200, height: 800, port: 9344 })
await b.goto('http://localhost:5175/?help=0&theme=dark&quality=low&menu=0&mcp=1')
await new Promise((r) => setTimeout(r, 4000))
const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); return r.isError ? 'ERR ' + r.content[0].text : r.content[0].type === 'text' ? JSON.parse(r.content[0].text) : r.content[0] }
const flat = await call('get_flat')
console.log('rooms', flat.rooms.map((r) => `${r.id}:${r.name}:${r.area_m2}`).join(' | '))
const bed = flat.rooms.find((r) => /bed/i.test(r.name)) ?? flat.rooms[0]
await call('clear_furniture')
const added = await call('add_furniture', { type: 'gamingDesk', room: bed.id, against_wall: 'north' })
console.log('added', JSON.stringify(added.added.map((a) => [a.type, a.x, a.z, a.rotation_deg, a.room_name, a.problem])))
const id = added.added[0].id
console.log('moved', JSON.stringify(await call('move_furniture', { id, x: added.added[0].x + 0.3, z: added.added[0].z + 0.2 })))
console.log('bad', JSON.stringify(await call('move_furniture', { id: 'nope', x: 1, z: 1 })))
console.log('check', JSON.stringify(await call('check_furniture')))
const img = await call('screenshot', { view: 'plan' })
writeFileSync(process.env.TEMP + '/mcp-shot.jpg', Buffer.from(img.data, 'base64'))
console.log('shot bytes', img.data.length)
await call('undo')
await client.close(); process.exit(0)
