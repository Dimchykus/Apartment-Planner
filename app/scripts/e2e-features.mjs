// Walls / floors, doors (3 positions), windows (add / resize / remove), lights & switches, 2D lighting plan: driven through the real app.
import { launch } from './cdp.mjs'
const URL = process.env.URL ?? 'http://localhost:5173/'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT ?? (tmpdir().replace(/\/g, '/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })
const b = await launch({ port: 9336, width: 1360, height: 860 })
const P = (expr) => b.eval(`(() => { const { store, ui } = window.__planner; const s = store.getState(); ${expr} })()`)
const fail = (m) => { console.log('FAIL:', m); console.log(b.logs.filter((l) => !l.includes('THREE.Clock')).slice(0, 6).join('\n')); b.close(); process.exit(1) }
try {
  await b.goto(URL + '?help=0&theme=light&quality=med&menu=1&close=overview')
  await b.waitFor("window.__planner !== undefined")
  await b.sleep(6000)
  console.log('lights / switches:', await P("return s.lights.length + ' lights, ' + s.switches.length + ' switches'"))
  // ── doors: three positions
  console.log('doors:', await P("const ks = Object.keys(s.doorState); return 'doorState entries ' + ks.length"))
  await P("s.setAllDoors(2); return 1")
  await b.sleep(1500); await b.shot(OUT + '/f_doors_open.png')
  await P("s.setAllDoors(0); return 1"); await b.sleep(1500); await b.shot(OUT + '/f_doors_closed.png')
  await P("s.setAllDoors(1); return 1"); await b.sleep(1500)
  console.log('door states after all->half:', await P("return JSON.stringify(Object.values(store.getState().doorState).map(d => d.state))"))
  // ── colours & floors
  await P("const ids = Object.keys(s.roomStyle); s.setRoomStyle('r3', { wall: '#8aa0b5', floor: 'darkwood' }); s.setRoomStyle('r1', { wall: '#e8dcc8', floor: 'herringbone' }); s.setRoomStyle('r2', { floor: 'marble', wall: '#cfdde8' }); s.setRoomStyle('outside', { wall: '#e9d3cf' }); return 1")
  await b.sleep(2500); await b.shot(OUT + '/f_style.png')
  // ── windows: add / resize / remove
  const before = await P("return JSON.stringify(Object.fromEntries(Object.entries(s.openings).map(([k, v]) => [k, v.length])))")
  console.log('add wide window on the bathroom-side outer wall w3 ->', await P("return s.addOpening('w3', 112, 'wide')"))
  console.log('add full-wall glazing on loggia front w10 (already has a window: must be refused) ->', await P("return s.addOpening('w10', 120, 'full')"))
  console.log('add glazed door on inner wall w12 ->', await P("return s.addOpening('w12', 80, 'french')"))
  await b.sleep(1500)
  console.log('openings overrides:', await P("return JSON.stringify(Object.fromEntries(Object.entries(store.getState().openings).map(([k, v]) => [k, v.map(o => o.kind + ' ' + Math.round((o.to-o.from)/79*100) + 'cm sill ' + o.sill + ' top ' + o.top)])))"))
  await P("const sel = s.selOpening; s.editOpening(sel.wall, sel.i, { width: 1.5 }); return 1")
  console.log('after resize to 1.5 m:', await P("const st = store.getState(); const o = st.openings[st.selOpening.wall][st.selOpening.i]; return Math.round((o.to-o.from)/79*100) + ' cm'"))
  await b.sleep(1500); await b.shot(OUT + '/f_windows.png')
  // ── electrics regenerated after the door/window edits
  console.log('lights / switches now:', await P("return store.getState().lights.length + ' lights, ' + store.getState().switches.length + ' switches'"))
  // ── undo restores
  await P("store.getState().undo(); store.getState().undo(); return 1")
  console.log('after 2 undos, overrides:', await P("return Object.keys(store.getState().openings).length"))
  // ── night + lights on, 2D lighting plan
  await P("ui.getState().setEnv('night'); return 1"); await b.sleep(3000); await b.shot(OUT + '/f_night.png')
  await P("ui.getState().setEnv('day'); ui.getState().setOn2d(true); ui.getState().setCeiling2d(true); return 1"); await b.sleep(3500); await b.shot(OUT + '/f_2d_ceiling.png')
  await P("ui.getState().setCeiling2d(false); return 1"); await b.sleep(2000); await b.shot(OUT + '/f_2d_lights.png')
  console.log('errors:', b.logs.filter((l) => !l.includes('THREE.Clock') && !l.includes('synchronously unmount')).slice(0, 4).join(' | ') || 'none')
} catch (e) { fail(e.message) }
b.close()
