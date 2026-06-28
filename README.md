# Run Decode

A personal running dashboard powered by the Strava API. Decode your runs, track safe habits, and wrap your week.

**Features:**
- **Consistency Coach** — weekly mileage, 10% rule warnings, easy/hard split, streaks, milestones
- **Pace Decoder** — weather context, HR drift, elevation story, plain-English verdicts
- **Run Wrapped** — weekly/monthly shareable recap cards with GPS trace art

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Strava credentials:

```bash
cp .env.example .env.local
```

2. Get credentials from [https://www.strava.com/settings/api](https://www.strava.com/settings/api)

3. Install and run:

```bash
npm install
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) and click **Connect with Strava**

### Quick dev with tokens

If you already have an access token, add to `.env.local`:

```
STRAVA_ACCESS_TOKEN=your_token
STRAVA_REFRESH_TOKEN=your_refresh_token
STRAVA_EXPIRES_AT=unix_timestamp
```

Then hit **Sync runs** on the dashboard. This only works locally — not on Vercel.

## Deploy to Vercel

### 1. Create a Turso database

Run Decode uses [Turso](https://turso.tech) (libSQL) for persistent storage across serverless instances.

```bash
# Install Turso CLI: https://docs.turso.tech/cli/installation
turso auth login
turso db create run-decode
turso db show run-decode --url
turso db tokens create run-decode
```

Save the database URL and auth token for Vercel.

### 2. Push to GitHub and import in Vercel

### 3. Add Environment Variables

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

Next.js 16 · TypeScript · Tailwind · Turso (libSQL) · Strava API · Open-Meteo
