# Flat Planner MCP

Lets Claude read the open flat and edit its **furniture** from the chat.

1. `cd app/mcp && npm install` (once).
2. Register it: the repo already has `.mcp.json` (Claude Code asks to approve it), or run `claude mcp add flat-planner -- node app/mcp/server.mjs`.
3. Start the app (`npm run dev`), open the menu, **Scene & view**, and switch on **Claude connection (MCP)**. It shows "connected" once the server is running. (`?mcp=1` in the address also switches it on.)
4. Ask in the chat, e.g. "put the gaming setup against the north wall of the bedroom".

Tools: get_flat, list_furniture, add_furniture, move_furniture, edit_furniture, remove_furniture, duplicate_furniture, fit_furniture,
check_furniture, set_room_kind, auto_furnish, clear_furniture, undo, redo, screenshot. Metres; x = east, z = south; rotation in degrees.

Security: the server listens on 127.0.0.1 only and the page connects only while the switch is on.
`node test.mjs` runs an end-to-end check (needs the dev server and Chrome).

## Walls

`get_walls` (corners + walls, with `can_move` and the allowed sideways range), `shift_wall`, `move_node`, and `resize_room_to_area`
(say the wanted net m² for a room and which of its walls to push; it solves the distance and reports the new area of every room).
Only inner walls move: outer walls are locked by the app. The app limits (free corners inside a box, sliding corners along their outer wall) apply.
