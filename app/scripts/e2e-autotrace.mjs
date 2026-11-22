// Auto-detection of walls / doors / windows on the sample plans: screenshots of the result for eyeballing.
import { launch } from './cdp.mjs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL ?? 'http://localhost:5173/'
const OUT = process.env.OUT ?? (tmpdir().split(String.fromCharCode(92)).join('/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })
const plans = [['plan1', 1021, 796, 79], ['plan2', 726, 853, 104], ['plan3', 788, 828, 117]]
if (process.env.PHOTO) plans.push(['photo', 0, 0, 47])
const only = process.argv[2]
const b = await launch({ width: 1360, height: 900 })
try {
  for (const [name, W0, H0, pxm] of plans) {
    if (only && only !== name) continue
    let W = W0, H = H0
    await b.goto(URL + '?help=0&theme=light&quality=low&menu=1')
    if (process.env.FORCE) await b.eval('window.__forceOutline = true')
    await b.waitFor("document.querySelector('.side') !== null")
    if (!(await b.eval("[...document.querySelectorAll('button')].some(e => e.textContent.includes('New flat from a plan image'))"))) await b.eval("[...document.querySelectorAll('.card-h')].find(e => e.textContent.includes('My flats')).click()")
    await b.waitFor("[...document.querySelectorAll('button')].some(e => e.textContent.includes('New flat from a plan image'))")
    await b.eval("[...document.querySelectorAll('button')].find(e => e.textContent.includes('New flat from a plan image')).click()")
    await b.waitFor("document.querySelector('.tr') !== null")
    await b.upload('.tr-drop input', [name === 'photo' ? process.env.PHOTO : resolve(import.meta.dirname, `../src/assets/${name}.png`)])
    await b.waitFor("document.querySelector('.tr-svg image') !== null")
    await b.sleep(400)
    if (!W) { const dims = await b.eval("(() => { const i = document.querySelector('.tr-svg image'); return [i.width.baseVal.value, i.height.baseVal.value] })()"); W = dims[0]; H = dims[1] }
    const toScreen = ([px, py]) => b.eval(`(() => { const i = document.querySelector('.tr-svg image').getBoundingClientRect(); return [i.left + ${px} * i.width / ${W}, i.top + ${py} * i.height / ${H}] })()`)
    for (const p of [[100, 20], [100 + 3 * pxm, 20]]) { const [x, y] = await toScreen(p); await b.click(x, y) }
    await b.eval("(() => { const i = document.querySelector('.tr-box input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '3'); i.dispatchEvent(new Event('input', { bubbles: true })) })()")
    await b.eval("[...document.querySelectorAll('.tr-box button')].find(e => e.textContent.includes('Apply scale')).click()")
    const t0 = Date.now()
    await b.waitFor("/[1-9]\\d* wall pieces/.test([...document.querySelectorAll('.tr-box small')].map(s => s.textContent).join(' '))", 60000).catch(() => {})
    console.log(name, 'walls in', Date.now() - t0, 'ms:', await b.eval("document.querySelector('.tr-box small')?.textContent"), '| err:', await b.eval("document.querySelector('.warn')?.textContent ?? '-'"))
    if (process.env.SWITCH) { await b.eval("[...document.querySelectorAll('.tr-box button')].find(e => e.textContent.includes('Not right?')).click()"); await b.sleep(500); console.log('switched:', await b.eval("document.querySelector('.toast')?.textContent")) }
    if (process.env.OUTL) console.log(await b.eval('JSON.stringify(window.__outl)'))
    console.log(name, 'method:', await b.eval("JSON.stringify(window.__detInfo)"))
    await b.shot(`${OUT}/${name}-walls.png`)
    if (name === 'plan1' && process.env.AI) {
      await b.eval("[...document.querySelectorAll('.tr-box button')].find(e => e.textContent.includes('AI finds the flat')).click()")
      await b.waitFor("![...document.querySelectorAll('.tr-box button')].some(e => e.textContent.includes('AI is looking'))", 240000)
      await b.sleep(500)
      console.log('AI walls:', await b.eval("[...document.querySelectorAll('.tr-box small')].map(s => s.textContent).pop()"), '| err:', await b.eval("document.querySelector('.warn')?.textContent ?? '-'"))
      await b.shot(`${OUT}/plan1-ai-walls.png`)
    }
    if (name === 'plan1' && !process.env.AI) {
      await b.eval("[...document.querySelectorAll('.tr-box button')].find(e => e.textContent.includes('Connect / models')).click()")
      await b.waitFor("document.querySelector('.ai-modal') !== null")
      await b.sleep(1500)
      await b.shot(`${OUT}/ai-modal.png`)
      await b.key('Escape')
    }
    if (name === 'plan1') {
      const node = () => b.eval("(() => { const c = [...document.querySelectorAll('.tr-svg circle')].filter(x => x.getAttribute('fill') === '#ffd23f')[3]; const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, c.getAttribute('cx')] })()")
      const n0 = await node()
      for (const [type, dx] of [['mousePressed', 0], ['mouseMoved', 12], ['mouseMoved', 30], ['mouseReleased', 30]]) await b.send('Input.dispatchMouseEvent', { type, x: n0[0] + dx, y: n0[1] + dx / 2, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
      const n1 = await node()
      console.log('corner drag: cx', n0[2], '->', n1[2])
      await b.eval("document.querySelector('.tr-tools .ibtn').click()")
      console.log('after undo: cx', (await node())[2])
    }
    await b.eval("[...document.querySelectorAll('.tr-nav .btn')].find(e => e.textContent.includes('Next')).click()")
    await b.waitFor("document.querySelector('.tr-step.on')?.textContent.includes('Doors')")
    await b.sleep(1500)
    console.log(name, 'openings:', await b.eval("[...document.querySelectorAll('.tr-box small')].map(s => s.textContent).join(' / ')"))
    await b.shot(`${OUT}/${name}-openings.png`)
    if (name === 'plan1' && process.env.AI) {
      await b.eval("[...document.querySelectorAll('.tr-box button')].find(e => e.textContent.includes('Second opinion')).click()")
      await b.waitFor("![...document.querySelectorAll('.tr-box button')].some(e => e.textContent.includes('AI is looking'))", 240000)
      await b.shot(`${OUT}/plan1-ai-types.png`)
      console.log('AI types:', await b.eval("document.querySelector('.toast')?.textContent ?? '-'"), '| err:', await b.eval("document.querySelector('.warn')?.textContent ?? '-'"))
    }
    if (name === 'plan1') {
      // drag the first window along its wall, then retype it as a door
      const st = () => b.eval("JSON.stringify([...document.querySelectorAll('.tr-box small')].pop().textContent)")
      const geo = await b.eval("(() => { const l = [...document.querySelectorAll('.tr-svg line')].find(x => x.getAttribute('stroke') === '#0f8a8a'); const r = l.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })()")
      await b.click(geo[0], geo[1]); await b.sleep(200)
      console.log('selected panel:', await b.eval("document.querySelector('.tr-room.sel') ? 'yes' : 'no'"))
      for (const type of ['mousePressed', 'mouseMoved', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: type === 'mousePressed' ? geo[0] : geo[0] + 40, y: geo[1], button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
      await b.eval("[...document.querySelectorAll('.tr-room.sel .seg button')].find(e => e.textContent.includes('Door')).click()")
      console.log('after retype:', await st())
    }
  }
  if (b.logs.length) console.log(b.logs.slice(0, 8).join('\n'))
} finally { b.close() }
console.log('shots in', OUT)
