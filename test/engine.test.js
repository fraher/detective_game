/* Node test harness for the deduction engine. Run: node test/engine.test.js */
var E = require('../engine.js');
var THEMES = require('../themes.js');

var fails = 0, checks = 0;
function assert(cond, msg) { checks++; if (!cond) { fails++; console.error('  ✗ ' + msg); } }

// Verify a puzzle's clues are all TRUE for its stated solution.
function cluesConsistent(p) {
  var sol = p.solution; // sol[s] = [valueIdx per cat]
  function suspOf(cat, val) { for (var s = 0; s < sol.length; s++) if (sol[s][cat] === val) return s; return -1; }
  function linked(c1, v1, c2, v2) { return suspOf(c1, v1) === suspOf(c2, v2); }
  for (var i = 0; i < p.clues.length; i++) {
    var c = p.clues[i];
    if (c.kind === 'pos' && !linked(c.e1[0], c.e1[1], c.e2[0], c.e2[1])) return false;
    if (c.kind === 'neg' && linked(c.e1[0], c.e1[1], c.e2[0], c.e2[1])) return false;
    if (c.kind === 'either') {
      var a = c.a, o1 = c.opts[0], o2 = c.opts[1];
      var l1 = linked(a[0], a[1], o1[0], o1[1]), l2 = linked(a[0], a[1], o2[0], o2[1]);
      if (!(l1 ^ l2)) return false; // exactly one must hold
    }
  }
  return true;
}

console.log('Generating puzzles across all themes and many seeds...');
var total = 0, diffCount = {};
THEMES.forEach(function (theme) {
  for (var seed = 0; seed < 50; seed++) {
    var p = E.generate(theme, E.hashStr(theme.id + ':' + seed));
    assert(p !== null, theme.id + ' seed ' + seed + ' generated');
    if (!p) continue;
    total++;
    diffCount[p.difficulty] = (diffCount[p.difficulty] || 0) + 1;

    // 1) unique solution
    var empty = E.emptyGrid(p.cats);
    assert(E.countSolutions(p.cats, p.clues, empty, 2) === 1, theme.id + ' seed ' + seed + ' unique solution');
    // 1b) solvable by pure logic, no guessing (fairness guarantee)
    assert(E.propagationSolvable(p.cats, p.clues), theme.id + ' seed ' + seed + ' solvable without guessing');
    // 1c) the deterministic completeness certificate agrees (unique + solvable + sufficient)
    assert(E.verify(p).ok, theme.id + ' seed ' + seed + ' verify().ok');
    // 2) clues consistent with solution
    assert(cluesConsistent(p), theme.id + ' seed ' + seed + ' clues consistent');
    // 3) minimal: removing any clue breaks logical solvability
    var minimal = true;
    for (var k = 0; k < p.clues.length; k++) {
      var trial = p.clues.slice(0, k).concat(p.clues.slice(k + 1));
      if (E.propagationSolvable(p.cats, trial)) { minimal = false; break; }
    }
    assert(minimal, theme.id + ' seed ' + seed + ' clue set is minimal');
    // 4) culprit is the suspect tied to the guilt element
    assert(p.solution[p.culprit][p.guilt.cat] === p.guilt.value, theme.id + ' seed ' + seed + ' culprit correct');

    // 5) investigation: a location+suspect source per value, every clue discoverable once
    var N = p.cats[0].values.length;
    assert(Array.isArray(p.sources) && p.sources.length === 2 * N, theme.id + ' seed ' + seed + ' has location+suspect sources');
    var union = {};
    p.sources.forEach(function (s) { s.clueIdx.forEach(function (ix) { union[ix] = (union[ix] || 0) + 1; }); });
    var everyClueOnce = p.clues.every(function (_, ix) { return union[ix] === 1; });
    assert(everyClueOnce, theme.id + ' seed ' + seed + ' every clue attached to exactly one source');
    // searching ALL sources surfaces ALL clues -> case is always solvable within budget
    assert(Object.keys(union).length === p.clues.length, theme.id + ' seed ' + seed + ' all clues reachable by searching every source');
    assert(p.minSearches >= 1 && p.minSearches <= p.sources.length, theme.id + ' seed ' + seed + ' minSearches in range');
    // each clue carries discoverable flavor + a crisp logical restatement
    var enriched = p.clues.every(function (c) {
      return typeof c.flavor === 'string' && c.flavor.length > 0 && typeof c.logic === 'string' && c.source;
    });
    assert(enriched, theme.id + ' seed ' + seed + ' clues carry flavor + logic + source');
  }
});

// Investigation rating: every dead-end (wasted) search costs a star, floor 1.
assert(E.investigationRating(0) === 3, 'rating: no wasted searches = 3 stars');
assert(E.investigationRating(1) === 2, 'rating: one wasted search = 2 stars');
assert(E.investigationRating(3) === 1, 'rating: two+ wasted searches = 1 star');

// Accusation: the true culprit profile must never conflict; correctness detects it.
THEMES.forEach(function (theme) {
  for (var seed = 0; seed < 30; seed++) {
    var p = E.generate(theme, E.hashStr('acc:' + theme.id + ':' + seed));
    var allIdx = p.clues.map(function (_, i) { return i; });
    var cp = p.culprit, profile = { 0: cp, 1: p.solution[cp][1], 2: p.solution[cp][2], 3: p.solution[cp][3] };
    assert(E.accusationConflicts(p.cats, p.clues, allIdx, profile).clues.length === 0, theme.id + ' ' + seed + ' true culprit profile never conflicts');
    assert(E.accusationCorrect(p.solution, p.culprit, profile) === true, theme.id + ' ' + seed + ' correct accusation recognized');
    var wrong = { 0: cp, 1: (p.solution[cp][1] + 1) % p.cats[1].values.length, 2: p.solution[cp][2], 3: p.solution[cp][3] };
    assert(E.accusationCorrect(p.solution, p.culprit, wrong) === false, theme.id + ' ' + seed + ' wrong accusation rejected');
  }
});
// A pick that directly violates a known pos clue is flagged.
(function () {
  var p = E.generate(THEMES[0], 12345), c = null, ci = -1, i;
  for (i = 0; i < p.clues.length; i++) { if (p.clues[i].kind === 'pos') { c = p.clues[i]; ci = i; break; } }
  if (c) {
    var acc = {}, bump = function (cat, v) { return (v + 1) % p.cats[cat].values.length; };
    if (c.e1[0] === 0) { acc[0] = c.e1[1]; acc[c.e2[0]] = bump(c.e2[0], c.e2[1]); }
    else if (c.e2[0] === 0) { acc[0] = c.e2[1]; acc[c.e1[0]] = bump(c.e1[0], c.e1[1]); }
    else { acc[c.e1[0]] = c.e1[1]; acc[c.e2[0]] = bump(c.e2[0], c.e2[1]); }
    assert(E.accusationConflicts(p.cats, p.clues, [ci], acc).clues.indexOf(ci) >= 0, 'a pick contradicting a pos clue is flagged as a conflict');
  }
})();
// A partial accusation (attribute picked, Who not yet chosen) must not false-conflict.
(function () {
  var p = E.generate(THEMES[1], 999), c = null, ci = -1, i;
  for (i = 0; i < p.clues.length; i++) { var cl = p.clues[i]; if (cl.kind === 'pos' && (cl.e1[0] === 0 || cl.e2[0] === 0)) { c = cl; ci = i; break; } }
  if (c) {
    var sub = c.e1[0] === 0 ? c.e1 : c.e2, oth = c.e1[0] === 0 ? c.e2 : c.e1, acc = {};
    acc[oth[0]] = oth[1]; // pick only the attribute; leave Who unset
    assert(E.accusationConflicts(p.cats, p.clues, [ci], acc).clues.length === 0, 'partial accusation without Who does not false-conflict');
    acc[0] = (sub[1] + 1) % p.cats[0].values.length; // now accuse the WRONG suspect for that clued attribute
    assert(E.accusationConflicts(p.cats, p.clues, [ci], acc).clues.length === 1, 'accusing the wrong suspect for a clued attribute conflicts');
  }
})();

// Determinism: same seed -> identical puzzle text
var pa = E.generate(THEMES[0], 12345), pb = E.generate(THEMES[0], 12345);
assert(JSON.stringify(pa.clueText) === JSON.stringify(pb.clueText), 'same seed is deterministic');

// Uniqueness across "30 years" of daily puzzles (theme rotates by day).
var seen = {}, collisions = 0, DAYS = 2000;
for (var d = 0; d < DAYS; d++) {
  var th = THEMES[d % THEMES.length];
  var pp = E.generate(th, E.hashStr('daily:' + d));
  var sig = th.id + '|' + pp.clueText.slice().sort().join('§');
  if (seen[sig]) collisions++; else seen[sig] = 1;
}
assert(collisions === 0, '30 years (' + DAYS + ' days) with no repeated puzzle (collisions=' + collisions + ')');

console.log('\nGenerated ' + total + ' puzzles. Difficulty mix:', diffCount);
console.log(checks + ' checks, ' + fails + ' failures.');
process.exit(fails ? 1 : 0);
