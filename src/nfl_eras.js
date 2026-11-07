/**
 * nfl_eras.js - single source of truth for NFL league history 1966-2026.
 *
 * Used by BOTH the Node master builder (src/build_master.js) and the browser
 * season selector (nfl_season_selector.html), so team branding, divisions,
 * playoff formats and Football GM scheduledEvents can never drift apart.
 *
 * Football GM phases: -1 fantasy draft, 0 preseason, 1 regular season,
 * 2 after trade deadline, 3 playoffs, 4 draft lottery ("after playoffs"),
 * 5 draft, 6 after draft, 7 re-sign players, 8 free agency.
 */
(function (root) {
  // Sim tuning per season (data_cache/era_factors.json, made by calibrate_eras.js). In the browser the build
  // scripts embed it as NFL_ERA_FACTORS; in Node it is read from disk.
  let ERA_FACTORS = root.NFL_ERA_FACTORS || null;
  if (!ERA_FACTORS && typeof require !== 'undefined') {
    try { ERA_FACTORS = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data_cache', 'era_factors.json'), 'utf8')); } catch (e) { ERA_FACTORS = null; }
  }
  const SIM_FACTOR_KEYS = ['completionFactor', 'intFactor', 'sackFactor', 'fumbleFactor', 'rushYdsFactor', 'passYdsFactor'];
  'use strict';

  const FIRST_SEASON = 1966;
  const LAST_SEASON = 2026;
  const PHASE = { PRESEASON: 0, REGULAR_SEASON: 1, PLAYOFFS: 3, DRAFT_LOTTERY: 4, DRAFT: 5, AFTER_DRAFT: 6, RESIGN_PLAYERS: 7, FREE_AGENCY: 8 };

  const ESPN = (a) => `https://a.espncdn.com/i/teamlogos/nfl/500/${a}.png`;

  // ---------------------------------------------------------------------------
  // Franchise timelines. tid is the permanent Football GM slot (unchanged from
  // the 1978-2026 build so every existing stat row keeps pointing at the right
  // franchise). Each segment applies from `from` onward and overrides earlier
  // fields. colors = [jersey body, numbers, trim]. jersey = FBGM template.
  // ---------------------------------------------------------------------------
  const TEAMS = [
    { tid: 0, srID: 'crd', segs: [
      { from: 1960, region: 'St. Louis', name: 'Cardinals', abbrev: 'STL', colors: ['#97233F', '#FFFFFF', '#000000'], jersey: 'football3', logo: 'ARI_1960', stadiumCapacity: 54392 },
      { from: 1988, region: 'Phoenix', abbrev: 'PHO', stadiumCapacity: 73379 },
      { from: 1994, region: 'Arizona', abbrev: 'ARI' },
      { from: 2005, colors: ['#97233F', '#FFFFFF', '#000000'], jersey: 'football2', logo: 'ARI_2005' },
      { from: 2006, stadiumCapacity: 63400 },
      { from: 2023, jersey: 'football' }
    ] },
    { tid: 1, srID: 'atl', segs: [
      { from: 1966, region: 'Atlanta', name: 'Falcons', abbrev: 'ATL', colors: ['#A71930', '#FFFFFF', '#000000'], jersey: 'football3', logo: 'ATL_1966', stadiumCapacity: 58850 },
      { from: 1990, colors: ['#000000', '#FFFFFF', '#A71930'], logo: 'ATL_1990' },
      { from: 1992, stadiumCapacity: 71228 },
      { from: 2003, colors: ['#A71930', '#FFFFFF', '#000000'], jersey: 'football2', logo: 'ATL_2003' },
      { from: 2017, stadiumCapacity: 71000 },
      { from: 2020, colors: ['#000000', '#FFFFFF', '#A71930'], jersey: 'football', logo: 'ATL_2020' }
    ] },
    { tid: 2, srID: 'rav', activeFrom: 1996, segs: [
      { from: 1996, region: 'Baltimore', name: 'Ravens', abbrev: 'BAL', colors: ['#241773', '#FFFFFF', '#9E7C0C'], jersey: 'football3', logo: 'BAL_1996', stadiumCapacity: 65248 },
      { from: 1998, stadiumCapacity: 71008 },
      { from: 1999, logo: 'BAL_1999' }
    ] },
    { tid: 3, srID: 'buf', segs: [
      { from: 1960, region: 'Buffalo', name: 'Bills', abbrev: 'BUF', colors: ['#00338D', '#FFFFFF', '#C60C30'], jersey: 'football3', logo: 'BUF_1962', stadiumCapacity: 46206 },
      { from: 1970, logo: 'BUF_1970' },
      { from: 1973, stadiumCapacity: 80020 },
      { from: 1974, logo: 'BUF_1974' },
      { from: 2002, colors: ['#0C2340', '#FFFFFF', '#C60C30'], jersey: 'football2', logo: 'BUF_2002', stadiumCapacity: 73079 },
      { from: 2011, colors: ['#00338D', '#FFFFFF', '#C60C30'], jersey: 'football3', logo: 'BUF_2011' },
      { from: 2026, stadiumCapacity: 62000 }
    ] },
    { tid: 4, srID: 'car', activeFrom: 1995, segs: [
      { from: 1995, region: 'Carolina', name: 'Panthers', abbrev: 'CAR', colors: ['#101820', '#FFFFFF', '#0085CA'], jersey: 'football3', logo: 'CAR_1995', stadiumCapacity: 72685 },
      { from: 2012, jersey: 'football2', logo: 'CAR_2012' }
    ] },
    { tid: 5, srID: 'chi', segs: [
      { from: 1920, region: 'Chicago', name: 'Bears', abbrev: 'CHI', colors: ['#0B162A', '#FFFFFF', '#C83803'], jersey: 'football3', logo: 'CHI_1962', stadiumCapacity: 47000 },
      { from: 1971, stadiumCapacity: 55701 },
      { from: 1974, logo: 'CHI_1974' },
      { from: 2003, stadiumCapacity: 61500 }
    ] },
    { tid: 6, srID: 'cin', activeFrom: 1968, segs: [
      { from: 1968, region: 'Cincinnati', name: 'Bengals', abbrev: 'CIN', colors: ['#FB4F14', '#FFFFFF', '#000000'], jersey: 'football', logo: 'CIN_1968', stadiumCapacity: 28000 },
      { from: 1970, stadiumCapacity: 56200 },
      { from: 1981, colors: ['#FB4F14', '#FFFFFF', '#000000'], jersey: 'football3', logo: 'CIN_1981' },
      { from: 1997, colors: ['#000000', '#FFFFFF', '#FB4F14'], jersey: 'football3', logo: 'CIN_1997' },
      { from: 2000, stadiumCapacity: 65515 },
      { from: 2004, jersey: 'football2', logo: 'CIN_2004' },
      { from: 2021, jersey: 'football3' }
    ] },
    { tid: 7, srID: 'cle', inactive: [1996, 1998], segs: [
      { from: 1946, region: 'Cleveland', name: 'Browns', abbrev: 'CLE', colors: ['#311D00', '#FFFFFF', '#FF3C00'], jersey: 'football3', logo: 'CLE_1946', stadiumCapacity: 80000 },
      { from: 1973, logo: 'CLE_1973' },
      { from: 1999, logo: 'CLE_1999', stadiumCapacity: 67431 },
      { from: 2015, colors: ['#311D00', '#FF3C00', '#FFFFFF'], jersey: 'football2', logo: 'CLE_2015' },
      { from: 2020, colors: ['#311D00', '#FFFFFF', '#FF3C00'], jersey: 'football3' },
      { from: 2024, logo: 'CLE_2024' }
    ] },
    { tid: 8, srID: 'dal', segs: [
      { from: 1960, region: 'Dallas', name: 'Cowboys', abbrev: 'DAL', colors: ['#FFFFFF', '#003594', '#869397'], jersey: 'football3', logo: 'DAL_1964', stadiumCapacity: 75504 },
      { from: 1971, stadiumCapacity: 65675 },
      { from: 1990, colors: ['#FFFFFF', '#041E42', '#869397'] },
      { from: 2009, stadiumCapacity: 80000 }
    ] },
    { tid: 9, srID: 'den', segs: [
      { from: 1960, region: 'Denver', name: 'Broncos', abbrev: 'DEN', colors: ['#FB4F14', '#FFFFFF', '#002244'], jersey: 'football3', logo: 'DEN_1968', stadiumCapacity: 50657 },
      { from: 1970, logo: 'DEN_1970' },
      { from: 1977, stadiumCapacity: 76273 },
      { from: 1997, colors: ['#002244', '#FFFFFF', '#FB4F14'], jersey: 'football2', logo: 'DEN_1997' },
      { from: 2001, stadiumCapacity: 76125 },
      { from: 2012, colors: ['#FB4F14', '#FFFFFF', '#002244'] },
      { from: 2024, jersey: 'football4' }
    ] },
    { tid: 10, srID: 'det', segs: [
      { from: 1934, region: 'Detroit', name: 'Lions', abbrev: 'DET', colors: ['#0076B6', '#FFFFFF', '#B0B7BC'], jersey: 'football3', logo: 'DET_1961', stadiumCapacity: 54418 },
      { from: 1970, logo: 'DET_1970' },
      { from: 1975, stadiumCapacity: 80311 },
      { from: 2002, stadiumCapacity: 65000 },
      { from: 2005, colors: ['#0076B6', '#FFFFFF', '#000000'], jersey: 'football2' },
      { from: 2009, logo: 'DET_2009' },
      { from: 2017, colors: ['#0076B6', '#B0B7BC', '#FFFFFF'], jersey: 'football', logo: 'DET_2017' },
      { from: 2024, colors: ['#0076B6', '#FFFFFF', '#B0B7BC'], jersey: 'football3' }
    ] },
    { tid: 11, srID: 'gnb', segs: [
      { from: 1921, region: 'Green Bay', name: 'Packers', abbrev: 'GB', colors: ['#203731', '#FFFFFF', '#FFB612'], jersey: 'football3', logo: 'GB_1961', stadiumCapacity: 50852 },
      { from: 1980, logo: 'GB_1980' },
      { from: 1995, stadiumCapacity: 60890 },
      { from: 2013, stadiumCapacity: 81441 }
    ] },
    { tid: 12, srID: 'htx', activeFrom: 2002, segs: [
      { from: 2002, region: 'Houston', name: 'Texans', abbrev: 'HOU', colors: ['#03202F', '#FFFFFF', '#A71930'], jersey: 'football2', logo: 'HOU_2002', stadiumCapacity: 72220 },
      { from: 2024, colors: ['#03202F', '#FFFFFF', '#A71930'], jersey: 'football5' }
    ] },
    { tid: 13, srID: 'clt', segs: [
      { from: 1953, region: 'Baltimore', name: 'Colts', abbrev: 'BAL', colors: ['#002C5F', '#FFFFFF', '#A2AAAD'], jersey: 'football3', logo: 'IND_1953', stadiumCapacity: 60238 },
      { from: 1984, region: 'Indianapolis', abbrev: 'IND', stadiumCapacity: 60127 },
      { from: 2002, logo: 'IND_2002' },
      { from: 2008, stadiumCapacity: 67000 },
      { from: 2020, logo: 'IND_2020' }
    ] },
    { tid: 14, srID: 'jax', activeFrom: 1995, segs: [
      { from: 1995, region: 'Jacksonville', name: 'Jaguars', abbrev: 'JAX', colors: ['#006778', '#FFFFFF', '#D7A22A'], jersey: 'football3', logo: 'JAX_1995', stadiumCapacity: 73000 },
      { from: 2009, colors: ['#006778', '#FFFFFF', '#000000'], jersey: 'football2' },
      { from: 2013, colors: ['#000000', '#FFFFFF', '#006778'], logo: 'JAX_2013', stadiumCapacity: 67814 },
      { from: 2018, colors: ['#006778', '#FFFFFF', '#101820'], jersey: 'football' }
    ] },
    { tid: 15, srID: 'kan', segs: [
      { from: 1963, region: 'Kansas City', name: 'Chiefs', abbrev: 'KC', colors: ['#E31837', '#FFFFFF', '#FFB81C'], jersey: 'football3', logo: 'KC_1963', stadiumCapacity: 47000 },
      { from: 1972, stadiumCapacity: 78097 },
      { from: 1972, logo: 'KC_1972' },
      { from: 2010, stadiumCapacity: 76416 }
    ] },
    { tid: 16, srID: 'rai', segs: [
      { from: 1960, region: 'Oakland', name: 'Raiders', abbrev: 'OAK', colors: ['#000000', '#A5ACAF', '#FFFFFF'], jersey: 'football3', logo: 'OAK_1964', stadiumCapacity: 54587 },
      // "RAI" (Pro-Football-Reference style) avoids colliding with the LA Rams' "LA" while both played in Los Angeles.
      { from: 1982, region: 'Los Angeles', abbrev: 'RAI', stadiumCapacity: 92516 },
      { from: 1995, region: 'Oakland', abbrev: 'OAK', stadiumCapacity: 63132 },
      { from: 2020, region: 'Las Vegas', abbrev: 'LV', logo: 'LV_2020', stadiumCapacity: 65000 }
    ] },
    { tid: 17, srID: 'sdg', segs: [
      { from: 1961, region: 'San Diego', name: 'Chargers', abbrev: 'SD', colors: ['#0080C6', '#FFFFFF', '#FFC20E'], jersey: 'football2', logo: 'SD_1961', stadiumCapacity: 34000 },
      { from: 1967, stadiumCapacity: 50000 },
      { from: 1974, colors: ['#1C3F94', '#FFC20E', '#FFFFFF'], logo: 'SD_1974' },
      { from: 1984, stadiumCapacity: 60835 },
      { from: 1988, colors: ['#002244', '#FFFFFF', '#FFC20E'], logo: 'SD_1988' },
      { from: 1997, stadiumCapacity: 70561 },
      { from: 2007, logo: 'SD_2007' },
      { from: 2017, region: 'Los Angeles', abbrev: 'LAC', logo: 'LAC_2017', stadiumCapacity: 27000 },
      { from: 2019, colors: ['#0080C6', '#FFFFFF', '#FFC20E'] },
      { from: 2020, logo: 'LAC_2020', stadiumCapacity: 70240 }
    ] },
    { tid: 18, srID: 'ram', segs: [
      { from: 1946, region: 'Los Angeles', name: 'Rams', abbrev: 'LA', colors: ['#002244', '#FFFFFF', '#FFFFFF'], jersey: 'football3', logo: 'LA_1951', stadiumCapacity: 92516 },
      { from: 1973, colors: ['#003594', '#FFD100', '#FFFFFF'], logo: 'LA_1973' },
      { from: 1980, stadiumCapacity: 69008 },
      { from: 1995, region: 'St. Louis', abbrev: 'STL', stadiumCapacity: 66000 },
      { from: 2000, colors: ['#002244', '#FFFFFF', '#B3995D'], jersey: 'football2', logo: 'STL_2000' },
      { from: 2016, region: 'Los Angeles', abbrev: 'LAR', jersey: 'football3', stadiumCapacity: 93607 },
      { from: 2017, logo: 'LAR_2017' },
      { from: 2020, colors: ['#003594', '#FFA300', '#FFFFFF'], jersey: 'football2', logo: 'LAR_2020', stadiumCapacity: 70240 }
    ] },
    { tid: 19, srID: 'mia', segs: [
      { from: 1966, region: 'Miami', name: 'Dolphins', abbrev: 'MIA', colors: ['#008E97', '#FFFFFF', '#F26A36'], jersey: 'football3', logo: 'MIA_1966', stadiumCapacity: 75000 },
      { from: 1974, logo: 'MIA_1974' },
      { from: 1987, stadiumCapacity: 75192 },
      { from: 1997, logo: 'MIA_1997' },
      { from: 2013, colors: ['#008E97', '#FFFFFF', '#FC4C02'], jersey: 'football', logo: 'MIA_2013', stadiumCapacity: 64767 },
      { from: 2018, jersey: 'football3' }
    ] },
    { tid: 20, srID: 'min', segs: [
      { from: 1961, region: 'Minnesota', name: 'Vikings', abbrev: 'MIN', colors: ['#4F2683', '#FFFFFF', '#FFC62F'], jersey: 'football3', logo: 'MIN_1961', stadiumCapacity: 47900 },
      { from: 1982, stadiumCapacity: 62212 },
      { from: 2006, jersey: 'football5' },
      { from: 2013, jersey: 'football', logo: 'MIN_2013' },
      { from: 2016, stadiumCapacity: 66860 }
    ] },
    { tid: 21, srID: 'nwe', segs: [
      { from: 1960, region: 'Boston', name: 'Patriots', abbrev: 'BOS', colors: ['#C60C30', '#FFFFFF', '#002244'], jersey: 'football3', logo: 'NE_1961', stadiumCapacity: 40000 },
      { from: 1971, region: 'New England', abbrev: 'NE', stadiumCapacity: 60292 },
      { from: 1993, colors: ['#002244', '#FFFFFF', '#C60C30'], logo: 'NE_1993' },
      { from: 2000, colors: ['#002244', '#FFFFFF', '#B0B7BC'], jersey: 'football2' },
      { from: 2002, stadiumCapacity: 65878 },
      { from: 2020, colors: ['#002244', '#FFFFFF', '#C60C30'], jersey: 'football3' }
    ] },
    { tid: 22, srID: 'nor', activeFrom: 1967, segs: [
      { from: 1967, region: 'New Orleans', name: 'Saints', abbrev: 'NO', colors: ['#101820', '#D3BC8D', '#FFFFFF'], jersey: 'football3', logo: 'NO_1967', stadiumCapacity: 80985 },
      { from: 1975, stadiumCapacity: 69703 },
      { from: 2000, logo: 'NO_2000' }
    ] },
    { tid: 23, srID: 'nyg', segs: [
      { from: 1925, region: 'New York', name: 'Giants', abbrev: 'NYG', colors: ['#0B2265', '#FFFFFF', '#A71930'], jersey: 'football3', logo: 'NYG_1961', stadiumCapacity: 62000 },
      { from: 1975, logo: 'NYG_1975' },
      { from: 1976, logo: 'NYG_1976', stadiumCapacity: 76500 },
      { from: 2000, logo: 'NYG_2000' },
      { from: 2010, stadiumCapacity: 82500 }
    ] },
    { tid: 24, srID: 'nyj', segs: [
      { from: 1963, region: 'New York', name: 'Jets', abbrev: 'NYJ', colors: ['#125740', '#FFFFFF', '#FFFFFF'], jersey: 'football3', logo: 'NYJ_1965', stadiumCapacity: 60000 },
      { from: 1978, colors: ['#007A33', '#FFFFFF', '#FFFFFF'], logo: 'NYJ_1978' },
      { from: 1984, stadiumCapacity: 76500 },
      { from: 1998, colors: ['#125740', '#FFFFFF', '#000000'], logo: 'NYJ_1998' },
      { from: 2010, stadiumCapacity: 82500 },
      { from: 2019, colors: ['#125740', '#FFFFFF', '#000000'], jersey: 'football2', logo: 'NYJ_2019' },
      { from: 2024, jersey: 'football3', logo: 'NYJ_2024' }
    ] },
    { tid: 25, srID: 'phi', segs: [
      { from: 1933, region: 'Philadelphia', name: 'Eagles', abbrev: 'PHI', colors: ['#00843D', '#FFFFFF', '#A5ACAF'], jersey: 'football3', logo: 'PHI_1948', stadiumCapacity: 60000 },
      { from: 1971, stadiumCapacity: 65356 },
      { from: 1987, logo: 'PHI_1987' },
      { from: 1996, colors: ['#004C54', '#FFFFFF', '#A5ACAF'], jersey: 'football2', logo: 'PHI_1996' },
      { from: 2003, stadiumCapacity: 69796 }
    ] },
    { tid: 26, srID: 'pit', segs: [
      { from: 1933, region: 'Pittsburgh', name: 'Steelers', abbrev: 'PIT', colors: ['#101820', '#FFB612', '#FFFFFF'], jersey: 'football3', logo: 'PIT_1962', stadiumCapacity: 35000 },
      { from: 1970, stadiumCapacity: 59000 },
      { from: 2001, stadiumCapacity: 68400 }
    ] },
    { tid: 27, srID: 'sfo', segs: [
      { from: 1946, region: 'San Francisco', name: '49ers', abbrev: 'SF', colors: ['#AA0000', '#FFFFFF', '#B3995D'], jersey: 'football3', logo: 'SF_1968', stadiumCapacity: 59636 },
      { from: 1971, stadiumCapacity: 61185 },
      { from: 1996, logo: 'SF_1996' },
      { from: 2009, logo: 'SF_2009' },
      { from: 2014, stadiumCapacity: 68500 }
    ] },
    { tid: 28, srID: 'sea', activeFrom: 1976, segs: [
      { from: 1976, region: 'Seattle', name: 'Seahawks', abbrev: 'SEA', colors: ['#002A5C', '#FFFFFF', '#4DA338'], jersey: 'football3', logo: 'SEA_1976', stadiumCapacity: 64984 },
      { from: 2002, colors: ['#002244', '#FFFFFF', '#4D5357'], jersey: 'football2', logo: 'SEA_2002', stadiumCapacity: 68740 },
      { from: 2012, colors: ['#002244', '#FFFFFF', '#69BE28'], jersey: 'football5', logo: 'SEA_2012' }
    ] },
    { tid: 29, srID: 'tam', activeFrom: 1976, segs: [
      { from: 1976, region: 'Tampa Bay', name: 'Buccaneers', abbrev: 'TB', colors: ['#FF7900', '#FFFFFF', '#C8102E'], jersey: 'football3', logo: 'TB_1976', stadiumCapacity: 72000 },
      { from: 1997, colors: ['#D50A0A', '#FFFFFF', '#34302B'], logo: 'TB_1997' },
      { from: 1998, stadiumCapacity: 65618 },
      { from: 2014, colors: ['#D50A0A', '#897653', '#FF7900'], jersey: 'football2', logo: 'TB_2014' },
      { from: 2020, colors: ['#D50A0A', '#FFFFFF', '#34302B'], jersey: 'football3' }
    ] },
    { tid: 30, srID: 'oti', segs: [
      { from: 1960, region: 'Houston', name: 'Oilers', abbrev: 'HOU', colors: ['#4B92DB', '#FFFFFF', '#C60C30'], jersey: 'football2', logo: 'HOU_1960', stadiumCapacity: 52000 },
      { from: 1968, stadiumCapacity: 50000 },
      { from: 1997, region: 'Tennessee', abbrev: 'TEN', stadiumCapacity: 62000 },
      { from: 1999, name: 'Titans', colors: ['#0C2340', '#FFFFFF', '#4B92DB'], jersey: 'football2', logo: 'TEN_1999', stadiumCapacity: 69143 },
      { from: 2018, jersey: 'football5', logo: 'TEN_2018' }
    ] },
    { tid: 31, srID: 'was', segs: [
      { from: 1937, region: 'Washington', name: 'Redskins', abbrev: 'WAS', colors: ['#773141', '#FFFFFF', '#FFB612'], jersey: 'football3', logo: 'WAS_1972', stadiumCapacity: 50000 },
      { from: 1997, stadiumCapacity: 85000 },
      { from: 2020, name: 'Football Team', colors: ['#773141', '#FFB612', '#FFFFFF'], jersey: 'football', logo: 'WAS_2020', stadiumCapacity: 67617 },
      { from: 2022, name: 'Commanders', colors: ['#5A1414', '#FFFFFF', '#FFB612'], jersey: 'football2', logo: 'WAS_2022' }
    ] }
  ];

  // Home-jersey colors in Football GM's order: [jersey body, shoulder/collar stripe, accent stripe]
  // (the game draws no numbers). Each entry applies from its season until the next one.
  const HOME_JERSEYS = {
    0: [[1966, ['#C8102E', '#FFFFFF', '#000000'], 'football3'], [1996, ['#C8102E', '#FFFFFF', '#002868'], 'football3'],
      [2005, ['#97233F', '#000000', '#FFFFFF'], 'football2'], [2023, ['#97233F', '#FFFFFF', '#000000'], 'football']],
    1: [[1966, ['#000000', '#C8102E', '#FFFFFF'], 'football3'], [1971, ['#C8102E', '#000000', '#FFFFFF'], 'football3'], [1990, ['#000000', '#C8102E', '#FFFFFF'], 'football3'],
      [2003, ['#000000', '#A71930', '#A5ACAF'], 'football2'], [2004, ['#A71930', '#000000', '#FFFFFF'], 'football2'], [2020, ['#000000', '#A71930', '#A5ACAF'], 'football'], [2026, ['#A71930', '#FFFFFF', '#000000'], 'football3']],
    2: [[1996, ['#241773', '#000000', '#9E7C0C'], 'football3']],
    3: [[1966, ['#00338D', '#C8102E', '#FFFFFF'], 'football3'], [2002, ['#0C2340', '#C60C30', '#5E8FC4'], 'football2'], [2011, ['#00338D', '#C60C30', '#FFFFFF'], 'football3']],
    4: [[1995, ['#000000', '#0085CA', '#BFC0BF'], 'football3'], [2012, ['#101820', '#0085CA', '#BFC0BF'], 'football2']],
    5: [[1966, ['#0B162A', '#C83803', '#FFFFFF'], 'football3']],
    6: [[1968, ['#000000', '#FB4F14', '#FFFFFF'], 'football3'], [1981, ['#000000', '#FB4F14', '#000000'], 'football4'],
      [1997, ['#000000', '#FB4F14', '#FFFFFF'], 'football'], [2004, ['#000000', '#FB4F14', '#FFFFFF'], 'football2'], [2021, ['#000000', '#FB4F14', '#FFFFFF'], 'football3']],
    7: [[1966, ['#4E2A1E', '#FF3C00', '#FFFFFF'], 'football3'], [1999, ['#311D00', '#FF3C00', '#FFFFFF'], 'football3'],
      [2015, ['#311D00', '#FF3C00', '#FFFFFF'], 'football2'], [2020, ['#311D00', '#FF3C00', '#FFFFFF'], 'football3']],
    8: [[1966, ['#FFFFFF', '#003594', '#000000'], 'football3'], [1980, ['#FFFFFF', '#041E42', '#869397'], 'football3']],
    9: [[1966, ['#FB4F14', '#0033A0', '#FFFFFF'], 'football3'], [1997, ['#002244', '#FB4F14', '#FFFFFF'], 'football2'],
      [2012, ['#FB4F14', '#002244', '#FFFFFF'], 'football2'], [2024, ['#FB4F14', '#002244', '#FFFFFF'], 'football4']],
    10: [[1966, ['#0076B6', '#B0B7BC', '#FFFFFF'], 'football3'], [2003, ['#0076B6', '#000000', '#B0B7BC'], 'football3'],
      [2009, ['#0076B6', '#000000', '#B0B7BC'], 'football2'], [2017, ['#0076B6', '#B0B7BC', '#FFFFFF'], 'football'], [2024, ['#0076B6', '#FFFFFF', '#B0B7BC'], 'football3']],
    11: [[1966, ['#203731', '#FFB612', '#FFFFFF'], 'football3']],
    12: [[2002, ['#03202F', '#A71930', '#FFFFFF'], 'football2'], [2024, ['#03202F', '#A71930', '#76D7EA'], 'football4']],
    13: [[1966, ['#003B7B', '#FFFFFF', '#FFFFFF'], 'football3'], [2004, ['#002C5F', '#FFFFFF', '#A2AAAD'], 'football3']],
    14: [[1995, ['#006778', '#000000', '#D7A22A'], 'football3'], [2009, ['#006778', '#000000', '#D7A22A'], 'football2'],
      [2013, ['#101820', '#006778', '#D7A22A'], 'football2'], [2018, ['#101820', '#006778', '#D7A22A'], 'football'], [2021, ['#006778', '#101820', '#D7A22A'], 'football']],
    15: [[1966, ['#E31837', '#FFB81C', '#FFFFFF'], 'football3']],
    16: [[1966, ['#000000', '#A5ACAF', '#FFFFFF'], 'football3']],
    17: [[1966, ['#0080C6', '#FFC20E', '#FFFFFF'], 'football2'], [1974, ['#1C3F94', '#FFC20E', '#FFFFFF'], 'football2'],
      [1988, ['#002244', '#FFC20E', '#FFFFFF'], 'football2'], [2007, ['#002244', '#FFC20E', '#0080C6'], 'football2'], [2019, ['#0080C6', '#FFC20E', '#FFFFFF'], 'football2']],
    18: [[1966, ['#002B5C', '#FFFFFF', '#FFFFFF'], 'football3'], [1973, ['#003594', '#FFD100', '#FFFFFF'], 'football3'],
      [2000, ['#002244', '#B3995D', '#FFFFFF'], 'football2'], [2017, ['#002244', '#FFFFFF', '#B3995D'], 'football3'], [2020, ['#003594', '#FFA300', '#FFD100'], 'football2']],
    19: [[1966, ['#008E97', '#FF7F00', '#FFFFFF'], 'football3'], [1974, ['#008E97', '#F26A36', '#FFFFFF'], 'football3'], [1997, ['#008E97', '#F58220', '#005778'], 'football3'],
      [2013, ['#008E97', '#FC4C02', '#FFFFFF'], 'football'], [2018, ['#008E97', '#FC4C02', '#FFFFFF'], 'football3']],
    20: [[1966, ['#4F2683', '#FFFFFF', '#FFC62F'], 'football3'], [1969, ['#4F2683', '#FFC62F', '#FFFFFF'], 'football3'], [1996, ['#4F2683', '#FFC62F', '#FFFFFF'], 'football'], [2006, ['#4F2683', '#FFC62F', '#FFFFFF'], 'football4'], [2013, ['#4F2683', '#FFC62F', '#FFFFFF'], 'football']],
    21: [[1966, ['#C8102E', '#FFFFFF', '#002244'], 'football3'], [1993, ['#0D2C6C', '#C60C30', '#FFFFFF'], 'football3'],
      [2000, ['#002244', '#B0B7BC', '#C60C30'], 'football2'], [2020, ['#002244', '#C60C30', '#FFFFFF'], 'football3']],
    22: [[1967, ['#101820', '#D3BC8D', '#FFFFFF'], 'football3'], [1986, ['#101820', '#D3BC8D', '#D3BC8D'], 'football'], [1996, ['#101820', '#D3BC8D', '#FFFFFF'], 'football']],
    23: [[1966, ['#0B2265', '#A71930', '#FFFFFF'], 'football3'], [1975, ['#0B2265', '#FFFFFF', '#A71930'], 'football3'], [1980, ['#0B2265', '#A71930', '#FFFFFF'], 'football3'], [2000, ['#0B2265', '#A71930', '#FFFFFF'], 'football2']],
    24: [[1966, ['#125740', '#FFFFFF', '#125740'], 'football3'], [1978, ['#007A33', '#FFFFFF', '#000000'], 'football3'],
      [1998, ['#125740', '#FFFFFF', '#000000'], 'football3'], [2019, ['#115740', '#000000', '#FFFFFF'], 'football2'], [2024, ['#125740', '#FFFFFF', '#000000'], 'football3']],
    25: [[1966, ['#00843D', '#A5ACAF', '#FFFFFF'], 'football3'], [1996, ['#004C54', '#000000', '#A5ACAF'], 'football2']],
    26: [[1966, ['#101820', '#FFB612', '#FFB612'], 'football4'], [1968, ['#101820', '#FFB612', '#FFFFFF'], 'football3']],
    27: [[1966, ['#AA0000', '#FFFFFF', '#000000'], 'football3'], [1989, ['#AA0000', '#FFFFFF', '#B3995D'], 'football3'], [1996, ['#9B1B30', '#B3995D', '#000000'], 'football3'], [2009, ['#AA0000', '#B3995D', '#FFFFFF'], 'football3']],
    28: [[1976, ['#002A5C', '#4DA338', '#A5ACAF'], 'football3'], [2002, ['#203F72', '#002244', '#69BE28'], 'football2'], [2012, ['#002244', '#69BE28', '#A5ACAF'], 'football4']],
    29: [[1976, ['#FF7900', '#C8102E', '#FFFFFF'], 'football3'], [1997, ['#D50A0A', '#FFFFFF', '#34302B'], 'football3'],
      [2014, ['#D50A0A', '#FFFFFF', '#FF7900'], 'football2'], [2020, ['#A71930', '#FFFFFF', '#34302B'], 'football3']],
    30: [[1966, ['#4B92DB', '#C60C30', '#FFFFFF'], 'football3'], [1999, ['#0C2340', '#4B92DB', '#C8102E'], 'football2'], [2018, ['#0C2340', '#4B92DB', '#C8102E'], 'football2'], [2026, ['#4B92DB', '#C60C30', '#FFFFFF'], 'football3']],
    31: [[1966, ['#773141', '#FFB612', '#FFFFFF'], 'football3'], [2020, ['#773141', '#FFB612', '#FFFFFF'], 'football'], [2022, ['#5A1414', '#FFB612', '#000000'], 'football2']]
  };
  // 2026 home jerseys exactly as worn (body, numbers, trim), checked against each team's current uniform
  // diagram on Wikimedia Commons and the 2026 uniform announcements. Replaces a team's 2026 entry or adds one.
  const JERSEYS_2026 = {
    2: ['#241773', '#FFFFFF', '#000000'], 3: ['#00338D', '#FFFFFF', '#C60C30'], 4: ['#101820', '#FFFFFF', '#0085CA'],
    5: ['#0B162A', '#FFFFFF', '#C83803'], 6: ['#000000', '#FFFFFF', '#FB4F14'], 7: ['#311D00', '#FFFFFF', '#FF3C00'],
    9: ['#FB4F14', '#FFFFFF', '#002244'], 11: ['#203731', '#FFFFFF', '#FFB612'], 12: ['#03202F', '#FFFFFF', '#A71930'],
    14: ['#006778', '#FFFFFF', '#101820'], 15: ['#E31837', '#FFFFFF', '#FFB81C'], 16: ['#000000', '#FFFFFF', '#A5ACAF'],
    17: ['#0080C6', '#FFFFFF', '#FFC20E'], 18: ['#003594', '#FFD100', '#FFFFFF'], 19: ['#008E97', '#FFFFFF', '#FC4C02'],
    20: ['#4F2683', '#FFFFFF', '#FFC62F'], 21: ['#002244', '#FFFFFF', '#C60C30'], 23: ['#0B2265', '#FFFFFF', '#A71930'],
    25: ['#004C54', '#FFFFFF', '#A5ACAF'], 26: ['#101820', '#FFFFFF', '#FFB612'], 27: ['#AA0000', '#FFFFFF', '#B3995D'],
    28: ['#002244', '#A5ACAF', '#69BE28'], 30: ['#4B92DB', '#FFFFFF', '#C8102E'], 31: ['#5A1414', '#FFFFFF', '#FFB612']
  };
  for (const [tid, colors] of Object.entries(JERSEYS_2026)) {
    const list = HOME_JERSEYS[tid];
    const last = list[list.length - 1];
    if (last[0] === 2026) last[1] = colors;
    else list.push([2026, colors, last[2]]);
  }
  function homeJersey(tid, season) {
    let pick = HOME_JERSEYS[tid][0];
    for (const e of HOME_JERSEYS[tid]) if (e[0] <= season) pick = e;
    return { colors: pick[1].slice(), jersey: pick[2] };
  }

  // Logo URLs keyed by the `logo` ids above. Filled with verified historical
  // logos by src/fetch_logos.js (data_cache/logos.json); anything missing
  // falls back to the franchise's current ESPN logo.
  // Current logos: official transparent files from Wikipedia (ESPN where none is listed).
  const CURRENT_LOGO = {
    0: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/72/Arizona_Cardinals_logo.svg/500px-Arizona_Cardinals_logo.svg.png',
    1: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c5/Atlanta_Falcons_logo.svg/500px-Atlanta_Falcons_logo.svg.png',
    2: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Baltimore_Ravens_logo.svg/500px-Baltimore_Ravens_logo.svg.png',
    3: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png',
    4: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1c/Carolina_Panthers_logo.svg/500px-Carolina_Panthers_logo.svg.png',
    5: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Chicago_Bears_logo.svg/500px-Chicago_Bears_logo.svg.png',
    6: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Cincinnati_Bengals_logo.svg/500px-Cincinnati_Bengals_logo.svg.png',
    7: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d9/Cleveland_Browns_logo.svg/500px-Cleveland_Browns_logo.svg.png',
    8: 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png',
    9: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/44/Denver_Broncos_logo.svg/500px-Denver_Broncos_logo.svg.png',
    10: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/71/Detroit_Lions_logo.svg/500px-Detroit_Lions_logo.svg.png',
    11: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Green_Bay_Packers_logo.svg/500px-Green_Bay_Packers_logo.svg.png',
    12: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/28/Houston_Texans_logo.svg/500px-Houston_Texans_logo.svg.png',
    13: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Indianapolis_Colts_logo.svg/500px-Indianapolis_Colts_logo.svg.png',
    14: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/74/Jacksonville_Jaguars_logo.svg/500px-Jacksonville_Jaguars_logo.svg.png',
    15: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Kansas_City_Chiefs_logo.svg/500px-Kansas_City_Chiefs_logo.svg.png',
    16: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/48/Las_Vegas_Raiders_logo.svg/500px-Las_Vegas_Raiders_logo.svg.png',
    17: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Los_Angeles_Chargers_logo.svg/500px-Los_Angeles_Chargers_logo.svg.png',
    18: 'https://a.espncdn.com/i/teamlogos/nfl/500/la.png',
    19: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/37/Miami_Dolphins_logo.svg/500px-Miami_Dolphins_logo.svg.png',
    20: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/48/Minnesota_Vikings_logo.svg/500px-Minnesota_Vikings_logo.svg.png',
    21: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b9/New_England_Patriots_logo.svg/500px-New_England_Patriots_logo.svg.png',
    22: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/New_Orleans_Saints_logo.svg/500px-New_Orleans_Saints_logo.svg.png',
    23: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/New_York_Giants_logo.svg/500px-New_York_Giants_logo.svg.png',
    24: 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6b/New_York_Jets_logo.svg/500px-New_York_Jets_logo.svg.png',
    25: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Philadelphia_Eagles_logo.svg/500px-Philadelphia_Eagles_logo.svg.png',
    26: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Pittsburgh_Steelers_logo.svg/500px-Pittsburgh_Steelers_logo.svg.png',
    27: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/San_Francisco_49ers_logo.svg/500px-San_Francisco_49ers_logo.svg.png',
    28: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Seattle_Seahawks_logo.svg/500px-Seattle_Seahawks_logo.svg.png',
    29: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/Tampa_Bay_Buccaneers_logo.svg/500px-Tampa_Bay_Buccaneers_logo.svg.png',
    30: 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png',
    31: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Washington_Commanders_logo.svg/500px-Washington_Commanders_logo.svg.png'
  };
  // Logo ids whose design is the same as (or indistinguishable at icon size from) the
  // franchise's current logo, so the current file is the correct image for that era.
  const SAME_AS_CURRENT = new Set(['CHI_1962', 'CHI_1974', 'DAL_1964', 'GB_1961', 'GB_1980', 'KC_1963', 'KC_1972', 'PIT_1962', 'IND_2002', 'IND_2020',
    'CLE_1999', 'CLE_2015', 'CLE_2024', 'MIN_1961', 'MIN_2013', 'NE_1993', 'NYG_2000', 'PHI_1996', 'BAL_1999', 'CAR_2012', 'JAX_2013', 'HOU_2002',
    'ATL_2020', 'LV_2020', 'NO_2000', 'SF_1968', 'SF_1996', 'SF_2009', 'SEA_2012', 'TB_2014', 'TEN_2018', 'MIA_2013', 'DET_2009', 'DET_2017',
    'LAC_2020', 'LAR_2020', 'WAS_2022', 'DEN_1997', 'CIN_2004', 'BUF_2011', 'ARI_2005', 'NYJ_2024', 'TEN_1999']);
  let LOGOS = {};
  // Dated logo histories (Logopedia): { primary: { tid: [{ from, to, data }] }, secondary: { tid: data } }.
  let LOGO_ERAS = { primary: {}, secondary: {} };
  function setLogos(map, processed, eras) { LOGOS = Object.assign({}, map || {}, processed || {}); if (eras) LOGO_ERAS = eras; }
  function eraLogo(tid, season) {
    const list = LOGO_ERAS.primary[tid];
    if (!list || !list.length) return null;
    const inRange = list.filter(e => e.from <= season && season <= e.to);
    if (inRange.length) return inRange.sort((a, b) => b.from - a.from)[0].data;
    const before = list.filter(e => e.from <= season).sort((a, b) => b.from - a.from)[0];
    return (before || list[0]).data;
  }

  // Population (millions of metro residents) anchors, interpolated.
  const POP = {
    0: { 1966: 2.3, 1987: 2.4, 1988: 2.0, 2000: 3.3, 2026: 5.0 }, 1: { 1966: 1.3, 2000: 4.1, 2026: 6.3 }, 2: { 1996: 2.5, 2026: 2.8 },
    3: { 1966: 1.3, 2026: 1.1 }, 4: { 1995: 1.3, 2026: 2.8 }, 5: { 1966: 7.0, 2026: 9.4 }, 6: { 1968: 1.4, 2026: 2.3 }, 7: { 1966: 2.0, 2026: 2.1 },
    8: { 1966: 1.6, 2026: 8.1 }, 9: { 1966: 1.0, 2026: 3.0 }, 10: { 1966: 4.2, 2026: 4.3 }, 11: { 1966: 0.2, 2026: 0.3 }, 12: { 2002: 5.0, 2026: 7.5 },
    13: { 1966: 1.9, 1983: 2.2, 1984: 1.2, 2026: 2.1 }, 14: { 1995: 1.0, 2026: 1.7 }, 15: { 1966: 1.2, 2026: 2.2 },
    16: { 1966: 3.0, 1981: 3.3, 1982: 8.5, 1994: 9.3, 1995: 4.0, 2019: 4.7, 2020: 2.2, 2026: 2.3 },
    17: { 1966: 1.3, 2016: 3.3, 2017: 13.2, 2026: 12.8 }, 18: { 1966: 7.0, 1994: 9.3, 1995: 2.6, 2015: 2.8, 2016: 13.2, 2026: 12.8 },
    19: { 1966: 1.2, 2026: 6.2 }, 20: { 1966: 1.6, 2026: 3.7 }, 21: { 1966: 3.4, 2026: 4.9 }, 22: { 1967: 1.1, 2026: 1.3 },
    23: { 1966: 16.0, 2026: 19.5 }, 24: { 1966: 16.0, 2026: 19.5 }, 25: { 1966: 4.8, 2026: 6.2 }, 26: { 1966: 2.4, 2026: 2.3 },
    27: { 1966: 3.0, 2026: 4.6 }, 28: { 1976: 1.6, 2026: 4.1 }, 29: { 1976: 1.4, 2026: 3.3 }, 30: { 1966: 1.9, 1996: 4.2, 1997: 1.2, 2026: 2.1 },
    31: { 1966: 2.9, 2026: 6.4 }
  };
  function getPop(tid, season) {
    const a = POP[tid]; const ys = Object.keys(a).map(Number).sort((x, y) => x - y);
    if (season <= ys[0]) return a[ys[0]];
    if (season >= ys[ys.length - 1]) return a[ys[ys.length - 1]];
    for (let i = 0; i < ys.length - 1; i++) {
      if (season >= ys[i] && season <= ys[i + 1]) {
        if (ys[i + 1] - ys[i] === 1) return season === ys[i] ? a[ys[i]] : a[ys[i + 1]];
        return Math.round((a[ys[i]] + (season - ys[i]) / (ys[i + 1] - ys[i]) * (a[ys[i + 1]] - a[ys[i]])) * 10) / 10;
      }
    }
    return 2;
  }

  function isActive(tid, season) {
    const t = TEAMS[tid];
    if (t.activeFrom && season < t.activeFrom) return false;
    if (t.inactive && season >= t.inactive[0] && season <= t.inactive[1]) return false;
    return true;
  }

  function getTeamBranding(tid, season) {
    const t = TEAMS[tid];
    const b = {};
    for (const s of t.segs) if (s.from <= season || s === t.segs[0]) Object.assign(b, s);
    delete b.from;
    const era = eraLogo(tid, season);
    const logo = era || (b.logo && LOGOS[b.logo]) || LOGOS['CURRENT_' + tid] || CURRENT_LOGO[tid];
    const small = LOGO_ERAS.secondary[tid] || logo;
    b._logoKnown = !!era || !b.logo || !!LOGOS[b.logo] || SAME_AS_CURRENT.has(b.logo);
    delete b.logo;
    const hj = homeJersey(tid, season);
    return {
      tid, srID: t.srID, region: b.region, name: b.name, abbrev: b.abbrev,
      colors: hj.colors, jersey: hj.jersey, imgURL: logo, imgURLSmall: small,
      pop: getPop(tid, season), stadiumCapacity: b.stadiumCapacity,
      disabled: !isActive(tid, season), logoVerified: b._logoKnown
    };
  }

  // ---------------------------------------------------------------------------
  // Conferences and divisions. 1966-69 the AFL and NFL are modeled as the two
  // conferences of one league (their champions meet in the Super Bowl).
  // ---------------------------------------------------------------------------
  const D = (did, cid, name) => ({ did, cid, name });
  function getAlignment(season) {
    let confs, divs, map;
    if (season <= 1966) {
      confs = [{ cid: 0, name: 'AFL' }, { cid: 1, name: 'NFL' }];
      divs = [D(0, 0, 'AFL East'), D(1, 0, 'AFL West'), D(2, 1, 'NFL Eastern'), D(3, 1, 'NFL Western')];
      map = { 21: 0, 3: 0, 30: 0, 19: 0, 24: 0, 9: 1, 15: 1, 16: 1, 17: 1,
        1: 2, 7: 2, 8: 2, 23: 2, 25: 2, 26: 2, 0: 2, 31: 2, 13: 3, 5: 3, 10: 3, 11: 3, 18: 3, 20: 3, 27: 3 };
    } else if (season <= 1969) {
      confs = [{ cid: 0, name: 'AFL' }, { cid: 1, name: 'NFL' }];
      divs = [D(0, 0, 'AFL East'), D(1, 0, 'AFL West'), D(2, 1, 'Capitol'), D(3, 1, 'Century'), D(4, 1, 'Coastal'), D(5, 1, 'Central')];
      map = { 21: 0, 3: 0, 30: 0, 19: 0, 24: 0, 9: 1, 15: 1, 16: 1, 17: 1, 6: 1,
        8: 2, 25: 2, 31: 2, 7: 3, 26: 3, 0: 3, 13: 4, 1: 4, 18: 4, 27: 4, 5: 5, 10: 5, 11: 5, 20: 5 };
      if (season === 1968) { map[23] = 2; map[22] = 3; } else { map[22] = 2; map[23] = 3; }
    } else if (season <= 2001) {
      confs = [{ cid: 0, name: 'AFC' }, { cid: 1, name: 'NFC' }];
      divs = [D(0, 0, 'AFC East'), D(1, 0, 'AFC Central'), D(2, 0, 'AFC West'), D(3, 1, 'NFC East'), D(4, 1, 'NFC Central'), D(5, 1, 'NFC West')];
      map = { 13: 0, 21: 0, 3: 0, 19: 0, 24: 0, 6: 1, 7: 1, 30: 1, 26: 1, 9: 2, 15: 2, 16: 2, 17: 2,
        8: 3, 23: 3, 25: 3, 0: 3, 31: 3, 5: 4, 10: 4, 11: 4, 20: 4, 1: 5, 18: 5, 22: 5, 27: 5 };
      if (season === 1976) { map[28] = 5; map[29] = 2; } else { map[28] = 2; map[29] = 4; }
      map[4] = 5; map[14] = 1; map[2] = 1;
    } else {
      confs = [{ cid: 0, name: 'AFC' }, { cid: 1, name: 'NFC' }];
      divs = [D(0, 0, 'AFC East'), D(1, 0, 'AFC North'), D(2, 0, 'AFC South'), D(3, 0, 'AFC West'), D(4, 1, 'NFC East'), D(5, 1, 'NFC North'), D(6, 1, 'NFC South'), D(7, 1, 'NFC West')];
      map = { 3: 0, 19: 0, 21: 0, 24: 0, 2: 1, 6: 1, 7: 1, 26: 1, 12: 2, 13: 2, 14: 2, 30: 2, 9: 3, 15: 3, 16: 3, 17: 3,
        8: 4, 23: 4, 25: 4, 31: 4, 5: 5, 10: 5, 11: 5, 20: 5, 1: 6, 4: 6, 22: 6, 29: 6, 0: 7, 18: 7, 27: 7, 28: 7 };
    }
    // Not-yet-founded franchises still need a valid division while disabled.
    for (let tid = 0; tid < 32; tid++) if (map[tid] === undefined) map[tid] = divs[divs.length - 1].did;
    const teamDiv = {};
    for (let tid = 0; tid < 32; tid++) {
      const did = map[tid];
      teamDiv[tid] = { did, cid: divs.find(d => d.did === did).cid };
    }
    return { confs, divs, teamDiv };
  }

  // ---------------------------------------------------------------------------
  // League rules by season (Football GM gameAttributes).
  // Salary values are in thousands. The NFL had no salary cap before 1994, so
  // those seasons use salaryCapType "none" (values only scale contracts).
  // ---------------------------------------------------------------------------
  const CAP = {
    1994: 34608, 1995: 37100, 1996: 40753, 1997: 41454, 1998: 52388, 1999: 57288, 2000: 62172, 2001: 67405, 2002: 71101,
    2003: 75007, 2004: 80582, 2005: 85500, 2006: 102000, 2007: 109000, 2008: 116000, 2009: 123000, 2010: 128000, 2011: 120375,
    2012: 120600, 2013: 123600, 2014: 133000, 2015: 143280, 2016: 155270, 2017: 167000, 2018: 177200, 2019: 188200, 2020: 198200,
    2021: 182500, 2022: 208200, 2023: 224800, 2024: 255400, 2025: 279200, 2026: 301200
  };
  const MIN_SALARY = { 1966: 12, 1970: 15, 1975: 20, 1978: 25, 1982: 40, 1985: 50, 1990: 75, 1993: 100, 1994: 100, 1995: 119, 1996: 131,
    1998: 158, 1999: 175, 2000: 193, 2001: 209, 2002: 225, 2004: 230, 2006: 275, 2008: 295, 2010: 325, 2011: 375, 2012: 390, 2013: 405,
    2014: 420, 2015: 435, 2016: 450, 2017: 465, 2018: 480, 2019: 495, 2020: 610, 2021: 660, 2022: 705, 2023: 750, 2024: 795, 2025: 840, 2026: 885 };
  function stepLookup(tbl, season) { let v; for (const y of Object.keys(tbl).map(Number).sort((a, b) => a - b)) if (y <= season) v = tbl[y]; return v; }

  function getRules(season) {
    const minContract = stepLookup(MIN_SALARY, season);
    let salaryCap, salaryCapType;
    if (season >= 1994) { salaryCap = CAP[season] || CAP[2026]; salaryCapType = 'hard'; }
    else {
      // Pre-cap era: team payroll = NFLPA average salary x roster size; used only to scale contracts.
      const est = { 1966: 750, 1968: 880, 1970: 1000, 1972: 1200, 1974: 2000, 1975: 2400, 1977: 2500, 1978: 2800, 1980: 3600,
        1982: 4700, 1983: 6900, 1985: 8700, 1987: 10400, 1988: 10800, 1990: 15800, 1991: 19500, 1992: 22900, 1993: 31000 };
      salaryCap = stepLookup(est, season); salaryCapType = 'none';
    }
    // Highest salaries of each pre-cap era (thousands per year).
    const maxContract = season >= 1994 ? Math.round(salaryCap * 0.215)
      : stepLookup({ 1966: 150, 1970: 200, 1975: 450, 1978: 750, 1982: 1100, 1985: 1800, 1988: 2500, 1990: 3500, 1992: 4400, 1993: 5000 }, season);
    let numGamesPlayoffSeries, numPlayoffByes;
    if (season <= 1966) { numGamesPlayoffSeries = [1, 1]; numPlayoffByes = 0; }            // AFL/NFL title games + Super Bowl
    else if (season <= 1977) { numGamesPlayoffSeries = [1, 1, 1]; numPlayoffByes = 0; }    // 8 teams
    else if (season === 1982) { numGamesPlayoffSeries = [1, 1, 1, 1]; numPlayoffByes = 0; } // strike: 16-team tournament
    else if (season <= 1989) { numGamesPlayoffSeries = [1, 1, 1, 1]; numPlayoffByes = 6; } // 10 teams
    else if (season <= 2019) { numGamesPlayoffSeries = [1, 1, 1, 1]; numPlayoffByes = 4; } // 12 teams
    else { numGamesPlayoffSeries = [1, 1, 1, 1]; numPlayoffByes = 2; }                     // 14 teams
    // Strike seasons: 9 games in 1982, 15 in 1987 (one week cancelled).
    const numGames = season === 1982 ? 9 : season === 1987 ? 15 : season <= 1977 ? 14 : (season <= 2020 ? 16 : 17);
    const numDraftRounds = season <= 1992 ? 12 : (season === 1993 ? 8 : 7);
    // Active roster limits by era (also keeps Football GM from padding the pool with random free agents).
    const maxRosterSize = stepLookup({ 1966: 40, 1974: 47, 1975: 43, 1978: 45, 1982: 49, 1985: 45, 1991: 47, 1993: 53 }, season);
    // Game rules Football GM can simulate.
    const twoPointConversions = season >= 1994;
    // Football GM throws about 55% of plays at passFactor 1. Real NFL pass share (attempts / plays):
    // about 47% before 1978, 53% in 1978-89, 55-56% in 1990-2009, 58% from 2010.
    const era = ERA_FACTORS && (ERA_FACTORS[season] || ERA_FACTORS[Math.min(season, 2025)]);
    const passFactor = era && era.passFactor !== undefined ? era.passFactor : season <= 1977 ? 0.9 : season <= 1989 ? 1 : season <= 2009 ? 1.05 : 1.1;
    const simFactors = {};
    for (const k of SIM_FACTOR_KEYS) simFactors[k] = era && era[k] !== undefined ? era[k] : 1;
    const scrimmageTouchbackKickoff = season <= 2015 ? 20 : season <= 2023 ? 25 : season === 2024 ? 30 : 35;
    const maxOvertimes = season <= 1973 ? 0 : 1; // regular-season ties stood until 1974
    const footballOvertime = season <= 2011 ? 'suddenDeath' : season <= 2023 ? 'exceptFg' : 'bothPossess';
    const footballOvertimePlayoffs = season <= 2009 ? 'suddenDeath' : season <= 2021 ? 'exceptFg' : 'bothPossess';
    const overtimeLength = season <= 2016 ? 15 : 10;
    // Schedule shape: AFL and NFL never met in the regular season before the merger.
    // Conference games, the way Football GM counts them. With the division setting on (2002 on, eight divisions of four),
    // it means games against the other divisions in the conference: the NFL plays 6, plus 6 in the division and the rest
    // out of conference. With it off, division opponents count as conference games too, so it is "games in the
    // conference": every game before the 1970 merger (the AFL and NFL never met), then all but the real cross-conference
    // games (3 a team in 1970-77, 4 in 1978-2001). Division sizes were uneven before 2002, so that setting stays off.
    // The strike seasons (1982, 1987) had no regular pattern, and with 31 teams (1999-2001: 16 AFC, 15 NFC) the
    // cross-conference games cannot pair up evenly, so those stay off too.
    const numGamesConf = season <= 1969 ? numGames : season >= 2002 ? 6 : season === 1982 || season === 1987 || (season >= 1999 && season <= 2001) ? null : numGames - (season <= 1977 ? 3 : 4);
    const numGamesDiv = season >= 2002 ? 6 : null;
    // Rookie deals: the 2011 CBA made every drafted contract four years.
    const rookieContractLengths = season >= 2011 ? [4] : [4, 3];
    return {
      numGames, numGamesPlayoffSeries, numPlayoffByes, numDraftRounds, maxRosterSize, minRosterSize: maxRosterSize - 8,
      salaryCap, salaryCapType, minPayroll: Math.round(salaryCap * 0.89), minContract, maxContract,
      ...simFactors, twoPointConversions, passFactor, scrimmageTouchbackKickoff, maxOvertimes, footballOvertime, footballOvertimePlayoffs, overtimeLength,
      overtimeLengthPlayoffs: 15, numGamesConf, numGamesDiv, rookieContractLengths,
      draftPickAutoContract: true // Football GM's Rookie Scale setting, on (it's off by default in football)
    };
  }
  // Rule keys that scheduled gameAttributes events keep in sync with getRules().
  const RULE_KEYS = ['numGames', 'numPlayoffByes', 'numDraftRounds', 'maxRosterSize', 'minRosterSize', 'salaryCap', 'salaryCapType',
    'minPayroll', 'minContract', 'maxContract', 'numGamesPlayoffSeries', 'twoPointConversions', 'passFactor', 'completionFactor', 'intFactor', 'sackFactor', 'fumbleFactor', 'rushYdsFactor', 'passYdsFactor', 'scrimmageTouchbackKickoff', 'maxOvertimes',
    'footballOvertime', 'footballOvertimePlayoffs', 'overtimeLength', 'numGamesConf', 'numGamesDiv', 'rookieContractLengths'];

  // ---------------------------------------------------------------------------
  // Famous retirements / comebacks (resolved to pids by name+birth year).
  // Football GM retirePlayer/unretirePlayer only need info.pid.
  // ---------------------------------------------------------------------------
  const PLAYER_EVENTS = [
    { season: 1999, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Reggie White', born: 1961 },
    { season: 2000, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Reggie White', born: 1961, tid: 4 },
    { season: 2001, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Reggie White', born: 1961 },
    { season: 2001, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Deion Sanders', born: 1967 },
    { season: 2004, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Deion Sanders', born: 1967, tid: 2 },
    { season: 2006, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Deion Sanders', born: 1967 },
    { season: 2004, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Ricky Williams', born: 1977 },
    { season: 2005, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Ricky Williams', born: 1977, tid: 19 },
    { season: 2011, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Brett Favre', born: 1969 },
    { season: 2011, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Randy Moss', born: 1977 },
    { season: 2012, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Randy Moss', born: 1977, tid: 27 },
    { season: 2013, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Randy Moss', born: 1977 },
    { season: 2016, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Marshawn Lynch', born: 1986 },
    { season: 2017, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Marshawn Lynch', born: 1986, tid: 16 },
    { season: 2018, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Marshawn Lynch', born: 1986 },
    { season: 2019, phase: PHASE.REGULAR_SEASON, type: 'unretirePlayer', name: 'Marshawn Lynch', born: 1986, tid: 28 },
    { season: 2020, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Marshawn Lynch', born: 1986 },
    { season: 2018, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Jason Witten', born: 1982 },
    { season: 2019, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Jason Witten', born: 1982, tid: 8 },
    { season: 2021, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Jason Witten', born: 1982 },
    { season: 2019, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Rob Gronkowski', born: 1989 },
    { season: 2020, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Rob Gronkowski', born: 1989, tid: 29 },
    { season: 2022, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Rob Gronkowski', born: 1989 },
    { season: 2020, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Eric Weddle', born: 1985 },
    { season: 2021, phase: PHASE.PLAYOFFS, type: 'unretirePlayer', name: 'Eric Weddle', born: 1985, tid: 18 },
    { season: 2022, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Eric Weddle', born: 1985 },
    { season: 2023, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Tom Brady', born: 1977 },
    { season: 2023, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'J.J. Watt', born: 1989 },
    { season: 2024, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Aaron Donald', born: 1991 },
    { season: 2025, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: 'Aaron Donald', born: 1991, tid: 18 }, // back with the Rams for 2026
    // Favre's retire-then-return offseasons: traded to the Jets in 2008, signed with the Vikings in 2009
    { season: 2008, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Brett Favre', born: 1969 },
    { season: 2008, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Brett Favre', born: 1969, tid: 24 },
    { season: 2009, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Brett Favre', born: 1969 },
    { season: 2009, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: 'Brett Favre', born: 1969, tid: 20 },
    // Retirements Football GM wouldn't make on its own (still productive, or left young)
    { season: 1972, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Gale Sayers', born: 1943 },
    { season: 1974, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Dick Butkus', born: 1942 },
    { season: 1999, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'John Elway', born: 1960 },
    { season: 2001, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Robert Smith', born: 1972 },
    { season: 2007, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Tiki Barber', born: 1975 },
    { season: 2007, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Jake Plummer', born: 1974 },
    { season: 2016, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Peyton Manning', born: 1976 },
    { season: 2017, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Tony Romo', born: 1980 },
    { season: 2018, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Joe Thomas', born: 1984 },
    { season: 2021, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Drew Brees', born: 1979 },
    { season: 2021, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Philip Rivers', born: 1981 },
    { season: 2025, phase: PHASE.REGULAR_SEASON, type: 'unretirePlayer', name: 'Philip Rivers', born: 1981, tid: 13 }, // signed by the Colts in December 2025
    { season: 2022, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Ben Roethlisberger', born: 1982 },
    { season: 2024, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Matt Ryan', born: 1985 },
    { season: 2024, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Jason Kelce', born: 1987 },
    // Careers ended by injury, death, or a sudden retirement that changed the league.
    { season: 1971, phase: PHASE.REGULAR_SEASON, type: 'retirePlayer', name: 'Chuck Hughes', born: 1943 },
    { season: 1978, phase: PHASE.REGULAR_SEASON, type: 'retirePlayer', name: 'Darryl Stingley', born: 1951 },
    { season: 1986, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Joe Theismann', born: 1949 },
    { season: 1991, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Bo Jackson', born: 1962 },
    { season: 1992, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Mike Utley', born: 1965 },
    { season: 1993, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Dennis Byrd', born: 1966 },
    { season: 1995, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Sterling Sharpe', born: 1965 },
    { season: 1995, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Napoleon McCallum', born: 1963 },
    { season: 1999, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Barry Sanders', born: 1968 },
    { season: 2000, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Michael Irvin', born: 1966 },
    { season: 2000, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Steve Young', born: 1961 },
    { season: 2000, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Derrick Thomas', born: 1967 },
    { season: 2001, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Troy Aikman', born: 1966 },
    { season: 2001, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Korey Stringer', born: 1974 },
    { season: 2007, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Michael Vick', born: 1980 }, // federal prison, 2007-08
    { season: 2008, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: 'Michael Vick', born: 1980, tid: 25 },
    { season: 2007, phase: 2, type: 'retirePlayer', name: 'Sean Taylor', born: 1983 },
    { season: 2008, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Kevin Everett', born: 1982 },
    { season: 2011, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Peyton Manning', born: 1976 }, // neck surgeries, missed 2011
    { season: 2011, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: 'Peyton Manning', born: 1976, tid: 9 },
    { season: 2015, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Patrick Willis', born: 1985 },
    { season: 2015, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Chris Borland', born: 1990 },
    { season: 2016, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Calvin Johnson', born: 1985 },
    { season: 2018, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Ryan Shazier', born: 1992 },
    { season: 2019, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Andrew Luck', born: 1989 },
    { season: 2019, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Alex Smith', born: 1984 }, // leg infection, returned 2020
    { season: 2019, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: 'Alex Smith', born: 1984, tid: 31 },
    { season: 2020, phase: PHASE.PRESEASON, type: 'retirePlayer', name: 'Luke Kuechly', born: 1991 },
    // Brady retired for 40 days after the 2021 season, then came back to Tampa
    { season: 2021, phase: PHASE.DRAFT_LOTTERY, type: 'retirePlayer', name: "Tom Brady", born: 1977 },
    { season: 2021, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: "Tom Brady", born: 1977, tid: 29 },
    // More comebacks
    { season: 2006, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Junior Seau", born: 1969 },
    { season: 2006, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: "Junior Seau", born: 1969, tid: 21 },
    { season: 2010, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Junior Seau", born: 1969 },
    { season: 1980, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "John Riggins", born: 1949 },
    { season: 1981, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: "John Riggins", born: 1949, tid: 31 },
    { season: 2018, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Le'Veon Bell", born: 1992 },
    { season: 2018, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: "Le'Veon Bell", born: 1992, tid: 24 },
    { season: 2015, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Josh Gordon", born: 1991 },
    { season: 2016, phase: PHASE.PRESEASON, type: 'unretirePlayer', name: "Josh Gordon", born: 1991, tid: 7 },
    { season: 2022, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Calvin Ridley", born: 1994 },
    { season: 2022, phase: PHASE.FREE_AGENCY, type: 'unretirePlayer', name: "Calvin Ridley", born: 1994, tid: 14 },
    // Careers that ended off the field
    { season: 2014, phase: PHASE.REGULAR_SEASON, type: 'retirePlayer', name: "Ray Rice", born: 1987 },
    { season: 2017, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Colin Kaepernick", born: 1987 },
    // Legends' retirements
    { season: 1980, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Roger Staubach", born: 1942 },
    { season: 1984, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Terry Bradshaw", born: 1948 },
    { season: 1988, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Walter Payton", born: 1953 },
    { season: 1994, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Lawrence Taylor", born: 1959 },
    { season: 1995, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Joe Montana", born: 1956 },
    { season: 2000, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Dan Marino", born: 1961 },
    { season: 2005, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Jerry Rice", born: 1962 },
    { season: 2005, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Emmitt Smith", born: 1969 },
    { season: 2008, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Michael Strahan", born: 1971 },
    { season: 2013, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Ray Lewis", born: 1975 },
    { season: 2014, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Tony Gonzalez", born: 1976 },
    { season: 2014, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Ed Reed", born: 1978 },
    { season: 2015, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Champ Bailey", born: 1978 },
    { season: 2016, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Charles Woodson", born: 1976 },
    { season: 2017, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "DeMarcus Ware", born: 1982 },
    { season: 2017, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Steve Smith", born: 1979 },
    { season: 2019, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Antonio Gates", born: 1980 },
    { season: 2021, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Larry Fitzgerald", born: 1983 },
    { season: 2021, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Julian Edelman", born: 1986 },
    { season: 2022, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Andrew Whitworth", born: 1981 },
    { season: 2022, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Frank Gore", born: 1983 },
    { season: 2024, phase: PHASE.PRESEASON, type: 'retirePlayer', name: "Fletcher Cox", born: 1990 },
    // Suspensions: the player stays on his team and misses the real number of games (shown like an injury)
    { season: 2010, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "Ben Roethlisberger", born: 1982, games: 4, reason: 'Suspended (personal conduct policy)' },
    { season: 2014, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "Josh Gordon", born: 1991, games: 10, reason: 'Suspended (substance abuse policy)' },
    { season: 2014, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "Adrian Peterson", born: 1985, games: 15, reason: 'Suspended (child abuse case)' },
    { season: 2016, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "Tom Brady", born: 1977, games: 4, reason: 'Suspended (Deflategate)' },
    { season: 2017, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "Ezekiel Elliott", born: 1995, games: 6, reason: 'Suspended (personal conduct policy)' },
    { season: 2022, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "Deshaun Watson", born: 1995, games: 11, reason: 'Suspended (personal conduct policy)' },
    { season: 2022, phase: PHASE.REGULAR_SEASON, type: 'suspension', name: "DeAndre Hopkins", born: 1992, games: 6, reason: 'Suspended (PED policy)' }
  ];

  // Why each player event happened (shown in the news by the NFL history mod). Key: type|name|season.
  const EVENT_REASONS = {
    "retirePlayer|Chuck Hughes|1971": "dies of a heart attack on the field",
    "retirePlayer|Darryl Stingley|1978": "is paralyzed by a hit in a preseason game",
    "retirePlayer|Joe Theismann|1986": "never recovers from a compound leg fracture",
    "retirePlayer|Bo Jackson|1991": "never recovers from a hip injury",
    "retirePlayer|Mike Utley|1992": "is paralyzed by an injury in a game",
    "retirePlayer|Dennis Byrd|1993": "retires after breaking his neck in a game",
    "retirePlayer|Sterling Sharpe|1995": "retires after a neck injury",
    "retirePlayer|Barry Sanders|1999": "abruptly retires at 31, 1,457 yards short of the career rushing record",
    "retirePlayer|John Elway|1999": "retires after winning back-to-back Super Bowls",
    "retirePlayer|Michael Irvin|2000": "retires after a spinal injury",
    "retirePlayer|Steve Young|2000": "retires after repeated concussions",
    "retirePlayer|Derrick Thomas|2000": "dies after a car accident",
    "retirePlayer|Troy Aikman|2001": "retires after repeated concussions",
    "retirePlayer|Korey Stringer|2001": "dies of heatstroke at training camp",
    "retirePlayer|Michael Vick|2007": "goes to federal prison for running a dogfighting ring",
    "unretirePlayer|Michael Vick|2008": "is released from prison and reinstated by the NFL",
    "retirePlayer|Sean Taylor|2007": "is killed in a home invasion",
    "retirePlayer|Kevin Everett|2008": "retires after a spinal cord injury",
    "retirePlayer|Brett Favre|2008": "retires in tears in Green Bay",
    "unretirePlayer|Brett Favre|2008": "changes his mind and is traded to the Jets",
    "unretirePlayer|Brett Favre|2009": "comes back again, this time with the rival Vikings",
    "retirePlayer|Peyton Manning|2011": "misses the season after multiple neck surgeries",
    "unretirePlayer|Peyton Manning|2011": "is cleared after neck surgery and signs with Denver",
    "retirePlayer|Patrick Willis|2015": "retires at 30 because of foot injuries",
    "retirePlayer|Chris Borland|2015": "retires at 24 over concussion concerns",
    "retirePlayer|Calvin Johnson|2016": "retires at 30",
    "retirePlayer|Ryan Shazier|2018": "retires after a spinal injury",
    "retirePlayer|Andrew Luck|2019": "retires at 29, worn down by injuries",
    "retirePlayer|Alex Smith|2019": "nearly loses his leg to an infection after surgery",
    "unretirePlayer|Alex Smith|2019": "completes a remarkable comeback from his leg injury",
    "retirePlayer|Luke Kuechly|2020": "retires at 28",
    "retirePlayer|Rob Gronkowski|2019": "retires at 29",
    "unretirePlayer|Rob Gronkowski|2020": "reunites with Tom Brady in Tampa",
    "unretirePlayer|Marshawn Lynch|2017": "comes back to play for his hometown Raiders",
    "unretirePlayer|Marshawn Lynch|2019": "returns to Seattle for the playoff push",
    "retirePlayer|Tom Brady|2021": "retires after 22 seasons",
    "unretirePlayer|Tom Brady|2021": "changes his mind 40 days later",
    "retirePlayer|Tom Brady|2023": "retires for good",
    "unretirePlayer|Aaron Donald|2025": "comes back to the Rams",
    "unretirePlayer|Philip Rivers|2025": "returns at 44 to play for the Colts",
    "retirePlayer|Junior Seau|2006": "retires with the Chargers",
    "unretirePlayer|Junior Seau|2006": "signs with the Patriots four days later",
    "retirePlayer|John Riggins|1980": "sits out the season in a contract dispute",
    "unretirePlayer|John Riggins|1981": "comes back: \"I'm bored, I'm broke and I'm back\"",
    "retirePlayer|Le'Veon Bell|2018": "sits out the season in a contract dispute",
    "unretirePlayer|Le'Veon Bell|2018": "signs with the Jets",
    "retirePlayer|Josh Gordon|2015": "is suspended for the season (substance abuse policy)",
    "unretirePlayer|Josh Gordon|2016": "is reinstated by the NFL",
    "retirePlayer|Calvin Ridley|2022": "is suspended for the season for betting on NFL games",
    "unretirePlayer|Calvin Ridley|2022": "is reinstated and traded to Jacksonville",
    "retirePlayer|Ray Rice|2014": "is released after a domestic violence video surfaces",
    "retirePlayer|Colin Kaepernick|2017": "goes unsigned after his national anthem protests",
    "unretirePlayer|Deion Sanders|2004": "comes back to play for the Ravens",
    "unretirePlayer|Reggie White|2000": "comes back to play for the Panthers",
    "unretirePlayer|Randy Moss|2012": "comes back to play for the 49ers",
    "unretirePlayer|Jason Witten|2019": "leaves the broadcast booth to return to the Cowboys",
    "unretirePlayer|Eric Weddle|2021": "comes back for the Rams playoff run",
    "retirePlayer|Philip Rivers|2021": "retires after 17 seasons"
  };

  // Major injuries in league history: [name, born, season, games missed, type, died?]
  // Stored in each player's injury history (shown on the player page).
  const HISTORICAL_INJURIES = [
    ['Joe Namath', 1943, 1970, 9, 'Broken wrist'], ['Joe Namath', 1943, 1971, 10, 'Knee'],
    ['Gale Sayers', 1943, 1968, 5, 'Torn knee ligaments'], ['Gale Sayers', 1943, 1970, 12, 'Knee'],
    ['Johnny Unitas', 1933, 1968, 9, 'Elbow'], ['Chuck Hughes', 1943, 1971, 7, 'Heart attack (died on the field)', true],
    ['Darryl Stingley', 1951, 1978, 16, 'Spinal cord injury (paralysis)'], ['Kellen Winslow', 1957, 1984, 9, 'Knee'],
    ['Joe Theismann', 1949, 1985, 5, 'Compound leg fracture (career-ending)'], ['Tim Krumrie', 1960, 1988, 1, 'Broken leg (Super Bowl XXIII)'],
    ['Bo Jackson', 1962, 1990, 1, 'Hip (career-ending)'], ['Mike Utley', 1965, 1991, 5, 'Spinal cord injury (paralysis)'],
    ['Lawrence Taylor', 1959, 1992, 7, 'Torn Achilles'], ['Dennis Byrd', 1966, 1992, 4, 'Broken neck'],
    ['Dan Marino', 1961, 1993, 11, 'Torn Achilles'], ['Sterling Sharpe', 1965, 1994, 1, 'Neck (career-ending)'],
    ['Napoleon McCallum', 1963, 1994, 13, 'Knee (career-ending)'], ['Jerry Rice', 1962, 1997, 14, 'Torn ACL'],
    ['Terrell Davis', 1972, 1999, 12, 'Torn ACL'], ['Michael Irvin', 1966, 1999, 12, 'Spinal cord injury (career-ending)'],
    ['Steve Young', 1961, 1999, 13, 'Concussion (career-ending)'], ['Troy Aikman', 1966, 2000, 5, 'Concussions'],
    ['Daunte Culpepper', 1977, 2005, 9, 'Torn knee ligaments'], ['Carson Palmer', 1979, 2005, 1, 'Torn ACL (playoffs)'],
    ['Kevin Everett', 1982, 2007, 16, 'Spinal cord injury'], ['Sean Taylor', 1983, 2007, 6, 'Killed in a home invasion', true],
    ['Tom Brady', 1977, 2008, 15, 'Torn ACL'], ['Wes Welker', 1981, 2009, 1, 'Torn ACL'],
    ['Peyton Manning', 1976, 2011, 16, 'Neck surgeries'], ['Adrian Peterson', 1985, 2011, 2, 'Torn ACL'],
    ['Robert Griffin III', 1990, 2012, 1, 'Torn ACL (playoffs)'], ['Rob Gronkowski', 1989, 2013, 9, 'Torn ACL'],
    ['Teddy Bridgewater', 1992, 2016, 16, 'Dislocated knee'], ['Andrew Luck', 1989, 2017, 16, 'Shoulder'],
    ['Ryan Shazier', 1992, 2017, 4, 'Spinal cord injury'], ['Alex Smith', 1984, 2018, 6, 'Compound leg fracture'],
    ['Joe Burrow', 1996, 2020, 6, 'Torn ACL'], ['Saquon Barkley', 1997, 2020, 14, 'Torn ACL'], ['Christian McCaffrey', 1996, 2020, 13, 'Ankle'],
    ['Damar Hamlin', 1998, 2022, 1, 'Cardiac arrest'], ['Tua Tagovailoa', 1998, 2022, 4, 'Concussions'],
    ['Aaron Rodgers', 1983, 2023, 16, 'Torn Achilles'], ['Kirk Cousins', 1988, 2023, 9, 'Torn Achilles'],
    ['Derrick Thomas', 1967, 2000, 0, 'Car accident (died)', true], ['Korey Stringer', 1974, 2001, 0, 'Heatstroke (died)', true]
  ];

  const BRAND_KEYS = ['region', 'name', 'abbrev', 'colors', 'jersey', 'imgURL', 'imgURLSmall'];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /**
   * Football GM scheduledEvents for a league that starts at (startSeason, startPhase).
   * Only events strictly after the starting point are returned.
   * resolvePid(name, bornYear) -> pid | undefined (player events are skipped when unresolved).
   */
  // Franchises that moved, keyed by the season they last played in the old city and the old franchise: the players
  // under contract went with the owner. The Browns' name and history stayed in Cleveland (the 1996 agreement), so in
  // the data Baltimore is a new franchise and Cleveland comes back in 1999.
  const RELOCATIONS = { '1995|7': 2 };
  // A franchise starting play the season after this one, as an expansion draft or a move sets it up
  function joiningTeam(tid, season) {
    const b = getTeamBranding(tid, season + 1);
    const nextAlign = getAlignment(season + 1);
    return { tid, region: b.region, name: b.name, abbrev: b.abbrev, imgURL: b.imgURL, imgURLSmall: b.imgURLSmall,
      colors: b.colors, jersey: b.jersey, pop: b.pop, stadiumCapacity: b.stadiumCapacity,
      did: String(nextAlign.teamDiv[tid].did) };
  }

  function buildScheduledEvents(startSeason, startPhase, resolvePid) {
    const ev = [];
    const after = (season, phase) => season > startSeason || (season === startSeason && phase > startPhase);

    for (let season = startSeason; season <= LAST_SEASON; season++) {
      const prevAlign = getAlignment(season - 1);
      const align = getAlignment(season);
      const rules = getRules(season);
      const prevRules = getRules(season - 1);

      // League rules change at the start of each new season.
      const ga = {};
      for (const k of RULE_KEYS) if (!same(rules[k], prevRules[k])) ga[k] = rules[k];
      if (Object.keys(ga).length) ev.push({ season, phase: PHASE.PRESEASON, type: 'gameAttributes', info: ga });

      // Realignment.
      if (!same(align.confs, prevAlign.confs) || !same(align.divs, prevAlign.divs) || !same(align.teamDiv, prevAlign.teamDiv)) {
        ev.push({ season, phase: PHASE.PRESEASON, type: 'confsDivs', info: {
          confs: align.confs, divs: align.divs,
          teams: Object.keys(align.teamDiv).map(Number).map(tid => ({ tid, did: align.teamDiv[tid].did }))
        } });
      }

      for (let tid = 0; tid < 32; tid++) {
        const wasActive = isActive(tid, season - 1);
        const nowActive = isActive(tid, season);
        const nextActive = isActive(tid, season + 1);
        // A franchise that stops playing next season folds after this season's playoffs
        // (1995 Browns): players become free agents.
        if (nowActive && !nextActive) {
          const info = { tid };
          // A move (1995 Browns to Baltimore): the NFL history mod moves the players and draft picks to the new
          // franchise instead of making them free agents. Plain Football GM ignores this and folds the team as before.
          const to = RELOCATIONS[season + '|' + tid];
          if (to !== undefined) info.nflRelocateTo = joiningTeam(to, season);
          ev.push({ season, phase: PHASE.DRAFT_LOTTERY, type: 'contraction', info });
        }
        // A franchise that starts next season joins via expansion draft after this season's playoffs (skipped by the
        // mod when a move above already started it).
        if (!nowActive && nextActive) {
          const team = joiningTeam(tid, season);
          // Teams joining the same season share one expansion draft (Seahawks and Buccaneers 1976, Panthers and Jaguars
          // 1995): Football GM runs one draft at a time, so a second event left the second team out
          const same = ev.find(e => e.type === 'expansionDraft' && e.season === season && e.phase === PHASE.DRAFT_LOTTERY);
          if (same) same.info.teams.push(team);
          else ev.push({ season, phase: PHASE.DRAFT_LOTTERY, type: 'expansionDraft', info: { numProtectedPlayers: season < 1990 ? 30 : 37, teams: [team] } });
        }
        // Branding changes for franchises that were already playing.
        if (wasActive && nowActive) {
          const a = getTeamBranding(tid, season - 1), b = getTeamBranding(tid, season);
          const info = { tid };
          for (const k of BRAND_KEYS) if (!same(a[k], b[k])) info[k] = b[k];
          if (info.imgURL && !info.imgURLSmall) info.imgURLSmall = b.imgURLSmall;
          if (a.region !== b.region || Math.abs(a.pop - b.pop) >= 1) info.pop = b.pop;
          if (a.stadiumCapacity !== b.stadiumCapacity) info.stadiumCapacity = b.stadiumCapacity;
          if (Object.keys(info).length > 1) ev.push({ season, phase: PHASE.PRESEASON, type: 'teamInfo', info });
        }
      }
    }

    for (const pe of PLAYER_EVENTS) {
      const pid = resolvePid ? resolvePid(pe.name, pe.born) : undefined;
      if (pid === undefined) continue;
      if (pe.type === 'suspension') {
        // Sent as a gameAttributes event so plain Football GM only stores a harmless setting; the mod turns it
        // into an absence (shown like an injury) of pe.games games.
        ev.push({ season: pe.season, phase: pe.phase, type: 'gameAttributes', info: { nflSuspension: { pid, games: pe.games, reason: pe.reason } } });
        continue;
      }
      // tid: the team a returning player signs with; reason: shown in the news (both used by the NFL history mod)
      const info = { pid };
      if (pe.tid !== undefined) info.tid = pe.tid;
      const reason = EVENT_REASONS[pe.type + '|' + pe.name + '|' + pe.season];
      if (reason) info.reason = reason;
      ev.push({ season: pe.season, phase: pe.phase, type: pe.type, info });
    }

    // Football GM processes realignment before team changes within the same phase.
    const order = { gameAttributes: 0, confsDivs: 1, contraction: 2, expansionDraft: 3, teamInfo: 4, retirePlayer: 5, unretirePlayer: 6 };
    return ev
      .filter(e => after(e.season, e.phase))
      .sort((x, y) => x.season - y.season || x.phase - y.phase || order[x.type] - order[y.type])
      .map((e, i) => ({ id: i + 1, ...e }));
  }

  const api = { FIRST_SEASON, LAST_SEASON, PHASE, TEAMS, CURRENT_LOGO, setLogos, getPop, isActive, getTeamBranding, getAlignment, getRules, RULE_KEYS, HOME_JERSEYS, buildScheduledEvents, PLAYER_EVENTS, HISTORICAL_INJURIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NFL_ERAS = api;
})(typeof window !== 'undefined' ? window : globalThis);
