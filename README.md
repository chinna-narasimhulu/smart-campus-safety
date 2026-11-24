# Smart Campus Safety & Emergency Response System

A full-stack web application enabling students and faculty to submit SOS emergency alerts and safety incident reports with consent-based location sharing, while empowering authorized campus responders and administrators to coordinate dispatch, track incident timelines in real time, and maintain auditable safety records.

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Leaflet.js + OpenStreetMap
- **Backend (Runnable Local/Cloud Server)**: Node.js, Express, WebSockets (`ws`), SQLite (`better-sqlite3`) with normalized relational schema, `scrypt` password hashing, HMAC-SHA256 Bearer tokens
- **Supabase / PostgreSQL Deliverables**: Complete SQL DDL migrations, Row Level Security (RLS) policies, and Deno Edge Functions in `/supabase`

## Project Structure

```
├── server.ts                          # Express + WebSocket + Vite entry point (port 3000)
├── server/
│   ├── db.ts                          # Normalized relational schema, indexes, and reference seeds
│   ├── auth.ts                        # scrypt hashing, token verification, RBAC middleware
│   ├── realtime.ts                    # Authenticated WebSocket broadcaster & escalation monitor
│   └── routes/
│       ├── authRoutes.ts              # First-run admin claim, register, login, password reset
│       ├── incidentRoutes.ts          # SOS, incident reporting, attachments, responder actions
│       ├── adminRoutes.ts             # Analytics, user/responder CRUD, assignment, audit logs
│       └── publicRoutes.ts            # Emergency contacts, safety guidance, notifications
├── src/
│   ├── App.tsx                        # Role-aware workspace shell & navigation
│   ├── types.ts                       # Shared TypeScript interfaces
│   ├── lib/api.ts                     # In-memory Bearer API client
│   ├── context/AuthContext.tsx        # Auth state, WebSocket client, fallback polling
│   └── components/
│       ├── PublicPages.tsx            # Landing, Login, Register, Reset, Contacts, Guidance, Diagrams
│       ├── StudentDashboard.tsx       # Student & Faculty dashboard, My Incidents, Profile
│       ├── ResponderDashboard.tsx     # Incoming SOS queue, Dispatch map, Response history
│       ├── AdminDashboard.tsx         # Analytics, User/Responder management, Audit logs, Settings
│       ├── IncidentForm.tsx           # 9-category incident report form + consent GPS + attachments
│       ├── IncidentDetailView.tsx     # Live timeline, responder operations, internal notes
│       ├── SosModal.tsx               # Confirmation SOS workflow with idempotency lock
│       ├── CampusMap.tsx              # Interactive Leaflet + OpenStreetMap component
│       └── StatusText.tsx             # Accessible semantic status & priority indicators
├── supabase/
│   ├── migrations/001_schema.sql      # PostgreSQL DDL
│   ├── migrations/002_rls_policies.sql# Row Level Security policies
│   └── functions/submit-sos/index.ts  # Deno Edge Function
└── docs/
    └── PROJECT_REPORT_AND_TESTS.md    # Academic report, diagrams, test cases, deployment guide
```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure optional environment variables in `.env` based on `.env.example` (leave `ADMIN_BOOTSTRAP_PASSCODE` empty to claim the initial Admin interactively in the browser).
3. Start the full-stack server on port 3000:
   ```bash
   npm run dev
   ```
4. Open the application in your browser, claim the **Initial Administrator Account** on the Sign In page, and optionally load the **Academic Demonstration Test Dataset** from **System Settings**.
