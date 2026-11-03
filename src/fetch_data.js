const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const CACHE_DIR = path.join(__dirname, '..', 'data_cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

function downloadFile(url, destPath, gunzip = false) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) {
    return Promise.resolve('cached');
  }
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'NFL-FBGM-Generator/1.0 (https://football-gm.com)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath, gunzip).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const tmpPath = destPath + '.tmp';
      const fileStream = fs.createWriteStream(tmpPath);
      const stream = gunzip ? res.pipe(zlib.createGunzip()) : res;
      stream.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          fs.renameSync(tmpPath, destPath);
          resolve('downloaded');
        });
      });
      stream.on('error', err => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(err);
      });
      fileStream.on('error', err => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

async function runPool(tasks, concurrency = 8) {
  let idx = 0;
  let completed = 0;
  const results = [];
  async function worker() {
    while (idx < tasks.length) {
      const myIdx = idx++;
      const t = tasks[myIdx];
      try {
        const status = await downloadFile(t.url, t.dest, t.gunzip);
        completed++;
        if (completed % 15 === 0 || completed === tasks.length || status === 'downloaded') {
          console.log(`[${completed}/${tasks.length}] ${t.name}: ${status}`);
        }
        results[myIdx] = { name: t.name, ok: true, status };
      } catch (err) {
        completed++;
        console.error(`[${completed}/${tasks.length}] ERROR ${t.name}: ${err.message}`);
        results[myIdx] = { name: t.name, ok: false, error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  const tasks = [];

  // 1. Core nflverse master datasets
  tasks.push({
    name: 'players.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv.gz',
    dest: path.join(CACHE_DIR, 'players.csv'),
    gunzip: true
  });
  tasks.push({
    name: 'otc_players.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/players_components/otc_players.csv.gz',
    dest: path.join(CACHE_DIR, 'otc_players.csv'),
    gunzip: true
  });
  tasks.push({
    name: 'draft_picks.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv',
    dest: path.join(CACHE_DIR, 'draft_picks.csv'),
    gunzip: false
  });
  tasks.push({
    name: 'games.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
    dest: path.join(CACHE_DIR, 'games.csv'),
    gunzip: false
  });
  tasks.push({
    name: 'trades.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/trades/trades.csv',
    dest: path.join(CACHE_DIR, 'trades.csv'),
    gunzip: false
  });
  // historical_contracts.csv: nflverse's CSV copy stopped updating in 2022; src/fetch_contracts.mjs reads the current
  // parquet file instead
  tasks.push({
    name: 'pfr_rosters.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/misc/pfr_rosters.csv',
    dest: path.join(CACHE_DIR, 'pfr_rosters.csv'),
    gunzip: false
  });
  tasks.push({
    name: 'teams_colors_logos.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv',
    dest: path.join(CACHE_DIR, 'teams_colors_logos.csv'),
    gunzip: false
  });

  // 2. Yearly rosters (1985 to 2026)
  fs.mkdirSync(path.join(CACHE_DIR, 'rosters'), { recursive: true });
  for (let yr = 1985; yr <= 2026; yr++) {
    tasks.push({
      name: `roster_${yr}.csv`,
      url: `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${yr}.csv`,
      dest: path.join(CACHE_DIR, 'rosters', `roster_${yr}.csv`),
      gunzip: false
    });
  }

  // 3. Yearly player stats (reg 1999-2026, post 1999-2025) & team stats (reg 1999-2026, post 1999-2025)
  fs.mkdirSync(path.join(CACHE_DIR, 'stats_player'), { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'stats_team'), { recursive: true });
  for (let yr = 1999; yr <= 2026; yr++) {
    tasks.push({
      name: `stats_player_reg_${yr}.csv`,
      url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_${yr}.csv.gz`,
      dest: path.join(CACHE_DIR, 'stats_player', `stats_player_reg_${yr}.csv`),
      gunzip: true
    });
    tasks.push({
      name: `stats_team_reg_${yr}.csv`,
      url: `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_reg_${yr}.csv.gz`,
      dest: path.join(CACHE_DIR, 'stats_team', `stats_team_reg_${yr}.csv`),
      gunzip: true
    });
    if (yr <= 2025) {
      tasks.push({
        name: `stats_player_post_${yr}.csv`,
        url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_post_${yr}.csv.gz`,
        dest: path.join(CACHE_DIR, 'stats_player', `stats_player_post_${yr}.csv`),
        gunzip: true
      });
      tasks.push({
        name: `stats_team_post_${yr}.csv`,
        url: `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_post_${yr}.csv.gz`,
        dest: path.join(CACHE_DIR, 'stats_team', `stats_team_post_${yr}.csv`),
        gunzip: true
      });
    }
  }

  // 4. Historical Madden ratings (2001-2025) + Madden 27 (2026) + PFR Approximate Value (2000-2025)
  fs.mkdirSync(path.join(CACHE_DIR, 'madden'), { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'pfr_av'), { recursive: true });
  for (let yr = 2001; yr <= 2025; yr++) {
    tasks.push({
      name: `madden_${yr}.csv`,
      url: `https://raw.githubusercontent.com/theedgepredictor/nfl-madden-data/main/data/madden/processed/${yr}.csv`,
      dest: path.join(CACHE_DIR, 'madden', `madden_${yr}.csv`),
      gunzip: false
    });
  }
  tasks.push({
    name: 'madden_2026.csv',
    url: 'https://raw.githubusercontent.com/zachxwalton/madden-ratings-breakdown/main/scraper/output/madden27_ratings.csv',
    dest: path.join(CACHE_DIR, 'madden', 'madden_2026.csv'),
    gunzip: false
  });
  for (let yr = 2000; yr <= 2025; yr++) {
    tasks.push({
      name: `pfr_av_${yr}.csv`,
      url: `https://raw.githubusercontent.com/theedgepredictor/nfl-madden-data/main/data/pfr/approximate_value/${yr}.csv`,
      dest: path.join(CACHE_DIR, 'pfr_av', `pfr_av_${yr}.csv`),
      gunzip: false
    });
  }

  // 5. Pre-1999 player stats & hometowns (Basic_Stats + Career_Stats_*)
  fs.mkdirSync(path.join(CACHE_DIR, 'pre1999'), { recursive: true });
  for (const f of ['Basic_Stats.csv', 'Career_Stats_Passing.csv', 'Career_Stats_Rushing.csv', 'Career_Stats_Receiving.csv', 'Career_Stats_Defensive.csv']) {
    tasks.push({
      name: f,
      url: `https://raw.githubusercontent.com/hblend9/NFL-Historical-Stats-Database/main/data/${f}`,
      dest: path.join(CACHE_DIR, 'pre1999', f),
      gunzip: false
    });
  }

  // 6. All-Pro and Pro Bowl CSVs + Wikipedia award pages
  fs.mkdirSync(path.join(CACHE_DIR, 'awards'), { recursive: true });
  tasks.push({
    name: 'all_pro_2000_2025.csv',
    url: 'https://raw.githubusercontent.com/tsully54/nfl_all_pro/main/all_pro_data.csv',
    dest: path.join(CACHE_DIR, 'awards', 'all_pro_2000_2025.csv'),
    gunzip: false
  });
  tasks.push({
    name: 'pro_bowl_2000_2019.csv',
    url: 'https://raw.githubusercontent.com/atferguson/NFL-Pro-Bowl-Classification/master/Data/Raw_Data/Pro_Football_Ref/ProBowl2000-2019.csv',
    dest: path.join(CACHE_DIR, 'awards', 'pro_bowl_2000_2019.csv'),
    gunzip: false
  });

  const wikiPages = [
    'AP_NFL_Most_Valuable_Player',
    'AP_NFL_Offensive_Player_of_the_Year',
    'AP_NFL_Defensive_Player_of_the_Year',
    'AP_NFL_Rookie_of_the_Year',
    'Super_Bowl_Most_Valuable_Player',
    '2020_Pro_Bowl',
    '2021_Pro_Bowl',
    '2022_Pro_Bowl',
    '2023_Pro_Bowl_Games',
    '2024_Pro_Bowl_Games',
    '2025_Pro_Bowl_Games',
    '2026_Pro_Bowl_Games'
  ];
  for (let yr = 1985; yr <= 1999; yr++) {
    wikiPages.push(`${yr}_All-Pro_Team`);
    wikiPages.push(`${yr + 1}_Pro_Bowl`);
  }
  for (const page of wikiPages) {
    tasks.push({
      name: `wiki_${page}.json`,
      url: `https://en.wikipedia.org/w/api.php?action=parse&redirects=1&page=${encodeURIComponent(page)}&prop=wikitext&format=json`,
      dest: path.join(CACHE_DIR, 'awards', `wiki_${page}.json`),
      gunzip: false
    });
  }
  tasks.push({
    name: 'depth_charts_2026.csv',
    url: 'https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_2026.csv.gz',
    dest: path.join(CACHE_DIR, 'depth_charts_2026.csv'),
    gunzip: true
  });

  console.log(`Starting download of ${tasks.length} dataset files...`);
  const results = await runPool(tasks, 10);
  const failed = results.filter(r => !r.ok);
  console.log(`Download complete! ${results.length - failed.length}/${results.length} succeeded.`);
  if (failed.length) {
    console.log('Failed items:', failed);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
