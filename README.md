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
2. Add these **Environment Variables** in Vercel → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `STRAVA_CLIENT_ID` | From [Strava API settings](https://www.strava.com/settings/api) |
| `STRAVA_CLIENT_SECRET` | From Strava API settings |
| `NEXT_PUBLIC_APP_URL` | `https://run-decode.vercel.app` (your Vercel URL, no trailing slash) |
| `SESSION_SECRET` | Any long random string |
| `RUN_DECODE_TIMEZONE` | Your IANA timezone (e.g. `America/Toronto`) — **use the same value locally and on Vercel** |

Do **not** add `STRAVA_ACCESS_TOKEN` to Vercel — use OAuth on the live site instead.

3. In Strava API settings, set **Authorization Callback Domain** to `run-decode.vercel.app`
4. Redeploy after adding env vars

**Note:** On Vercel, SQLite uses ephemeral `/tmp` storage — data may reset on cold starts. For persistent hosting, migrate to [Turso](https://turso.tech) later.

## Stack

Next.js 16 · TypeScript · Tailwind · SQLite · Strava API · Open-Meteo
