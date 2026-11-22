// Fast logic & state regression tests (runs in Node via Vite's SSR module loader, no browser needed).
import assert from 'node:assert/strict'
import { createServer } from 'vite'

// Minimal browser globals for store.ts / uiStore.ts
const ls = new Map()
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => { ls.set(k, String(v)) },
  removeItem: (k) => { ls.delete(k) },
  clear: () => { ls.clear() },
}
globalThis.location = { hash: '', search: '', origin: 'http://localhost:5173', pathname: '/' }
globalThis.matchMedia = () => ({ matches: false })

const server = await createServer({
  root: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  logLevel: 'error',
  server: { middlewareMode: true },
})

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log('  PASS', name)
    passed++
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message)
    failed++
  }
}

try {
  const storeMod = await server.ssrLoadModule('/src/store.ts')
  const planMod = await server.ssrLoadModule('/src/plan.ts')
  const catMod = await server.ssrLoadModule('/src/catalog.ts')
  const autoMod = await server.ssrLoadModule('/src/autofurnish.ts')
  const dimsMod = await server.ssrLoadModule('/src/Dims.tsx')

  const { useStore } = storeMod
  const { rooms, walls, openingsOf, insetRoom, doorSwing } = planMod
  const { CATALOG, isWallMounted } = catMod
  const { misplacedReason, overflowZones, fitFurn } = autoMod
  const { roomSize, itemWallDistances } = dimsMod

  const reset = () => {
    useStore.getState().switchFlat('flat-1b')
  }

  test('Undo / Redo: dragging furniture records 1 step and restores position', () => {
    reset()
    const st = useStore
    const f0 = st.getState().furniture[0]
    const x0 = f0.x, z0 = f0.z
    assert.equal(st.getState().past.length, 0)

    st.getState().setDrag({ kind: 'furn', id: f0.id, dx: 0, dz: 0, sx: x0, sz: z0, sy: 0, cy: 0 })
    st.getState().moveFurn(f0.id, x0 + 0.2, z0)
    st.getState().moveFurn(f0.id, x0 + 0.5, z0 + 0.3)
    st.getState().setDrag(null)

    assert.equal(st.getState().past.length, 1, 'whole drag should be 1 undo step')
    assert.ok(Math.abs(st.getState().furniture[0].x - (x0 + 0.5)) < 1e-4)

    st.getState().undo()
    assert.equal(st.getState().past.length, 0)
    assert.equal(st.getState().future.length, 1)
    assert.ok(Math.abs(st.getState().furniture[0].x - x0) < 1e-4, 'undo should restore x')
    assert.ok(Math.abs(st.getState().furniture[0].z - z0) < 1e-4, 'undo should restore z')

    st.getState().redo()
    assert.equal(st.getState().past.length, 1)
    assert.ok(Math.abs(st.getState().furniture[0].x - (x0 + 0.5)) < 1e-4, 'redo should reapply x')
  })

  test('Undo / Redo: addFurn enters cursor-carry mode, placing is 1 step, rotate and removeFurn are each undoable', () => {
    reset()
    const st = useStore
    const n0 = st.getState().furniture.length
    st.getState().addFurn('treadmill')
    assert.equal(st.getState().furniture.length, n0 + 1)
    assert.equal(st.getState().drag?.carry, true, 'addFurn should start carry mode following mouse')
    const id = st.getState().selected
    assert.ok(id)

    // Move under mouse and drop -> still 1 undo step total for adding + placing
    st.getState().moveFurn(id, 3.0, 4.0)
    st.getState().setDrag(null)
    assert.equal(st.getState().past.length, 1, 'add + cursor placement should be 1 undo step')

    st.getState().patchFurn(id, { rot: Math.PI / 2 })
    st.getState().removeFurn(id)
    assert.equal(st.getState().furniture.length, n0)

    st.getState().undo()
    assert.equal(st.getState().furniture.length, n0 + 1, 'undo removeFurn should restore item')
    st.getState().undo()
    assert.equal(st.getState().furniture.find((f) => f.id === id)?.rot, 0, 'undo rotate should restore rot')
    st.getState().undo()
    assert.equal(st.getState().furniture.length, n0, 'undo addFurn should remove item')
  })

  test('Undo / Redo: removing and editing a window restores it immediately', () => {
    reset()
    const st = useStore
    const w = walls.find((q) => openingsOf(q, st.getState().nodes).some((o) => o.kind === 'window'))
    assert.ok(w, 'flat should have a wall with a window')
    const opsBefore = openingsOf(w, st.getState().nodes)
    const winIdx = opsBefore.findIndex((o) => o.kind === 'window')
    const winBefore = opsBefore[winIdx]

    st.getState().editOpening(w.id, winIdx, { sill: 0.1, top: 2.45, width: 2.4 })
    const winEdited = openingsOf(w, st.getState().nodes)[winIdx]
    assert.ok(Math.abs(winEdited.sill - 0.1) < 1e-4, 'window sill should become 0.1 m')

    st.getState().undo()
    const winRestored = openingsOf(w, st.getState().nodes)[winIdx]
    assert.ok(Math.abs(winRestored.sill - winBefore.sill) < 1e-4, 'undo should restore window sill')

    st.getState().removeOpening(w.id, winIdx)
    assert.equal(openingsOf(w, st.getState().nodes).length, opsBefore.length - 1, 'window should be removed')

    st.getState().undo()
    assert.equal(openingsOf(w, st.getState().nodes).length, opsBefore.length, 'undo should restore removed window')
  })

  test('Z-axis lock: floor items stay locked at y=0, wall-mounted items can move vertically', () => {
    reset()
    const st = useStore
    for (const t of ['sofa', 'lSofa', 'desk', 'treadmill', 'gamingChair', 'officeChair', 'cornerDesk', 'plant', 'rug']) {
      assert.equal(isWallMounted(t), false, `${t} should be floor-standing`)
    }
    for (const t of ['shelf', 'tv', 'mirror', 'ac', 'towelWarmer']) {
      assert.equal(isWallMounted(t), true, `${t} should be wall-mounted`)
    }
    st.getState().addFurn('lSofa')
    const sofaId = st.getState().selected
    st.getState().patchFurn(sofaId, { y: 1.2 })
    assert.equal(st.getState().furniture.find((f) => f.id === sofaId)?.y, undefined, 'floor item y must remain undefined')

    st.getState().addFurn('mirror')
    const mirrorId = st.getState().selected
    st.getState().setAxis('z')
    st.getState().patchFurn(mirrorId, { y: 1.6 })
    assert.equal(st.getState().furniture.find((f) => f.id === mirrorId)?.y, 1.6, 'wall-mounted item y should update')

    st.getState().select(sofaId)
    assert.equal(st.getState().axis, 'free', 'selecting a floor item should clear Z axis lock')
  })

  test('Room sizes and item-to-wall distances return valid measurements', () => {
    reset()
    const st = useStore
    for (const r of rooms.filter((q) => !q.skip)) {
      const sz = roomSize(insetRoom(r, st.getState().nodes))
      assert.ok(sz.w > 0.5 && sz.d > 0.5, `room ${r.id} size should be positive`)
    }
    const f0 = st.getState().furniture[0]
    const dists = itemWallDistances(f0, st.getState().nodes, st.getState().customWalls)
    assert.equal(dists.length, 4, 'item should report 4 wall distances')
    assert.ok(dists.every((d) => d.dist >= 0))
  })

  test('Overflow zones and minimal-nudge Fit to space preserve rotation and dimensions', () => {
    reset()
    const st = useStore
    const bed = st.getState().furniture.find((f) => f.type === 'bed')
    assert.ok(bed, 'flat should have a bed')
    const origRot = bed.rot, origW = bed.w, origD = bed.d
    // Push bed 20 cm into a wall by moving it slightly past room edge
    const dists = itemWallDistances(bed, st.getState().nodes, st.getState().customWalls).sort((a, b) => a.dist - b.dist)
    const near = dists[0]
    const dirX = Math.sign(near.to[0] - near.from[0]) || 0
    const dirZ = Math.sign(near.to[1] - near.from[1]) || 0
    const pushed = { ...bed, x: bed.x + dirX * (near.dist + 0.15), z: bed.z + dirZ * (near.dist + 0.15) }
    const ovs = overflowZones(pushed, st.getState().nodes, st.getState().customWalls, st.getState().furniture)
    assert.ok(ovs.some((z) => z.kind === 'wall'), 'pushed bed should report wall overflow zone')

    const fitted = fitFurn(pushed, st.getState().furniture, st.getState().nodes, st.getState().customWalls)
    assert.ok(fitted, 'fitFurn should find a nudged spot')
    assert.equal(fitted.rot, origRot, 'fitFurn must not rotate item')
    assert.equal(fitted.w, origW, 'fitFurn must not resize w')
    assert.equal(fitted.d, origD, 'fitFurn must not resize d')
    assert.equal(misplacedReason(fitted, st.getState().nodes, st.getState().customWalls, st.getState().furniture.map((q) => (q.id === fitted.id ? fitted : q))), null)
  })

  test('Door opening side: flipping swing moves clearance zone to the other side', () => {
    reset()
    const st = useStore
    const w = walls.find((q) => q.thick < 20 && openingsOf(q, st.getState().nodes).some((o) => o.kind === 'door'))
    assert.ok(w, 'flat should have an interior door')
    const o = openingsOf(w, st.getState().nodes).find((q) => q.kind === 'door')
    const key = w.id + ':' + (o.i ?? 0)
    const sg0 = doorSwing(w, o, st.getState().nodes, st.getState().doorState)
    st.getState().setDoor(key, { swing: sg0 === 1 ? -1 : 1 })
    const sg1 = doorSwing(w, o, st.getState().nodes, st.getState().doorState)
    assert.equal(sg1, -sg0, 'doorSwing should reflect flipped side')
    st.getState().undo()
    assert.equal(doorSwing(w, o, st.getState().nodes, st.getState().doorState), sg0, 'undo should restore door swing')
  })

  test('L-shaped furniture uses exact L-shaped hitbox (inner cutout is free)', () => {
    reset()
    const st = useStore
    // Place an L-shape sofa (2.5 x 1.7, chaise on right) in the open living room
    const sofa = { id: 'ls1', type: 'lSofa', x: 4.2, z: 5.5, rot: 0, style: 'right' }
    // Coffee table placed in the inner cutout (left-front quadrant of the L-sofa: x = 4.2 - 0.55, z = 5.5 + 0.45)
    const tableInCutout = { id: 'ct1', type: 'coffeeTable', x: 4.2 - 0.55, z: 5.5 + 0.45, rot: 0, w: 0.8, d: 0.5 }
    assert.equal(misplacedReason(tableInCutout, st.getState().nodes, [], [sofa, tableInCutout]), null, 'coffee table in L-sofa cutout should not overlap')
    assert.equal(overflowZones(tableInCutout, st.getState().nodes, [], [sofa, tableInCutout]).length, 0)

    // Coffee table placed on top of the chaise leg (right-front quadrant: x = 4.2 + 0.78, z = 5.5 + 0.45) MUST collide
    const tableOnChaise = { id: 'ct2', type: 'coffeeTable', x: 4.2 + 0.78, z: 5.5 + 0.45, rot: 0, w: 0.8, d: 0.5 }
    assert.equal(misplacedReason(tableOnChaise, st.getState().nodes, [], [sofa, tableOnChaise]), 'overlaps l-shape sofa')
    assert.ok(overflowZones(tableOnChaise, st.getState().nodes, [], [sofa, tableOnChaise]).some((z) => z.kind === 'item'))
  })

  test('Catalog includes UREVO Foldi 3S and new furniture models', () => {
    assert.equal(CATALOG.treadmill.label, 'UREVO Foldi 3S')
    assert.equal(CATALOG.treadmill.w, 0.65)
    assert.equal(CATALOG.treadmill.d, 1.31)
    assert.ok(CATALOG.lSofa && CATALOG.officeChair && CATALOG.cornerDesk && CATALOG.ottoman && CATALOG.gamingChair && CATALOG.desk)
  })
} finally {
  await server.close()
}

console.log(`\nUnit tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
