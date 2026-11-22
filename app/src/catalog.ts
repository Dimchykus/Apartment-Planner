export type FType =
  | 'sofa' | 'armchair' | 'coffeeTable' | 'diningTable' | 'chair' | 'bed' | 'nightstand' | 'shower'
  | 'shelf' | 'tv' | 'bookcase' | 'dresser' | 'shoeCabinet' | 'wardrobe' | 'tvUnit' | 'kitchen' | 'fridge' | 'bathtub' | 'wc' | 'vanity' | 'washer' | 'desk' | 'gamingDesk' | 'gamingChair' | 'painting' | 'flowers'

/** w / d override the catalog size (metres); the model is stretched to fit. */
export type Finish = 'matte' | 'satin' | 'gloss'

export type Furn = { id: string; type: FType; x: number; z: number; rot: number; color?: string; w?: number; d?: number; y?: number /* height of the underside above the floor (wall-mounted items) */; h?: number; style?: string; finish?: Finish; group?: string /* id of the item this one belongs to (chairs -> table / desk, nightstand -> bed, coffee table -> sofa): they move, rotate and get removed together */; low?: boolean /* kitchen without upper cabinets (stands under a window) */ }

export const CATALOG: Record<FType, { label: string; w: number; d: number; h: number; color: string }> = {
  sofa: { label: 'Sofa', w: 2.2, d: 0.95, h: 0.85, color: '#8d8f93' },
  armchair: { label: 'Armchair', w: 0.85, d: 0.85, h: 0.85, color: '#b08a5a' },
  coffeeTable: { label: 'Coffee table', w: 1.0, d: 0.6, h: 0.4, color: '#6b4a2f' },
  diningTable: { label: 'Dining table', w: 1.4, d: 0.8, h: 0.75, color: '#8a6a45' },
  chair: { label: 'Chair', w: 0.45, d: 0.5, h: 0.9, color: '#d8d2c6' },
  bed: { label: 'Bed 160×200', w: 1.6, d: 2.0, h: 1.0, color: '#e9e5de' },
  nightstand: { label: 'Nightstand', w: 0.45, d: 0.4, h: 0.5, color: '#8a6a45' },
  shelf: { label: 'Wall shelf', w: 1.2, d: 0.25, h: 0.3, color: '#7a5a3a' },
  bookcase: { label: 'Bookcase / tall cabinet', w: 0.8, d: 0.3, h: 2.0, color: '#c9b79c' },
  dresser: { label: 'Chest of drawers', w: 1.0, d: 0.45, h: 0.85, color: '#d8d2c6' },
  shoeCabinet: { label: 'Shoe cabinet', w: 0.9, d: 0.3, h: 1.2, color: '#e6e2da' },
  wardrobe: { label: 'Wardrobe', w: 3.0, d: 0.6, h: 2.4, color: '#e6e2da' },
  tvUnit: { label: 'TV unit', w: 1.8, d: 0.4, h: 1.3, color: '#3a3532' }, // h includes the screen
  tv: { label: 'Wall TV', w: 1.2, d: 0.06, h: 0.7, color: '#101012' },
  kitchen: { label: 'Kitchen', w: 2.9, d: 0.6, h: 2.1, color: '#e8e8e4' },
  fridge: { label: 'Fridge', w: 0.6, d: 0.65, h: 1.85, color: '#cfd3d6' },
  bathtub: { label: 'Bathtub', w: 1.7, d: 0.75, h: 0.55, color: '#f6f6f4' },
  shower: { label: 'Shower', w: 0.9, d: 0.9, h: 2.0, color: '#dfe9ee' },
  wc: { label: 'WC', w: 0.4, d: 0.7, h: 0.8, color: '#f6f6f4' },
  vanity: { label: 'Vanity + sink', w: 0.8, d: 0.5, h: 0.85, color: '#d9d3c8' },
  washer: { label: 'Washer', w: 0.6, d: 0.6, h: 0.85, color: '#eceff1' },
  desk: { label: 'Desk', w: 1.4, d: 0.65, h: 0.75, color: '#c9b79c' },
  gamingDesk: { label: 'Gaming setup (desk, 2 monitors, PC)', w: 1.6, d: 0.75, h: 1.12, color: '#26272c' },
  painting: { label: 'Painting (wall)', w: 0.7, d: 0.04, h: 0.5, color: '#2b2b2d' }, // colour = frame
  flowers: { label: 'Flowers in a vase', w: 0.22, d: 0.22, h: 0.55, color: '#e7eef0' }, // colour = vase; stands on a table / shelf (lift_y) or the floor
  gamingChair: { label: 'Gaming chair', w: 0.66, d: 0.68, h: 1.3, color: '#c1272d' }, // colour = accent (stripes, headrest)
}

export const sizeOf = (q: Furn) => {
  const c = CATALOG[q.type]
  return { w: q.w ?? c.w, d: q.d ?? c.d, h: q.h ?? c.h }
}

export type Preset = { label: string; w: number; d: number; h?: number }
const P = (label: string, w: number, d: number, h?: number): Preset => ({ label, w, d, h })
/** Named size variants per item type (metres). */
export const PRESETS: Partial<Record<FType, Preset[]>> = {
  sofa: [P('2-seater', 1.6, 0.9), P('3-seater', 2.2, 0.95), P('Large 3-seater', 2.6, 1.0)],
  armchair: [P('Compact', 0.75, 0.8), P('Standard', 0.85, 0.85), P('Large', 1.0, 0.95)],
  coffeeTable: [P('Small', 0.8, 0.5), P('Standard', 1.0, 0.6), P('Large', 1.2, 0.7)],
  diningTable: [P('2 persons', 0.8, 0.8), P('4 persons', 1.2, 0.75), P('6 persons', 1.6, 0.9), P('8 persons', 2.0, 0.95)],
  bed: [P('Single 90×200', 0.9, 2.0), P('Double 140×200', 1.4, 2.0), P('Queen 160×200', 1.6, 2.0), P('King 180×200', 1.8, 2.0)],
  nightstand: [P('Slim', 0.35, 0.35), P('Standard', 0.45, 0.4), P('Wide', 0.6, 0.45)],
  wardrobe: [P('90 cm', 0.9, 0.6), P('120 cm', 1.2, 0.6), P('180 cm', 1.8, 0.6), P('240 cm', 2.4, 0.6), P('300 cm', 3.0, 0.6), P('Shallow 180', 1.8, 0.45)],
  tvUnit: [P('120 cm', 1.2, 0.4), P('150 cm', 1.5, 0.4), P('180 cm', 1.8, 0.4), P('220 cm', 2.2, 0.45)],
  kitchen: [P('180 cm', 1.8, 0.6), P('240 cm', 2.4, 0.6), P('290 cm', 2.9, 0.6), P('340 cm', 3.4, 0.6)],
  fridge: [P('Compact', 0.55, 0.6, 1.45), P('Standard', 0.6, 0.65, 1.85), P('Large', 0.9, 0.7, 1.9)],
  bathtub: [P('150 cm', 1.5, 0.7), P('160 cm', 1.6, 0.75), P('170 cm', 1.7, 0.75), P('180 cm', 1.8, 0.8)],
  shower: [P('80×80', 0.8, 0.8), P('90×90', 0.9, 0.9), P('120×80', 1.2, 0.8)],
  wc: [P('Compact', 0.36, 0.6), P('Standard', 0.4, 0.7)],
  vanity: [P('50 cm', 0.5, 0.5), P('60 cm', 0.6, 0.5), P('80 cm', 0.8, 0.5), P('100 cm', 1.0, 0.5)],
  washer: [P('Slim', 0.6, 0.45), P('Standard', 0.6, 0.6)],
  desk: [P('100 cm', 1.0, 0.6), P('140 cm', 1.4, 0.65), P('160 cm', 1.6, 0.75)],
  painting: [P('Small 40×30', 0.4, 0.04, 0.3), P('Medium 70×50', 0.7, 0.04, 0.5), P('Large 100×70', 1.0, 0.04, 0.7), P('Wide 120×60', 1.2, 0.04, 0.6)],
  gamingDesk: [P('120 cm (1 monitor fits)', 1.2, 0.7), P('140 cm', 1.4, 0.75), P('160 cm', 1.6, 0.75), P('180 cm', 1.8, 0.8)],
  tv: [P('32″', 0.75, 0.06, 0.45), P('43″', 0.95, 0.06, 0.56), P('55″', 1.25, 0.06, 0.72), P('65″', 1.45, 0.06, 0.84)],
  bookcase: [P('40 cm', 0.4, 0.3), P('60 cm', 0.6, 0.3), P('80 cm', 0.8, 0.3), P('120 cm', 1.2, 0.35)],
  dresser: [P('80 cm', 0.8, 0.4), P('100 cm', 1.0, 0.45), P('120 cm', 1.2, 0.45)],
  shoeCabinet: [P('70 cm', 0.7, 0.3), P('90 cm', 0.9, 0.3), P('120 cm', 1.2, 0.35)],
  shelf: [P('60 cm', 0.6, 0.25), P('90 cm', 0.9, 0.25), P('120 cm', 1.2, 0.25), P('160 cm', 1.6, 0.25)],
}

/** Model style variants (first entry = default). */
export const STYLES: Partial<Record<FType, { id: string; label: string }[]>> = {
  sofa: [{ id: 'classic', label: 'Classic (arms)' }, { id: 'modern', label: 'Modern (slim, legs)' }],
  coffeeTable: [{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round' }],
  diningTable: [{ id: 'rect', label: 'Rectangular' }, { id: 'round', label: 'Round / oval' }],
  chair: [{ id: 'standard', label: 'Chair' }, { id: 'stool', label: 'Bar stool' }],
  bed: [{ id: 'soft', label: 'Upholstered headboard' }, { id: 'wood', label: 'Wooden headboard' }, { id: 'platform', label: 'Low platform' }],
  bookcase: [{ id: 'closed', label: 'Closed back (against a wall)' }, { id: 'open', label: 'Open on all sides (freestanding rack)' }],
  wardrobe: [{ id: 'hinged', label: 'Hinged doors' }, { id: 'sliding', label: 'Sliding doors' }],
}

export const FINISHES: { id: Finish; label: string }[] = [{ id: 'matte', label: 'Matte' }, { id: 'satin', label: 'Satin' }, { id: 'gloss', label: 'Gloss' }]
