/**
 * fetch_prospects.js - real college players for the 2027-2029 draft classes, from ESPN's public APIs.
 *
 *   - every FBS team (and its conference) for the current college season
 *   - every roster: name, position, height, weight, class year, jersey, hometown, headshot
 *   - each player's college stats for the last two seasons (only the current one for freshmen)
 *   - ESPN's ranked big board for the next draft (top prospects, with position ranks)
 * Everything is cached under data_cache/prospects/, so reruns only fetch what's missing.
 *
 * Usage: node src/fetch_prospects.js [collegeSeason=2026]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SEASON = +(process.argv[2] || 2026);
const DIR = path.join(__dirname, '..', 'data_cache', 'prospects');
fs.mkdirSync(path.join(DIR, 'stats'), { recursive: true });
const UA = 'Mozilla/5.0 (NFLHistoryFBGM personal project)';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

function get(url, tries = 3) {
  return new Promise((resolve) => {
    const req = https.get(url.replace('http://', 'https://').replace('.pvt/', '.com/'), { headers: { 'User-Agent': UA } }, (res) => {
      if ([301, 302].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(get(res.headers.location, tries)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null);
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { tries > 1 ? setTimeout(() => resolve(get(url, tries - 1)), 1500) : resolve(null); }
      });
    });
    req.on('error', () => (tries > 1 ? setTimeout(() => resolve(get(url, tries - 1)), 1500) : resolve(null)));
    req.setTimeout(20000, () => req.destroy());
  });
}
const cached = async (file, fetcher) => {
  const f = path.join(DIR, file);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fetcher();
  if (v !== undefined) fs.writeFileSync(f, JSON.stringify(v));
  return v;
};
async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); if (++done % 1000 === 0) console.log(`  ${done}/${items.length}`); }
  }));
}

(async () => {
  // FBS teams and their conferences
  const teams = await cached(`teams_${SEASON}.json`, async () => {
    const list = await get(`${CORE}/leagues/college-football/seasons/${SEASON}/types/2/groups/80/teams?limit=300`);
    const out = [];
    await pool(list.items, 8, async (it) => {
      const t = await get(it.$ref);
      if (!t) return;
      const g = t.groups && t.groups.$ref ? await get(t.groups.$ref) : null;
      out.push({ id: t.id, name: t.displayName, abbrev: t.abbreviation, conf: g ? g.shortName || g.name : '', confId: g ? g.id : '' });
    });
    return out;
  });
  console.log(`FBS teams: ${teams.length}`);

  // Rosters
  const players = [];
  await pool(teams, 8, async (t) => {
    const r = await cached(`roster_${t.id}.json`, () => get(`${SITE}/teams/${t.id}/roster`));
    for (const grp of (r && r.athletes) || []) for (const a of grp.items) {
      players.push({
        id: a.id, first: a.firstName, last: a.lastName, pos: a.position && a.position.abbreviation, hgt: a.height, wgt: a.weight,
        cls: a.experience && a.experience.years, clsName: a.experience && a.experience.displayValue, jersey: a.jersey,
        home: a.birthPlace && a.birthPlace.displayText, headshot: a.headshot && a.headshot.href, team: t.id,
      });
    }
  });
  fs.writeFileSync(path.join(DIR, `players_${SEASON}.json`), JSON.stringify(players));
  console.log(`players: ${players.length}`);

  // Stats: this season for everyone, last season for everyone past their first year
  const jobs = [];
  for (const p of players) {
    if (!p.cls) continue;
    jobs.push([p.id, SEASON]);
    if (p.cls >= 2) jobs.push([p.id, SEASON - 1]);
  }
  const todo = jobs.filter(([id, s]) => !fs.existsSync(path.join(DIR, 'stats', `${id}_${s}.json`)));
  console.log(`stat lines: ${jobs.length}, to fetch: ${todo.length}`);
  await pool(todo, 20, async ([id, s]) => {
    const j = await get(`${CORE}/leagues/college-football/seasons/${s}/types/2/athletes/${id}/statistics`);
    const flat = {};
    for (const c of (j && j.splits && j.splits.categories) || []) for (const st of c.stats) if (st.value) flat[`${c.name}.${st.name}`] = st.value;
    fs.writeFileSync(path.join(DIR, 'stats', `${id}_${s}.json`), JSON.stringify(flat));
  });

  // ESPN recruiting grades for the classes now in college (pedigree: what scouts thought coming out of high school)
  for (let rc = SEASON - 4; rc <= SEASON; rc++) {
    await cached(`recruits_${rc}.json`, async () => {
      const first = await get(`${CORE}/leagues/college-football/seasons/${rc}/recruits?limit=1000&page=1`);
      if (!first) return [];
      const refs = [...first.items];
      for (let page = 2; page <= first.pageCount; page++) {
        const l = await get(`${CORE}/leagues/college-football/seasons/${rc}/recruits?limit=1000&page=${page}`);
        if (l && l.items) refs.push(...l.items);
      }
      const out = [];
      await pool(refs, 20, async (it) => {
        const r = await get(it.$ref);
        if (!r || !r.athlete) return;
        const attr = Object.fromEntries((r.attributes || []).map(x => [x.name, x.value]));
        out.push({ collegeId: r.athlete.alternateId, name: r.athlete.displayName, grade: r.grade, cls: rc, posRank: attr.positionRank, natRank: attr.nationalRank ?? attr.overallRank });
      });
      console.log(`recruits ${rc}: ${out.length}`);
      return out;
    });
  }

  // ESPN big board for the next draft
  const board = await cached(`board_${SEASON + 1}.json`, async () => {
    const out = [];
    for (let page = 1; page < 20; page++) {
      const l = await get(`${CORE}/leagues/nfl/seasons/${SEASON + 1}/draft/athletes?limit=100&page=${page}`);
      if (!l || !l.items || !l.items.length) break;
      await pool(l.items, 8, async (it) => {
        const a = await get(it.$ref);
        if (!a) return;
        const attr = Object.fromEntries((a.attributes || []).map(x => [x.name, x.value]));
        const cid = a.athlete && a.athlete.$ref ? (a.athlete.$ref.match(/athletes\/(\d+)/) || [])[1] : null;
        out.push({ collegeId: cid, name: a.displayName, pos: a.position && a.position.abbreviation, ...attr });
      });
      if (page >= l.pageCount) break;
    }
    return out;
  });
  console.log(`big board: ${board.length}`);
})();
