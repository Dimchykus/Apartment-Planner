// The AI setup check for people who do not have everything installed: wrong address, browser blocked (CORS), no model, all fine.
import { launch } from './cdp.mjs'
import { createServer } from 'node:http'
const URL = process.env.URL ?? 'http://localhost:5173/'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
const OUT = process.env.OUT ?? (tmpdir().replace(/\/g, '/') + '/planner-shots')
mkdirSync(OUT, { recursive: true })
// fake Ollama servers: A answers without CORS headers (browser blocks it), B allows everything but has no models
const A = createServer((q, r) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ version: '0.0-fake' })) }).listen(11998)
const B = createServer((q, r) => { r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Content-Type', 'application/json'); r.end(q.url.includes('tags') ? JSON.stringify({ models: [] }) : JSON.stringify({ version: '0.0-fake' })) }).listen(11997)
const b = await launch({ port: 9343, width: 1360, height: 900 })
const state = () => b.eval("JSON.stringify(window.__planner.ai.getState().diag?.steps.map(s => s.id + ':' + s.ok))")
const setUrl = async (u, model = 'qwen2.5:14b') => { await b.eval(`(async () => { const ai = window.__planner.ai.getState(); ai.patch({ url: '${u}', model: '${model}', auto: true }); window.__planner.ai.setState({ diag: null }); await ai.refreshModels() })()`); await b.sleep(1500) }
try {
  await b.goto(URL + '?help=0&theme=light&quality=low&debug=1&close=overview,tools&open=ai')
  await b.waitFor("!!window.__planner?.ai && window.__planner.ai.getState().diag !== null", 20000)
  console.log('1) real Ollama, nothing configured -> ', await state(), '| model chosen:', await b.eval("window.__planner.ai.getState().settings.model"))
  await b.shot(OUT + '/setup_ok.png')
  await setUrl('http://localhost:11999')
  console.log('2) wrong address (nothing listening)  -> ', await state())
  await b.shot(OUT + '/setup_notrunning.png')
  await setUrl('http://localhost:11998')
  console.log('3) running, browser blocked (no CORS) -> ', await state())
  await b.shot(OUT + '/setup_cors.png')
  await setUrl('http://localhost:11997')
  console.log('4) running + allowed, no model        -> ', await state())
  await b.shot(OUT + '/setup_nomodel.png')
  console.log('   run button disabled when not ready:', await b.eval("document.querySelector('.ai-go')?.disabled"))
  await setUrl('http://localhost:11434')
  await b.eval("window.__planner.ai.getState().testModel()"); await b.sleep(15000)
  console.log('5) back to real Ollama + model test   -> ', await state(), '| ready:', await b.eval("window.__planner.ai.getState().diag.ready"))
  console.log('errors:', b.logs.filter((l) => !l.includes('THREE.Clock') && !l.includes('synchronously') && !l.includes('Failed to load resource') && !l.includes('CORS') && !l.includes('ERR_')).slice(0, 3).join(' | ') || 'none')
} catch (e) { console.log('FAIL', e.message) }
b.close(); A.close(); B.close()
