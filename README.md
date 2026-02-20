# Reporting Engine Platform

Production-grade starter platform with React + Node.js + SQLite + Docker Compose.

## Stack

- Frontend: React TSX + Vite + Mantine UI + TanStack Query/Table + Radix Dialog
- Backend: Node.js + Express (TypeScript) + SQLite + Zod + Pino
- Auth: Signup/Login with session token
- Stateful UX: UI state persisted in Node.js (navigation, toggle, form) and restored after reload

## Product baseline included

- Auth flow: signup + login
- Redirect to dashboard after auth
- Dashboard navigation tabs:
  - Pipeline
  - Connections
  - Settings
- Pipeline management: create/list/delete (delete includes confirmation dialog)
- Connection management: create/list/delete (delete includes confirmation dialog)
- Connection table inspection for SQLite DB files
- Server-managed UI state rehydration on refresh

## Run locally

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000

## Docker

```bash
docker compose up --build
```

## API highlights

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/pipelines` / `POST /api/pipelines` / `DELETE /api/pipelines/:id`
- `GET /api/connections` / `POST /api/connections` / `DELETE /api/connections/:id`
- `GET /api/connections/:id/tables`
- `GET /api/ui-state` / `POST /api/ui-state`
