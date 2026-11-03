// NFL History for Football GM: launcher with automatic updates. Install_and_Play (.bat / .sh) downloads a private
// Node 24 and runs this script, which:
//   1. checks GitHub for a newer release; if there is one, downloads NFL_History_Mod.zip, copies it over this folder
//      and shows what's new (here, and the release notes in the browser)
//   2. sets up Football GM's source with the mod applied, whenever the installed mod version isn't the current one
//   3. starts the game
// Offline, or if GitHub can't be reached, it skips the check and starts what's installed.
// Testing: NFL_RELEASE_API points the update check at another URL; NFL_NO_START=1 stops before starting the game.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOD = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.dirname(MOD);
const GAME = path.join(DIR, 'football-gm');
const LOG = path.join(DIR, 'install_log.txt');
const MARKER = path.join(GAME, '.nfl-installed');
const API = process.env.NFL_RELEASE_API || 'https://api.github.com/repos/JenZiMiBruh/nfl-history-fbgm/releases/latest';
const WIN = process.platform === 'win32';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const log = (s) => fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${s}\n`);
const say = (s = '') => { console.log(s); log(s); };
const run = (cmd, args, opts = {}) => {
  log(`$ ${cmd} ${args.join(' ')}`);
  // corepack is a .cmd script on Windows, so it goes through cmd /c (its arguments never contain spaces)
  if (WIN && opts.shell) [cmd, args] = ['cmd', ['/c', cmd, ...args]];
  const out = execFileSync(cmd, args, { cwd: opts.cwd || DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  if (out) log(out.trim());
  return out;
};
const newer = (a, b) => { // is version a newer than b? ("v1.10" > "1.9")
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
const openUrl = (url) => {
  try {
    if (WIN) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* no browser: the address is printed anyway */ }
};

// One anonymous count per start, so the dashboard shows how many people play and on which version: just the mod version,
// nothing about the player or their computer. Skipped with a no-stats.txt file in this folder. Never delays the game:
// at most 3 seconds, and any failure is ignored.
async function countStart(version) {
  if (fs.existsSync(path.join(DIR, 'no-stats.txt')) || process.env.NFL_NO_START) return;
  const url = 'https://galloade.goatcounter.com/count?' + new URLSearchParams({ p: '/mod/start/v' + version, t: 'Mod started', e: 'true', rnd: Math.random().toString(36).slice(2) });
  try { await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NFLHistoryMod/' + version }, signal: AbortSignal.timeout(3000) }); } catch { /* offline: no count */ }
}

// "Playing now": while the game is open, a check-in every 4 minutes under the current 10-minute window
// (/mod/live/20261103-0510). GoatCounter counts each computer once per path, so the site shows how many computers
// checked in during this window or the last one. Same opt-out and same nothing-personal rule as countStart.
function heartbeat(version) {
  if (fs.existsSync(path.join(DIR, 'no-stats.txt')) || process.env.NFL_NO_START) return;
  const ping = () => {
    const d = new Date(Math.floor(Date.now() / 600000) * 600000).toISOString();
    const bucket = d.slice(0, 10).replace(/-/g, '') + '-' + d.slice(11, 16).replace(':', '');
    const url = 'https://galloade.goatcounter.com/count?' + new URLSearchParams({ p: '/mod/live/' + bucket, t: 'Playing now', e: 'true', rnd: Math.random().toString(36).slice(2) });
    fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NFLHistoryMod/' + version }, signal: AbortSignal.timeout(5000) }).catch(() => {});
  };
  ping();
  setInterval(ping, 4 * 60000);
}

async function checkForUpdate(current) {
  let rel;
  try {
    const res = await fetch(API, { headers: { 'User-Agent': 'nfl-history-fbgm-launcher' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    rel = await res.json();
  } catch (e) {
    say(`  (Couldn't check for updates: ${e.message}. Starting what's installed.)`);
    return null;
  }
  if (!newer(rel.tag_name, current)) { say(`  Up to date (v${current}).`); return null; }
  const asset = (rel.assets || []).find(a => a.name === 'NFL_History_Mod.zip');
  if (!asset) return null;
  say(`  Updating the mod: v${current} -> ${rel.tag_name}...`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nfl-update-'));
  const zip = path.join(tmp, 'mod.zip');
  const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'nfl-history-fbgm-launcher' } });
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const out = path.join(tmp, 'x');
  fs.mkdirSync(out);
  if (WIN) {
    // tar copes with long paths better than Expand-Archive
    try { run('tar', ['-xf', zip, '-C', out]); } catch { run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${out}' -Force`]); }
  }
  else run('unzip', ['-q', '-o', zip, '-d', out]);
  // Copy everything over this folder; football-gm/ and node/ are never in the zip, so they stay
  fs.cpSync(out, DIR, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return rel;
}

function showWhatsNew(rel) {
  say();
  say(`  What's new in ${rel.tag_name}`);
  say('  ' + '-'.repeat(40));
  const body = String(rel.body || '').split('| File |')[0]; // the notes, without the file table
  for (const line of body.split(/\r?\n/)) {
    const t = line.replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trimEnd();
    if (t && !t.startsWith('Every NFL season') && !/^What's new in/.test(t)) say('  ' + t);
  }
  say();
  if (rel.html_url) openUrl(rel.html_url);
}

function install(cfg) {
  if (!fs.existsSync(path.join(GAME, '.git'))) {
    say('Downloading Football GM source...');
    run('git', ['clone', 'https://github.com/zengm-games/zengm.git', GAME]);
  }
  // A clean copy every time the mod changes, so a run that stopped halfway can't block the next one
  run('git', ['checkout', '-q', '-f', cfg.base], { cwd: GAME });
  run('git', ['clean', '-q', '-fd', '-e', 'node_modules'], { cwd: GAME });
  say('Applying the NFL History mod...');
  run('git', ['apply', '--whitespace=nowarn', path.join(MOD, 'nfl-history-mod.patch')], { cwd: GAME });
  fs.mkdirSync(path.join(GAME, 'public', 'football', 'nfl'), { recursive: true });
  fs.copyFileSync(path.join(MOD, 'public', 'nfl', 'nfl_mod.js'), path.join(GAME, 'public', 'football', 'nfl', 'nfl_mod.js'));
  say('Installing packages, the longest step...');
  try { run('corepack', ['enable'], { cwd: GAME, shell: true }); } catch { /* not needed when pnpm is reachable */ }
  run('corepack', ['pnpm', 'install'], { cwd: GAME, shell: true });
  fs.writeFileSync(MARKER, cfg.version);
}

async function main() {
  console.log('\n  NFL History for Football GM\n  ---------------------------');
  let cfg = readJson(path.join(MOD, 'version.json'));
  const rel = await checkForUpdate(cfg.version);
  if (rel) cfg = readJson(path.join(MOD, 'version.json'));

  const installed = fs.existsSync(MARKER) ? fs.readFileSync(MARKER, 'utf8').trim() : '';
  if (installed !== cfg.version) {
    if (!installed) say('  The first run sets everything up (about 5-10 minutes). After that it starts in seconds.');
    install(cfg);
  }
  if (rel) showWhatsNew(rel);
  if (process.env.NFL_NO_START) { say('INSTALL_OK v' + cfg.version); return; }
  await countStart(cfg.version);
  heartbeat(cfg.version);

  const ip = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal)?.address;
  say('\n  Ready. Opening http://localhost:3000');
  if (ip) say(`  On your phone (same Wi-Fi): http://${ip}:3000`);
  say('  Keep this window open while you play.\n');
  setTimeout(() => openUrl('http://localhost:3000'), 4000);
  const child = spawn(WIN ? 'node.exe' : 'node', ['--run', 'dev', '--', '--host'], { cwd: GAME, stdio: 'inherit', env: { ...process.env, SPORT: 'football' } });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  log(String(e && e.stack || e));
  console.log('\nSomething went wrong. Run Install_and_Play again first (it picks up where it stopped).');
  console.log('If it still fails, open an issue on GitHub and attach install_log.txt from this folder:');
  console.log('  https://github.com/JenZiMiBruh/nfl-history-fbgm/issues');
  process.exit(1);
});
