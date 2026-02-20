# Reporting Engine Platform (React + Node.js + SQLite)

Production-oriented starter monorepo for a reporting platform:

- **Frontend**: React + TypeScript (TSX), built with Vite.
- **Backend**: Node.js + Express + TypeScript, with security middleware and request logging.
- **State Authority**: UI state (e.g. form input, toggle state) is persisted and monitored in Node.js backed by SQLite.
- **Database Explorer Base**: Register external SQLite connections and list tables (foundation for broader multi-DB connectors).
- **Containerization**: API and web app shipped together in Docker Compose.

## Quick Start

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

## Docker Compose

```bash
docker compose up --build
```

- Frontend (nginx): `http://localhost:5173`
- API: `http://localhost:4000`

## API Surface

- `GET /health`
- `GET /api/ui-state`
- `POST /api/ui-state`
- `GET /api/connections`
- `POST /api/connections`
- `GET /api/connections/:id/tables`

## Notes for Platform Extension

- `db_type` currently supports `sqlite` and can be extended with connector modules per provider.
- UI state table tracks all persisted component states for auditing/replay.
- Connection records are stored centrally in the platform database (`backend/data/platform.sqlite`).
