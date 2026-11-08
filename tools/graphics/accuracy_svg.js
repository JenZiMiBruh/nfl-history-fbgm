// Builds assets/accuracy.svg from an analyze_sim.js output: each position's middle-half range of sim/real career
// totals as a bar, the median as a dot, 100% as the reference line. Dark theme to match the explorer screenshots.
const fs = require('fs');
const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const order = ['QB', 'RB', 'TE', 'LB', 'CB', 'WR', 'S', 'DL'];
const label = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Receivers', TE: 'Tight ends', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', DL: 'Pass rushers' };
const W = 1000, rowH = 46, top = 120, left = 210, right = 120, lo = 0.5, hi = 1.2;
const x = v => left + (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (W - left - right);
const H = top + order.length * rowH + 60;
let rows = '';
order.forEach((pos, i) => {
  const c = a.careers[pos], y = top + i * rowH;
  const good = c.median >= 0.9;
  rows += `<text x="${left - 18}" y="${y + 6}" text-anchor="end" class="lab">${label[pos]}</text>`;
  rows += `<text x="${left - 18}" y="${y + 22}" text-anchor="end" class="sub">${c.stat}</text>`;
  rows += `<rect x="${x(c.q25)}" y="${y - 8}" width="${x(c.q75) - x(c.q25)}" height="18" rx="9" fill="${good ? '#3fbf73' : '#c98b2b'}" opacity=".35"/>`;
  rows += `<circle cx="${x(c.median)}" cy="${y + 1}" r="9" fill="${good ? '#3fbf73' : '#f0a93b'}" stroke="#0a0e14" stroke-width="3"/>`;
  rows += `<text x="${W - right + 24}" y="${y + 7}" class="val" fill="${good ? '#3fbf73' : '#f0a93b'}">${Math.round(c.median * 100)}%</text>`;
});
const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2].map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 26}" y2="${H - 50}" stroke="${v === 1 ? '#e8efe9' : '#223029'}" ${v === 1 ? 'stroke-dasharray="5 5"' : ''}/><text x="${x(v)}" y="${H - 28}" text-anchor="middle" class="ax">${Math.round(v * 100)}%</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Barlow,'Segoe UI',Helvetica,Arial,sans-serif">
<style>.lab{fill:#e8efe9;font-size:17px;font-weight:700}.sub{fill:#93a39a;font-size:12.5px}.ax{fill:#93a39a;font-size:12.5px}.val{font-size:18px;font-weight:800}.t{fill:#e8efe9;font-size:26px;font-weight:800}.st{fill:#93a39a;font-size:14.5px}</style>
<rect width="${W}" height="${H}" rx="18" fill="#121822"/>
<text x="40" y="52" class="t">A whole career, simmed from 1966</text>
<text x="40" y="80" class="st">Sim career totals as a share of the real ones · each position's 60 biggest careers · dot = median, bar = middle half</text>
${ticks}${rows}
</svg>`;
fs.writeFileSync(process.argv[3], svg);
console.log('ok');
