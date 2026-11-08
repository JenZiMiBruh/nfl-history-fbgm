// NFL History site: what every page shares. The nav, the ticker and the footer are written here once, so the pages
// only hold their own content: <body data-page="teams"> marks the current page in the nav.
(() => {
  const REPO = 'https://github.com/JenZiMiBruh/nfl-history-fbgm';
  const DL = REPO + '/releases/latest/download/';
  const PAGES = [
    ['index.html', 'home', 'Home'],
    ['teams.html', 'teams', 'Teams'],
    ['draft.html', 'draft', 'Draft'],
    ['build.html', 'build', 'Build a league'],
    ['mod.html', 'mod', 'The mod'],
    ['updates.html', 'updates', 'Updates'],
    ['guide.html', 'guide', 'How to play'],
  ];
  // Facts for the bottom line: kept short, true for every release
  const TICKER = [
    'Every NFL season since 1966', '28,700+ real players', 'Ratings built from real careers',
    'Every logo and jersey, switching on the real date', 'Real schedules, game for game', 'The real 2027–2029 drafts',
    'Start in any season, any week', 'Retirements, comebacks and suspensions on the real date',
    'Beta: found a bug? Report it on GitHub', 'Updated every week of the season',
  ];

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ball = `<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M2 20C10 4 54 4 62 20 54 36 10 36 2 20Z" fill="#8b4513" stroke="#4a210a" stroke-width="2"/><path d="M14 9c4 6 4 16 0 22M50 9c-4 6-4 16 0 22" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M22 20h20M25 16.5v7M29 16.5v7M33 16.5v7M37 16.5v7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;

  // A jersey in a team's colors: body, numbers, trim
  function jersey(c, num = '', w = 80) {
    let [body, numc, trim] = c || ['#555', '#fff', '#999'];
    // Numbers must read on the jersey: if the number color is too close to the body, use the trim color instead
    const lum = h => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000; };
    if (Math.abs(lum(body) - lum(numc)) < 90 && Math.abs(lum(body) - lum(trim)) > Math.abs(lum(body) - lum(numc))) [numc, trim] = [trim, numc];
    return `<svg viewBox="0 0 100 106" width="${w}" aria-hidden="true">
      <path d="M30 2 L40 8 Q50 13 60 8 L70 2 L98 15 L90 41 L79 37 L79 104 L21 104 L21 37 L10 41 L2 15 Z" fill="${body}" stroke="rgba(0,0,0,.25)" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M2 15 L30 2 M70 2 L98 15" stroke="${trim}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M90 41 L79 37 M10 41 L21 37" stroke="${trim}" stroke-width="5" stroke-linecap="round"/>
      <path d="M40 8 Q50 13 60 8" stroke="${trim}" stroke-width="3" fill="none"/>
      ${num !== '' ? `<text x="50" y="78" text-anchor="middle" font-family="Big Shoulders Display,Oswald,Arial Black,sans-serif" font-weight="900" font-size="42" fill="${numc}" stroke="${trim}" stroke-width="1.2" paint-order="stroke">${esc(num)}</text>` : ''}
    </svg>`;
  }
  const ovrColor = o => o >= 80 ? '#2e9e5b' : o >= 70 ? '#6aa33a' : o >= 60 ? '#b3a22c' : o >= 50 ? '#cf8a2e' : '#c2553d';

  // Site data: one file per team, fetched when needed. Opened from disk (file://, where fetch is blocked), the
  // bundle with everything is loaded instead
  let bundle;
  const loadBundle = () => bundle || (bundle = new Promise((ok, no) => {
    if (window.SITE_DATA) return ok(window.SITE_DATA);
    const s = document.createElement('script'); s.src = 'data/all.js';
    s.onload = () => ok(window.SITE_DATA); s.onerror = no; document.head.appendChild(s);
  }));
  async function data(name) {
    if (location.protocol !== 'file:') {
      try { const r = await fetch('data/' + name + '.json'); if (r.ok) return await r.json(); } catch {}
    }
    const b = await loadBundle();
    if (name === 'teams') return b.teams;
    if (name === 'draft') return b.draft;
    const m = name.match(/^team-(\d+)$/);
    return m ? b.team[+m[1]] : undefined;
  }

  // Theme: follows the device unless the visitor picks one (kept on this device only)
  const THEME_KEY = 'nflh-theme';
  try { const t = localStorage.getItem(THEME_KEY); if (t) document.documentElement.setAttribute('data-theme', t); } catch {}
  const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  function toggleTheme() {
    const t = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    const b = document.querySelector('.theme-t'); if (b) b.textContent = isDark() ? 'Light mode' : 'Dark mode';
  }

  function chrome() {
    const page = document.body.dataset.page;
    const nav = document.createElement('header');
    nav.className = 'nav';
    nav.innerHTML = `<div class="wrap">
      <a class="brand" href="index.html">${ball}<span>NFL <em>History</em></span><span class="beta" title="It works, but you may still hit bugs">Beta</span></a>
      <button class="menu" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button>
      <nav class="links" aria-label="Site">${PAGES.slice(1).map(([href, id, label]) => `<a href="${href}"${id === page ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('')}
        <a class="dl${page === 'download' ? ' on' : ''}" href="download.html">Download</a></nav>
    </div>`;
    const tick = document.createElement('div');
    tick.className = 'ticker'; tick.setAttribute('aria-hidden', 'true');
    const run = TICKER.map(t => `<span>${esc(t)}</span>`).join('');
    tick.innerHTML = `<div class="tag">NFL History</div><div class="run">${run}${run}</div>`;
    document.body.prepend(nav, tick);
    const btn = nav.querySelector('.menu');
    btn.onclick = () => { const o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o); };
    nav.querySelectorAll('.links a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

    const foot = document.createElement('footer');
    foot.className = 'foot';
    foot.innerHTML = `<div class="wrap"><div class="cols">
        <div><a class="brand" href="index.html">${ball}<span>NFL <em>History</em></span></a>
          <small>Every NFL season since 1966 for Football GM. A passion project by <b style="color:var(--hero-ink)">JenZiMiBruh</b>. Thank you, dumbmatter.</small></div>
        <div><h4>Explore</h4>${PAGES.slice(1, 4).map(([h, , l]) => `<a href="${h}">${l}</a>`).join('')}</div>
        <div><h4>Play</h4><a href="guide.html">How to play</a><a href="mod.html">The mod</a><a href="updates.html">Updates &amp; roadmap</a><a href="download.html">Download</a></div>
        <div><h4>Help out</h4><a href="${REPO}/issues/new/choose">Report a bug</a><a href="${REPO}/issues/new?template=rating.yml">Report a wrong rating</a><a href="${REPO}/issues/new?template=logo.yml">Report a wrong logo</a><a href="${REPO}">Star it on GitHub</a></div>
      </div>
      <div class="base"><span>Unofficial fan project. Team names and logos belong to the NFL and its teams. Not affiliated with the NFL or Football GM. Data: nflverse, Pro-Football-Reference via the Internet Archive, Wikipedia, OverTheCap.</span>
        <button class="theme-t" type="button">${isDark() ? 'Light mode' : 'Dark mode'}</button></div>
    </div>`;
    document.body.append(foot);
    foot.querySelector('.theme-t').onclick = toggleTheme;
  }

  // Sections ease in as they reach the screen
  function reveal() {
    const els = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 4200);
  }

  window.NFLH = { REPO, DL, esc, jersey, ovrColor, data, toast };
  const start = () => { chrome(); reveal(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // Visitor stats (GoatCounter: no cookies, no personal data)
  const gc = document.createElement('script');
  gc.async = true; gc.src = '//gc.zgo.at/count.js'; gc.dataset.goatcounter = 'https://galloade.goatcounter.com/count';
  document.head.appendChild(gc);
})();
