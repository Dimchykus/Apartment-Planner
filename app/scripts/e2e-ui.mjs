// UI checks in headless Chrome: phone layout (touch emulation), joystick, tracer on a phone, Rooms-mode placing circle.
import { launch } from './cdp.mjs'
const URL = process.env.URL ?? 'http://localhost:5173/'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT ?? (tmpdir().replace(/\/g, '/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })

// ───────── phone
let b = await launch({ port: 9334, width: 500, height: 900 })
try {
  await b.mobile(390, 844)
  await b.goto(URL + '?help=0&theme=light')
  await b.waitFor("document.querySelector('.side') !== null")
  await b.sleep(9000)
  await b.shot(OUT + '/p_main.png')
  const info = await b.eval("JSON.stringify({ touch: matchMedia('(pointer: coarse)').matches, quality: JSON.parse(localStorage.getItem('planner-ui-v1')||'{}').quality, sideH: Math.round(document.querySelector('.side').getBoundingClientRect().height), vw: innerWidth, overflowX: document.documentElement.scrollWidth > innerWidth })")
  console.log('phone:', info)
  // expand the sheet, open the tools card
  await b.eval("document.querySelector('.grab-handle').click()")
  await b.sleep(600)
  await b.shot(OUT + '/p_sheet_full.png')
  // walk mode -> joystick
  await b.eval("document.querySelector('.grab-handle').click(); [...document.querySelectorAll('.mbtn')].find(e => e.textContent.includes('Walk')).click()")
  await b.sleep(2500)
  console.log('joystick shown:', await b.eval("!!document.querySelector('.joy')"))
  await b.shot(OUT + '/p_walk.png')
  // hide the menu, then bring it back
  await b.eval("document.querySelector('.side-h .ibtn').click()")
  await b.sleep(500)
  console.log('menu hidden:', await b.eval("document.querySelector('.side').classList.contains('closed')"), '| fab visible:', await b.eval("!!document.querySelector('.fab-menu')"))
  await b.shot(OUT + '/p_hidden.png')
  await b.eval("document.querySelector('.fab-menu').click()")
  // tracer on a phone
  await b.goto(URL + '?help=0&theme=light&dup=flat-29')
  await b.waitFor("document.querySelector('.tr') !== null")
  await b.sleep(2500)
  await b.shot(OUT + '/p_tracer.png')
  console.log('phone errors:', b.logs.filter((l) => !l.includes('THREE.Clock')).slice(0, 3).join(' | ') || 'none')
} catch (e) { console.log('PHONE FAIL', e.message) }
b.close()

// ───────── desktop: Rooms mode placing circle
b = await launch({ port: 9335, width: 1360, height: 860 })
try {
  await b.goto(URL + '?help=0&theme=light&mode=rooms&close=overview&open=tools')
  await b.waitFor("document.querySelector('.chips') !== null")
  await b.sleep(6000)
  await b.eval("[...document.querySelectorAll('.chips button')].find(e => e.textContent.trim().startsWith('Wardrobe')).click()")
  await b.sleep(500)
  for (const [x, y, name] of [[820, 330, 'a'], [700, 300, 'b'], [560, 380, 'c']]) {
    await b.move(x, y); await b.sleep(900)
    const lbl = await b.eval("[...document.querySelectorAll('.lbl')].map(e => e.textContent).find(t => /Wardrobe:/.test(t)) ?? '(no circle label)'")
    console.log('probe at', x, y, '->', lbl)
    await b.shot(OUT + '/d_probe_' + name + '.png')
  }
  console.log('desktop errors:', b.logs.filter((l) => !l.includes('THREE.Clock')).slice(0, 3).join(' | ') || 'none')
} catch (e) { console.log('DESKTOP FAIL', e.message) }
b.close()
