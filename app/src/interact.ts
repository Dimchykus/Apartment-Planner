import * as THREE from 'three'
import { useStore } from './store'

const rc = new THREE.Raycaster()
/** "Press E": use the door or wall switch you are looking at (within about 2.5 m, nothing solid in between). */
export function interactAhead(camera: THREE.Camera, scene: THREE.Scene): boolean {
  rc.setFromCamera(new THREE.Vector2(0, 0), camera)
  rc.far = 2.5
  for (const h of rc.intersectObjects(scene.children, true)) {
    if (!(h.object as THREE.Mesh).isMesh) continue
    let o: THREE.Object3D | null = h.object, data: { type: string; key?: string; rooms?: string[]; group?: 'main' | 'bed' } | undefined
    while (o && !data) { data = o.userData?.interact; o = o.parent }
    if (!data) { if ((h.object as THREE.Mesh).material && ((h.object as THREE.Mesh).material as THREE.Material).transparent) continue; return false } // something solid is in the way
    const s = useStore.getState()
    if (data.type === 'door' && data.key) { const c = s.doorState[data.key]; s.setDoor(data.key, { state: (((c?.state ?? 1) + 1) % 3) as 0 | 1 | 2 }); return true }
    if (data.type === 'switch' && data.rooms) { for (const r of data.rooms) s.toggleLight(r, data.group ?? 'main'); return true }
    return false
  }
  return false
}
