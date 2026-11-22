// Compare Ollama models on the same flat: node --import ./scripts/register-stub.mjs (via tsx) scripts/ai-bench.ts qwen2.5:7b qwen2.5:14b
import { activateFlat } from '../src/plan'
import { FLATS } from '../src/flats'
import { aiFurnish } from '../src/ai/run'
import { DEFAULT_AI } from '../src/ai/ollama'
import { DEFAULT_CRITERIA, CRITERIA_PRESETS } from '../src/criteria'
import { misplacedReason, analyze } from '../src/autofurnish'

const models = process.argv.slice(2)
const flatIdx = Number(process.env.FLAT ?? 0), n = Number(process.env.N ?? 3)
const f = FLATS[flatIdx]; activateFlat(f)
const crit = process.env.PRESET ? CRITERIA_PRESETS.find((p) => p.id === process.env.PRESET)!.c : DEFAULT_CRITERIA
const rows: string[] = []
for (const model of models) {
  const t0 = Date.now()
  const { variants, errors } = await aiFurnish({ settings: { ...DEFAULT_AI, model, variants: n, timeoutSec: 600 }, nodes: f.nodes, customWalls: [], roomKinds: {}, criteria: crit, pins: {} })
  const secs = (Date.now() - t0) / 1000
  const avg = (g: (v: (typeof variants)[number]) => number) => variants.length ? variants.reduce((a, v) => a + g(v), 0) / variants.length : 0
  const distinct = new Set(variants.map((v) => v.furniture.filter((q) => ['bed', 'sofa', 'tvUnit', 'diningTable', 'wardrobe'].includes(q.type)).map((q) => q.type + q.x.toFixed(0) + q.z.toFixed(0)).sort().join())).size
  console.log(`\n=== ${model} on ${f.name} (${n} variants, ${secs.toFixed(0)} s total, ${(secs / Math.max(1, variants.length)).toFixed(0)} s/variant) ===`)
  for (const v of variants) {
    const bad = v.furniture.filter((q) => misplacedReason(q, f.nodes, [], v.furniture)).length
    console.log(`  ${v.label}: match ${(v.match * 100).toFixed(0)}% | ${v.furniture.length} items | model placed ${v.placed}, dropped ${v.dropped}, rules filled ${v.filled} | misplaced ${bad} | narrow: ${analyze(v.furniture, f.nodes, []).blocked.join(',') || '-'}`)
    console.log(`     idea: ${v.idea.slice(0, 150)}`)
    console.log(`     log: ${v.log.slice(0, 5).join(' ; ')}`)
  }
  rows.push(`${model.padEnd(14)} avg match ${(avg((v) => v.match) * 100).toFixed(0)}%  best ${(Math.max(0, ...variants.map((v) => v.match)) * 100).toFixed(0)}%  dropped/variant ${avg((v) => v.dropped).toFixed(1)}  rules-filled ${avg((v) => v.filled).toFixed(1)}  distinct layouts ${distinct}/${variants.length}  ${(secs / Math.max(1, variants.length)).toFixed(0)} s/variant  errors ${errors.length}`)
}
console.log('\nSUMMARY\n' + rows.join('\n'))
process.exit(0)
