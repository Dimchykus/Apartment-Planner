export type FType =
  | 'sofa' | 'lSofa' | 'armchair' | 'ottoman' | 'coffeeTable' | 'diningTable' | 'chair' | 'officeChair' | 'gamingChair'
  | 'bed' | 'nightstand' | 'shower' | 'shelf' | 'tv' | 'mirror' | 'ac' | 'painting' | 'flowers'
  | 'bookcase' | 'dresser' | 'shoeCabinet' | 'wardrobe' | 'tvUnit' | 'kitchen' | 'kitchenIsland' | 'fridge'
  | 'bathtub' | 'wc' | 'vanity' | 'washer' | 'desk' | 'cornerDesk' | 'gamingDesk' | 'treadmill' | 'floorLamp' | 'plant' | 'rug'

/** w / d override the catalog size (metres); the model is stretched to fit. */
export type Finish = 'matte' | 'satin' | 'gloss'

export type Furn = { id: string; type: FType; x: number; z: number; rot: number; color?: string; w?: number; d?: number; y?: number /* height of the underside above the floor (wall-mounted items) */; h?: number; style?: string; finish?: Finish; group?: string /* id of the item this one belongs to (chairs -> table / desk, nightstand -> bed, coffee table -> sofa): they move, rotate and get removed together */; low?: boolean /* kitchen without upper cabinets (stands under a window) */ }

export const CATALOG: Record<FType, { label: string; w: number; d: number; h: number; color: string; wallMounted?: boolean }> = {
  sofa: { label: 'Sofa', w: 2.2, d: 0.95, h: 0.85, color: '#8d8f93' },
  lSofa: { label: 'L-shape sofa', w: 2.5, d: 1.7, h: 0.85, color: '#7e838b' },
  armchair: { label: 'Armchair', w: 0.85, d: 0.85, h: 0.85, color: '#b08a5a' },
  ottoman: { label: 'Ottoman / pouf', w: 0.7, d: 0.7, h: 0.42, color: '#9c8c7c' },
  coffeeTable: { label: 'Coffee table', w: 1.0, d: 0.6, h: 0.4, color: '#6b4a2f' },
  diningTable: { label: 'Dining table', w: 1.4, d: 0.8, h: 0.75, color: '#8a6a45' },
  chair: { label: 'Chair', w: 0.45, d: 0.5, h: 0.9, color: '#d8d2c6' },
  officeChair: { label: 'Office chair', w: 0.62, d: 0.62, h: 1.12, color: '#2f3540' },
  gamingChair: { label: 'Gaming chair', w: 0.66, d: 0.68, h: 1.3, color: '#c1272d' }, // colour = accent (stripes, headrest)
  bed: { label: 'Bed 160×200', w: 1.6, d: 2.0, h: 1.0, color: '#e9e5de' },
  nightstand: { label: 'Nightstand', w: 0.45, d: 0.4, h: 0.5, color: '#8a6a45' },
  shelf: { label: 'Wall shelf', w: 1.2, d: 0.25, h: 0.3, color: '#7a5a3a', wallMounted: true },
  tv: { label: 'Wall TV', w: 1.2, d: 0.06, h: 0.7, color: '#101012', wallMounted: true },
  mirror: { label: 'Wall mirror', w: 0.7, d: 0.05, h: 1.4, color: '#d8e4ea', wallMounted: true },
  ac: { label: 'Air conditioner', w: 0.9, d: 0.22, h: 0.3, color: '#f2f3f5', wallMounted: true },
  bookcase: { label: 'Bookcase / tall cabinet', w: 0.8, d: 0.3, h: 2.0, color: '#c9b79c' },
  dresser: { label: 'Chest of drawers', w: 1.0, d: 0.45, h: 0.85, color: '#d8d2c6' },
  shoeCabinet: { label: 'Shoe cabinet', w: 0.9, d: 0.3, h: 1.2, color: '#e6e2da' },
  wardrobe: { label: 'Wardrobe', w: 3.0, d: 0.6, h: 2.4, color: '#e6e2da' },
  tvUnit: { label: 'TV unit', w: 1.8, d: 0.4, h: 1.3, color: '#3a3532' }, // h includes the screen
  kitchen: { label: 'Kitchen', w: 2.9, d: 0.6, h: 2.1, color: '#e8e8e4' },
  kitchenIsland: { label: 'Kitchen island / bar', w: 1.6, d: 0.85, h: 0.92, color: '#e4e2dc' },
  fridge: { label: 'Fridge', w: 0.6, d: 0.65, h: 1.85, color: '#cfd3d6' },
  bathtub: { label: 'Bathtub', w: 1.7, d: 0.75, h: 0.55, color: '#f6f6f4' },
  shower: { label: 'Shower', w: 0.9, d: 0.9, h: 2.0, color: '#dfe9ee' },
  wc: { label: 'WC', w: 0.4, d: 0.7, h: 0.8, color: '#f6f6f4' },
  vanity: { label: 'Vanity + sink', w: 0.8, d: 0.5, h: 0.85, color: '#d9d3c8' },
  washer: { label: 'Washer', w: 0.6, d: 0.6, h: 0.85, color: '#eceff1' },
  desk: { label: 'Working desk (PC + 2 monitors)', w: 1.4, d: 0.65, h: 1.15, color: '#c9b79c' },
  cornerDesk: { label: 'L-shape corner desk', w: 1.6, d: 1.4, h: 0.75, color: '#b89f80' },
  gamingDesk: { label: 'Gaming setup (desk, 2 monitors, PC)', w: 1.6, d: 0.75, h: 1.12, color: '#26272c' },
  treadmill: { label: 'UREVO Foldi 3S', w: 0.65, d: 1.31, h: 1.2, color: '#23252a' },
  floorLamp: { label: 'Floor lamp', w: 0.4, d: 0.4, h: 1.7, color: '#f0e2c8' },
  plant: { label: 'Potted plant', w: 0.45, d: 0.45, h: 1.35, color: '#4c7c48' },
  rug: { label: 'Rug / carpet', w: 2.0, d: 1.4, h: 0.02, color: '#cfc7ba' },
  painting: { label: 'Painting (wall)', w: 0.7, d: 0.04, h: 0.5, color: '#2b2b2d', wallMounted: true }, // colour = frame
  flowers: { label: 'Flowers in a vase', w: 0.22, d: 0.22, h: 0.55, color: '#e7eef0', wallMounted: true }, // colour = vase; stands on a table / shelf (lift_y) or the floor
}

export const isWallMounted = (t: FType) => !!CATALOG[t].wallMounted

export const sizeOf = (q: Furn) => {
  const c = CATALOG[q.type]
  return { w: q.w ?? c.w, d: q.d ?? c.d, h: q.h ?? c.h }
}

/** Local XZ footprint boxes for collision, overflow, and outlines (2 boxes for L-shaped items, 1 box for rectangular items). */
export function partBoxes(q: Furn): { lx: number; lz: number; w: number; d: number }[] {
  const { w, d } = sizeOf(q)
  if (q.type === 'lSofa') {
    const sgn = q.style === 'left' ? -1 : 1
    return [
      { lx: 0, lz: (-0.38 / 1.7) * d, w, d: (0.94 / 1.7) * d },
      { lx: sgn * (0.78 / 2.5) * w, lz: (0.45 / 1.7) * d, w: (0.94 / 2.5) * w, d: (0.8 / 1.7) * d },
    ]
  }
  if (q.type === 'cornerDesk') {
    const sgn = q.style === 'left' ? -1 : 1
    return [
      { lx: 0, lz: (-0.375 / 1.4) * d, w, d: (0.65 / 1.4) * d },
      { lx: sgn * (0.5 / 1.6) * w, lz: (0.325 / 1.4) * d, w: (0.6 / 1.6) * w, d: (0.75 / 1.4) * d },
    ]
  }
  return [{ lx: 0, lz: 0, w, d }]
}

export type Preset = { label: string; w: number; d: number; h?: number }
const P = (label: string, w: number, d: number, h?: number): Preset => ({ label, w, d, h })
/** Named size variants per item type (metres). */
export const PRESETS: Partial<Record<FType, Preset[]>> = {
  sofa: [P('2-seater', 1.6, 0.9), P('3-seater', 2.2, 0.95), P('Large 3-seater', 2.6, 1.0)],
  lSofa: [P('Compact', 2.2, 1.5), P('Standard', 2.5, 1.7), P('Large', 2.9, 1.9)],
  armchair: [P('Compact', 0.75, 0.8), P('Standard', 0.85, 0.85), P('Large', 1.0, 0.95)],
  ottoman: [P('Small', 0.5, 0.5), P('Standard', 0.7, 0.7), P('Bench', 1.1, 0.45)],
  coffeeTable: [P('Small', 0.8, 0.5), P('Standard', 1.0, 0.6), P('Large', 1.2, 0.7)],
  diningTable: [P('2 persons', 0.8, 0.8), P('4 persons', 1.2, 0.75), P('6 persons', 1.6, 0.9), P('8 persons', 2.0, 0.95)],
  gamingChair: [P('Compact', 0.6, 0.62, 1.22), P('Standard', 0.66, 0.68, 1.3), P('XL', 0.74, 0.72, 1.38)],
  bed: [P('Single 90×200', 0.9, 2.0), P('Double 140×200', 1.4, 2.0), P('Queen 160×200', 1.6, 2.0), P('King 180×200', 1.8, 2.0)],
  nightstand: [P('Slim', 0.35, 0.35), P('Standard', 0.45, 0.4), P('Wide', 0.6, 0.45)],
  wardrobe: [P('90 cm', 0.9, 0.6), P('120 cm', 1.2, 0.6), P('180 cm', 1.8, 0.6), P('240 cm', 2.4, 0.6), P('300 cm', 3.0, 0.6), P('Shallow 180', 1.8, 0.45)],
  tvUnit: [P('120 cm', 1.2, 0.4), P('150 cm', 1.5, 0.4), P('180 cm', 1.8, 0.4), P('220 cm', 2.2, 0.45)],
  kitchen: [P('180 cm', 1.8, 0.6), P('240 cm', 2.4, 0.6), P('290 cm', 2.9, 0.6), P('340 cm', 3.4, 0.6)],
  kitchenIsland: [P('Compact', 1.2, 0.75), P('Standard', 1.6, 0.85), P('Large', 2.0, 0.9)],
  fridge: [P('Compact', 0.55, 0.6, 1.45), P('Standard', 0.6, 0.65, 1.85), P('Large', 0.9, 0.7, 1.9)],
  bathtub: [P('150 cm', 1.5, 0.7), P('160 cm', 1.6, 0.75), P('170 cm', 1.7, 0.75), P('180 cm', 1.8, 0.8)],
  shower: [P('80×80', 0.8, 0.8), P('90×90', 0.9, 0.9), P('120×80', 1.2, 0.8)],
  wc: [P('Compact', 0.36, 0.6), P('Standard', 0.4, 0.7)],
  vanity: [P('50 cm', 0.5, 0.5), P('60 cm', 0.6, 0.5), P('80 cm', 0.8, 0.5), P('100 cm', 1.0, 0.5)],
  washer: [P('Slim', 0.6, 0.45), P('Standard', 0.6, 0.6)],
  desk: [P('120 cm', 1.2, 0.6, 1.15), P('140 cm', 1.4, 0.65, 1.15), P('160 cm', 1.6, 0.75, 1.15)],
  cornerDesk: [P('Compact', 1.4, 1.2), P('Standard', 1.6, 1.4), P('Large', 1.8, 1.5)],
  painting: [P('Small 40×30', 0.4, 0.04, 0.3), P('Medium 70×50', 0.7, 0.04, 0.5), P('Large 100×70', 1.0, 0.04, 0.7), P('Wide 120×60', 1.2, 0.04, 0.6)],
  gamingDesk: [P('120 cm (1 monitor fits)', 1.2, 0.7), P('140 cm', 1.4, 0.75), P('160 cm', 1.6, 0.75), P('180 cm', 1.8, 0.8)],
  treadmill: [P('Unfolded (65×131×120)', 0.65, 1.31, 1.2), P('Folded (65×131×17)', 0.65, 1.31, 0.17)],
  tv: [P('32″', 0.75, 0.06, 0.45), P('43″', 0.95, 0.06, 0.56), P('55″', 1.25, 0.06, 0.72), P('65″', 1.45, 0.06, 0.84)],
  mirror: [P('Bathroom 60×90', 0.6, 0.05, 0.9), P('Full length 70×140', 0.7, 0.05, 1.4), P('Wide 100×80', 1.0, 0.05, 0.8)],
  ac: [P('Standard 90 cm', 0.9, 0.22, 0.3), P('Wide 110 cm', 1.1, 0.24, 0.32)],
  bookcase: [P('40 cm', 0.4, 0.3), P('60 cm', 0.6, 0.3), P('80 cm', 0.8, 0.3), P('120 cm', 1.2, 0.35)],
  dresser: [P('80 cm', 0.8, 0.4), P('100 cm', 1.0, 0.45), P('120 cm', 1.2, 0.45)],
  shoeCabinet: [P('70 cm', 0.7, 0.3), P('90 cm', 0.9, 0.3), P('120 cm', 1.2, 0.35)],
  shelf: [P('60 cm', 0.6, 0.25), P('90 cm', 0.9, 0.25), P('120 cm', 1.2, 0.25), P('160 cm', 1.6, 0.25)],
  plant: [P('Small', 0.3, 0.3, 0.65), P('Medium', 0.45, 0.45, 1.35), P('Tall', 0.55, 0.55, 1.85)],
  rug: [P('Small 140×100', 1.4, 1.0), P('Medium 200×140', 2.0, 1.4), P('Large 260×180', 2.6, 1.8), P('Runner 220×80', 2.2, 0.8)],
}

/** Model style variants (first entry = default). */
export const STYLES: Partial<Record<FType, { id: string; label: string }[]>> = {
  sofa: [{ id: 'classic', label: 'Classic (arms)' }, { id: 'modern', label: 'Modern (slim, legs)' }],
  lSofa: [{ id: 'right', label: 'Chaise on right' }, { id: 'left', label: 'Chaise on left' }],
  ottoman: [{ id: 'square', label: 'Square' }, { id: 'round', label: 'Round' }],
  coffeeTable: [{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round' }],
  diningTable: [{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round / oval' }],
  chair: [{ id: 'standard', label: 'Chair' }, { id: 'stool', label: 'Bar stool' }],
  bed: [{ id: 'soft', label: 'Upholstered headboard' }, { id: 'wood', label: 'Wooden headboard' }, { id: 'platform', label: 'Low platform' }],
  bookcase: [{ id: 'closed', label: 'Closed back (against a wall)' }, { id: 'open', label: 'Open on all sides (freestanding rack)' }],
  wardrobe: [{ id: 'hinged', label: 'Hinged doors' }, { id: 'sliding', label: 'Sliding doors' }],
  desk: [{ id: 'workstation', label: 'PC + 2 monitors' }, { id: 'plain', label: 'Empty desk' }],
  cornerDesk: [{ id: 'right', label: 'Return on right' }, { id: 'left', label: 'Return on left' }],
  treadmill: [{ id: 'unfolded', label: 'Unfolded (handrail up)' }, { id: 'folded', label: 'Folded flat' }],
  floorLamp: [{ id: 'classic', label: 'Standing shade' }, { id: 'arc', label: 'Arc lamp' }],
  mirror: [{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round' }],
  rug: [{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round' }],
}

export const FINISHES: { id: Finish; label: string }[] = [{ id: 'matte', label: 'Matte' }, { id: 'satin', label: 'Satin' }, { id: 'gloss', label: 'Gloss' }]
