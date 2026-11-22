// Tiny Chrome DevTools driver for end-to-end checks (headless Chrome, no extra dependencies).
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export async function launch({ port = 9333, width = 1360, height = 860 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-'))
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
  let list
  for (let i = 0; i < 60; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.find((t) => t.type === 'page')) break } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const waiting = new Map()
  const logs = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && waiting.has(d.id)) { const { res, rej } = waiting.get(d.id); waiting.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result) }
    else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '))
    else if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text))
  }
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable')
  const api = {
    send, logs,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async goto(url) { await send('Page.navigate', { url }); await api.sleep(1500) },
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed'); return r.result.value },
    async waitFor(expr, timeout = 30000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await api.eval(expr)) return true } catch { /* retry */ } await api.sleep(300) } throw new Error('timeout waiting for: ' + expr) },
    async click(x, y, button = 'left') { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }) },
    async move(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }) },
    async key(key, code) { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: code ?? key }) },
    async upload(selector, files) { const { root } = await send('DOM.getDocument'); const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector }); await send('DOM.setFileInputFiles', { nodeId, files }) },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')) },
    async mobile(w = 390, h = 844) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }) },
    close() { try { ws.close() } catch { /* */ } proc.kill() },
  }
  return api
}
