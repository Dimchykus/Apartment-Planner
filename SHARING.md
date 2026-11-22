# Sharing Flat Planner

Build the package (needs Node 20+):

    cd app
    npm install
    npm run package

Result: `app/share/FlatPlanner.zip` (about 4 MB).

| What | How a friend uses it |
|---|---|
| **FlatPlanner.html** (inside the zip) | Double-click. Works offline, in any modern browser, also on a phone. |
| **website/** folder (inside the zip) | Upload to any static host, e.g. drag it onto https://app.netlify.com/drop, and share the link. |
| Share link (menu → Share & backup → Copy link) | Only on the hosted version: opens the same layout. |
| Project file (Export project) | A `.json` with all flats and layouts; the friend uses Import project. |
| One flat (My flats → export) | A `.flat.json` with plan image and traced geometry. |

Everything a user creates is stored in their own browser (localStorage).
