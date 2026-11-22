import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, Environment, Lightformer, SoftShadows } from '@react-three/drei'
import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Flat, PlanOverlay } from './Flat'
import { Walker, Flyer } from './Walk'
import { DragPlane, Guides, WallHandles, Furniture, Keys } from './Editor'
import { Dimensions, ItemWallDims } from './Dims'
import { Outside, SunLight, ENV_SETTINGS } from './Outside'
import { RoomsLayer } from './Rooms'
import { Electrics } from './Electrics'
import { m, initialNodes } from './plan'
import { useStore } from './store'
import { useUI, isTouch } from './ui/uiStore'
import { Sidebar, ToolPanel, ToolsTab, EDIT_MODES } from './ui/Sidebar'
import { ModeBar, TopBar, Toast, Help } from './ui/Bars'
import { Tracer } from './ui/Tracer'
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

const DPR: Record<string, [number, number]> = { low: [1, 1.5], med: [1, 1.75], high: [1, 2] }

export default function App() {
  const mode = useStore((s) => s.mode)
  const flatId = useStore((s) => s.flatId)
  const dragging = useStore((s) => !!s.drag)
  const tracer = useUI((s) => s.tracer)
  const wallViewRaw = useUI((s) => s.wallView)
  const on2d = useUI((s) => s.on2d)
  const overlay = useUI((s) => s.overlay)
  const flatOpacity = useUI((s) => s.flatOpacity)
  const env = useUI((s) => s.env)
  const q = useUI((s) => s.quality)
  const theme = useUI((s) => s.theme)
  const ceiling2d = useUI((s) => s.ceiling2d)
  const ortho = useUI((s) => s.ortho)
  const tracerOpen = !!tracer
  const fly = mode === 'fly'
  const walk = mode === 'walk'
  const wallView = !walk && !fly ? wallViewRaw : null
  const view2d = on2d && !walk && !fly && !wallView // flat top-down 2D view
  const op = overlay ? flatOpacity : 1
  const { cx, cz, fw, fh } = useMemo(() => {
    const pts = Object.values(initialNodes)
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    return { cx: m((minX + maxX) / 2), cz: m((minY + maxY) / 2), fw: m(maxX - minX), fh: m(maxY - minY) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatId])

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { // choosing an edit mode shows its tools; leaving it brings back the general tab
    const edit = EDIT_MODES.includes(mode)
    useUI.getState().setSheetTab(edit ? 'tools' : 'general')
    if (edit) useUI.getState().setToolsOpen(true)
  }, [mode])
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const md = q.get('mode'); if (md) useStore.getState().setMode(md as never)
    if (q.has('debug') || import.meta.env.DEV) (window as unknown as Record<string, unknown>).__planner = { ...((window as unknown as { __planner?: object }).__planner ?? {}), store: useStore, ui: useUI, ai: useAI } // for tests / demos
    const dup = q.get('dup') // ?dup=<flat id>: make an editable copy and open it in the tracer (used for demos / tests)
    if (dup) { const id = duplicateFlat(dup); if (id) useUI.getState().openTracer(id) }
  }, [])

  return (
    <div className="app">
      <Canvas frameloop={walk || fly ? 'always' : 'demand'} shadows={q !== 'low' ? 'percentage' : false} dpr={DPR[q]} camera={{ position: [cx + 6, 9, cz + 9], fov: 50, near: 0.05, far: 5000 }}
        gl={{ toneMapping: THREE.NoToneMapping, antialias: false, preserveDrawingBuffer: true }}
        onPointerMissed={() => useStore.getState().select(null)}>
        {(view2d || env === 'off') && <color attach="background" args={[theme === 'dark' ? '#1a1f27' : '#dfe6ee']} />}
        <Tone low={q === 'low'} />
        <DebugHook />
        <Suspense fallback={null}>
          {q === 'high' && <SoftShadows size={18} samples={12} />}
          {/* studio-style reflections made from light panels: no HDRI download, works offline */}
          <Environment resolution={256} environmentIntensity={view2d ? 0.7 : ENV_SETTINGS[env].envI}>
            <Lightformer form="rect" intensity={2.4} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={1.6} position={[-9, 3, 0]} rotation-y={Math.PI / 2} scale={[18, 7, 1]} color="#fff3e0" />
            <Lightformer form="rect" intensity={1.2} position={[9, 3, 2]} rotation-y={-Math.PI / 2} scale={[18, 7, 1]} color="#e8f0ff" />
            <Lightformer form="rect" intensity={1.0} position={[0, 3, -9]} scale={[18, 7, 1]} color="#ffffff" />
            <Lightformer form="rect" intensity={0.8} position={[0, 3, 9]} rotation-y={Math.PI} scale={[18, 7, 1]} color="#fff8ee" />
            <Lightformer form="rect" intensity={0.9} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[24, 24, 1]} color="#f3e9dc" />
          </Environment>
          <hemisphereLight args={['#ffffff', '#cfc6b8', view2d ? 0.5 : env === 'night' ? 0.12 : 0.55]} />
          <SunLight env={view2d ? 'off' : env} cx={cx} cz={cz} quality={q} />
          {!view2d && env !== 'off' && <Outside env={env} cx={cx} cz={cz} fw={fw} fh={fh} />}
          <Flat ceiling={walk} opacity={op} />
          <Electrics view2d={view2d} ceiling2d={ceiling2d} />
          <Furniture editable={mode === 'furniture' || mode === 'move' || mode === 'dims'} movable={mode === 'move'} showBad={mode === 'furniture' || mode === 'move'} opacity={op} />
          {overlay && <PlanOverlay key={flatId} opacity={1 - flatOpacity} />}
          {mode === 'walls' && <WallHandles />}
          {mode === 'dims' && <Dimensions />}
          {(mode === 'furniture' || mode === 'move' || mode === 'dims') && <ItemWallDims />}
          {mode === 'rooms' && <RoomsLayer />}
          <DragPlane />
          <Guides />
        </Suspense>
        {walk
          ? <Walker />
          : fly
          ? <Flyer />
          : <OrbitControls key={flatId + view2d + (wallView?.label ?? '') + ortho} makeDefault enabled={!dragging && !tracerOpen} target={wallView ? [(wallView.a[0] + wallView.b[0]) / 2, 1.35, (wallView.a[1] + wallView.b[1]) / 2] : [cx, 0, cz]} maxPolarAngle={Math.PI / 2.02}
              enableRotate={!view2d && !wallView} screenSpacePanning
              mouseButtons={view2d ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined}
              touches={view2d ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : undefined} />}
        {view2d && <View2D key={flatId} cx={cx} cz={cz} w={fw} h={fh} />}
        {wallView && <WallView key={wallView.label} w={wallView} />}
        {ortho && !view2d && !wallView && !walk && !fly && <OrbitOrtho key={flatId} cx={cx} cz={cz} w={fw} h={fh} />}
        <Keys />
        <CameraRig cx={cx} cz={cz} k={flatId} off={view2d} still={walk || fly} />
        <ViewShift />
        {q !== 'low' && (
          <EffectComposer multisampling={0}>
            <N8AO aoRadius={0.6} intensity={2.2} distanceFalloff={1} quality={q === 'high' ? 'medium' : 'performance'} />
            <Bloom intensity={0.15} luminanceThreshold={0.9} />
            <ToneMapping mode={7} />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>

      {walk && !isTouch && <><div className="cross" /><div className="cross-hint">E: open door · use switch</div></>}
      <TopBar />
      <Sidebar />
      <ToolPanel />
      <ToolsTab />
      <ModeBar />
      {isTouch && (walk || fly) && <Joystick fly={fly} />}
      <Toast />
      <Help />
      {tracerOpen && <Tracer key={tracer!.id ?? 'new'} />}
    </div>
  )
}
