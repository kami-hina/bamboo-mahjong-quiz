// 全手牌を列挙して向聴数と待ち／受け入れを計算し、data/hands.js を生成する。
//   node tools/build.js
const path = require('path');
const fs = require('fs');
const { Bamboo } = require(path.join(__dirname, '..', 'mahjong.js'));

const SIZES = [13, 10, 7, 4];
const data = { generated: new Date().toISOString().slice(0, 10), sizes: {} };
for (const N of SIZES) {
  const t0 = Date.now();
  const hands = Bamboo.enumerate(N);
  const dist = {}, waits = {};
  const parts = [];
  for (const h of hands) {
    const s = Bamboo.shanten(h, N);
    const mask = Bamboo.advanceMask(h, N);
    dist[s] = (dist[s] || 0) + 1;
    if (s === 0) { let w = 0; for (let t = 0; t < 9; t++) if (mask & (1 << t)) w++; waits[w] = (waits[w] || 0) + 1; }
    parts.push(Bamboo.encode(s, mask));
  }
  data.sizes[N] = { total: hands.length, shanten: dist, waits, str: parts.join('') };
  console.log(N + '枚: ' + hands.length + ' 通り, 向聴分布 ' + JSON.stringify(dist) + ', 待ち数分布 ' + JSON.stringify(waits) + ', ' + (Date.now() - t0) + 'ms');
}
const out = '// tools/build.js が生成。手で編集しない。\nwindow.BAMBOO_DATA = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'data', 'hands.js'), out);
console.log('data/hands.js を書き出しました');
