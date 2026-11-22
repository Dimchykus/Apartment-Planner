// Real headless Chrome E2E test for Ctrl+Z / Ctrl+Y, Walls mode window editing, and core interactions.
import assert from 'node:assert/strict'
import { launch } from './cdp.mjs'

const URL = process.env.URL ?? 'http://localhost:5173/'
const b = await launch({ port: 9341, width: 1360, height: 860 })

async function pressCtrl(key, code, shift = false) {
  const modifiers = 2 | (shift ? 8 : 0) // 2 = Ctrl, 8 = Shift
  await b.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), key, code })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), key, code })
  await b.sleep(150)
}

try {
  await b.goto(URL + '?help=0&debug=1&theme=light')
  await b.waitFor('!!window.__planner?.store')
  await b.sleep(1500)

  // Reset to a clean flat-1b state
  await b.eval("window.__planner.store.getState().switchFlat('flat-1b')")
  await b.sleep(300)

  // 1. Add furniture -> real Ctrl+Z -> real Ctrl+Y
  const n0 = await b.eval('window.__planner.store.getState().furniture.length')
  await b.eval("window.__planner.store.getState().addFurn('treadmill')")
  await b.sleep(200)
  const n1 = await b.eval('window.__planner.store.getState().furniture.length')
  assert.equal(n1, n0 + 1, 'addFurn should add UREVO Foldi 3S')

  const undoDisabledBefore = await b.eval("document.querySelector('[title^=\"Undo\"]')?.disabled")
  assert.equal(undoDisabledBefore, false, 'Undo button should be enabled after addFurn')

  await pressCtrl('z', 'KeyZ')
  const nAfterUndo = await b.eval('window.__planner.store.getState().furniture.length')
  assert.equal(nAfterUndo, n0, 'Real Ctrl+Z should undo addFurn')

  await pressCtrl('y', 'KeyY')
  const nAfterRedo = await b.eval('window.__planner.store.getState().furniture.length')
  assert.equal(nAfterRedo, n0 + 1, 'Real Ctrl+Y should redo addFurn')

  // 2. Drag move -> real Ctrl+Z even while a range slider or button has focus!
  await b.eval("[...document.querySelectorAll('.mbtn')].find(e => e.textContent.includes('Move')).click()")
  await b.sleep(300)
  await b.eval("document.querySelector('.side-body button')?.focus()")
  const x0 = await b.eval('window.__planner.store.getState().furniture[0].x')
  await b.eval(`(() => {
    const st = window.__planner.store.getState()
    const f = st.furniture[0]
    st.setDrag({ kind: 'furn', id: f.id, dx: 0, dz: 0, sx: f.x, sz: f.z, sy: 0, cy: 0 })
    st.moveFurn(f.id, f.x + 0.4, f.z)
    st.setDrag(null)
  })()`)
  await b.sleep(200)
  const x1 = await b.eval('window.__planner.store.getState().furniture[0].x')
  assert.ok(Math.abs(x1 - (x0 + 0.4)) < 1e-3, 'furniture should move')

  await pressCtrl('z', 'KeyZ')
  const xAfterUndo = await b.eval('window.__planner.store.getState().furniture[0].x')
  assert.ok(Math.abs(xAfterUndo - x0) < 1e-3, 'Real Ctrl+Z should undo drag move even when a sidebar button is focused')

  // 3. Remove window in Walls mode -> real Ctrl+Z restores it
  await b.eval("[...document.querySelectorAll('.mbtn')].find(e => e.textContent.includes('Walls')).click()")
  await b.sleep(300)
  const removeBtnExists = await b.eval("!!document.querySelector('.side.tools .flats .ibtn.danger')")
  assert.equal(removeBtnExists, true, 'Walls panel should show Windows & doors list with remove buttons')
  const openingsCount0 = await b.eval("document.querySelectorAll('.side.tools .flats .flat').length")
  await b.eval("document.querySelector('.side.tools .flats .ibtn.danger').click()")
  await b.sleep(200)
  const openingsCount1 = await b.eval("document.querySelectorAll('.side.tools .flats .flat').length")
  assert.equal(openingsCount1, openingsCount0 - 1, 'Clicking remove in Walls mode should remove opening')

  await pressCtrl('z', 'KeyZ')
  await b.sleep(200)
  const openingsCountUndo = await b.eval("document.querySelectorAll('.side.tools .flats .flat').length")
  assert.equal(openingsCountUndo, openingsCount0, 'Real Ctrl+Z should restore removed window')

  const errs = b.logs.filter((l) => l.startsWith('EXCEPTION:') || l.startsWith('error:'))
  assert.equal(errs.length, 0, 'Should have no console errors: ' + errs.join(' | '))
  console.log('E2E Ctrl+Z & regression tests PASSED!')
} finally {
  b.close()
}
