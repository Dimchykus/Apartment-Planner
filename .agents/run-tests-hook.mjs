// Antigravity Stop hook: runs unit tests after every prompt completion.
// If tests fail, asks the agent to continue and fix them (once per turn to avoid loops).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let input = {}
try {
  const raw = readFileSync(0, 'utf8').trim()
  if (raw) input = JSON.parse(raw)
} catch { /* ignore malformed stdin */ }

// Only gate normal turn completion, and avoid infinite loops if we already forced a continuation.
if (input.terminationReason && input.terminationReason !== 'NO_TOOL_CALL') {
  process.stdout.write(JSON.stringify({ decision: 'allow' }))
  process.exit(0)
}

const repoRoot = input.cwd || resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = resolve(repoRoot, 'app')

try {
  execFileSync(process.execPath, ['scripts/test-unit.mjs'], {
    cwd: appDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 25000,
  })
  process.stdout.write(JSON.stringify({ decision: 'allow' }))
} catch (err) {
  const out = ((err.stdout || '') + '\n' + (err.stderr || '') + '\n' + (err.message || '')).trim().slice(-1500)
  if (input.continuationActive) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }))
  } else {
    process.stdout.write(JSON.stringify({
      decision: 'continue',
      reason: 'Post-prompt test hook failed (`npm --prefix app test`). Please fix the failing tests before finishing:\n\n' + out,
    }))
  }
}
