# Ondalyr

A light browser player for songs, music videos, live radio and podcasts. When a 30-second preview starts in the middle of a song, Ondalyr transcribes the clip, finds where it sits in the full track, and shifts the synced lyrics to match.

## What it does

| Area | How |
| --- | --- |
| Songs | iTunes Search previews, relayed same-origin through `/api/media` so the Web Audio analyser can read them |
| Music videos | iTunes music-video previews, played on the stage with lyrics alongside |
| Live radio | Radio Browser directory, HTTPS and non-HLS streams only |
| Podcasts | iTunes podcast search, then the RSS feed parsed by `/api/rss` |
| Lyrics | LRCLIB synced lyrics, re-timed by `/api/align` (Whisper on Groq, offset voting) |
| Stage | Cover, video, or Orbwave (72 mirrored spectrum bands) |
| Receipts | Solana devnet Memo transaction with the item id and seconds heard |
| Languages | English (default) and Indonesian |

## Listening data and running cost

Seconds are counted in the browser and kept in `localStorage`, so the count is exact even when the network drops. The browser sends one batch to `/api/tally` every 15 minutes, on track change, and when the tab is hidden or closed (`sendBeacon`). The server folds each batch into a single row per device, item and day with one `INSERT ... ON CONFLICT` statement.

For one listener with the radio on 24 hours a day, that comes to at most about 98 requests and one row a day. Writing once per second would be 86,400 requests. `GET /api/tally` (the weekly chart) is cached at the CDN for five minutes, so page views do not reach the database.

No Blob store is used. Listening data is a few integers per row, and Postgres handles that fine. A Blob store would only make sense for user uploads or exports, and the app has neither.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in GROQ_API_KEY and DATABASE_URL
node --env-file=.env.local scripts/migrate.mjs
npm run dev
```

Both variables are optional. Without `GROQ_API_KEY`, lyrics show without re-timing. Without `DATABASE_URL`, tallies are accepted and dropped.

## Layout

```
src/app/            pages (landing, /listen) and API routes (media, rss, align, tally)
src/components/     player context, stage, lyrics, bar, views, landing demos, logo
src/lib/            sources, lyrics, i18n, solana, tally
scripts/migrate.mjs creates the listen_day table
anchor/             listen-ledger Anchor program (per-minute payments, crates); not deployed yet
```
