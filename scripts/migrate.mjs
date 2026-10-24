// Creates the one table Ondalyr writes to. Run once per database:
//   node --env-file=.env.local scripts/migrate.mjs
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = neon(url);

await sql`
  create table if not exists listen_day (
    device  uuid    not null,
    item    text    not null,
    kind    text    not null,
    day     date    not null,
    seconds integer not null default 0,
    plays   integer not null default 0,
    primary key (device, item, day)
  )`;
await sql`create index if not exists listen_day_day on listen_day (day)`;

// Stations the recorder polls: ones people played in Ondalyr, plus seeded
// popular music stations. has_meta goes false after a station sends no titles.
await sql`
  create table if not exists radio_watch (
    station        uuid        primary key,
    name           text        not null,
    url            text        not null,
    has_meta       boolean     not null default true,
    seeded         boolean     not null default false,
    clicks         integer     not null default 0,
    last_requested timestamptz not null default now()
  )`;
await sql`alter table radio_watch add column if not exists seeded boolean not null default false`;
await sql`alter table radio_watch add column if not exists clicks integer not null default 0`;

// Normalised names of artists on the current Deezer charts.
await sql`
  create table if not exists hit_artist (
    name       text        primary key,
    updated_at timestamptz not null default now()
  )`;

// Each distinct title once; the airing log only points at it.
await sql`
  create table if not exists song (
    id       serial      primary key,
    key      text        not null unique,
    title    text        not null,
    hit      boolean     not null,
    plays    integer     not null default 1,
    stations integer     not null default 1,
    first_at timestamptz not null default now(),
    last_at  timestamptz not null default now()
  )`;

// The first version stored the full title per airing; replace it.
const [{ old }] = await sql`
  select count(*)::int as old from information_schema.columns
  where table_name = 'aired' and column_name = 'title'`;
if (old) await sql`drop table aired`;
await sql`
  create table if not exists aired (
    station uuid        not null,
    song    integer     not null,
    at      timestamptz not null default now()
  )`;
await sql`create index if not exists aired_station_at on aired (station, at desc)`;
await sql`create index if not exists aired_at on aired (at)`;
console.log("listen_day, radio_watch, hit_artist, song, aired ready");
