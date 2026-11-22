import { useRef, useState } from 'react'
import { touchInput, resetTouchInput } from './touch'
import { Icon } from './Icon'

/** On-screen stick (left) + up / down buttons (right, Fly only). Look around by dragging anywhere else on the scene. */
export function Joystick({ fly }: { fly: boolean }) {
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const base = useRef<HTMLDivElement>(null)
  const R = 48
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    const L = Math.hypot(dx, dy)
    if (L > R) { dx = (dx / L) * R; dy = (dy / L) * R }
    setKnob([dx, dy]); touchInput.x = dx / R; touchInput.y = -dy / R
  }
  const end = () => { setKnob([0, 0]); touchInput.x = 0; touchInput.y = 0 }
  return (
    <>
      <div ref={base} className="joy" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e) }} onPointerMove={(e) => e.buttons && set(e)} onPointerUp={end} onPointerCancel={end}>
        <div className="joy-knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
      </div>
      {fly && (
        <div className="joy-ud">
          <button onPointerDown={() => (touchInput.up = 1)} onPointerUp={() => (touchInput.up = 0)} onPointerLeave={() => (touchInput.up = 0)}><Icon n="down" size={22} /><i style={{ transform: 'rotate(180deg)' }} /></button>
          <button onPointerDown={() => (touchInput.up = -1)} onPointerUp={() => (touchInput.up = 0)} onPointerLeave={() => (touchInput.up = 0)}><Icon n="down" size={22} /></button>
        </div>
      )}
    </>
  )
}
export { resetTouchInput }
