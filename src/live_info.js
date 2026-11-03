/**
 * live_info.js - where the live season stands, from the data rather than typed into each page: the last week with a
 * finished game, the next week a league can start at, and the date of the last finished game. Used by the selector
 * and mod builds for their week lists and "through Week N" labels.
 */
const fs = require('fs');
const path = require('path');
const { parseCSVFile } = require('./csv_parser');

function liveInfo(season = 2026) {
  const ROOT = path.join(__dirname, '..');
  const games = parseCSVFile(path.join(ROOT, 'data_cache', 'live2026', 'games.csv'))
    .filter(g => +g.season === season && g.game_type === 'REG' && g.home_score !== '' && g.home_score !== 'NA');
  const lastWeek = Math.max(0, ...games.map(g => +g.week));
  const lastDay = games.map(g => g.gameday).sort().pop();
  const date = lastDay ? new Date(lastDay + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  // A week is complete when none of its games are still to be played
  const left = parseCSVFile(path.join(ROOT, 'data_cache', 'live2026', 'games.csv'))
    .filter(g => +g.season === season && g.game_type === 'REG' && +g.week === lastWeek && (g.home_score === '' || g.home_score === 'NA')).length;
  return { season, lastWeek, nextWeek: lastWeek + 1, complete: left === 0, date, label: `through Week ${lastWeek}${left ? '' : ' (complete)'}, ${date}` };
}

module.exports = { liveInfo };
