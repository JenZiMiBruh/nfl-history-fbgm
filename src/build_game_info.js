/**
 * build_game_info.js - the real calendar for every game: date, kickoff time, stadium, roof and weather, plus each
 * season's real playoff dates and Super Bowl site, and each stadium's typical weather by month (for seasons the
 * game generates after the real data ends). Written to data_cache/game_info.json and served to the mod as
 * /nfl/game_info.json (see build_mod_assets.js), where src/common/nflCalendar.ts in the mod reads it.
 *
 *   Dates: spreadspoke_scores.csv (1966-1977), nflverse games.csv (1978 on, including the 2026 schedule)
 *   Kickoff times (ET) and roofs: games.csv, 1999 on. Earlier times are filled in by era rules in the mod.
 *   Weather: games.csv temp/wind, else spreadspoke temperature/wind/detail (rain, snow, fog), matched by date and home team.
 *
 * Seasons are keyed the way Football GM names them in the league files: by the year they end (the 2026 season is 2027).
 * Dates are stored as days after Sep 1 of the year the season starts, to keep the file small.
 *
 * Usage: node src/build_game_info.js
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');
const { FULL: FULL0, CODE } = require('./team_codes');

const CACHE = path.join(__dirname, '..', 'data_cache');
const FULL = { ...FULL0, 'Tennessee Titans': 30, 'Washington Football Team': 31, 'Washington Commanders': 31, 'Los Angeles Chargers': 17, 'Las Vegas Raiders': 16 };

const ROOF = { outdoors: 0, dome: 1, open: 2, closed: 3 };
const COND = { rain: 1, snow: 2, fog: 3 };
const num = (x) => (x === '' || x === undefined || x === null || Number.isNaN(+x) ? null : Math.round(+x));
const parseDate = (s) => { // "2025-09-04" or "9/2/1966"
  if (s.includes('-')) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  const [m, d, y] = s.split('/').map(Number); return new Date(Date.UTC(y, m - 1, d));
};
const dayOffset = (date, startYear) => Math.round((date - Date.UTC(startYear, 8, 1)) / 86400000);
const ymd = (date) => date.toISOString().slice(0, 10);
const minutes = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const condFrom = (detail) => { // spreadspoke's "snow | rain | fog": the most notable one
  if (!detail) return 0;
  if (detail.includes('snow')) return COND.snow;
  if (detail.includes('rain')) return COND.rain;
  if (detail.includes('fog')) return COND.fog;
  return 0;
};
const roofFromDetail = (detail) => (!detail ? null : detail === 'indoor' ? ROOF.dome : detail.includes('open roof') ? ROOF.open : detail.includes('closed') ? ROOF.closed : null);

// spreadspoke weather by date + home team, to fill what games.csv lacks
const spread = parseCSVFile(path.join(CACHE, 'spreadspoke_scores.csv'));
const weatherBy = new Map();
for (const r of spread) {
  const h = FULL[r.team_home];
  if (h === undefined) continue;
  weatherBy.set(ymd(parseDate(r.schedule_date)) + ':' + h, {
    temp: num(r.weather_temperature), wind: num(r.weather_wind_mph), cond: condFrom(r.weather_detail),
    roof: roofFromDetail(r.weather_detail), stadium: r.stadium, neutral: r.stadium_neutral === 'TRUE',
  });
}

const seasons = {}; // game season -> { reg: { "h-a": rec }, post: [[round name, [[dayOffset, minutes]...]]], sb: rec, stadiums: { tid: name } }
const S = (y) => (seasons[y + 1] = seasons[y + 1] || { reg: {}, post: {}, homeStadiums: {} });
// rec: [dayOffset, minutes ET or null, temp or null, wind or null, cond, roof or null, stadium or null (only for neutral sites)]
const add = (y, kind, round, h, a, date, time, temp, wind, cond, roof, stadium, neutral) => {
  const s = S(y);
  const rec = [dayOffset(date, y), time, temp, wind, cond, roof, neutral ? stadium : null];
  if (kind === 'REG') {
    let key = `${h}-${a}`;
    if (s.reg[key]) key += '-2'; // the rare repeat pairing (strike years)
    s.reg[key] = rec;
    if (!neutral && stadium) { const c = (s.homeStadiums[h] = s.homeStadiums[h] || {}); c[stadium] = (c[stadium] || 0) + 1; }
  } else {
    (s.post[round] = s.post[round] || []).push(round === 'SB' ? [...rec.slice(0, 6), stadium] : rec.slice(0, 2));
  }
};

const ROUND = { Wildcard: 'WC', Division: 'DIV', Conference: 'CON', Superbowl: 'SB', WC: 'WC', DIV: 'DIV', CON: 'CON', CONF: 'CON', SB: 'SB' };
for (const r of spread) {
  const y = +r.schedule_season;
  if (!(y >= 1966 && y <= 1977)) continue;
  const h = FULL[r.team_home], a = FULL[r.team_away];
  if (h === undefined || a === undefined) continue;
  const kind = r.schedule_playoff === 'TRUE' ? 'POST' : 'REG';
  const w = weatherBy.get(ymd(parseDate(r.schedule_date)) + ':' + h) || {};
  add(y, kind, ROUND[r.schedule_week], h, a, parseDate(r.schedule_date), null, w.temp ?? null, w.wind ?? null, w.cond || 0, w.roof ?? null, r.stadium, r.stadium_neutral === 'TRUE');
}
for (const r of parseCSVFile(path.join(CACHE, 'games.csv'))) {
  const y = +r.season;
  if (!(y >= 1978) || !r.gameday) continue;
  const h = CODE[r.home_team], a = CODE[r.away_team];
  if (h === undefined || a === undefined) continue;
  const date = parseDate(r.gameday);
  const w = weatherBy.get(ymd(date) + ':' + h) || {};
  const roof = r.roof ? ROOF[r.roof] : (w.roof ?? null);
  const indoors = roof === ROOF.dome || roof === ROOF.closed;
  add(y, r.game_type === 'REG' ? 'REG' : 'POST', ROUND[r.game_type], h, a, date, minutes(r.gametime),
    indoors ? null : (num(r.temp) ?? w.temp ?? null), indoors ? null : (num(r.wind) ?? w.wind ?? null), indoors ? 0 : (w.cond || 0),
    roof, r.stadium || w.stadium || null, r.location === 'Neutral');
}

// Each team's main home stadium that season, and each stadium's latest roof
const out = { v: 1, seasons: {}, climate: {}, teamStadium: {} };
const roofOf = {};
for (const [season, s] of Object.entries(seasons)) {
  const stadiums = {};
  for (const [tid, counts] of Object.entries(s.homeStadiums)) stadiums[tid] = Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0];
  const post = ['WC', 'DIV', 'CON', 'SB'].filter(k => s.post[k]).map(k => [k, s.post[k]]);
  out.seasons[season] = { reg: s.reg, post, stadiums };
  for (const [key, rec] of Object.entries(s.reg)) {
    const st = rec[6] || stadiums[key.split('-')[0]];
    if (st && rec[5] !== null) roofOf[st] = rec[5];
  }
}

// Typical weather by stadium and month (outdoor games 1990 on): mean and spread of temperature, mean wind, and how
// often it rained or snowed. Used to make up believable weather for seasons after the real data.
const acc = {};
for (const [season, s] of Object.entries(out.seasons)) {
  if (+season < 1991) continue;
  for (const [key, rec] of Object.entries(s.reg)) {
    const st = rec[6] || s.stadiums[key.split('-')[0]];
    if (!st || rec[2] === null) continue;
    const month = new Date(Date.UTC(+season - 1, 8, 1 + rec[0])).getUTCMonth() + 1;
    const a = ((acc[st] = acc[st] || {})[month] = acc[st][month] || { n: 0, t: 0, t2: 0, w: 0, wn: 0, rain: 0, snow: 0 });
    a.n++; a.t += rec[2]; a.t2 += rec[2] * rec[2];
    if (rec[3] !== null) { a.w += rec[3]; a.wn++; }
    if (rec[4] === COND.rain) a.rain++;
    if (rec[4] === COND.snow) a.snow++;
  }
}
for (const [st, months] of Object.entries(acc)) {
  out.climate[st] = { roof: roofOf[st] ?? 0, m: {} };
  for (const [m, a] of Object.entries(months)) {
    if (a.n < 3) continue;
    const mean = a.t / a.n;
    out.climate[st].m[m] = [Math.round(mean), Math.round(Math.sqrt(Math.max(a.t2 / a.n - mean * mean, 9))), a.wn ? Math.round(a.w / a.wn) : 8,
      +(a.rain / a.n).toFixed(2), +(a.snow / a.n).toFixed(2)];
  }
}
for (const st of Object.keys(roofOf)) if (!out.climate[st]) out.climate[st] = { roof: roofOf[st], m: {} };

// Each team's latest home stadium, for seasons after the data
const latest = Object.keys(out.seasons).map(Number).sort((a, b) => b - a);
for (const season of latest) for (const [tid, st] of Object.entries(out.seasons[season].stadiums)) if (!out.teamStadium[tid]) out.teamStadium[tid] = st;

// Super Bowl sites already announced past the data (game season -> [date, stadium, roof])
out.futureSuperBowls = {
  2027: ['2027-02-14', 'SoFi Stadium', ROOF.closed],
  2028: ['2028-02-13', 'Mercedes-Benz Stadium', ROOF.closed],
};

fs.writeFileSync(path.join(CACHE, 'game_info.json'), JSON.stringify(out));
const n = Object.values(out.seasons).reduce((a, s) => a + Object.keys(s.reg).length, 0);
console.log(`game_info.json: ${Object.keys(out.seasons).length} seasons, ${n} regular-season games, ${Object.keys(out.climate).length} stadiums,`,
  (fs.statSync(path.join(CACHE, 'game_info.json')).size / 1024).toFixed(0), 'KB');
