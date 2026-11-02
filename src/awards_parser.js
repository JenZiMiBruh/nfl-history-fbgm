const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');

const CACHE_DIR = path.join(__dirname, '..', 'data_cache', 'awards');

function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\{\{sortname\|([^|]+)\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1 $2')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[*+†‡#]/g, '')
    .replace(/\b(Jr\.?|Sr\.?|II|III|IV|V)\b/gi, '')
    .replace(/['’\.]/g, '')
    .replace(/\b([a-zA-Z])\s+([a-zA-Z])(?=\s)/g, (m, a, b) => a + b)
    .replace(/[^a-zA-Z\s-]/g, ' ')
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const CANONICAL_NICKNAMES = {
  cam: 'cameron', cameron: 'cameron',
  zach: 'zachary', zachary: 'zachary', zack: 'zachary',
  mitch: 'mitchell', mitchell: 'mitchell',
  josh: 'joshua', joshua: 'joshua',
  drew: 'andrew', andrew: 'andrew', andy: 'andrew',
  ben: 'benjamin', benjamin: 'benjamin', benny: 'benjamin',
  dan: 'daniel', daniel: 'daniel', danny: 'daniel',
  sam: 'samuel', samuel: 'samuel', sammy: 'samuel',
  will: 'william', william: 'william', bill: 'william', billy: 'william', willie: 'william',
  rob: 'robert', robert: 'robert', bob: 'robert', bobby: 'robert',
  tony: 'anthony', anthony: 'anthony',
  tom: 'thomas', thomas: 'thomas', tommy: 'thomas',
  tim: 'timothy', timothy: 'timothy',
  pat: 'patrick', patrick: 'patrick',
  nate: 'nathan', nathan: 'nathan', nathaniel: 'nathan',
  jeff: 'jeffrey', jeffrey: 'jeffrey',
  jon: 'jonathan', jonathan: 'jonathan', john: 'jonathan', johnny: 'jonathan',
  nick: 'nicholas', nicholas: 'nicholas',
  joe: 'joseph', joseph: 'joseph', joey: 'joseph',
  steve: 'steven', steven: 'steven', stephen: 'steven',
  alex: 'alexander', alexander: 'alexander',
  chris: 'christopher', christopher: 'christopher',
  matt: 'matthew', matthew: 'matthew',
  greg: 'gregory', gregory: 'gregory',
  mike: 'michael', michael: 'michael',
  dax: 'daxton', daxton: 'daxton',
  dru: 'andru', andru: 'andru',
  chig: 'chigoziem', chigoziem: 'chigoziem',
  olu: 'olumuyiwa', olumuyiwa: 'olumuyiwa', olusegun: 'olumuyiwa',
  juju: 'julius', julius: 'julius',
  gabe: 'gabriel', gabriel: 'gabriel',
  jim: 'james', james: 'james', jimmy: 'james', jimbo: 'james',
  irv: 'irvin', irvin: 'irvin', irving: 'irvin',
  ken: 'kenneth', kenneth: 'kenneth', kenny: 'kenneth',
  dave: 'david', david: 'david',
  ted: 'theodore', theodore: 'theodore',
  tedarrell: 'tj',
  fred: 'frederick', frederick: 'frederick', freddie: 'frederick',
  pepe: 'damarion',
  chijioke: 'cj', basil: 'cj',
  ed: 'edward', eddie: 'edward', edward: 'edward',
  rick: 'richard', ricky: 'richard', rich: 'richard', richard: 'richard',
  ron: 'ronald', ronnie: 'ronald', ronald: 'ronald',
  gene: 'eugene', eugene: 'eugene'
};

const SPECIFIC_PLAYER_ALIASES = {
  'zach bakobewele': 'zachary tom',
  'zachary bakobewele': 'zachary tom',
  'zach tom': 'zachary tom',
  'tedarrell slaton': 'tj slaton',
  'xavier newman johnson': 'xavier newman',
  'christian roland wallace': 'christopher roland wallace',
  'chris roland wallace': 'christopher roland wallace',
  'chijioke okoye': 'cj okoye',
  'basil okoye': 'cj okoye',
  'basil chijioke okoye': 'cj okoye',
  'pepe williams': 'damarion williams',
  'jimbo covert': 'james covert',
  'irv pankey': 'irvin pankey'
};

function canonicalName(normName) {
  if (!normName) return '';
  let s = normName.trim().toLowerCase();
  if (SPECIFIC_PLAYER_ALIASES[s]) return SPECIFIC_PLAYER_ALIASES[s];
  const parts = s.split(' ');
  if (parts.length >= 2) {
    const f = parts[0];
    const canonF = CANONICAL_NICKNAMES[f] || f;
    const rest = parts.slice(1).join(' ');
    const canonFull = `${canonF} ${rest}`;
    if (SPECIFIC_PLAYER_ALIASES[canonFull]) return SPECIFIC_PLAYER_ALIASES[canonFull];
    return canonFull;
  }
  return s;
}

function readWikiText(filename) {
  const p = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(p)) return '';
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.parse?.wikitext?.['*'] || '';
  } catch (_) {
    return '';
  }
}

/**
 * Parse Wikipedia award tables (MVP, OPOY, DPOY, OROY, DROY, Super Bowl MVP)
 */
function parseIndividualAwardTable(wikitext, isSuperBowl = false) {
  const bySeason = new Map();
  // Only parse inside wikitable blocks
  const tableBlocks = [...wikitext.matchAll(/\{\|[\s\S]*?\|\}/g)].map(m => m[0]);
  const textToParse = tableBlocks.length > 0 ? tableBlocks.join('\n') : wikitext;
  const rows = textToParse.split('|-');
  for (const row of rows) {
    // Match season link like [[2000 NFL season|2000]] or |2000
    let season = null;
    const seasonLinkMatch = row.match(/\[\[(\d{4})\s+NFL\s+season/i);
    if (seasonLinkMatch) {
      season = parseInt(seasonLinkMatch[1], 10);
    } else if (!isSuperBowl) {
      const yearCellMatch = row.match(/^\s*\|\s*(\d{4})\b/m);
      if (yearCellMatch) season = parseInt(yearCellMatch[1], 10);
    }
    if (!season || season < 1960 || season > 2026) continue;

    // Extract player name from {{sortname|First|Last...}} or ! scope="row" | [[Player Name]]
    let playerName = null;
    const sortMatches = [...row.matchAll(/\{\{sortname\|([^|]+)\|([^|}]+)(?:\|([^|}]+))?/gi)];
    if (sortMatches.length > 0) {
      const m = sortMatches[0];
      playerName = `${m[1].trim()} ${m[2].trim()}`;
    } else {
      const scopeMatch = row.match(/!\s*scope="row"[^|]*\|\s*(?:\[\[([^|\]]+\|)?([^\]]+)\]\])/i);
      if (scopeMatch) {
        playerName = scopeMatch[2].trim();
      } else {
        // Fallback: look for player link after season link
        const links = [...row.matchAll(/\[\[(?:([^|\]]+)\|)?([^\]]+)\]\]/g)];
        for (const l of links) {
          const target = l[1] || l[2];
          const label = l[2];
          if (
            !target.includes('NFL season') &&
            !target.includes('Super Bowl') &&
            !target.includes('Quarterback') &&
            !target.includes('Running back') &&
            !target.includes('Wide receiver') &&
            !target.includes('Linebacker') &&
            !target.includes('Defensive') &&
            !target.includes('Safety') &&
            !target.includes('Cornerback') &&
            !/^\d{4}$/.test(label) &&
            label.split(' ').length >= 2
          ) {
            playerName = label;
            break;
          }
        }
      }
    }

    if (playerName) {
      const clean = playerName.replace(/\([^)]*\)/g, '').replace(/[*+†‡]/g, '').trim();
      if (!bySeason.has(season)) bySeason.set(season, []);
      bySeason.get(season).push(clean);
    }
  }
  return bySeason;
}

/**
 * Parse AP_NFL_Rookie_of_the_Year which has two tables: Offensive and Defensive
 */
function parseRookieOfTheYear(wikitext) {
  const combined = parseIndividualAwardTable(wikitext);
  const oroy = new Map();
  const droy = new Map();
  for (const [yr, arr] of combined.entries()) {
    if (arr.length >= 2) {
      oroy.set(yr, [arr[0]]);
      droy.set(yr, [arr[arr.length - 1]]);
    } else if (arr.length === 1) {
      oroy.set(yr, [arr[0]]);
    }
  }
  return { oroy, droy };
}

/**
 * Extract all player wiki-links from a Pro Bowl or All-Pro Wikipedia page
 */
function extractPlayersFromProBowlWiki(wikitext) {
  const players = new Set();
  // Remove self-closing refs FIRST, then paired refs and files
  const cleaned = wikitext
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/\[\[File:[^\]]+\]\]/gi, '');

  const lines = cleaned.split('\n');
  const ignoreWords = new Set([
    'american football conference', 'national football conference', 'afc', 'nfc',
    'quarterback', 'running back', 'fullback', 'wide receiver', 'tight end',
    'offensive tackle', 'offensive guard', 'center', 'defensive end', 'defensive tackle',
    'inside linebacker', 'outside linebacker', 'linebacker', 'cornerback', 'free safety',
    'strong safety', 'safety', 'placekicker', 'kicker', 'punter', 'return specialist',
    'special teams', 'long snapper', 'all-star game', 'national football league',
    'super bowl', 'camping world stadium', 'allegiant stadium', 'espn', 'abc', 'cbs', 'fox', 'nbc',
    'bill cowher', 'barry switzer', 'tom coughlin', 'dom capers', 'larry nemmers', 'al michaels', 'frank gifford', 'dan dierdorf', 'lynn swann', 'lesley visser'
  ]);

  const teamNames = new Set([
    'arizona cardinals', 'st. louis cardinals', 'phoenix cardinals', 'atlanta falcons',
    'baltimore ravens', 'buffalo bills', 'carolina panthers', 'chicago bears',
    'cincinnati bengals', 'cleveland browns', 'dallas cowboys', 'denver broncos',
    'detroit lions', 'green bay packers', 'houston texans', 'houston oilers',
    'indianapolis colts', 'jacksonville jaguars', 'kansas city chiefs', 'las vegas raiders',
    'oakland raiders', 'los angeles raiders', 'los angeles chargers', 'san diego chargers',
    'los angeles rams', 'st. louis rams', 'miami dolphins', 'minnesota vikings',
    'new england patriots', 'new orleans saints', 'new york giants', 'new york jets',
    'philadelphia eagles', 'pittsburgh steelers', 'san francisco 49ers', 'seattle seahawks',
    'tampa bay buccaneers', 'tennessee titans', 'tennessee oilers', 'washington commanders',
    'washington football team', 'washington redskins', 'arizona', 'atlanta', 'baltimore',
    'buffalo', 'carolina', 'chicago', 'cincinnati', 'cleveland', 'dallas', 'denver',
    'detroit', 'green bay', 'houston', 'indianapolis', 'jacksonville', 'kansas city',
    'las vegas', 'oakland', 'la chargers', 'san diego', 'la rams', 'st. louis', 'miami',
    'minnesota', 'new england', 'new orleans', 'ny giants', 'ny jets', 'philadelphia',
    'pittsburgh', 'san francisco', 'seattle', 'tampa bay', 'tennessee', 'washington'
  ]);

  for (const line of lines) {
    if (line.startsWith('{{') || line.startsWith('<ref') || line.startsWith('==')) continue;
    if (line.toLowerCase().includes('coach') || line.toLowerCase().includes('referee') || line.toLowerCase().includes('announcer')) continue;
    const links = [...line.matchAll(/\[\[(?:([^|\]]+)\|)?([^\]]+)\]\]/g)];
    for (const m of links) {
      const target = (m[1] || m[2]).trim();
      const label = m[2].trim().replace(/\([^)]*\)/g, '').trim();
      const lowLabel = label.toLowerCase();
      const lowTarget = target.toLowerCase();
      if (ignoreWords.has(lowLabel) || ignoreWords.has(lowTarget)) continue;
      if (teamNames.has(lowLabel) || teamNames.has(lowTarget)) continue;
      if (lowTarget.includes('season') || lowTarget.includes('stadium') || lowTarget.includes('pro bowl') || lowTarget.includes('coach') || lowTarget.includes('referee') || lowTarget.includes('network') || lowTarget.includes('announcer') || lowTarget.includes('city') || lowTarget.includes('hawaii')) continue;
      if (/^\d+$/.test(label)) continue;
      const parts = label.split(/\s+/);
      if (parts.length >= 2 && parts.length <= 4 && /^[A-Z]/.test(label)) {
        players.add(label);
      }
    }
  }
  return [...players];
}

function parseWpmoy(wikitext) {
  const map = new Map();
  const rows = wikitext.split('|-');
  for (const row of rows) {
    const yrMatch = row.match(/\[\[(\d{4})\s+NFL\s+season/i);
    if (!yrMatch) continue;
    const yr = parseInt(yrMatch[1], 10);
    if (yr < 1970 || yr > 2026) continue;

    let player = null;
    const sortMatch = row.match(/\{\{sortname\|(?:\[\[)?([^|}]+?)(?:\]\])?\|(?:\[\[)?([^|}]+?)(?:\]\])?(?:\}\}|\|)/i);
    if (sortMatch) {
      player = `${sortMatch[1].trim()} ${sortMatch[2].trim()}`;
    } else {
      const linkMatches = [...row.matchAll(/\[\[(?:([^|\]]+)\|)?([^\]]+)\]\]/g)];
      for (const m of linkMatches) {
        const target = m[1] || m[2];
        const label = m[2];
        if (
          !target.includes('NFL season') &&
          !target.includes('Colts') && !target.includes('Chargers') && !target.includes('Chiefs') &&
          !target.includes('Cowboys') && !target.includes('Bears') && !target.includes('Dolphins') &&
          !target.includes('Quarterback') && !target.includes('Running back') && !target.includes('Linebacker') &&
          !target.includes('Defensive') && !target.includes('Offensive') &&
          label.split(' ').length >= 2
        ) {
          player = label;
          break;
        }
      }
    }
    if (player) {
      player = player.replace(/\([^)]*\)/g, '').replace(/[*+†‡]/g, '').trim();
      if (!map.has(yr)) map.set(yr, []);
      if (!map.get(yr).includes(player)) map.get(yr).push(player);
    }
  }
  return map;
}

function parseCpoy(wikitext) {
  const map = new Map();
  const rows = wikitext.split('|-');
  for (const row of rows) {
    const yrMatch = row.match(/\[\[(\d{4})\s+NFL\s+season/i);
    if (!yrMatch) continue;
    const yr = parseInt(yrMatch[1], 10);
    if (yr < 1960 || yr > 2026) continue;

    let player = null;
    const sortMatch = row.match(/\{\{sortname\|(?:\[\[)?([^|}]+?)(?:\]\])?\|(?:\[\[)?([^|}]+?)(?:\]\])?(?:\}\}|\|)/i);
    if (sortMatch) {
      player = `${sortMatch[1].trim()} ${sortMatch[2].trim()}`;
    } else {
      const linkMatches = [...row.matchAll(/\[\[(?:([^|\]]+)\|)?([^\]]+)\]\]/g)];
      for (const m of linkMatches) {
        const target = m[1] || m[2];
        const label = m[2];
        if (
          !target.includes('NFL season') &&
          !target.includes('Giants') && !target.includes('Steelers') && !target.includes('Packers') &&
          !target.includes('Quarterback') && !target.includes('Running back') && !target.includes('Linebacker') &&
          !target.includes('Wide receiver') && !target.includes('Tackle') && !target.includes('End') &&
          label.split(' ').length >= 2
        ) {
          player = label;
          break;
        }
      }
    }
    if (player) {
      player = player.replace(/\([^)]*\)/g, '').replace(/[*+†‡]/g, '').trim();
      if (!map.has(yr)) map.set(yr, []);
      if (!map.get(yr).includes(player)) map.get(yr).push(player);
    }
  }
  return map;
}

function loadAllAwardsData() {
  const mvpMap = parseIndividualAwardTable(readWikiText('wiki_AP_NFL_Most_Valuable_Player.json'));
  const opoyMap = parseIndividualAwardTable(readWikiText('wiki_AP_NFL_Offensive_Player_of_the_Year.json'));
  const dpoyMap = parseIndividualAwardTable(readWikiText('wiki_AP_NFL_Defensive_Player_of_the_Year.json'));
  const { oroy: oroyMap, droy: droyMap } = parseRookieOfTheYear(readWikiText('wiki_AP_NFL_Rookie_of_the_Year.json'));
  const fmvpMap = parseIndividualAwardTable(readWikiText('wiki_Super_Bowl_Most_Valuable_Player.json'), true);
  const wpmoyMap = parseWpmoy(readWikiText('wiki_Walter_Payton_Man_of_the_Year.json'));
  const cpoyMap = parseCpoy(readWikiText('wiki_Comeback_Player_of_the_Year.json'));

  // All-Pro 2000-2025 from CSV
  const allProFirst = new Map(); // season -> array of player names
  const allProSecond = new Map();
  const allProRows = parseCSVFile(path.join(CACHE_DIR, 'all_pro_2000_2025.csv'));
  for (const r of allProRows) {
    const yr = parseInt(r.Year, 10);
    const name = (r.Player || '').replace(/[*+]/g, '').trim();
    const teamsStr = r['All-pro teams'] || '';
    if (!yr || !name) continue;
    if (teamsStr.includes('AP: 1st Tm')) {
      if (!allProFirst.has(yr)) allProFirst.set(yr, []);
      allProFirst.get(yr).push({ name, pos: r.Pos, team: r.Tm });
    } else if (teamsStr.includes('AP: 2nd Tm') || teamsStr.includes('1st Tm')) {
      if (!allProSecond.has(yr)) allProSecond.set(yr, []);
      allProSecond.get(yr).push({ name, pos: r.Pos, team: r.Tm });
    }
  }

  // Pre-2000 All-Pro (1978-1999) + 2025 All-Pro from Wiki
  const wikiAllProYears = [];
  for (let yr = 1966; yr <= 1999; yr++) wikiAllProYears.push(yr);
  wikiAllProYears.push(2025);
  for (const yr of wikiAllProYears) {
    if (allProFirst.has(yr) && allProFirst.get(yr).length > 0) continue;
    const wt = readWikiText(`wiki_${yr}_All-Pro_Team.json`);
    if (wt) {
      const names = extractPlayersFromProBowlWiki(wt);
      allProFirst.set(yr, names.slice(0, 27).map(n => ({ name: n, pos: '', team: '' })));
      if (names.length > 27) {
        allProSecond.set(yr, names.slice(27, 60).map(n => ({ name: n, pos: '', team: '' })));
      }
    }
  }

  // Pro Bowl 2000-2019 from CSV
  const proBowlBySeason = new Map(); // season -> Set of normalized names & raw names
  const pbRows = parseCSVFile(path.join(CACHE_DIR, 'pro_bowl_2000_2019.csv'));
  for (const r of pbRows) {
    const yr = parseInt(r.Year, 10);
    const name = (r.Player || '').replace(/[*+%]/g, '').trim();
    if (!yr || !name) continue;
    if (!proBowlBySeason.has(yr)) proBowlBySeason.set(yr, []);
    proBowlBySeason.get(yr).push({ name, pos: r.Pos, team: r.Tm, conf: r.Conf });
  }

  // Pro Bowl 2019-2025 from Wiki (Note: 2020_Pro_Bowl = 2019 season, ..., 2026_Pro_Bowl_Games = 2025 season)
  const wikiProBowls = [
    [2019, 'wiki_2020_Pro_Bowl.json'],
    [2020, 'wiki_2021_Pro_Bowl.json'],
    [2021, 'wiki_2022_Pro_Bowl.json'],
    [2022, 'wiki_2023_Pro_Bowl_Games.json'],
    [2023, 'wiki_2024_Pro_Bowl_Games.json'],
    [2024, 'wiki_2025_Pro_Bowl_Games.json'],
    [2025, 'wiki_2026_Pro_Bowl_Games.json']
  ];
  for (let yr = 1966; yr <= 1999; yr++) {
    wikiProBowls.push([yr, `wiki_${yr + 1}_Pro_Bowl.json`]);
  }
  for (const [season, file] of wikiProBowls) {
    const wt = readWikiText(file);
    if (!wt) continue;
    const names = extractPlayersFromProBowlWiki(wt);
    if (!proBowlBySeason.has(season) || proBowlBySeason.get(season).length === 0) {
      proBowlBySeason.set(season, names.map(n => ({ name: n, pos: '', team: '', conf: '' })));
    }
  }

  return {
    normalizeName,
    mvpMap,
    opoyMap,
    dpoyMap,
    oroyMap,
    droyMap,
    fmvpMap,
    wpmoyMap,
    cpoyMap,
    allProFirst,
    allProSecond,
    proBowlBySeason
  };
}

module.exports = {
  normalizeName,
  canonicalName,
  loadAllAwardsData
};
