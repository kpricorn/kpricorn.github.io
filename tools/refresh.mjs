#!/usr/bin/env node
/* Merge Strava activities into the DATA line of index.html.

   node tools/refresh.mjs new.json [more.json ...]

   Each file holds Strava activities, either as list_activities returns them
   ({activities:[...]} or [...] of objects with id, sport_type, start_local,
   summary.distance, summary.elevation_gain) or as rows
   [start_local, sport_type, distance_m, elevation_gain_m, ..., id] (id last).
   Activities already on the page (same id) are replaced, so overlapping
   fetches are fine. Gym sessions are skipped. Prints what changed. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KIND = {
  Run: 'r', TrailRun: 'r', VirtualRun: 'r',
  Hike: 'h', Walk: 'h', Snowshoe: 'h',
  Ride: 'b', MountainBikeRide: 'b', GravelRide: 'b', EMountainBikeRide: 'b', EBikeRide: 'b', Velomobile: 'b', Handcycle: 'b',
  VirtualRide: 'v',
  BackcountrySki: 's', AlpineSki: 's', NordicSki: 's', Snowboard: 's', SkateSki: 's',
  RockClimbing: 'o', Swim: 'o', Rowing: 'o', Kayaking: 'o', Canoeing: 'o', StandUpPaddling: 'o', IceSkate: 'o', InlineSkate: 'o',
};
const SKIP = new Set(['Workout', 'WeightTraining', 'Pilates', 'Yoga', 'Tennis', 'Crossfit', 'Elliptical', 'StairStepper', 'HighIntensityIntervalTraining', 'Badminton', 'Squash', 'TableTennis', 'Padel', 'Pickleball', 'VirtualRow']);

const page = fileURLToPath(new URL('../index.html', import.meta.url));
const html = readFileSync(page, 'utf8');
const m = html.match(/^const DATA = (\[.*\]);$/m);
if (!m) throw new Error('no DATA line in index.html');
const rows = new Map(JSON.parse(m[1]).map(r => [r[4], r]));
const before = rows.size;

const toRow = a => Array.isArray(a)
  ? { start: a[0], sport: a[1], dist: a[2], up: a[3], id: String(a.at(-1)) }
  : { start: a.start_local, sport: a.sport_type, dist: a.summary?.distance ?? 0, up: a.summary?.elevation_gain ?? 0, id: String(a.id) };

let added = 0, updated = 0;
const unknown = {};
for (const file of process.argv.slice(2)) {
  let data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.activities) data = data.activities;
  for (const a of data) {
    const { start, sport, dist, up, id } = toRow(a);
    if (SKIP.has(sport)) continue;
    const k = KIND[sport];
    if (!k) { unknown[sport] = (unknown[sport] || 0) + 1; continue; }
    const row = [start.slice(0, 16), k, Math.round(dist), Math.round(up), id];
    if (rows.has(id)) { if (JSON.stringify(rows.get(id)) !== JSON.stringify(row)) updated++; } else added++;
    rows.set(id, row);
  }
}
const out = [...rows.values()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[4] < b[4] ? -1 : 1);
writeFileSync(page, html.replace(m[0], () => `const DATA = ${JSON.stringify(out)};`));
console.log(`${before} → ${out.length} outings: ${added} added, ${updated} updated, latest ${out.at(-1)[0]}`);
if (Object.keys(unknown).length) console.log('skipped unknown sport types (add them to KIND or SKIP):', unknown);
