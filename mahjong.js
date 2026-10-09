// バンブー麻雀（索子のみ）の向聴数・待ち・受け入れ計算。ブラウザと Node（tools/build.js）で共用する。
(function (root) {
  'use strict';
  const api = {};

  // N 枚の手牌（各牌 0〜4 枚）を全列挙する。順序は決定的で、data/hands.js の並びと一致させる。
  api.enumerate = function (N) {
    const out = [];
    const c = new Array(9).fill(0);
    (function rec(i, left) {
      if (i === 9) { if (left === 0) out.push(c.slice()); return; }
      for (let k = Math.min(4, left); k >= 0; k--) { c[i] = k; rec(i + 1, left - k); }
      c[i] = 0;
    })(0, N);
    return out;
  };

  // ---- 一般形の向聴数 ----
  // memo: 添字 i 以降の枚数列 + 雀頭使用フラグ -> 到達可能な (面子数<<4 | 塔子数) の集合
  const memo = new Map();
  const cnt = new Array(9).fill(0);
  function g(i, pairUsed) {
    while (i < 9 && cnt[i] === 0) i++;
    if (i >= 9) return [0];
    let key = (pairUsed ? 'p' : 'n') + i;
    for (let j = i; j < 9; j++) key += cnt[j];
    let r = memo.get(key);
    if (r) return r;
    const set = new Set();
    const add = (res, dm, dt) => { for (const v of res) set.add((((v >> 4) + dm) << 4) | ((v & 15) + dt)); };
    if (cnt[i] >= 3) { cnt[i] -= 3; add(g(i, pairUsed), 1, 0); cnt[i] += 3; }
    if (i <= 6 && cnt[i + 1] > 0 && cnt[i + 2] > 0) { cnt[i]--; cnt[i + 1]--; cnt[i + 2]--; add(g(i, pairUsed), 1, 0); cnt[i]++; cnt[i + 1]++; cnt[i + 2]++; }
    if (!pairUsed && cnt[i] >= 2) { cnt[i] -= 2; add(g(i, 1), 0, 0); cnt[i] += 2; }
    if (cnt[i] >= 2) { cnt[i] -= 2; add(g(i, pairUsed), 0, 1); cnt[i] += 2; }
    if (i <= 7 && cnt[i + 1] > 0) { cnt[i]--; cnt[i + 1]--; add(g(i, pairUsed), 0, 1); cnt[i]++; cnt[i + 1]++; }
    if (i <= 6 && cnt[i + 2] > 0) { cnt[i]--; cnt[i + 2]--; add(g(i, pairUsed), 0, 1); cnt[i]++; cnt[i + 2]++; }
    { const k = cnt[i]; cnt[i] = 0; add(g(i + 1, pairUsed), 0, 0); cnt[i] = k; }
    r = [...set];
    memo.set(key, r);
    return r;
  }
  function stdFormula(m, me, t, p) {
    if (me + t > m) t = m - me;
    return 2 * m - 2 * me - t - p;
  }
  // 雀頭なし／雀頭ありの 2 通りを評価して最小の向聴数を返す
  api.stdShanten = function (c, m) {
    for (let j = 0; j < 9; j++) cnt[j] = c[j];
    let best = 99;
    for (const v of g(0, 1)) best = Math.min(best, stdFormula(m, v >> 4, v & 15, 0));
    for (let t = 0; t < 9; t++) {
      if (cnt[t] >= 2) {
        cnt[t] -= 2;
        for (const v of g(0, 1)) best = Math.min(best, stdFormula(m, v >> 4, v & 15, 1));
        cnt[t] += 2;
      }
    }
    return best;
  };
  api.clearMemo = function () { memo.clear(); };

  // ---- 七対子（13 枚または 14 枚のときだけ有効。4 枚持ちは 1 対子扱い） ----
  api.chiitoiShanten = function (c) {
    let pairs = 0, kinds = 0;
    for (const k of c) { if (k >= 2) pairs++; if (k >= 1) kinds++; }
    return 6 - pairs + Math.max(0, 7 - kinds);
  };

  api.mentsuTarget = function (N) { return Math.floor(N / 3); }; // 13→4, 10→3, 7→2, 4→1, 14→4

  // 向聴数（-1 = 和了形）。N は手牌枚数。
  api.shanten = function (c, N) {
    const m = api.mentsuTarget(N);
    let s = api.stdShanten(c, m);
    if (N === 13 || N === 14) s = Math.min(s, api.chiitoiShanten(c));
    return s;
  };

  // 1 枚加えると向聴数が下がる牌のビットマスク（bit t = t+1 索）。
  // テンパイなら待ち牌、そうでなければ受け入れ牌。形で判定し、自分で 4 枚使い切っている牌も含める。
  api.advanceMask = function (c, N) {
    const s = api.shanten(c, N);
    let mask = 0;
    const h = c.slice();
    for (let t = 0; t < 9; t++) {
      h[t]++;
      if (api.shanten(h, N + 1) < s) mask |= 1 << t;
      h[t]--;
    }
    return mask;
  };

  // ---- 和了形の分解（待ちの形の説明用） ----
  // 返り値: [[{type:'kotsu'|'shuntsu'|'pair', start}], ...]
  api.agariDecomps = function (c, m) {
    const h = c.slice();
    const out = [];
    const blocks = [];
    function rec(i, me, pair) {
      while (i < 9 && h[i] === 0) i++;
      if (i >= 9) { if (me === m && pair) out.push(blocks.slice()); return; }
      if (h[i] >= 3) { h[i] -= 3; blocks.push({ type: 'kotsu', start: i }); rec(i, me + 1, pair); blocks.pop(); h[i] += 3; }
      if (i <= 6 && h[i + 1] > 0 && h[i + 2] > 0) {
        h[i]--; h[i + 1]--; h[i + 2]--; blocks.push({ type: 'shuntsu', start: i }); rec(i, me + 1, pair); blocks.pop(); h[i]++; h[i + 1]++; h[i + 2]++;
      }
      if (!pair && h[i] >= 2) { h[i] -= 2; blocks.push({ type: 'pair', start: i }); rec(i, me, true); blocks.pop(); h[i] += 2; }
    }
    rec(0, 0, false);
    return out;
  };

  // 待ち牌 t（0〜8）の形の名前の集合
  api.waitShapes = function (c, N, t) {
    const names = new Set();
    const h = c.slice(); h[t]++;
    const m = api.mentsuTarget(N);
    for (const d of api.agariDecomps(h, m)) {
      for (const b of d) {
        if (b.type === 'pair' && b.start === t) names.add('単騎');
        else if (b.type === 'kotsu' && b.start === t) names.add('シャンポン');
        else if (b.type === 'shuntsu') {
          if (t === b.start + 1) names.add('カンチャン');
          else if (t === b.start + 2 && b.start === 0) names.add('ペンチャン');
          else if (t === b.start && b.start === 6) names.add('ペンチャン');
          else if (t === b.start || t === b.start + 2) names.add('両面');
        }
      }
    }
    if (N === 13 && api.chiitoiShanten(h) === -1) names.add('七対子');
    return [...names];
  };

  // 向聴数の説明用に、最良の分解をひとつ返す（面子・雀頭・塔子・孤立牌）
  api.bestDecomp = function (c, N) {
    const m = api.mentsuTarget(N);
    const h = c.slice();
    let best = null, bestS = 99, bestScore = -1;
    const blocks = [];
    function rec(i, me, ta, pair) {
      while (i < 9 && h[i] === 0) i++;
      if (i >= 9) {
        const s = stdFormula(m, me, ta, pair ? 1 : 0);
        const score = me * 10 + ta + (pair ? 5 : 0);
        if (s < bestS || (s === bestS && score > bestScore)) { bestS = s; bestScore = score; best = blocks.slice(); }
        return;
      }
      if (h[i] >= 3) { h[i] -= 3; blocks.push({ type: 'kotsu', tiles: [i, i, i] }); rec(i, me + 1, ta, pair); blocks.pop(); h[i] += 3; }
      if (i <= 6 && h[i + 1] > 0 && h[i + 2] > 0) {
        h[i]--; h[i + 1]--; h[i + 2]--; blocks.push({ type: 'shuntsu', tiles: [i, i + 1, i + 2] }); rec(i, me + 1, ta, pair); blocks.pop(); h[i]++; h[i + 1]++; h[i + 2]++;
      }
      if (!pair && h[i] >= 2) { h[i] -= 2; blocks.push({ type: 'pair', tiles: [i, i] }); rec(i, me, ta, true); blocks.pop(); h[i] += 2; }
      if (me + ta < m) {
        if (h[i] >= 2) { h[i] -= 2; blocks.push({ type: 'taatsu', tiles: [i, i] }); rec(i, me, ta + 1, pair); blocks.pop(); h[i] += 2; }
        if (i <= 7 && h[i + 1] > 0) { h[i]--; h[i + 1]--; blocks.push({ type: 'taatsu', tiles: [i, i + 1] }); rec(i, me, ta + 1, pair); blocks.pop(); h[i]++; h[i + 1]++; }
        if (i <= 6 && h[i + 2] > 0) { h[i]--; h[i + 2]--; blocks.push({ type: 'taatsu', tiles: [i, i + 2] }); rec(i, me, ta + 1, pair); blocks.pop(); h[i]++; h[i + 2]++; }
      }
      { const k = h[i]; h[i] = 0; for (let q = 0; q < k; q++) blocks.push({ type: 'iso', tiles: [i] }); rec(i + 1, me, ta, pair); blocks.length -= k; h[i] = k; }
    }
    rec(0, 0, 0, false);
    const me = best.filter(b => b.type === 'kotsu' || b.type === 'shuntsu').length;
    const ta = best.filter(b => b.type === 'taatsu').length;
    const pair = best.some(b => b.type === 'pair');
    return { blocks: best, shanten: bestS, mentsu: me, taatsu: ta, pair, m };
  };

  // ---- データのエンコード（1 手牌 = 2 文字、12bit: 向聴数<<9 | 待ち/受け入れマスク） ----
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  api.encode = function (shanten, mask) {
    const v = (shanten << 9) | mask;
    return ALPHA[v >> 6] + ALPHA[v & 63];
  };
  api.decodeAt = function (str, idx) {
    const v = (ALPHA.indexOf(str[idx * 2]) << 6) | ALPHA.indexOf(str[idx * 2 + 1]);
    return { shanten: v >> 9, mask: v & 511 };
  };

  // 枚数配列 <-> 牌の並び（0〜8）
  api.countsToTiles = function (c) { const t = []; for (let i = 0; i < 9; i++) for (let k = 0; k < c[i]; k++) t.push(i); return t; };
  api.countsToString = function (c) { return api.countsToTiles(c).map(t => t + 1).join('') + 's'; };

  root.Bamboo = api;
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
