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
console.log("listen_day ready");
