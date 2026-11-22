import { create } from 'zustand'
import type { EnvId } from '../Outside'

export type Quality = 'low' | 'med' | 'high'
export type Theme = 'light' | 'dark'
export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

const KEY = 'planner-ui-v1'
type Saved = { rulesOnCriteria?: boolean; theme?: Theme; quality?: Quality; res?: number; fps?: number; mcp?: boolean; showFps?: boolean; cards?: Record<string, boolean>; helpSeen?: boolean; env?: EnvId; menuOpen?: boolean }
function load(): Saved { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const saved = load()
// handy for links and testing: ?theme=light|dark  ?quality=low|med|high  ?menu=0|1  ?help=0
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const prefersDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches

type UI = {
  menuOpen: boolean
  toolsOpen: boolean              // the right-hand panel with the tools of the current mode
  sheetTab: 'general' | 'tools'   // phones: which part the bottom sheet shows
  setToolsOpen: (v: boolean) => void
  setSheetTab: (t: 'general' | 'tools') => void
  sheetFull: boolean              // mobile bottom sheet: tall / compact
  theme: Theme
  quality: Quality
  mcp: boolean // the local MCP server may edit the furniture (menu switch)
  mcpOn: boolean // ... and is connected right now
  setMcp: (b: boolean) => void
  setMcpOn: (b: boolean) => void
  fps: number // frame-rate cap, 0 = as fast as the screen
  showFps: boolean
  res: number // render resolution as a share of the screen's pixels: 0 = automatic (from the graphics mode)
  env: EnvId
  on2d: boolean
  overlay: boolean
  ceiling2d: boolean
  ortho: boolean                  // Orbit view with an orthographic camera (no perspective distortion)
  setOrtho: (v: boolean) => void
  wallView: { a: [number, number]; b: [number, number]; n: [number, number]; label: string } | null // elevation view of one wall (metres)
  setWallView: (w: UI['wallView']) => void
  rulesOnCriteria: boolean
  setRulesOnCriteria: (v: boolean) => void
  setCeiling2d: (v: boolean) => void
  flatOpacity: number
  cards: Record<string, boolean>  // which side-menu cards are open
  helpOpen: boolean
  helpSeen: boolean
  tracer: { id: string | null } | null // plan tracer (null = closed; id = flat being edited, null = new flat)
  aiModal: boolean                // the local AI connection / models window (usable from any screen)
  setAiModal: (v: boolean) => void
  flatsVersion: number            // bumped whenever the flat list changes
  toast: string | null
  setMenuOpen: (v: boolean) => void
  setSheetFull: (v: boolean) => void
  setTheme: (t: Theme) => void
  setQuality: (q: Quality) => void
  setRes: (r: number) => void
  setFps: (f: number) => void
  setShowFps: (b: boolean) => void
  setEnv: (e: EnvId) => void
  setOn2d: (v: boolean) => void
  setOverlay: (v: boolean) => void
  setFlatOpacity: (v: number) => void
  toggleCard: (id: string, dflt?: boolean) => void
  setHelp: (v: boolean) => void
  openTracer: (id: string | null) => void
  closeTracer: () => void
  bumpFlats: () => void
  showToast: (t: string | null) => void
}

export const useUI = create<UI>((set, get) => ({
  menuOpen: qs.has('menu') ? qs.get('menu') !== '0' : saved.menuOpen ?? true,
  sheetFull: false,
  toolsOpen: true,
  sheetTab: 'general',
  setToolsOpen: (toolsOpen) => set({ toolsOpen }),
  setSheetTab: (sheetTab) => set({ sheetTab }),
  theme: (qs.get('theme') as Theme) || saved.theme || (prefersDark ? 'dark' : 'light'),
  mcp: qs.has('mcp') || (saved.mcp ?? false),
  mcpOn: false,
  setMcp: (mcp) => set({ mcp }),
  setMcpOn: (mcpOn) => set({ mcpOn }),
  fps: qs.has('fps') ? Number(qs.get('fps')) : saved.fps ?? 60,
  showFps: saved.showFps ?? false,
  res: Number(qs.get('res')) || saved.res || 0,
  quality: (qs.get('quality') as Quality) || saved.quality || (isTouch ? 'low' : 'high'),
  env: saved.env ?? 'day',
  on2d: false,
  overlay: false,
  ceiling2d: false,
  ortho: false,
  setOrtho: (ortho) => set({ ortho }),
  wallView: null,
  setWallView: (wallView) => set({ wallView }),
  rulesOnCriteria: saved.rulesOnCriteria ?? false,
  setRulesOnCriteria: (rulesOnCriteria) => set({ rulesOnCriteria }),
  setCeiling2d: (ceiling2d) => set({ ceiling2d }),
  flatOpacity: 0.35,
  cards: { ...(saved.cards ?? {}), ...Object.fromEntries((qs.get('open') ?? '').split(',').filter(Boolean).map((k) => [k, true])), ...Object.fromEntries((qs.get('close') ?? '').split(',').filter(Boolean).map((k) => [k, false])) },
  helpOpen: qs.get('help') === '0' ? false : !saved.helpSeen,
  helpSeen: !!saved.helpSeen,
  tracer: qs.has('tracer') ? { id: null } : null,
  aiModal: false,
  setAiModal: (aiModal) => set({ aiModal }),
  flatsVersion: 0,
  toast: null,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setSheetFull: (sheetFull) => set({ sheetFull }),
  setTheme: (theme) => set({ theme }),
  setQuality: (quality) => set({ quality }),
  setRes: (res) => set({ res }),
  setFps: (fps) => set({ fps }),
  setShowFps: (showFps) => set({ showFps }),
  setEnv: (env) => set({ env }),
  setOn2d: (on2d) => set({ on2d }),
  setOverlay: (overlay) => set({ overlay }),
  setFlatOpacity: (flatOpacity) => set({ flatOpacity }),
  toggleCard: (id, dflt = true) => set((s) => ({ cards: { ...s.cards, [id]: !(s.cards[id] ?? dflt) } })),
  setHelp: (helpOpen) => set({ helpOpen, helpSeen: true }),
  openTracer: (id) => set({ tracer: { id } }),
  closeTracer: () => set({ tracer: null }),
  bumpFlats: () => set((s) => ({ flatsVersion: s.flatsVersion + 1 })),
  showToast: (toast) => { set({ toast }); if (toast) setTimeout(() => get().toast === toast && set({ toast: null }), 3500) },
}))

useUI.subscribe((s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ rulesOnCriteria: s.rulesOnCriteria, theme: s.theme, quality: s.quality, res: s.res, mcp: s.mcp, fps: s.fps, showFps: s.showFps, cards: s.cards, helpSeen: s.helpSeen, env: s.env, menuOpen: s.menuOpen } satisfies Saved)) } catch { /* ignore */ }
})
