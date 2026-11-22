/** How furniture is placed. Each value is a weight 0..1; the kitchen and the bathroom fixtures ignore them (they stay where the building's plumbing is). */
export type Criteria = {
  plan: number     // stay close to where the developer's plan draws sofa / TV / bed / wardrobe
  space: number    // compact sizes, hug the walls -> as much free floor as possible
  comfort: number  // biggest sizes, extra seating, wider bed / TV / table
  light: number    // keep windows clear, desk and dining table by a window
  storage: number  // wider wardrobes, a second wardrobe, more shelves
  privacy: number  // bed as far as possible from the entrance / doors
  office: number   // add a work desk with chair and shelves
  utilization: number // fill every usable wall with useful furniture (storage, seating, work) while keeping free passages
}
export const CRITERIA_KEYS: { key: keyof Criteria; label: string; hint: string }[] = [
  { key: 'plan', label: 'Follow developer plan', hint: 'Items stay near where the plan draws them' },
  { key: 'space', label: 'Free floor space', hint: 'Compact sizes, everything against the walls' },
  { key: 'comfort', label: 'Comfort / size', hint: 'Largest sizes, armchair, bigger bed and TV' },
  { key: 'light', label: 'Natural light', hint: 'Nothing in front of windows; desk and table by a window' },
  { key: 'storage', label: 'Storage', hint: 'Wider wardrobes, a second wardrobe, more shelves' },
  { key: 'privacy', label: 'Privacy', hint: 'Bed far from the entrance and doors' },
  { key: 'office', label: 'Home office', hint: 'Adds a work desk, chair and shelves' },
  { key: 'utilization', label: 'Functional use of space', hint: 'Fills free wall space with storage / seating / work items, keeps 60 cm passages' },
]

export const DEFAULT_CRITERIA: Criteria = { plan: 1, space: 0, comfort: 0.3, light: 0.3, storage: 0.3, privacy: 0.2, office: 0, utilization: 0 }

export const CRITERIA_PRESETS: { id: string; label: string; c: Criteria }[] = [
  { id: 'plan', label: 'Follow developer plan', c: DEFAULT_CRITERIA },
  { id: 'space', label: 'Max free space', c: { plan: 0.3, space: 1, comfort: 0, light: 0.4, storage: 0.2, privacy: 0.2, office: 0, utilization: 0 } },
  { id: 'comfort', label: 'Max comfort', c: { plan: 0.5, space: 0, comfort: 1, light: 0.4, storage: 0.4, privacy: 0.4, office: 0, utilization: 0 } },
  { id: 'light', label: 'Natural light first', c: { plan: 0.4, space: 0.3, comfort: 0.3, light: 1, storage: 0.2, privacy: 0.2, office: 0, utilization: 0 } },
  { id: 'storage', label: 'Max storage', c: { plan: 0.4, space: 0.3, comfort: 0.3, light: 0.3, storage: 1, privacy: 0.2, office: 0, utilization: 0 } },
  { id: 'office', label: 'Home office', c: { plan: 0.4, space: 0.3, comfort: 0.4, light: 0.8, storage: 0.4, privacy: 0.3, office: 1, utilization: 0 } },
  { id: 'family', label: 'Family / guests', c: { plan: 0.5, space: 0, comfort: 0.8, light: 0.4, storage: 0.7, privacy: 0.3, office: 0, utilization: 0 } },
  { id: 'privacy', label: 'Privacy first', c: { plan: 0.4, space: 0.2, comfort: 0.3, light: 0.3, storage: 0.3, privacy: 1, office: 0, utilization: 0 } },
]
CRITERIA_PRESETS.splice(1, 0, { id: 'utilization', label: 'Max functional use of space', c: { plan: 0.4, space: 0.5, comfort: 0.2, light: 0.3, storage: 0.8, privacy: 0.2, office: 0.6, utilization: 1 } })
export const presetOf = (c: Criteria) => CRITERIA_PRESETS.find((p) => (Object.keys(p.c) as (keyof Criteria)[]).every((k) => Math.abs(p.c[k] - c[k]) < 0.001))?.id ?? 'custom'
