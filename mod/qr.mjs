// A small QR code generator for the launcher window, so a phone can scan the game's address. No dependencies, because
// it runs before anything is installed. Byte mode, error correction L, in the smallest size from 1 to 6 that fits.
const CAPACITY = [0, 17, 32, 53, 78, 106, 134]; // bytes
const EC_WORDS = [0, 7, 10, 15, 20, 26, 18]; // per block
const BLOCKS = [0, 1, 1, 1, 1, 1, 2];
const TOTAL_WORDS = [0, 26, 44, 70, 100, 134, 172];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function errorWords(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    gen = next;
  }
  const out = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const f = out[i];
    if (f) gen.forEach((c, j) => { out[i + j] ^= mul(c, f); });
  }
  return out.slice(data.length);
}

function codewords(bytes, version) {
  const total = TOTAL_WORDS[version], blocks = BLOCKS[version], ec = EC_WORDS[version], dataLen = total - ec * blocks;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(4, 4); put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);
  const size = Math.floor(dataLen / blocks), groups = [];
  for (let i = 0; i < blocks; i++) groups.push(data.slice(i * size, (i + 1) * size));
  const out = [];
  for (let i = 0; i < size; i++) for (const g of groups) out.push(g[i]);
  const ecs = groups.map(g => errorWords(g, ec));
  for (let i = 0; i < ec; i++) for (const g of ecs) out.push(g[i]);
  return out;
}

function matrix(bytes, version) {
  const n = 17 + 4 * version;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = v ? 1 : 0; fixed[r][c] = true; } };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(r0 + r, c0 + c, on);
    }
  };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  if (version >= 2) {
    const p = n - 7;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(p + r, p + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  set(n - 8, 8, 1);
  // Format information: error correction L, mask 0
  const F = 0b111011111000100;
  const bit = i => (F >> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(14 - i));
  set(8, 7, bit(8)); set(8, 8, bit(7)); set(7, 8, bit(6));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(14 - i));
  for (let i = 0; i < 8; i++) set(8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(n - 15 + i, 8, bit(i));
  const words = codewords(bytes, version);
  const stream = [];
  for (const w of words) for (let i = 7; i >= 0; i--) stream.push((w >> i) & 1);
  let k = 0, up = true;
  for (let c = n - 1; c >= 1; c -= 2) {
    if (c === 6) c = 5;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const cc of [c, c - 1]) {
        if (fixed[r][cc]) continue;
        const b = k < stream.length ? stream[k++] : 0;
        m[r][cc] = b ^ ((r + cc) % 2 === 0 ? 1 : 0);
      }
    }
    up = !up;
  }
  return m;
}

export function qrMatrix(text) {
  const bytes = [...Buffer.from(text, 'utf8')];
  const version = CAPACITY.findIndex((c, i) => i > 0 && bytes.length <= c);
  if (version < 1) throw new Error('address too long for a QR code');
  return matrix(bytes, version);
}

// Printed with background colors, which every Windows 10+ and Mac/Linux terminal shows, two spaces per square
export function qrLines(text) {
  const m = qrMatrix(text), quiet = 2, n = m.length + quiet * 2;
  const WHITE = '\x1b[47m  \x1b[0m', BLACK = '\x1b[40m  \x1b[0m';
  const lines = [];
  for (let r = 0; r < n; r++) {
    let line = '  ';
    for (let c = 0; c < n; c++) line += m[r - quiet]?.[c - quiet] ? BLACK : WHITE;
    lines.push(line);
  }
  return lines;
}
