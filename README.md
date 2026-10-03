# Referral Tracker

A complete synthetic referral workflow built with **React, TypeScript, Node.js/Fastify, and PostgreSQL**. Patients see what happens next; care coordinators can identify stalled work, request document information, and move referrals into appointments. Every transition produces an audit event and an in-app notification.

## Try it

[Interactive demo](https://harvestmoonpete.github.io/referral-tracker/) · [Source](https://github.com/harvestmoonpete/referral-tracker)

The public demo runs entirely in your browser. Its role selector is a **simulation**, not authentication. Data resets on refresh or with **Reset demo**. There are no actual patients, uploaded documents, messages, clinical advice, or external healthcare integrations.

A two-minute walkthrough:

1. Select Alex Morgan's cardiology referral. Notice its missing letter and stalled indicator.
2. Switch to Alex's patient perspective and select **Provide info** to record synthetic document metadata.
3. Switch to Jordan's coordinator perspective, select the referral, and schedule a future appointment.
4. Inspect the audit history and in-app updates. Switch to Sam Rivera: Alex's referrals and updates are absent.
5. Create a referral, request an additional document, or change ownership. Reset to replay.

## Run the real application

Requires Docker with Compose v2:

```sh
docker compose up --build --wait
```

Open http://localhost:8083. Select a demo account and sign in. The UI submits the intentionally public demo password `demo-care-2026`. Accounts are `coordinator`, `alex`, and `sam`. PostgreSQL automatically seeds the workspace once; subsequent starts preserve data. The frontend alone is exposed, bound to localhost. This is a local demonstration, not a production healthcare service.

```sh
docker compose down        # retain data
docker compose down -v     # delete local demo data and reseed on next start
```

Set `STALLED_DAYS=10 docker compose up --build` to change the attention threshold (default: 7 days). The browser simulation uses 7 days. `COOKIE_SECURE=true` is available for an API served behind HTTPS; local HTTP leaves it false.

## Architecture and engineering choices

```text
React + TypeScript → typed Client interface
  ├─ browser adapter → deterministic seeded workflow (memory only)
  └─ HTTP adapter → nginx → Fastify API → PostgreSQL
                               ├─ server-side sessions
                               ├─ shared workflow transition rules
                               └─ atomic state + audit + notification updates
```

`src/domain.ts` expresses the workflow and authorization invariants independently of React and HTTP. Both adapters use those transitions. The backend is the authority in connected mode: client role selection never grants permissions, and every read/write is scoped by the server-side session. Patients can record requested synthetic document metadata only for their own referrals. Coordinators can create, assign, request, schedule, and complete referrals.

PostgreSQL stores a **single JSONB workspace snapshot** containing referral state, audit events, notifications, and sessions. A transaction locks this row, validates changes, and commits the whole snapshot atomically. This deliberate small-demo tradeoff makes rollback and concurrent-update correctness straightforward, but serializes reads/writes and does not scale to production workloads. A production evolution would normalize entities, use per-referral locking, indexes, separate session storage, migrations, and an append-only audit database role. The demo does not claim regulatory compliance.

Sessions use random 256-bit tokens, server-side expiry, HttpOnly/SameSite=Strict cookies, and logout invalidation. Public seeded credentials are verified with scrypt. They are deliberately demo credentials; registration, recovery, external identity providers, and production abuse controls are outside this study. The API accepts small JSON bodies and explicit bounded strings. No file uploads are accepted.

### HTTP interface

- `GET /api/health`: API and PostgreSQL readiness.
- `POST /api/login`: `{userId, password}` → demo user and session cookie.
- `POST /api/logout`: invalidate current session.
- `GET /api/workspace`: authenticated user's referrals, audit events, notifications, threshold, and user.
- `POST /api/workspace`: `{type: "create", patientId, specialty}` or `{referralId, action}` → updated scoped workspace.

Actions are `assign` (owner), `request` (name), `receive` (name), `schedule` (future appointment ISO timestamp), and `complete`. Workflow states are awaiting documents → ready to schedule → scheduled → completed. Requesting additional documents before scheduling returns a referral to awaiting documents. Invalid transitions return 400, unauthenticated access 401, forbidden role operations 403, and inaccessible referrals 404.

## Development and validation

Requires Node.js 24:

```sh
npm ci
npm run dev         # browser simulation at http://localhost:5173
npm run check
npm test
npm run build
npm run test:integration  # against running Compose application
```

For frontend development against Compose, the Vite proxy targets localhost:3000; run the API locally with `DATABASE_URL` configured or adjust the proxy to localhost:8083, then start Vite with `VITE_API_MODE=http`. The Compose build configures HTTP mode automatically; GitHub Pages builds the browser adapter under `/referral-tracker/` using `PAGES=true`.

Tests cover transitions, invalid operations, patient isolation, session cookies, invalid credentials, logout, audit/notification ownership, concurrent updates, and transaction rollback. The Compose integration suite uses the real HTTP API and PostgreSQL to exercise a complete referral, concurrent assignments, cross-patient denial, notifications, and logout. Run it repeatedly: each run creates its own synthetic referral.

GitHub Actions runs checks, tests, builds, and Compose integration before publishing the Pages artifact. No API keys or paid services are required. Optional fonts load from Google Fonts with local fallbacks. Layout is responsive with labeled form controls, native keyboard controls, visible focus outlines, loading indicators, and inline errors.

## License

MIT. Built as a portfolio demonstration using synthetic data only.
