// Builds a shareable package:  share/FlatPlanner.zip
//   FlatPlanner.html  - the whole app in ONE file (works offline, just double-click it)
//   website/          - the normal multi-file build, for putting on a web host (Netlify, GitHub Pages, ...)
//   README.txt        - how to use / share it
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import AdmZip from 'adm-zip'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'share', 'FlatPlanner')
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })

rmSync(join(root, 'share'), { recursive: true, force: true })
mkdirSync(out, { recursive: true })

console.log('\n> building the single-file version')
run('npx tsc -b && npx vite build -c vite.single.config.ts')
cpSync(join(root, 'dist-single', 'index.html'), join(out, 'FlatPlanner.html'))

console.log('\n> building the website version')
run('npx vite build')
cpSync(join(root, 'dist'), join(out, 'website'), { recursive: true })

writeFileSync(join(out, 'README.txt'), `FLAT PLANNER
============

Plan a flat in 3D: walk through it, rotate it, move walls, furnish it automatically, try different layouts.

HOW TO OPEN
  Double-click  FlatPlanner.html   (Chrome, Edge, Firefox or Safari; needs no internet and no install).
  It also works on a phone: send the file to yourself, or put the "website" folder on a web host.

PUT IT ON THE INTERNET (so a friend only needs a link)
  1. Go to https://app.netlify.com/drop
  2. Drag the folder "website" onto the page. You get a public link right away.
     (Any static host works: GitHub Pages, Cloudflare Pages, Vercel ... upload the contents of "website".)

MAKE IT YOURS
  Style (menu bar): wall colour per room and per side, 10 floor types.
  Doors: click a door (or use the Doors tool) to set Closed / Half open / Open; add, move, resize or remove windows, full-wall glazing and doors.
  Lights: ceiling lights and wall switches are placed with the furniture. Click a switch (or press E next to it while walking) to switch a room's lights. The 2D view shows the lighting plan.

AI FURNISHING (optional, free, runs on your computer)
  1. Install Ollama: https://ollama.com/download  (keep it running)
  2. In a terminal run:  ollama pull qwen2.5:14b      (about 9 GB, needs about 12 GB of free memory)
     Small computer? Use the light one instead:  ollama pull qwen2.5:7b
  3. Open the menu -> "AI furnish". The card checks every step and tells you what is missing, with commands you can copy.
     Opened FlatPlanner.html from a file, or from a web address? Ollama must be told to trust it once:
       Windows PowerShell:  setx OLLAMA_ORIGINS "*"   (then quit Ollama from the tray and start it again)
       macOS Terminal:      launchctl setenv OLLAMA_ORIGINS "*"   (then restart Ollama)
  4. Press "Furnish with AI". The model plans every room, the app checks the result against the real walls, doors and windows.
     Each press gives different layouts; the one that matches your wishes best is shown first, the others stay in the list.

YOUR OWN FLAT
  Open the left menu -> "My flats" -> "+ New flat from a plan image".
  Upload a picture or screenshot of the floor plan, set the scale, trace the walls, mark doors and windows,
  click each room and say what it is. Done: the flat appears in the list and you can furnish it.
  "Export" saves a flat to a file you can send to a friend ("Import" opens it).

SHARING A DESIGN
  "Copy share link" (menu -> Share) puts your layout into a link. It works with the website version.
  "Export project" saves everything (all flats, walls, furniture) to a .json file; "Import project" loads it.

Your work is saved automatically in the browser you use (per file / per web address).
`)

const zip = new AdmZip()
zip.addLocalFolder(out, 'FlatPlanner')
const zipPath = join(root, 'share', 'FlatPlanner.zip')
zip.writeZip(zipPath)
const mb = (p) => (statSync(p).size / 1048576).toFixed(2) + ' MB'
console.log('\nDone:')
console.log('  ' + zipPath + '  (' + mb(zipPath) + ')')
console.log('  ' + join(out, 'FlatPlanner.html') + '  (' + mb(join(out, 'FlatPlanner.html')) + ')')
if (!existsSync(join(out, 'website', 'index.html'))) throw new Error('website build missing')
