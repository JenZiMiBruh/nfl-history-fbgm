// Teams page: the team picker, and one team's history at #team/<tid> (every look, season by season, best players by
// season, franchise legends, retired numbers, and a player card with his rating by season)
(() => {
  const $ = s => document.querySelector(s);
  const { esc, jersey, ovrColor, data, toast, REPO } = window.NFLH;
  const range = (a, b) => a === b ? `${a}` : `${a}–${b >= 2026 ? 'now' : b}`;
  let TEAMS = [];
  const cache = {};
  const loadTeam = async tid => cache[tid] || (cache[tid] = await data('team-' + tid));

  let filter = '';
  async function init() {
    TEAMS = await data('teams');
    $('#picker').innerHTML = TEAMS.map(t => `
      <div class="tp" tabindex="0" style="--c:${t.colors[0]}" data-tid="${t.tid}" role="link" aria-label="${esc(t.region)} ${esc(t.name)}"${t.tid === 0 ? ' title="Bird gang. Bring tissues."' : ''}>
        <span class="ab">${esc(t.abbrev)}</span>
        <img src="${t.logo}" alt="" loading="lazy"><b>${esc(t.region)}<br>${esc(t.name)}</b>
        <small>${t.looks} looks${t.champs ? ` · ${t.champs} ${t.champs === 1 ? 'title' : 'titles'}` : ''}</small>
      </div>`).join('');
    const F = [['', 'All 32'], ['champs', 'Title winners'], ['new', 'Joined after 1966']];
    $('#confs').innerHTML = F.map(([k, l]) => `<button class="chip${k === filter ? ' on' : ''}" data-f="${k}">${l}</button>`).join('');
    $('#confs').onclick = e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; document.querySelectorAll('#confs .chip').forEach(c => c.classList.toggle('on', c === b)); applyFilter(); };
    $('#findteam').addEventListener('input', applyFilter);
    $('#findteam').addEventListener('keydown', e => { if (e.key === 'Enter') { const el = document.querySelector('#picker .tp:not(.hide)'); if (el) location.hash = 'team/' + el.dataset.tid; } });
    const open = e => { const el = e.target.closest('.tp'); if (el && (e.type === 'click' || e.key === 'Enter')) location.hash = 'team/' + el.dataset.tid; };
    $('#picker').addEventListener('click', open);
    $('#picker').addEventListener('keydown', open);
    addEventListener('hashchange', route);
    route();
  }
  function applyFilter() {
    const q = $('#findteam').value.trim().toLowerCase();
    document.querySelectorAll('#picker .tp').forEach(el => {
      const t = TEAMS[+el.dataset.tid];
      const okQ = !q || (t.region + ' ' + t.name + ' ' + t.abbrev).toLowerCase().includes(q);
      const okF = !filter || (filter === 'champs' ? t.champs > 0 : t.from > 1966);
      el.classList.toggle('hide', !(okQ && okF));
    });
  }

  async function route() {
    const m = location.hash.match(/^#team\/(\d+)/);
    if (!m) {
      $('#team').classList.remove('on'); $('#team').innerHTML = ''; $('#pickerView').hidden = false;
      document.title = 'Teams · NFL History';
      return;
    }
    const T = await loadTeam(+m[1]);
    if (!T) { location.hash = ''; return; }
    renderTeam(T);
    $('#pickerView').hidden = true;
    $('#team').classList.add('on');
    document.title = `${T.region} ${T.name} · NFL History`;
    scrollTo({ top: 0 });
  }

  // The team's colors drive the page: a dark one for the header, a vivid one for accents
  function teamColors(T) {
    const r = document.documentElement.style;
    const [c1, c2, c3] = T.colors;
    const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8 & 255) * 587) + ((n & 255) * 114)) / 1000; };
    const team1 = lum(c1) < 150 ? c1 : (lum(c3) < 150 ? c3 : '#1d2b3a');
    const vivid = [c1, c3, c2].find(c => { const n = parseInt(c.slice(1), 16), R = n >> 16, G = n >> 8 & 255, B = n & 255; return Math.max(R, G, B) - Math.min(R, G, B) > 60 && lum(c) > 55; }) || '#ffb81c';
    r.setProperty('--team1', team1); r.setProperty('--teamc', vivid); r.setProperty('--team3', vivid);
  }

  function renderTeam(T) {
    teamColors(T);
    const W = T.seasons.reduce((n, s) => n + s.w, 0), L = T.seasons.reduce((n, s) => n + s.l, 0);
    const po = T.seasons.filter(s => s.po >= 0).length;
    const players = T.players;
    const byId = Object.fromEntries(players.map(p => [p.id, p]));
    const years = T.seasons.map(s => s.y);
    const notes = T.tid === 0 ? `<div class="egg-note">${CARDS_NOTES[Math.floor(Math.random() * CARDS_NOTES.length)]}</div>` : '';

    $('#team').innerHTML = `
      <header class="thead"><img class="bigl" src="${T.logo}" alt=""><div class="wrap">
        <div class="row"><img class="lg" src="${T.logo}" alt="">
          <div><div class="chy"><b>${esc(T.abbrev)}</b><span>${T.looks.length} looks · since ${T.looks[0].from}</span></div>
            <h1>${esc(T.region)}<br>${esc(T.name)}</h1>${notes}</div></div>
        <div class="kpis">
          <div class="kpi"><b>${W}–${L}</b>Record since ${T.seasons[0]?.y}</div>
          <div class="kpi"><b>${po}</b>Playoff seasons</div>
          <div class="kpi"><b>${T.champs.length}</b>${T.champs.length === 1 ? 'Title' : 'Titles'}${T.champs.length ? ' · ' + T.champs.join(', ') : ''}</div>
          <div class="kpi"><b>${T.retired.length}</b>Retired numbers</div>
        </div>
        <div class="tswitch">
          <select aria-label="Switch team" id="tswitch">${TEAMS.map(t => `<option value="${t.tid}"${t.tid === T.tid ? ' selected' : ''}>${esc(t.region)} ${esc(t.name)}</option>`).join('')}</select>
          <a class="btn line" href="teams.html">← All teams</a>
        </div>
      </div></header>
      <nav class="tsub" aria-label="On this page"><div class="wrap"><a href="#t-looks">Every look</a><a href="#t-seasons">Season by season</a><a href="#t-best">Best by season</a><a href="#t-legends">Legends</a>${T.retired.length ? '<a href="#t-retired">Retired numbers</a>' : ''}</div></nav>

      <div class="wrap">
      <div class="block" id="t-looks"><div class="bh"><div><h2>Every look</h2><p class="hint">Logo and jersey for each era. In the game these switch on the real date as you sim.</p></div>
        <a class="rep" data-goatcounter-click="report-logo-team" target="_blank" rel="noopener" href="${REPO}/issues/new?template=logo.yml&team=${encodeURIComponent(T.region + ' ' + T.name)}">Logo or uniform wrong? Report it →</a></div>
        <div class="lookwrap"><button class="arr l" aria-label="Earlier looks" data-d="-1">‹</button><button class="arr r" aria-label="Later looks" data-d="1">›</button>
        <div class="looks">${T.looks.map(l => { const k = num(T, l); return `<div class="look" style="--c:${l.colors[0]}">${l.to >= 2026 ? '<span class="now">Now</span>' : ''}
          <div class="stage">${l.logo ? `<img src="${l.logo}" alt="" loading="lazy">` : ''}${jersey(l.colors, k.n)}</div>
          <div class="info"><div class="yrs">${range(l.from, l.to)}</div><div class="nm">${esc(l.region)} ${esc(l.name)}</div>
            <div class="who">${k.who ? `#${esc(k.n)} <b>${esc(k.who)}</b>` : ''}</div>
            <div class="sw">${l.colors.map(c => `<i style="background:${c}" title="${c}"></i>`).join('')}</div></div></div>`; }).join('')}</div></div>
      </div>

      <div class="block" id="t-seasons"><div class="bh"><div><h2>Season by season</h2><p class="hint">Win percentage every season. Click a bar to see that year's best players.</p></div></div>
        <div class="panel chartp chart">
          <div class="bars" id="bars"><div class="half" style="bottom:50%"></div>${T.seasons.map(s => {
            const pct = (s.w + s.t / 2) / Math.max(1, s.w + s.l + s.t);
            return `<div class="b ${s.po >= 0 ? 'po' : ''} ${T.champs.includes(s.y) ? 'ch' : ''}" data-y="${s.y}" style="height:${Math.max(3, pct * 100)}%"></div>`;
          }).join('')}</div>
          <div class="axis">${years.map((y, i) => i === 0 || i === years.length - 1 || (y % 10 === 0 && i > 5 && i < years.length - 5) ? `<span style="left:${(i + .5) / years.length * 100}%">${y}</span>` : '').join('')}</div>
          <div class="legend"><span><i style="background:color-mix(in srgb,var(--muted) 45%,transparent)"></i>Missed the playoffs</span><span><i style="background:var(--teamc)"></i>Made the playoffs</span><span><b style="color:var(--signal)">★</b> Champions</span><span>- - - .500</span></div>
        </div>
      </div>

      <div class="block" id="t-best"><div class="bh"><div><h2>Best players by season</h2><p class="hint">Their rating in the league that season, built from what they really did.</p></div></div>
        <div class="seasonbar"><div class="yr" id="syr"></div><input type="range" id="srange" min="0" max="${years.length - 1}" value="${defaultIdx(T)}" aria-label="Season"><div class="rec" id="srec"></div></div>
        <div class="roster" id="roster"></div>
      </div>

      <div class="block" id="t-legends"><div class="bh"><div><h2>Franchise legends</h2><p class="hint">Everyone notable who played here, ranked by career value with the team. Tap a player for his ratings season by season.</p></div></div>
        <div class="tools">
          <input class="inp" id="q" placeholder="Search players…" aria-label="Search players">
          <select class="inp" id="pos" aria-label="Position"><option value="">All positions</option>${['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'].map(p => `<option>${p}</option>`).join('')}</select>
          <select class="inp" id="sort" aria-label="Sort"><option value="av">Career value</option><option value="peak">Peak rating</option><option value="yrs">Seasons</option></select>
        </div>
        <div class="panel" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Player</th><th>Pos</th><th class="hide-sm">Years</th><th class="num">Peak</th><th class="hide-sm">Rating by season</th><th class="hide-sm">Honors</th></tr></thead><tbody id="legends"></tbody></table></div>
      </div>

      ${T.retired.length ? `<div class="block" id="t-retired"><div class="bh"><div><h2>Retired numbers</h2><p class="hint">With the mod, numbers retired after your start season are retired when they really were.</p></div></div>
        <div class="retired">${[...T.retired].sort((a, b) => a.season - b.season).map(x => `<div class="rj">${jersey(T.colors, x.num, 42)}<div><b>${esc(x.text)}</b><small>#${esc(x.num)} · retired ${x.season || ''}</small></div></div>`).join('')}</div></div>` : ''}
      <div style="height:80px"></div>
      </div>`;

    $('#tswitch').onchange = e => { location.hash = 'team/' + e.target.value; };
    document.querySelectorAll('.lookwrap .arr').forEach(b => b.onclick = () => b.parentNode.querySelector('.looks').scrollBy({ left: 470 * b.dataset.d, behavior: 'smooth' }));

    // Season slider: at most one update per frame, and the card area keeps its height so nothing jumps
    const sr = $('#srange');
    const showSeason = i => {
      const y = years[i], s = T.seasons[i];
      $('#syr').textContent = y;
      $('#srec').innerHTML = `${esc(s.n)} · ${s.w}–${s.l}${s.t ? '–' + s.t : ''}${T.champs.includes(y) ? ' · ★ Champions' : s.po >= 0 ? ' · Playoffs' : ''}`;
      $('#roster').innerHTML = (T.seasonBest[y] || []).map(id => {
        const p = byId[id], x = p.s.find(r => r[0] === y);
        return `<div class="pc" data-id="${id}"><div class="ovr" style="background:${ovrColor(x[1])}">${x[1]}</div><div><b>${esc(p.n)}</b><small>${x[2]}${x[4] ? ' · #' + esc(x[4]) : ''} · ${statText(x)}</small></div></div>`;
      }).join('') || '<p class="muted">No rated players this season.</p>';
      document.querySelectorAll('.bars .b').forEach(b => b.classList.toggle('sel', +b.dataset.y === y));
    };
    let pending = false;
    sr.oninput = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; showSeason(+sr.value); }); };
    showSeason(+sr.value);
    $('#roster').onclick = e => { const el = e.target.closest('.pc'); if (el) openPlayer(byId[el.dataset.id], T); };

    const tip = $('#tip');
    $('#bars').addEventListener('mousemove', e => {
      const b = e.target.closest('.b'); if (!b) { tip.style.display = 'none'; return; }
      const s = T.seasons.find(x => x.y === +b.dataset.y);
      tip.innerHTML = `<b>${s.y}</b> · ${s.w}–${s.l}${s.t ? '–' + s.t : ''}<br>${esc(s.n)}${T.champs.includes(s.y) ? '<br>★ Champions' : s.po >= 0 ? '<br>Playoffs' : ''}`;
      tip.style.display = 'block'; tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + 'px'; tip.style.top = e.clientY + 14 + 'px';
    });
    $('#bars').addEventListener('mouseleave', () => tip.style.display = 'none');
    $('#bars').addEventListener('click', e => {
      const b = e.target.closest('.b'); if (!b) return;
      sr.value = years.indexOf(+b.dataset.y); showSeason(+sr.value);
      $('#t-best').scrollIntoView({ behavior: 'smooth' });
    });

    const draw = () => {
      const q = $('#q').value.toLowerCase(), pos = $('#pos').value, sort = $('#sort').value;
      const list = players.filter(p => (!q || p.n.toLowerCase().includes(q)) && (!pos || p.pos === pos))
        .sort((a, b) => sort === 'peak' ? b.peak - a.peak : sort === 'yrs' ? b.s.length - a.s.length : b.av - a.av).slice(0, 60);
      $('#legends').innerHTML = list.map(p => {
        const ys = p.s.map(x => x[0]);
        return `<tr data-id="${p.id}"><td><b>${esc(p.n)}</b></td><td>${p.pos}</td><td class="hide-sm">${range(Math.min(...ys), Math.max(...ys))}</td>
          <td class="num"><b style="color:${ovrColor(p.peak)}">${p.peak}</b></td><td class="hide-sm">${spark(p.s)}</td>
          <td class="hide-sm">${honors(p)}</td></tr>`;
      }).join('');
    };
    ['q', 'pos', 'sort'].forEach(id => $('#' + id).addEventListener('input', draw));
    draw();
    $('#legends').onclick = e => { const el = e.target.closest('tr'); if (el) openPlayer(byId[el.dataset.id], T); };
  }

  const honors = p => (p.hof ? '<span class="badge hof">Hall of Fame</span>' : '') + Object.entries(p.aw).map(([k, v]) => `<span class="badge">${v > 1 ? v + '× ' : ''}${k}</span>`).join('');
  // Start on the last complete season (the current one is still in progress)
  const defaultIdx = T => { const n = T.seasons.length, last = T.seasons[n - 1]; return last && last.w + last.l + last.t < 14 && n > 1 ? n - 2 : n - 1; };
  // The jersey number to show on a look: the franchise's best player's number in that era
  function num(T, l) {
    if (T.tid === 0 && l.from <= 2022 && l.to >= 2004) return { n: '11', who: 'Larry Fitzgerald' }; // Larry's years in Arizona
    let best = null, who = '';
    for (const p of T.players) for (const x of p.s) if (x[0] >= l.from && x[0] <= l.to && x[4] && (!best || x[1] > best[1])) { best = x; who = p.n; }
    return best ? { n: best[4], who } : { n: '', who: '' };
  }
  const statText = x => { if (x[2] === 'OL') return x[3] + ' games'; const out = []; for (let i = 5; i < x.length; i += 2) out.push(`${Number(x[i]).toLocaleString()} ${x[i + 1]}`); return out.join(' · '); };
  function spark(s, w = 140, h = 30) {
    const pts = s.map(x => x[1]);
    if (pts.length < 2) return `<svg class="spark" width="${w}" height="${h}"><circle cx="4" cy="${h - (pts[0] - 30) / 60 * h}" r="3" fill="var(--teamc)"/></svg>`;
    const xs = i => 3 + i * (w - 6) / (pts.length - 1), ys = v => h - 3 - (Math.max(30, Math.min(90, v)) - 30) / 60 * (h - 6);
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="var(--teamc)" stroke-width="2" stroke-linejoin="round" points="${pts.map((v, i) => xs(i) + ',' + ys(v)).join(' ')}"/><circle cx="${xs(pts.indexOf(Math.max(...pts)))}" cy="${ys(Math.max(...pts))}" r="3" fill="var(--ink)"/></svg>`;
  }

  // GitHub's report form, pre-filled with the player, his latest season here (named by the year it ends, like the
  // game) and his rating, so a report takes one tap
  function reportRating(p, T) {
    const last = p.s[p.s.length - 1];
    const q = new URLSearchParams({ template: 'rating.yml', title: `[Rating] ${p.n}, ${last[0] + 1}`, player: p.n, season: String(last[0] + 1), shown: `${last[1]} overall at ${last[2]} (${T.region} ${T.name})` });
    return REPO + '/issues/new?' + q.toString();
  }
  function openPlayer(p, T) {
    const W = 700, H = 210, pad = 30, s = p.s;
    const xs = i => pad + i * (W - pad * 2) / Math.max(1, s.length - 1), ys = v => H - pad - (Math.max(30, Math.min(90, v)) - 30) / 60 * (H - pad * 2);
    const grid = [40, 50, 60, 70, 80, 90].map(v => `<line x1="${pad}" x2="${W - pad}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--line)"/><text x="${pad - 6}" y="${ys(v) + 4}" text-anchor="end" font-size="11" font-family="IBM Plex Mono,monospace" fill="var(--muted)">${v}</text>`).join('');
    const chart = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Rating by season">${grid}
      <polyline fill="none" stroke="var(--teamc)" stroke-width="3" stroke-linejoin="round" points="${s.map((x, i) => xs(i) + ',' + ys(x[1])).join(' ')}"/>
      ${s.map((x, i) => `<circle cx="${xs(i)}" cy="${ys(x[1])}" r="4.5" fill="${ovrColor(x[1])}" stroke="var(--panel)" stroke-width="2"><title>${x[0]}: ${x[1]}</title></circle>`).join('')}
      ${s.map((x, i) => (s.length < 14 || i % 2 === 0) ? `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle" font-size="11" font-family="IBM Plex Mono,monospace" fill="var(--muted)">${String(x[0]).slice(2)}</text>` : '').join('')}
    </svg>`;
    const lastNum = [...s].reverse().find(x => x[4]);
    const fitz = p.n === 'Larry Fitzgerald' ? `<div class="egg-fitz"><b>Larry Legend.</b> 17 seasons, all of them in Arizona. <b>17,492</b> receiving yards and <b>1,432</b> catches, both 2nd all-time behind only Jerry Rice. Famous for never dropping the ball and for answering every interview like a kind uncle. Hands: illegal in several states.</div>` : '';
    $('#dcard').innerHTML = `
      <div class="top">${jersey(T.colors, lastNum ? lastNum[4] : '', 70)}
        <div><div class="eyebrow">${esc(T.region)} ${esc(T.name)} · ${p.pos}</div><h3>${esc(p.n)}</h3><div style="margin-top:8px">${honors(p)}</div></div>
        <button class="close" aria-label="Close">×</button></div>
      ${fitz}
      <p class="muted" style="font-size:14px;margin:18px 0 6px">Rating by season with the ${esc(T.name)} · <a data-goatcounter-click="report-rating-player" target="_blank" rel="noopener" href="${reportRating(p, T)}">Rating look wrong? Report it</a></p>
      ${chart}
      <table class="tbl" style="margin-top:12px"><thead><tr><th>Season</th><th class="num">Rating</th><th>Pos</th><th class="num">GP</th><th>Stats</th></tr></thead>
      <tbody>${s.map(x => `<tr style="cursor:default"><td>${x[0]}</td><td class="num"><b style="color:${ovrColor(x[1])}">${x[1]}</b></td><td>${x[2]}</td><td class="num">${x[3]}</td><td>${statText(x)}</td></tr>`).join('')}</tbody></table>`;
    $('#dcard .close').onclick = closeDrawer;
    $('#drawer').classList.add('on');
    if (fitz) toast('You found the GOAT. Respect.');
  }
  const closeDrawer = () => $('#drawer').classList.remove('on');
  // A Cardinals fan made this site, sorry in advance
  const CARDS_NOTES = [
    'The emotional support franchise of the NFL. Founded 1898, still waiting.',
    "2008: We don't talk about the last 35 seconds of Super Bowl XLIII.",
    'Chicago, then St. Louis, then Arizona. The Cardinals have been disappointing fans in three time zones.',
    'Fun fact: the oldest continuously run pro football team. Also a fact: 0 titles since 1947.',
  ];

  // Capture mode for README images: ?shot=<block>&teams=29,30 renders just that block
  async function shotMode(mode) {
    const q = new URLSearchParams(location.search);
    document.documentElement.setAttribute('data-theme', q.get('theme') || 'dark');
    TEAMS = await data('teams');
    const tids = (q.get('teams') || '29').split(',').map(Number);
    const root = document.createElement('div');
    root.style.cssText = 'padding:28px;display:flex;flex-direction:column;gap:18px';
    const blocks = [];
    for (const tid of mode === 'looks' ? tids : tids.slice(0, 1)) {
      const T = await loadTeam(tid);
      renderTeam(T); $('#team').classList.add('on');
      if (mode === 'looks') {
        const st = document.createElement('style'); st.textContent = '.looks{flex-wrap:wrap;overflow:visible}.look{flex:0 0 190px}.lookwrap .arr{display:none}'; document.head.appendChild(st);
        const blk = $('#t-looks'); blk.querySelector('h2').innerHTML = `<span style="display:flex;align-items:center;gap:12px"><img src="${T.logo}" style="width:44px;height:44px;object-fit:contain">${esc(T.region)} ${esc(T.name)}</span>`;
        blk.querySelector('.hint').remove(); blk.querySelector('.rep').remove(); blk.style.padding = '0'; blocks.push(blk);
      } else if (mode === 'header') { $('.tswitch').remove(); blocks.push($('.thead')); }
      else if (mode === 'chart') { document.querySelectorAll('.bars .sel').forEach(b => b.classList.remove('sel')); blocks.push($('.chart')); }
      else if (mode === 'roster') {
        const s = q.get('season'); if (s) { const sr = $('#srange'); sr.value = T.seasons.findIndex(x => x.y === +s); sr.oninput(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }
        blocks.push($('#t-best'));
      } else if (mode === 'legends') blocks.push($('#t-legends'));
      else if (mode === 'player') {
        openPlayer(T.players.find(x => x.n === q.get('name')) || T.players[0], T);
        const card = $('#dcard'); card.style.cssText += ';max-height:none;border:1px solid var(--line);border-top:4px solid var(--teamc)';
        card.querySelector('.close').remove(); card.querySelectorAll('tbody tr').forEach((r, i) => { if (i >= 8) r.remove(); });
        blocks.push(card);
      }
    }
    blocks.forEach(b => root.appendChild(b));
    document.body.innerHTML = ''; document.body.appendChild(root);
  }

  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  document.addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });
  const mode = new URLSearchParams(location.search).get('shot');
  mode ? shotMode(mode) : init();
})();
