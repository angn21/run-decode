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

Then hit **Sync runs** on the dashboard.

## Deploy to Vercel

1. Push to GitHub and import in Vercel
2. Set environment variables (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`, `SESSION_SECRET`)
3. Update Strava app **Authorization Callback Domain** to your Vercel hostname (e.g. `run-decode.vercel.app`)

Note: SQLite works locally. For Vercel serverless, consider Turso or Vercel Postgres for production persistence.

## Stack

Next.js 16 · TypeScript · Tailwind · SQLite · Strava API · Open-Meteo
