// Lets Node (used for headless logic tests) import images the way Vite does: they become empty strings.
export async function load(url, context, next) {
  if (/\.(png|jpe?g|svg|webp)(\?|$)/.test(url)) return { format: 'module', source: 'export default ""', shortCircuit: true }
  return next(url, context)
}
