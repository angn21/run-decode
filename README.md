# Run Decode

A personal running dashboard powered by the Strava API. Decode your runs, track safe habits, and wrap your week.

**Features:**

- **Consistency Coach** (`/`) — weekly mileage, 10% rule warnings, easy/hard split, streaks, milestones
- **Pace Decoder** (`/activities/[id]`) — weather context, HR drift, elevation story, plain-English verdicts
- **Run Wrapped** (`/wrapped`) — weekly/monthly shareable recap cards with GPS trace art

## Setup

### 1. Environment

Copy `.env.example` to `.env.local` and fill in your Strava credentials:

```bash
cp .env.example .env.local        # macOS / Linux
copy .env.example .env.local      # Windows
```

Get credentials from [Strava API settings](https://www.strava.com/settings/api).

| Variable | Required | Description |
|---|---|---|
| `STRAVA_CLIENT_ID` | Yes | Strava app client ID |
| `STRAVA_CLIENT_SECRET` | Yes | Strava app client secret |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL, no trailing slash (default `http://localhost:3000`) |
| `SESSION_SECRET` | Yes | Random string for session cookies |
| `RUN_DECODE_TIMEZONE` | Yes | IANA timezone (e.g. `America/Toronto`) — use the same value locally and on Vercel |
| `STRAVA_ACCESS_TOKEN` | Optional | See quick dev below |
| `STRAVA_REFRESH_TOKEN` | Optional | See quick dev below |
| `STRAVA_EXPIRES_AT` | Optional | Unix timestamp (seconds); defaults to 6h from now if omitted |
| `TURSO_DATABASE_URL` | Production only | See deploy section |
| `TURSO_AUTH_TOKEN` | Production only | See deploy section |

### 2. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Connect with Strava**.

**Local database:** Turso is not required for local development. When `TURSO_DATABASE_URL` is unset, the app stores data in `data/run-decode.db` (created automatically, gitignored).

### Quick dev with tokens (local only)

If you already have OAuth tokens with `activity:read_all` scope, add them to `.env.local`:

```
STRAVA_ACCESS_TOKEN=your_token
STRAVA_REFRESH_TOKEN=your_refresh_token
STRAVA_EXPIRES_AT=unix_timestamp
```

Then hit **Sync runs** on the dashboard. Manual tokens from the Strava settings page usually lack activity permissions — OAuth via **Connect with Strava** is preferred.

This only works locally — do not add `STRAVA_ACCESS_TOKEN` to Vercel.

## Project structure

```
run-decode/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # Dashboard — coach stats + recent runs
│   │   ├── wrapped/page.tsx      # Weekly / monthly recap cards
│   │   ├── activities/[id]/      # Per-run pace decoder
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── strava/       # OAuth redirect to Strava
│   │       │   ├── callback/     # OAuth callback
│   │       │   └── logout/       # Clear session
│   │       └── sync/             # Sync activities from Strava
│   ├── components/               # UI components
│   │   ├── CoachDashboard.tsx    # Consistency coach panel
│   │   ├── PaceDecoderView.tsx   # Single-run decode view
│   │   ├── WrappedView.tsx       # Shareable recap cards
│   │   ├── ActivityList.tsx      # Recent runs list
│   │   └── ...
│   └── lib/                      # Core logic
│       ├── strava.ts             # Strava API, OAuth, sync
│       ├── coach.ts              # Consistency coach stats
│       ├── decoder.ts            # Pace decoder insights
│       ├── wrapped.ts            # Wrapped recap stats
│       ├── weather.ts            # Open-Meteo integration
│       ├── db.ts                 # libSQL client + schema
│       ├── session.ts            # Athlete session cookies
│       └── ...
├── public/
└── data/                         # Local SQLite DB (runtime, gitignored)
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

## Deploy to Vercel

### 1. Create a Turso database

Run Decode uses [Turso](https://turso.tech) (libSQL) for persistent storage across serverless instances. Turso is required on Vercel; local dev falls back to `data/run-decode.db` when these vars are unset.

```bash
# Install Turso CLI: https://docs.turso.tech/cli/installation
turso auth login
turso db create run-decode
turso db show run-decode --url
turso db tokens create run-decode
```

Save the database URL and auth token for Vercel.

### 2. Push to GitHub and import in Vercel

### 3. Add environment variables

In Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `STRAVA_CLIENT_ID` | From [Strava API settings](https://www.strava.com/settings/api) |
| `STRAVA_CLIENT_SECRET` | From Strava API settings |
| `NEXT_PUBLIC_APP_URL` | `https://run-decode.vercel.app` (your Vercel URL, no trailing slash) |
| `TURSO_DATABASE_URL` | `libsql://your-db-name-org.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso auth token from `turso db tokens create` |
| `SESSION_SECRET` | Any long random string |
| `RUN_DECODE_TIMEZONE` | Your IANA timezone (e.g. `America/Toronto`) — **use the same value locally and on Vercel** |

Do **not** add `STRAVA_ACCESS_TOKEN` to Vercel — use OAuth on the live site instead.

### 4. Strava callback domain

In Strava API settings, set **Authorization Callback Domain** to `run-decode.vercel.app` (your Vercel domain).

### 5. Redeploy

Redeploy after adding env vars.

### Multi-user notes

- Each user connects via OAuth and gets an isolated session cookie.
- Strava limits apps to **10 connected athletes** by default. Remove unused athletes in [Strava API settings](https://www.strava.com/settings/api) if the limit is reached.
- Use **Logout** on the dashboard to clear your session.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Turso (libSQL) · Strava API · Open-Meteo
