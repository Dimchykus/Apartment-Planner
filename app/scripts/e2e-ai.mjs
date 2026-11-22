// AI furnish through the real UI with a real local Ollama.
import { launch } from './cdp.mjs'
const URL = process.env.URL ?? 'http://localhost:5173/'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT ?? (tmpdir().replace(/\/g, '/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })
const b = await launch({ port: 9342, width: 1360, height: 860 })
const P = (expr) => b.eval(`(() => { const { store, ui } = window.__planner; const s = store.getState(); ${expr} })()`)
try {
  await b.goto(URL + '?help=0&theme=light&quality=med&debug=1&close=overview,tools&mode=furniture')
  await b.waitFor("!!window.__planner?.store"); await b.sleep(5000)
  await b.waitFor("document.querySelector('.ai-status.ok') !== null", 15000)
  console.log('connected:', await b.eval("document.querySelector('.ai-status').innerText.split(String.fromCharCode(10)).join(' ')"))
  const layout = () => P("return JSON.stringify(store.getState().furniture.filter(f => ['bed','sofa','wardrobe','diningTable','tvUnit'].includes(f.type)).map(f => f.type + '@' + f.x.toFixed(1) + ',' + f.z.toFixed(1)))")
  console.log('before:', await layout())
  // 2 variants per run for the test
  await b.eval("(() => { const el = [...document.querySelectorAll('button')].find(e => e.textContent.includes('Show AI settings')); el && el.click() })()")
  await b.sleep(400)
  await b.eval("(() => { const r = [...document.querySelectorAll('input[type=range]')].find(i => i.max === '6'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '2'); r.dispatchEvent(new Event('input', { bubbles: true })) })()")
  await b.sleep(300)
  await b.eval("document.querySelector('.ai-go').click()")
  await b.waitFor("document.querySelector('.ai-busy') !== null", 5000)
  console.log('busy:', await b.eval("document.querySelector('.ai-busy small').innerText"))
  await b.shot(OUT + '/ai_busy.png')
  await b.waitFor("document.querySelectorAll('.variant').length >= 2", 200000)
  console.log('variants:', await b.eval("[...document.querySelectorAll('.variant')].map(v => v.innerText.split(String.fromCharCode(10)).join(' ')).join(' | ')"))
  console.log('after run 1:', await layout())
  await b.sleep(1500); await b.shot(OUT + '/ai_done.png')
  // second run: different layouts?
  await b.eval("document.querySelector('.ai-go').click()")
  await b.waitFor("document.querySelectorAll('.variant').length >= 4", 200000)
  console.log('variants after run 2:', await b.eval("[...document.querySelectorAll('.variant')].map(v => v.innerText.split(String.fromCharCode(10)).join(' ')).join(' | ')"))
  console.log('after run 2:', await layout())
  // click another variant -> layout changes
  await b.eval("document.querySelectorAll('.variant')[2].click()"); await b.sleep(800)
  console.log('apply 3rd variant:', await layout())
  console.log('undo restores previous:', await P("store.getState().undo(); return JSON.stringify(store.getState().furniture.length)"))
  console.log('lights/switches regenerated:', await P("return store.getState().lights.length + '/' + store.getState().switches.length"))
  console.log('misplaced items in applied layout:', await b.eval(`document.querySelector('.warn')?.innerText ?? 'none shown'`))
  console.log('errors:', b.logs.filter((l) => !l.includes('THREE.Clock') && !l.includes('synchronously')).slice(0, 3).join(' | ') || 'none')
  await b.sleep(1000); await b.shot(OUT + '/ai_final.png')
} catch (e) { console.log('FAIL', e.message); console.log(b.logs.slice(0, 4)) }
b.close()
