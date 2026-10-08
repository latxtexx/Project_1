# AntiGrav

AntiGrav is a personal-finance dashboard for tracking cash flow, accounts, and transactions.

## Project map

- [`apps/cyber-hud/`](./apps/cyber-hud/) — standalone HTML and JavaScript dashboard.
- [`src/`](./src/) — TypeScript dashboard, finance analytics, and shared types.
- [`server/`](./server/) — local PowerShell HTTP server used by the standalone app.
- [`supabase/`](./supabase/) — database migrations.
- [`tests/`](./tests/) — analytics verification.
- [`Brain/Welcome.md`](./Brain/Welcome.md) — Obsidian knowledge hub linking architecture, usage, testing, and finance records.

## Run the standalone dashboard

Double-click [`start-server.bat`](./start-server.bat), then open the local URL printed by the server. The launcher starts `server/server.ps1`, which serves the dashboard and its finance-data API.

## Knowledge map

The Obsidian vault links related project knowledge by topic:

- [`Brain/architecture/plan.md`](./Brain/architecture/plan.md) — architecture and implementation blueprint.
- [`Brain/guides/manual.md`](./Brain/guides/manual.md) — usage and local-server guide.
- [`Brain/testing/test.md`](./Brain/testing/test.md) — test entry point and verification notes.
- [`Brain/รายรับรายจ่าย/README.md`](./Brain/รายรับรายจ่าย/README.md) — finance-data notes.
