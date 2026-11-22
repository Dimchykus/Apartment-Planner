import { startMcpBridge } from './lib/mcpBridge'
import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, Environment, Lightformer, SoftShadows } from '@react-three/drei'
import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Flat, PlanOverlay } from './Flat'
import { Walker, Flyer } from './Walk'
import { DragPlane, Guides, WallHandles, Furniture, Keys } from './Editor'
import { Dimensions } from './Dims'
import { Outside, SunLight, ENV_SETTINGS } from './Outside'
import { RoomsLayer } from './Rooms'
import { Electrics } from './Electrics'
import { m, initialNodes } from './plan'
import { useStore } from './store'
import { useUI, isTouch } from './ui/uiStore'
import { Sidebar, ToolPanel, ToolsTab, EDIT_MODES } from './ui/Sidebar'
import { ModeBar, TopBar, Toast, Help } from './ui/Bars'
import { Tracer } from './ui/Tracer'
import { AiConnect } from './ui/AiConnect'
import { Joystick } from './ui/Joystick'
import { duplicateFlat } from './lib/libraryActions'
import { useAI } from './ai/aiStore'
import './App.css'

/** Flat 2D plan view: orthographic camera straight above, fitted to the window. */
function View2D({ cx, cz, w, h }: { cx: number; cz: number; w: number; h: number }) {
  const size = useThree((s) => s.size)
  const zoom = Math.min(size.width / (w * 1.25), size.height / (h * 1.25))
  return <OrthographicCamera makeDefault position={[cx, 40, cz + 0.001]} zoom={zoom} near={0.1} far={200} />
}

function CameraRig({ cx, cz, k, off, still }: { cx: number; cz: number; k: string; off: boolean; still: boolean }) {
  const camera = useThree((s) => s.camera)
  const top = useStore((s) => s.topView)
  // also runs when the camera object itself is swapped (leaving the 2D / wall view), so the 3D view never keeps a top-down position
  useEffect(() => { if (!off && !still) { camera.position.set(cx + 6, 9, cz + 9); camera.up.set(0, 1, 0); camera.lookAt(cx, 0, cz) } }, [k, off, camera]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (top) { camera.position.set(cx, off ? 40 : 16, cz + 0.001); camera.lookAt(cx, 0, cz) } }, [top]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Keep the flat visually centred in the part of the screen the menu doesn't cover. */
function ViewShift() {
  const { camera, size } = useThree()
  const open = useUI((s) => s.menuOpen)
  const full = useUI((s) => s.sheetFull)
  const mode = useStore((s) => s.mode)
  const toolsShown = useUI((s) => s.toolsOpen) && EDIT_MODES.includes(mode)
  useEffect(() => {
    const narrow = size.width < 760
    const walking = mode === 'walk' || mode === 'fly'
    if ((!open && !toolsShown) || walking) { (camera as THREE.PerspectiveCamera).clearViewOffset?.(); camera.updateProjectionMatrix(); return }
    const c = camera as THREE.PerspectiveCamera
    if (narrow) c.setViewOffset?.(size.width, size.height, 0, size.height * (full ? 0.3 : 0.17), size.width, size.height)
    else c.setViewOffset?.(size.width, size.height, -176 + (toolsShown ? 176 : 0), 0, size.width, size.height)
    c.updateProjectionMatrix()
    return () => { c.clearViewOffset?.(); c.updateProjectionMatrix() }
  }, [camera, size.width, size.height, open, full, mode, toolsShown])
  return null
}

/** ?debug exposes the scene for automated tests. */
function DebugHook() {
  const three = useThree()
  useEffect(() => { const w = window as unknown as { __planner?: Record<string, unknown> }; if (new URLSearchParams(location.search).has('debug') || import.meta.env.DEV) w.__planner = { ...(w.__planner ?? {}), three } }, [three])
  return null
}

/** Orbit view with an orthographic camera: same angle as the perspective view, but parallel lines stay parallel. */
function OrbitOrtho({ cx, cz, w, h }: { cx: number; cz: number; w: number; h: number }) {
  const size = useThree((s) => s.size)
  const zoom = Math.min(size.width / (w * 1.5), size.height / (h * 1.5))
  return <OrthographicCamera makeDefault position={[cx + 6, 9, cz + 9]} zoom={zoom} near={0.1} far={400} onUpdate={(c) => c.lookAt(cx, 0, cz)} />
}

/** Elevation view: orthographic camera facing one wall straight on (for aligning things on that wall). */
function WallView({ w }: { w: NonNullable<ReturnType<typeof useUI.getState>['wallView']> }) {
  const size = useThree((s) => s.size)
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2
  const zoom = Math.min(size.width / (L * 1.25 + 0.5), size.height / 3.6)
  return <OrthographicCamera makeDefault position={[mx + w.n[0] * 30, 1.35, mz + w.n[1] * 30]} zoom={zoom} near={0.1} far={80} onUpdate={(c) => c.lookAt(mx, 1.35, mz)} />
}

/** Without post-processing (fast mode) the renderer does the tone mapping itself. */
function Tone({ low }: { low: boolean }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    gl.toneMapping = low ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
    gl.toneMappingExposure = low ? 0.9 : 1
    scene.traverse((o) => { const mt = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => (x.needsUpdate = true)) })
  }, [low, gl, scene])
  return null
}

/** Frame-rate cap: the canvas is driven by this loop instead of the screen's refresh. It draws at the chosen rate while something is happening (camera, keys, edits, walking) and slowly when idle. */
function FpsLimiter({ fps, always }: { fps: number; always: boolean }) {
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    const iv = 1000 / fps
    let last = 0, raf = 0, active = performance.now() + 1500
    const wake = () => { active = performance.now() + 1500 }
    const evs = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'keyup', 'touchmove', 'resize']
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    const u1 = useStore.subscribe(wake), u2 = useUI.subscribe(wake)
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      const busy = always || performance.now() < active
      if (t - last >= (busy ? iv - 2 : 250)) { last = t; advance(t) }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); evs.forEach((e) => window.removeEventListener(e, wake)); u1(); u2() }
  }, [fps, always, advance])
  return null
}

/** Counts the frames that are really drawn. */
function FpsMeter() {
  const n = useRef(0)
  useFrame(() => { n.current++ })
  useEffect(() => {
    const id = setInterval(() => { const el = document.getElementById('fps-meter'); if (el) el.textContent = n.current ? Math.round(n.current * 2) + ' FPS' : 'idle'; n.current = 0 }, 500)
    return () => clearInterval(id)
  }, [])
  return null
}

/** Connects to the local MCP server while the menu switch is on (see app/mcp). */
function McpHost() {
  const on = useUI((x) => x.mcp)
  useEffect(() => {
    if (!on) return
    return startMcpBridge((c) => useUI.getState().setMcpOn(c))
  }, [on])
  return null
}

const DPR: Record<string, [number, number]> = { low: [1, 1], med: [1, 1.25], high: [1, 1.5] }

/** While the camera is being dragged nothing in the scene changes, so the shadow map is not redrawn (one big saving per frame). It is redrawn once when the drag ends. */
function FreezeShadows() {
  const controls = useThree((s) => s.controls) as unknown as THREE.EventDispatcher | null
  const gl = useThree((s) => s.gl), invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!controls) return
    const start = () => { gl.shadowMap.autoUpdate = false }
    const end = () => { gl.shadowMap.autoUpdate = true; gl.shadowMap.needsUpdate = true; invalidate() }
    controls.addEventListener('start' as never, start); controls.addEventListener('end' as never, end)
    return () => { controls.removeEventListener('start' as never, start); controls.removeEventListener('end' as never, end); gl.shadowMap.autoUpdate = true }
  }, [controls, gl, invalidate])
  return null
}

export default function App() {
  const s = useStore()
  const u = useUI()
  const tracerOpen = !!u.tracer
  const fly = s.mode === 'fly'
  const walk = s.mode === 'walk'
  const wallView = !walk && !fly ? u.wallView : null
  const view2d = u.on2d && !walk && !fly && !wallView // flat top-down 2D view
  const op = u.overlay ? u.flatOpacity : 1
  const env = u.env
  const q = u.quality
  const pts = Object.values(initialNodes)
  const cx = m((Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2)
  const cz = m((Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2)
  const fw = m(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])))
  const fh = m(Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])))

  useEffect(() => { document.documentElement.dataset.theme = u.theme }, [u.theme])
  useEffect(() => { // choosing an edit mode shows its tools; leaving it brings back the general tab
    const edit = EDIT_MODES.includes(s.mode)
    useUI.getState().setSheetTab(edit ? 'tools' : 'general')
    if (edit) useUI.getState().setToolsOpen(true)
  }, [s.mode])
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const md = q.get('mode'); if (md) useStore.getState().setMode(md as never)
    if (q.has('debug') || import.meta.env.DEV) (window as unknown as Record<string, unknown>).__planner = { ...((window as unknown as { __planner?: object }).__planner ?? {}), store: useStore, ui: useUI, ai: useAI } // for tests / demos
    const dup = q.get('dup') // ?dup=<flat id>: make an editable copy and open it in the tracer (used for demos / tests)
    if (dup) { const id = duplicateFlat(dup); if (id) useUI.getState().openTracer(id) }
  }, [])

  return (
    <div className="app">
      <Canvas frameloop={u.fps ? 'never' : walk || fly ? 'always' : 'demand'} shadows={q !== 'low' ? 'percentage' : false} dpr={u.res ? Math.max(0.4, Math.min(2, (window.devicePixelRatio || 1) * u.res)) : DPR[q]} camera={{ position: [cx + 6, 9, cz + 9], fov: 50, near: 0.05, far: 5000 }}
        gl={{ toneMapping: THREE.NoToneMapping, antialias: false, preserveDrawingBuffer: true }}
        onPointerMissed={() => s.select(null)}>
        {(view2d || env === 'off' || q === 'low') && <color attach="background" args={[u.theme === 'dark' ? '#1a1f27' : '#dfe6ee']} />}
        <Tone low={q === 'low'} />
        <FreezeShadows />
        {u.fps > 0 && <FpsLimiter fps={u.fps} always={walk || fly} />}
        {u.showFps && <FpsMeter />}
        <DebugHook />
        <Suspense fallback={null}>
          {q === 'high' && <SoftShadows size={14} samples={8} />}
          {/* studio-style reflections made from light panels: no HDRI download, works offline */}
          {q !== 'low' && <Environment resolution={256} environmentIntensity={view2d ? 0.7 : ENV_SETTINGS[env].envI}>
            <Lightformer form="rect" intensity={2.4} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={1.6} position={[-9, 3, 0]} rotation-y={Math.PI / 2} scale={[18, 7, 1]} color="#fff3e0" />
            <Lightformer form="rect" intensity={1.2} position={[9, 3, 2]} rotation-y={-Math.PI / 2} scale={[18, 7, 1]} color="#e8f0ff" />
            <Lightformer form="rect" intensity={1.0} position={[0, 3, -9]} scale={[18, 7, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={0.8} position={[0, 3, 9]} rotation-y={Math.PI} scale={[18, 7, 1]} color="#fff8ee" />
            <Lightformer form="rect" intensity={0.9} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[24, 24, 1]} color="#f3e9dc" />
          </Environment>}
          <hemisphereLight args={['#ffffff', '#cfc6b8', q === 'low' ? 1.5 : view2d ? 0.5 : env === 'night' ? 0.12 : 0.55]} />
          {q !== 'low' && <SunLight env={view2d ? 'off' : env} cx={cx} cz={cz} />}
          {!view2d && env !== 'off' && q !== 'low' && <Outside env={env} cx={cx} cz={cz} fw={fw} fh={fh} />}
          <Flat ceiling={walk} opacity={op} />
          <Electrics view2d={view2d} ceiling2d={u.ceiling2d} />
          <Furniture editable={s.mode === 'furniture' || s.mode === 'move'} movable={s.mode === 'move'} opacity={op} />
          {u.overlay && <PlanOverlay key={s.flatId} opacity={1 - u.flatOpacity} />}
          {s.mode === 'walls' && <WallHandles />}
          {s.mode === 'dims' && <Dimensions />}
          {s.mode === 'rooms' && <RoomsLayer />}
          <DragPlane />
          <Guides />
        </Suspense>
        {walk
          ? <Walker />
          : fly
          ? <Flyer />
          : <OrbitControls key={s.flatId + view2d + (wallView?.label ?? '') + u.ortho} makeDefault enabled={!s.drag && !tracerOpen} target={wallView ? [(wallView.a[0] + wallView.b[0]) / 2, 1.35, (wallView.a[1] + wallView.b[1]) / 2] : [cx, 0, cz]} maxPolarAngle={Math.PI / 2.02}
              enableRotate={!view2d && !wallView} screenSpacePanning
              mouseButtons={view2d ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined}
              touches={view2d ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : undefined} />}
        {view2d && <View2D key={s.flatId} cx={cx} cz={cz} w={fw} h={fh} />}
        {wallView && <WallView key={wallView.label} w={wallView} />}
        {u.ortho && !view2d && !wallView && !walk && !fly && <OrbitOrtho key={s.flatId} cx={cx} cz={cz} w={fw} h={fh} />}
        <Keys />
        <CameraRig cx={cx} cz={cz} k={s.flatId} off={view2d} still={walk || fly} />
        <ViewShift />
        {q !== 'low' && (
          <EffectComposer multisampling={0}>
            <N8AO halfRes aoRadius={0.6} intensity={2.2} distanceFalloff={1} quality={q === 'high' ? 'medium' : 'performance'} />
            <Bloom intensity={0.15} luminanceThreshold={0.9} />
            <ToneMapping mode={7} />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>

      {walk && !isTouch && <><div className="cross" /><div className="cross-hint">E: open door · use switch</div></>}
      {u.showFps && <div id="fps-meter" style={{ position: 'fixed', left: 10, bottom: 10, zIndex: 30, padding: '3px 8px', borderRadius: 8, background: 'rgba(0,0,0,.6)', color: '#7CFC9A', font: '600 12px monospace', pointerEvents: 'none' }}>…</div>}
      <McpHost />
      <TopBar />
      <Sidebar />
      <ToolPanel />
      <ToolsTab />
      <ModeBar />
      {isTouch && (walk || fly) && <Joystick fly={fly} />}
      <Toast />
      <Help />
      <AiConnect />
      {tracerOpen && <Tracer key={u.tracer!.id ?? 'new'} />}
    </div>
  )
}
