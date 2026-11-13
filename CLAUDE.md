# CLAUDE.md

SlayDesk is a desk booking and workplace analytics **showcase MVP**. It's a static site served by GitHub Pages from `main` at the repo root (https://angelorosace.github.io/slaydesk/).

## Hard constraints
- **No backend, no database, no build step, no npm.** Plain `index.html` + `styles.css` + `app.js`, with no dependencies. Keep it that way unless the user asks otherwise.
- All state lives in the browser's `localStorage` (key `slaydesk:state:v1`). The theme choice is stored under `slaydesk:theme`.
- Use relative asset paths, because the site is served from the `/slaydesk/` subpath on Pages.
- `.nojekyll` must stay at the root.

## Run / check
```bash
python3 -m http.server 8000   # http://localhost:8000
node --check app.js           # syntax check (there is no test suite)
```
To check rendering visually, use headless Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=1300,1700 "http://localhost:8000/#/admin/insights"`. Its minimum window width is 500px, so narrower screenshots look cropped but aren't actually overflowing.

## Architecture (`app.js`)
- **Data model:** `state = { office, desks[], areas[], bookings[], sensors{deskId}, employees[], me, autoPoll, lastPoll, mcpToken }`. The floor plan (`desks`/`areas`, in a 1000×620 SVG coordinate space) is the central model. Bookings, status and KPIs all derive from it.
- **Bookings:** `{ id, deskId, user, date: 'YYYY-MM-DD', slot: 'AM'|'PM'|'DAY', status: 'booked'|'checked-in'|'no-show'|'cancelled' }`. `DAY` overlaps both halves (`overlaps()`). Past bookings that are still `booked` become `no-show` on load (`resolvePast`).
- **Desk status:** `deskStatus(deskId, date, slot)` returns `free | booked | occupied`. Occupied means a sensor detects someone at a desk with no booking, and only applies for today and the current slot. Lights: green = free, red = anything else.
- **Hardware:** `pollHardware()` simulates the sensors. When a sensor reports someone at a booked desk, that booking is auto-checked-in.
- **Seed data:** `seedState()` uses a deterministic PRNG (`rng(7)`) and dates relative to today: 8 weeks of history plus about 2 weeks ahead. The weekday and per-desk popularity factors are tuned so that the insights tell a story (quiet Fridays, popular window desks, under-used quiet-zone desks). If the seed changes, the ↺ reset button or clearing localStorage picks it up.
- **KPIs:** `computeKpis(weeks)` counts only past working days. Utilization = checked-in desk half-days ÷ (desks × days × 2). `buildInsights()` turns the KPIs into sentences.
- **Rendering:** a hash router (`#/admin/{floor,insights,hardware}`, `#/employee/{book,bookings,mcp}`, `#/` landing). Each view function rebuilds `#app` with `innerHTML` and then wires up handlers. **Always pass user-entered text through `esc()`.**
- **Live sync:** a `storage` event listener re-renders other tabs. Call `save()` after every mutation.
- **Charts:** hand-rolled SVG (`barChart`, `heatmap`, `lineChart`, `floorSvg({mode:'heat'})`), with tooltips from `data-tip` attributes. No chart library.

## Style conventions
- Colors are CSS tokens on `:root`, with dark-mode overrides both under `prefers-color-scheme` and under `[data-theme="dark"]`. Add new colors to both blocks.
- Sequential ramps (`RAMP_LIGHT` / `RAMP_DARK`) are a single blue hue. Status green/red is reserved for desk availability.
- Layouts must work at phone width. Grids use `minmax(0, 1fr)`.
- The MCP page is illustrative. `mcp.slaydesk.example` is a placeholder endpoint, not a live server.
