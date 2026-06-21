/* =========================================================================
 * Daily Detective — Case Completeness Certificate
 * -------------------------------------------------------------------------
 * Deterministically audits EVERY case (the full daily rotation + a random
 * spread) against one formula: each must have EXACTLY ONE solution, that
 * solution must be reachable, and the clues must be sufficient to deduce it
 * with no guessing. Also reports evidence-prose coverage. Exits non-zero on
 * any failure so it can gate a release.
 *
 * Run:  node tools/verify.js [dailyDays]      (default 2000 days)
 * ====================================================================== */
var E = require('../engine.js');
var THEMES = require('../themes.js');
var PROSE = require('../prose.js');

var DAYS = parseInt(process.argv[2], 10) || 2000;
var RND_PER_THEME = 250;
var tally = { n: 0, ok: 0, unique: 0, solvable: 0, sufficient: 0, minimal: 0 };
var fails = [];

function audit(label, theme, seed) {
  var p = E.generate(theme, seed);
  if (!p) { fails.push(label + ' — generation failed'); return; }
  var v = E.verify(p);
  tally.n++;
  ['ok', 'unique', 'solvable', 'sufficient', 'minimal'].forEach(function (k) { if (v[k]) tally[k]++; });
  if (!v.ok) fails.push(label + ' — NOT ok ' + JSON.stringify(v));
}

for (var d = 0; d < DAYS; d++) {
  var th = THEMES[((d % THEMES.length) + THEMES.length) % THEMES.length];
  audit('daily#' + (d + 1) + ' (' + th.id + ')', th, E.hashStr('daily:' + d));
}
THEMES.forEach(function (theme) {
  for (var s = 0; s < RND_PER_THEME; s++) audit('random ' + theme.id + ' #' + s, theme, E.hashStr('rnd:' + theme.id + ':' + s));
});

// ---- evidence-prose coverage (bespoke vs templated-flavor fallback) ----
function clueKey(c) {
  if (c.kind === 'either') return { kind: 'either', cat: c.opts[0][0] };
  var a = c.e1, b = c.e2; if (a[0] > b[0]) { var t = a; a = b; b = t; }
  return { kind: c.kind, key: a[0] + '_' + b[0] };
}
function hasProse(themeId, c) {
  var bank = PROSE[themeId]; if (!bank) return false; var k = clueKey(c);
  if (k.kind === 'either') return !!(bank.either && bank.either[k.cat] && bank.either[k.cat].length);
  var pool = (k.kind === 'pos' ? bank.pos : bank.neg);
  return !!(pool && pool[k.key] && pool[k.key].length);
}
var totalClues = 0, bespoke = 0;
THEMES.forEach(function (theme) {
  for (var s = 0; s < 200; s++) {
    var p = E.generate(theme, E.hashStr('cov:' + theme.id + ':' + s));
    p.clues.forEach(function (c) { totalClues++; if (hasProse(theme.id, c)) bespoke++; });
  }
});

// prose integrity: every template must name its entities, so a displayed clue is
// never ambiguous about which fact it conveys (the logic line is no longer shown).
var proseChecked = 0;
THEMES.forEach(function (theme) {
  var bank = PROSE[theme.id]; if (!bank) return;
  function checkPool(kind, pool, slots) {
    Object.keys(pool || {}).forEach(function (key) {
      (pool[key] || []).forEach(function (t) {
        proseChecked++;
        slots.forEach(function (sl) { if (t.indexOf(sl) < 0) fails.push('prose ' + theme.id + ' ' + kind + ' ' + key + ' missing ' + sl + ': "' + t + '"'); });
      });
    });
  }
  checkPool('pos', bank.pos, ['{a}', '{b}']);
  checkPool('neg', bank.neg, ['{a}', '{b}']);
  checkPool('either', bank.either, ['{who}', '{x}', '{y}']);
  // either clues must convey exactly-one in prose alone (the logic line is hidden):
  // a clear alternation marker AND no hedge that implies both/neither/inconclusive.
  Object.keys(bank.either || {}).forEach(function (key) {
    (bank.either[key] || []).forEach(function (t) {
      proseChecked++;
      var hasAlt = /\beither\b|one or the other|one place or the other|one of the two|one of them|not both/i.test(t);
      var undercut = /\bneither\b|somewhere between|no clear line|no proof|inconclusive|both seemed|maybe both/i.test(t);
      if (!hasAlt || undercut)
        fails.push('prose ' + theme.id + ' either ' + key + ' must assert exactly-one: "' + t + '"');
    });
  });
});

function pct(n, dd) { return dd ? (Math.round(1000 * n / dd) / 10) : 0; }
console.log('\n============  CASE COMPLETENESS CERTIFICATE  ============');
console.log('Audited ' + tally.n + ' cases (' + DAYS + ' daily + ' + (THEMES.length * RND_PER_THEME) + ' random)\n');
console.log('  Exactly one solution (unique)   ' + pct(tally.unique, tally.n) + '%  (' + tally.unique + '/' + tally.n + ')');
console.log('  Has a solution (solvable)       ' + pct(tally.solvable, tally.n) + '%');
console.log('  Enough clues (no guessing)      ' + pct(tally.sufficient, tally.n) + '%');
console.log('  No redundant clues (minimal)    ' + pct(tally.minimal, tally.n) + '%');
console.log('  Fully certified (ok)            ' + pct(tally.ok, tally.n) + '%\n');
console.log('  Evidence-prose coverage         ' + pct(bespoke, totalClues) + '%  (' + bespoke + '/' + totalClues + ' clues bespoke; rest use templated flavor)');
console.log('  Prose names its entities        ' + (fails.some(function (f) { return f.indexOf('prose ') === 0; }) ? 'FAIL' : 'OK') + '  (' + proseChecked + ' templates checked)');
if (fails.length) {
  console.log('\nFAILURES (' + fails.length + '):');
  fails.slice(0, 20).forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('========================================================\n');
  process.exit(1);
}
console.log('\nEvery audited case is uniquely & fairly solvable. ✓');
console.log('========================================================\n');
process.exit(0);
