// "Flag a rating": a button at the bottom of every page opens a search over every player since 1966. Pick the player
// (typing a year too, like "brady 2007", jumps to it), pick the season, then say the rating is too high or too low.
// Each flag is one cookie-free GoatCounter event on rating/<pid>/<season>/<high|low>, the same counter the polls use,
// so it needs no account; this browser remembers its flags so one person can't stack them. Player cards open it with
// the player and season already picked: NFLH.flag(pid, season).
(() => {
  const GC = 'https://galloade.goatcounter.com/count';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = (pid, season) => `nflh-flag-${pid}-${season}`;
  const flagged = (pid, season) => { try { return localStorage.getItem(key(pid, season)); } catch { return null; } };
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.'’-]/g, '');

  let index; // { teams, players }
  const load = () => index || (index = fetch('data/players.json').then(r => r.json()));

  let root, state = {};
  function build() {
    const btn = document.createElement('button');
    btn.className = 'flag-fab';
    btn.type = 'button';
    btn.innerHTML = '<span aria-hidden="true">⚑</span> Flag a rating';
    btn.onclick = () => open();
    root = document.createElement('div');
    root.className = 'flag-panel';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Flag a rating');
    root.innerHTML = `<div class="flag-card">
      <div class="flag-head"><div><div class="chy"><b>Ratings</b><span>Flag one</span></div><h3>Is a rating off?</h3></div>
        <button type="button" class="flag-x" aria-label="Close">×</button></div>
      <p class="flag-sub">Find the player and season, then say which way it's off. No account needed.</p>
      <input id="flag-q" class="inp" type="search" autocomplete="off" placeholder="Search a player (try “Brady 2007”)" aria-label="Search a player">
      <div class="flag-body" id="flag-body"></div>
    </div>`;
    document.body.append(btn, root);
    root.querySelector('.flag-x').onclick = close;
    root.addEventListener('click', e => { if (e.target === root) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) close(); });
    root.querySelector('#flag-q').addEventListener('input', e => search(e.target.value));
  }

  async function open(pid, season) {
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    const q = root.querySelector('#flag-q');
    body('<p class="flag-note">Loading every player since 1966…</p>');
    let d;
    try { d = await load(); } catch { body('<p class="flag-note">The player list didn\'t load. Check your connection and try again.</p>'); index = undefined; return; }
    if (pid !== undefined) {
      const p = d.players.find(x => x[0] === pid);
      if (p) { q.value = p[1]; return pick(p, season); }
    }
    q.value = ''; q.focus();
    body('<p class="flag-note">Type a name. Add a year to jump straight to that season.</p>');
  }
  function close() { root.hidden = true; document.body.style.overflow = ''; }
  const body = html => { root.querySelector('#flag-body').innerHTML = html; };

  async function search(text) {
    const d = await load();
    const year = +(text.match(/\b(19[6-9]\d|20[0-2]\d)\b/) || [])[1] || undefined;
    const words = norm(text.replace(/\b(19|20)\d\d\b/, '')).split(/\s+/).filter(Boolean);
    if (!words.length) { body('<p class="flag-note">Type a name. Add a year to jump straight to that season.</p>'); return; }
    const hits = [];
    for (const p of d.players) {
      const n = norm(p[1]);
      if (!words.every(w => n.includes(w))) continue;
      if (year && !p[3].some(s => s[0] === year)) continue;
      // Exact last-name or full matches first, then the longer careers (the player people most likely mean)
      const score = (n === words.join(' ') ? 100 : 0) + (n.split(' ').pop() === words[words.length - 1] ? 10 : 0) + Math.min(p[3].length, 20);
      hits.push([score, p]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    if (!hits.length) { body(`<p class="flag-note">No player matches${year ? ' in ' + year : ''}. Check the spelling.</p>`); return; }
    state.year = year;
    body(`<div class="flag-list">${hits.slice(0, 8).map(([, p]) => {
      const ys = p[3].map(s => s[0]);
      const teams = [...new Set(p[3].map(s => d.teams[s[1]]))].slice(0, 4).join(', ');
      return `<button type="button" class="flag-hit" data-pid="${p[0]}"><b>${esc(p[1])}</b><span>${esc(p[2])} · ${ys[0]}${ys.length > 1 ? '–' + ys[ys.length - 1] : ''} · ${esc(teams)}</span></button>`;
    }).join('')}</div>`);
    root.querySelectorAll('.flag-hit').forEach(b => b.onclick = () => pick(d.players.find(x => x[0] === +b.dataset.pid), state.year));
  }

  async function pick(p, season) {
    const d = await load();
    state.p = p;
    const sel = p[3].find(s => s[0] === season) || p[3][p[3].length - 1];
    body(`<div class="flag-player"><b>${esc(p[1])}</b><span>${esc(p[2])}</span></div>
      <label class="flag-label" for="flag-season">Season</label>
      <select id="flag-season" class="inp">${p[3].map(s => `<option value="${s[0]}"${s === sel ? ' selected' : ''}>${s[0]} · ${esc(d.teams[s[1]] || '')} · rated ${s[2]}</option>`).join('')}</select>
      <div id="flag-act"></div>`);
    const draw = () => {
      const s = +root.querySelector('#flag-season').value, row = p[3].find(x => x[0] === s);
      const done = flagged(p[0], s);
      root.querySelector('#flag-act').innerHTML = done
        ? `<p class="flag-done">Thanks. You flagged ${esc(p[1])} ${s} as rated too ${done}. Ratings that get flagged a lot get a look in the next update.</p>`
        : `<div class="flag-big">${row[2]}<small>rating in ${s}</small></div>
           <div class="flag-btns"><button type="button" class="btn go" data-dir="high">Rated too high</button><button type="button" class="btn go" data-dir="low">Rated too low</button></div>`;
      root.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => send(p, s, b.dataset.dir, draw));
    };
    root.querySelector('#flag-season').onchange = draw;
    draw();
  }

  function send(p, season, dir, redraw) {
    new Image().src = `${GC}?${new URLSearchParams({ p: `rating/${p[0]}/${season}/${dir}`, t: `Rating: ${p[1]} ${season} too ${dir}`, e: 'true', rnd: Math.random().toString(36).slice(2) })}`;
    try { localStorage.setItem(key(p[0], season), dir); } catch {}
    redraw();
  }

  const start = () => { build(); window.NFLH = Object.assign(window.NFLH || {}, { flag: (pid, season) => open(pid, season) }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
