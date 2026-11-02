/**
 * team_codes.js - franchise IDs (tid) for real team names: full names as spreadspoke writes them (1966+) and the
 * abbreviations nflverse uses (1978+). Shared by the schedule and head-to-head builders.
 */
const FULL = {
  'Arizona Cardinals': 0, 'Phoenix Cardinals': 0, 'St. Louis Cardinals': 0, 'Atlanta Falcons': 1, 'Baltimore Ravens': 2, 'Buffalo Bills': 3,
  'Carolina Panthers': 4, 'Chicago Bears': 5, 'Cincinnati Bengals': 6, 'Cleveland Browns': 7, 'Dallas Cowboys': 8, 'Denver Broncos': 9,
  'Detroit Lions': 10, 'Green Bay Packers': 11, 'Houston Texans': 12, 'Baltimore Colts': 13, 'Indianapolis Colts': 13, 'Jacksonville Jaguars': 14,
  'Kansas City Chiefs': 15, 'Oakland Raiders': 16, 'Los Angeles Raiders': 16, 'San Diego Chargers': 17, 'Los Angeles Rams': 18, 'St. Louis Rams': 18,
  'Miami Dolphins': 19, 'Minnesota Vikings': 20, 'New England Patriots': 21, 'Boston Patriots': 21, 'New Orleans Saints': 22, 'New York Giants': 23,
  'New York Jets': 24, 'Philadelphia Eagles': 25, 'Pittsburgh Steelers': 26, 'San Francisco 49ers': 27, 'Seattle Seahawks': 28,
  'Tampa Bay Buccaneers': 29, 'Houston Oilers': 30, 'Tennessee Oilers': 30, 'Washington Redskins': 31
};
const CODE = { ARI: 0, ATL: 1, BAL: 2, BUF: 3, CAR: 4, CHI: 5, CIN: 6, CLE: 7, DAL: 8, DEN: 9, DET: 10, GB: 11, HOU: 12, IND: 13, JAX: 14,
  KC: 15, OAK: 16, LV: 16, SD: 17, LAC: 17, LA: 18, LAR: 18, STL: 18, MIA: 19, MIN: 20, NE: 21, NO: 22, NYG: 23, NYJ: 24, PHI: 25, PIT: 26,
  SF: 27, SEA: 28, TB: 29, TEN: 30, WAS: 31 };

module.exports = { FULL, CODE };
