# SlayDesk

Desk booking and workplace analytics: a showcase MVP.

SlayDesk has two sides:

- **Company admin**: sets up the office and tracks usage.
- **Employee**: books desks and sees availability.

This MVP is a static site with no backend and no build step. All data (floor plan, bookings, sensors) is kept in the browser's `localStorage` and seeded with eight weeks of sample history. Use the ↺ button in the header to reset it.

## Features

| Area | What it does |
|---|---|
| **Floor plan** (admin) | Drag-and-drop editor: add, move, resize, rename/number, duplicate and delete desks and areas. It's the central data model, so everything else builds on it. |
| **Book desk** (employee) | Pick a date and slot (morning, afternoon or full day), then click a green desk. Each booking updates the floor plan right away, including in other open tabs. |
| **Desk status indicators** | Every desk shows a green light (available) or a red light (booked/occupied). Status comes from bookings and from (simulated) occupancy sensors. |
| **KPIs & insights** (admin) | Utilization rate, peak days and times, no-show rate, most and least used desks, plus plain-language insights and charts (weekday bars, weekday × slot heatmap, daily trend, desk heatmap on the floor plan). |
| **Hardware** (admin) | Simulated under-desk sensors. A status check updates desk lights, auto-checks-in booked desks and flags walk-ins. |
| **Connect AI (MCP)** (employee) | Instructions for connecting an MCP client (Claude Desktop / Claude Code) to SlayDesk. The endpoint is illustrative in this showcase. |

## Data flow

```
Floor plan ──► desk status indicators + KPI tracking ──► insights
Book desk  ──► updates the floor plan
Hardware status check ──► updates desk status
Employee side ──► MCP connection instructions
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Tip: open `#/admin/floor` and `#/employee/book` in two tabs. Bookings and edits sync between them live.

## Files

- `index.html`: shell (header, tabs, tooltip, toasts)
- `styles.css`: design tokens (light and dark) and components
- `app.js`: state, seed data, router, views, KPI engine, SVG charts
