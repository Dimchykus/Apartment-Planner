// End-to-end: build a flat through the real UI (upload plan image, scale, walls, openings, rooms, save) in headless Chrome.
import { launch } from './cdp.mjs'
import { resolve } from 'node:path'

const URL = process.env.URL ?? 'http://localhost:5173/'
const IMG = resolve(import.meta.dirname, '../src/assets/plan3.png')
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT ?? (tmpdir().replace(/\/g, '/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })
const b = await launch()
const fail = (m) => { console.log('FAIL:', m); console.log(b.logs.slice(0, 8).join('\n')); b.close(); process.exit(1) }
try {
  await b.goto(URL + '?help=0&theme=light&quality=low&menu=1')
  await b.waitFor("document.querySelector('.side') !== null")
  // open the tracer from the menu: My flats -> New flat
  await b.eval("[...document.querySelectorAll('.card-h')].find(e => e.textContent.includes('My flats')).click()")
  await b.waitFor("[...document.querySelectorAll('button')].some(e => e.textContent.includes('New flat from a plan image'))")
  await b.eval("[...document.querySelectorAll('button')].find(e => e.textContent.includes('New flat from a plan image')).click()")
  await b.waitFor("document.querySelector('.tr') !== null")
  console.log('tracer opened')
  await b.upload('.tr-drop input', [IMG])
  await b.waitFor("document.querySelector('.tr-svg image') !== null")
  await b.sleep(400)
  // helper: image px -> screen px
  const toScreen = async ([px, py]) => b.eval(`(() => { const i = document.querySelector('.tr-svg image').getBoundingClientRect(); return [i.left + ${px} * i.width / ${788}, i.top + ${py} * i.height / ${828}] })()`)
  const clickImg = async (p) => { const [x, y] = await toScreen(p); await b.click(x, y) }
  // scale: the bedroom's top wall is 10..800 px wide = 6.75 m in my trace (117 px/m)
  await clickImg([10, 38]); await clickImg([800, 38])
  await b.eval("(() => { const i = document.querySelector('.tr-box input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '6.75'); i.dispatchEvent(new Event('input', { bubbles: true })) })()")
  await b.eval("[...document.querySelectorAll('.tr-box button')].find(e => e.textContent.includes('Apply scale')).click()")
  await b.waitFor("document.querySelector('.tr-step.on')?.textContent.includes('Walls')")
  console.log('scale applied -> walls step')
  // walls (the outline + inner walls of apartment 62)
  const chain = async (pts) => { for (const p of pts) await clickImg(p); await b.key('Escape') }
  await chain([[10, 38], [800, 38], [800, 800], [10, 800], [10, 38]])
  await chain([[415, 38], [415, 570]])           // living | bedroom/loggia
  await chain([[415, 215], [800, 215]])          // loggia | bedroom
  await chain([[415, 570], [800, 570]])          // bedroom | bath
  await chain([[525, 570], [525, 800]])          // bath west wall
  const walls = await b.eval("document.querySelector('.tr-box small').textContent")
  console.log('walls:', walls)
  // doors & windows
  await b.eval("[...document.querySelectorAll('.tr-nav .btn')].find(e => e.textContent.includes('Next')).click()")
  await b.waitFor("document.querySelector('.tr-step.on')?.textContent.includes('Doors')")
  await clickImg([330, 800])                      // entrance
  await clickImg([470, 570]); await clickImg([525, 700]); await clickImg([360, 215])
  await b.eval("[...document.querySelectorAll('.tr-box .seg button')].find(e => e.textContent.includes('Window')).click()")
  await clickImg([220, 38]); await clickImg([800, 400]); await clickImg([600, 38])
  console.log('openings:', await b.eval("document.querySelector('.tr-box small').textContent"))
  // rooms
  await b.eval("[...document.querySelectorAll('.tr-nav .btn')].find(e => e.textContent.includes('Next')).click()")
  await b.waitFor("document.querySelector('.tr-step.on')?.textContent.includes('Rooms')")
  for (const [name, p] of [['kitchen-living', [200, 400]], ['bedroom', [600, 400]], ['loggia', [650, 120]], ['bathroom', [660, 690]]]) {
    await clickImg(p); await b.sleep(250)
    console.log('  ', name, '-> rooms:', await b.eval("document.querySelectorAll('.tr-room').length"), '| toast:', await b.eval("document.querySelector('.toast')?.textContent ?? '-'"))
  }
  await b.waitFor("document.querySelectorAll('.tr-room select').length === 4")
  const rs = await b.eval("[...document.querySelectorAll('.tr-room select')].map(s => s.value).join(',')")
  console.log('rooms marked:', rs)
  // set the loggia + bathroom types through the selects
  await b.eval(`(() => { const sels = [...document.querySelectorAll('.tr-room select')]; const set = (s, v) => { const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; d.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true })) }; set(sels[2], 'loggia'); set(sels[3], 'bath') })()`)
  await b.sleep(300)
  console.log('room types:', await b.eval("[...document.querySelectorAll('.tr-room select')].map(s => s.value).join(',')"))
  await b.shot(OUT + '/e2e_rooms.png')
  // skip fixtures, go to save
  await b.eval("[...document.querySelectorAll('.tr-nav .btn')].find(e => e.textContent.includes('Next')).click()")
  await b.eval("[...document.querySelectorAll('.tr-nav .btn')].find(e => e.textContent.includes('Next')).click()")
  await b.waitFor("document.querySelector('.tr-step.on')?.textContent.includes('Save')")
  console.log('summary:', await b.eval("document.querySelector('.tr-sum')?.innerText ?? document.querySelector('.tr-box .warn')?.innerText"))
  await b.shot(OUT + '/e2e_save.png')
  await b.eval("[...document.querySelectorAll('.tr-box .btn.primary')].find(e => e.textContent.includes('Create flat')).click()")
  await b.waitFor("document.querySelector('.tr') === null")
  await b.sleep(6000)
  const state = await b.eval("JSON.stringify({ flat: document.querySelector('.flat-pick select').selectedOptions[0].textContent, groups: [...document.querySelectorAll('.flat-pick optgroup')].map(g => g.label), saved: JSON.parse(localStorage.getItem('planner-user-flats-v1') || '[]').length })")
  console.log('after save:', state)
  await b.shot(OUT + '/e2e_flat.png')
  console.log('page errors:', b.logs.length ? b.logs.slice(0, 5).join(' | ') : 'none')
} catch (e) { fail(e.message) }
b.close()
