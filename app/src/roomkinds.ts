import type { FType } from './catalog'
import type { RoomKind } from './autofurnish'

export const ROOM_KINDS: { id: RoomKind; label: string; color: string }[] = [
  { id: 'open', label: 'Kitchen-living (open plan)', color: '#f2b134' },
  { id: 'living', label: 'Living room', color: '#e6c84a' },
  { id: 'kitchen', label: 'Kitchen', color: '#e0662c' },
  { id: 'bedroom', label: 'Bedroom', color: '#6a7fe0' },
  { id: 'bath', label: 'Bathroom', color: '#35b6c9' },
  { id: 'office', label: 'Office / study', color: '#8e5be0' },
  { id: 'storage', label: 'Storage / loggia', color: '#b08a5a' },
  { id: 'none', label: 'Empty', color: '#9aa0a6' },
]
export const kindInfo = (k: RoomKind) => ROOM_KINDS.find((x) => x.id === k)!

/** Items whose position the user can pin on the floor. */
export const ZONE_ITEMS: { type: FType; label: string }[] = [
  { type: 'diningTable', label: 'Dining' }, { type: 'sofa', label: 'Sofa' },
  { type: 'tvUnit', label: 'TV' }, { type: 'bed', label: 'Bed' }, { type: 'wardrobe', label: 'Wardrobe' }, { type: 'desk', label: 'Desk' },
]
