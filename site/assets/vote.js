// Fan votes with no account. The polls live in data/polls.json, which the mod's What's new screen reads too, so a
// poll can change without a mod update. Each vote is one GoatCounter count on its own path (vote/<poll>/<option>),
// the same cookie-free counter the site already uses, sent with GoatCounter's no-script counter so it never waits on
// their script. Totals come back from GoatCounter's public counter. This browser remembers its vote, so a second click
// changes nothing. Not tamper-proof (clearing site data allows another vote), which is fine for a fan poll.
//
// GoatCounter stores an event path without its leading slash (vote/<poll>/<option>), so it is sent and read that
// way. The mod's launcher check-ins work the same way (mod/live/<window>).
//
// Markup: <div class="poll" data-poll="browns-move"></div>
(() => {
  const GC = 'https://galloade.goatcounter.com';
  const key = id => 'nflh-vote-' + id;
  const mine = id => { try { return localStorage.getItem(key(id)); } catch { return null; } };
  const remember = (id, v) => { try { localStorage.setItem(key(id), v); } catch {} };
  const count = path => fetch(`${GC}/counter/${encodeURIComponent(path)}.json`)
    .then(r => r.ok ? r.json() : { count: '0' }).then(j => +String(j.count).replace(/[^0-9]/g, '') || 0).catch(() => 0);
  const send = (path, title) => { new Image().src = `${GC}/count?${new URLSearchParams({ p: path, t: title, e: 'true', rnd: Math.random().toString(36).slice(2) })}`; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const justVoted = {};

  async function draw(el, P) {
    const voted = mine(P.id);
    const totals = await Promise.all(P.options.map(o => count(`vote/${P.id}/${o.id}`)));
    // Your own vote shows right away, before GoatCounter has counted it
    const shown = totals.map((n, i) => n + (justVoted[P.id] === P.options[i].id ? 1 : 0));
    const sum = shown.reduce((a, b) => a + b, 0);
    el.innerHTML = `<h3>${esc(P.q)}</h3><p class="pnote">${esc(P.note)}</p>
      <div class="opts">${P.options.map((o, i) => {
        const pct = sum ? Math.round(shown[i] / sum * 100) : 0;
        return `<button class="opt${voted === o.id ? ' mine' : ''}" data-o="${esc(o.id)}" ${voted ? 'disabled' : ''} aria-pressed="${voted === o.id}">
          <span class="fill" style="width:${voted ? pct : 0}%"></span>
          <span class="txt"><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></span>
          <span class="pct">${voted ? pct + '%' : 'Vote'}</span></button>`;
      }).join('')}</div>
      <p class="pfoot">${voted ? `Thanks for voting · ${sum.toLocaleString()} ${sum === 1 ? 'vote' : 'votes'} so far` : 'No account needed. One vote per browser.'}</p>`;
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (mine(P.id)) return;
      remember(P.id, b.dataset.o);
      justVoted[P.id] = b.dataset.o;
      send(`vote/${P.id}/${b.dataset.o}`, `Vote: ${P.id} ${b.dataset.o}`);
      draw(el, P);
    });
  }

  async function start() {
    const els = document.querySelectorAll('.poll[data-poll]');
    if (!els.length) return;
    let data;
    try { data = await (await fetch('data/polls.json', { cache: 'no-cache' })).json(); } catch { return; }
    els.forEach(el => { const P = data.polls.find(p => p.id === el.dataset.poll); if (P) draw(el, P); else el.remove(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
