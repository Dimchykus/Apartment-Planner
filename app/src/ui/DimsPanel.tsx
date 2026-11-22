import { Fragment } from 'react'
import { useStore, useAllWalls } from '../store'
import { rooms, insetRoom, roomAreas, totalArea, openingsOf, PX_PER_M, STATED_TOTAL } from '../plan'
import { kindInfo } from '../roomkinds'

const cm = (v: number) => Math.round(v * 100)
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

/** Dimensions mode: every number of the flat in one place, so it can be checked against the plan. */
export function DimsPanel() {
  const nodes = useStore((s) => s.nodes), custom = useStore((s) => s.customWalls), kinds = useStore((s) => s.roomKinds), furniture = useStore((s) => s.furniture)
  const walls = useAllWalls()
  const areas = roomAreas(nodes, custom), tot = totalArea(nodes, custom)
  const L = (w: { a: string; b: string }) => Math.hypot(nodes[w.b][0] - nodes[w.a][0], nodes[w.b][1] - nodes[w.a][1]) / PX_PER_M
  const ops = walls.flatMap((w) => openingsOf(w, nodes).map((o) => ({ w, o })))
  const doors = ops.filter((x) => x.o.kind === 'door'), wins = ops.filter((x) => x.o.kind === 'window')
  const ow = (x: { o: { from: number; to: number } }) => (x.o.to - x.o.from) / PX_PER_M
  const thick = walls.map((w) => (w.thick / PX_PER_M) * 100)
  const diff = STATED_TOTAL ? tot.living - STATED_TOTAL : 0
  const row = (k: string, v: string) => <tr key={k}><td>{k}</td><td>{v}</td></tr>
  return (
    <div className="dims-panel">
      <p className="hint">Lengths in cm. Blue = clear wall length, grey = thickness, brown / teal = doors / windows.</p>

      <b>Rooms</b>
      <table className="tr-table">
        <thead><tr><th>Room</th><th>Net m²</th><th>Plan</th><th>Δ</th></tr></thead>
        <tbody>
          {rooms.filter((r) => !r.skip).map((r) => {
            const a = areas.find((x) => x.room.id === r.id)?.area ?? 0, poly = insetRoom(r, nodes)
            const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
            const per = sum(poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) })) / PX_PER_M
            const d = r.stated ? (a - r.stated) / r.stated : null
            return (
              <Fragment key={r.id}>
                <tr>
                  <td>{kinds[r.id] ? kindInfo(kinds[r.id]).label : r.name}{!r.countsFull ? ' ×½' : ''}</td>
                  <td><b>{a.toFixed(2)}</b></td><td>{r.stated ? r.stated.toFixed(2) : '–'}</td>
                  <td className={d == null ? '' : Math.abs(d) > 0.04 ? 'bad' : 'ok'}>{d == null ? '–' : (d > 0 ? '+' : '') + (d * 100).toFixed(1) + '%'}</td>
                </tr>
                <tr className="subrow"><td colSpan={4}>inside {cm((Math.max(...xs) - Math.min(...xs)) / PX_PER_M)} × {cm((Math.max(...ys) - Math.min(...ys)) / PX_PER_M)} cm · perimeter {per.toFixed(1)} m</td></tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <b>Totals</b>
      <table className="tr-table"><tbody>
        {row('Living area (loggia ×0.5)', tot.living.toFixed(2) + ' m²')}
        {row('Full area (loggia ×1)', tot.gross.toFixed(2) + ' m²')}
        {row('Stated on the plan', STATED_TOTAL ? STATED_TOTAL.toFixed(2) + ' m² (' + (diff >= 0 ? '+' : '') + diff.toFixed(2) + ')' : '–')}
        {row('Rooms', String(rooms.filter((r) => !r.skip).length))}
      </tbody></table>

      <b>Walls</b>
      <table className="tr-table"><tbody>
        {row('Walls (own added: ' + custom.length + ')', walls.length + ' · ' + sum(walls.map(L)).toFixed(1) + ' m total')}
        {row('Thickness', walls.length ? Math.round(Math.min(...thick)) + '–' + Math.round(Math.max(...thick)) + ' cm' : '–')}
        {row('Longest / shortest', walls.length ? Math.max(...walls.map(L)).toFixed(2) + ' / ' + Math.min(...walls.map(L)).toFixed(2) + ' m' : '–')}
      </tbody></table>

      <b>Doors &amp; windows</b>
      <table className="tr-table">
        <thead><tr><th>Type</th><th>Width</th><th>Sill</th><th>Height</th><th>Wall</th></tr></thead>
        <tbody>
          {[...doors, ...wins].map(({ w, o }, i) => (
            <tr key={w.id + i}><td>{o.kind}{o.glass ? ' (glazed)' : ''}</td><td>{cm(ow({ o }))}</td><td>{cm(o.sill)}</td><td>{cm(o.top - o.sill)}</td><td>{w.id} · {cm(L(w))} cm</td></tr>
          ))}
          {!ops.length && <tr><td colSpan={5}>none</td></tr>}
        </tbody>
      </table>
      <small className="muted">{doors.length} doors · {wins.length} windows · window glass {sum(wins.map((x) => ow(x) * (x.o.top - x.o.sill))).toFixed(1)} m²</small>

      <b>Furniture</b>
      <small className="muted">{furniture.length} items placed</small>
    </div>
  )
}
