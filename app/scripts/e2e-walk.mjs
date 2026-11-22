// Walk mode: stand in front of a wall switch and a door, press E, check that the light / door state changes.
import { launch } from './cdp.mjs'
const URL = process.env.URL ?? 'http://localhost:5173/'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT ?? (tmpdir().replace(/\/g, '/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })
const b = await launch({ port: 9337, width: 1200, height: 760 })
const P = (expr) => b.eval(`(() => { const { store, ui, three } = window.__planner; const s = store.getState(); ${expr} })()`)
try {
  await b.goto(URL + '?help=0&theme=light&quality=low&menu=0&debug=1')
  await b.waitFor("!!(window.__planner && window.__planner.three)")
  await b.sleep(4000)
  await P("s.setMode('walk'); return 1"); await b.sleep(2500)
  // pick the switch beside the hall / living door and stand 0.9 m in front of it looking at it
  const sw = await P(`const sw = s.switches[0]; const w = [...Object.values({})]; return JSON.stringify(sw)`)
  console.log('first switch:', sw)
  const place = `
    const sw = s.switches[0];
    const wall = window.__planner.walls.find(w => w.id === sw.wall);
    const A = s.nodes[wall.a], B = s.nodes[wall.b], L = Math.hypot(B[0]-A[0], B[1]-A[1]), ppm = window.__planner.ppm;
    const ux = (B[0]-A[0])/L, uy = (B[1]-A[1])/L, nx = -uy*sw.side, nz = ux*sw.side;
    const px = (A[0]+ux*sw.s)/ppm, pz = (A[1]+uy*sw.s)/ppm;
    const cam = three.camera;
    cam.position.set(px + nx*0.9, 1.5, pz + nz*0.9);
    cam.lookAt(px, sw.y, pz);
    three.invalidate();
    return 1`
  await P("window.__planner.walls = []; return 1")
  await b.eval(`(async () => { const m = await import('/src/plan.ts'); const st = await import('/src/store.ts'); window.__planner.walls = st.getAllWalls(); window.__planner.ppm = m.PX_PER_M })()`)
  await P(place); await b.sleep(1200)
  const before = await P("return JSON.stringify(s.lightOv)")
  await b.key('e', 'KeyE'); await b.sleep(800)
  const after = await P("return JSON.stringify(store.getState().lightOv)")
  console.log('light overrides before:', before, '| after pressing E at the switch:', after)
  await b.shot(OUT + '/w_switch.png')
  // a door: look at the first door leaf at 1.4 m
  const doorInfo = await P(`const w = window.__planner.walls.find(w => w.id === 'w16'); const A = s.nodes[w.a], B = s.nodes[w.b], L = Math.hypot(B[0]-A[0], B[1]-A[1]), ppm = window.__planner.ppm; const ux=(B[0]-A[0])/L, uy=(B[1]-A[1])/L; const mid = 85; const px=(A[0]+ux*mid)/ppm, pz=(A[1]+uy*mid)/ppm; const cam = three.camera; cam.position.set(px - 1.4, 1.5, pz); cam.lookAt(px, 1.0, pz); three.invalidate(); return JSON.stringify({ px, pz })`)
  console.log('door spot:', doorInfo)
  await b.sleep(1000)
  const d0 = await P("return JSON.stringify(store.getState().doorState)")
  await b.key('e', 'KeyE'); await b.sleep(1500)
  console.log('doorState before:', d0, '| after E:', await P("return JSON.stringify(store.getState().doorState)"))
  await b.shot(OUT + '/w_door.png')
  console.log('errors:', b.logs.filter((l) => !l.includes('THREE.Clock') && !l.includes('synchronously unmount')).slice(0, 3).join(' | ') || 'none')
} catch (e) { console.log('FAIL', e.message, b.logs.slice(0, 3)) }
b.close()
