/* =========================================================================
 * Daily Detective — Deduction Engine
 * -------------------------------------------------------------------------
 * A self-contained logic-grid (Einstein/Zebra puzzle) engine:
 *   - deterministic PRNG (seed -> reproducible puzzle, like Wordle's daily)
 *   - a constraint solver that propagates clues to a fixpoint + branches
 *   - a generator that builds a puzzle with a GUARANTEED UNIQUE solution
 *     and a minimal, elegant clue set (real deduction, no guessing)
 *
 * No dependencies. Runs in the browser (global `DDEngine`) and in Node
 * (module.exports) so the generator can be unit-tested.
 *
 * Model
 *   A puzzle has K categories, each with N values. categories[0] is the
 *   "anchor" (the suspects). The solution assigns every suspect exactly one
 *   value from every other category (a set of permutations).
 *
 *   The solver works over C(K,2) pairwise NxN grids whose cells are:
 *       0 unknown, 1 linked (yes), -1 not linked (no)
 * ====================================================================== */
(function (root) {
  'use strict';

  /* ----- Deterministic PRNG (mulberry32) -------------------------------- */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ----- Pairwise grid helpers ----------------------------------------- */
  function emptyGrid(cats) {
    var N = cats[0].values.length, G = {};
    for (var a = 0; a < cats.length; a++) {
      for (var b = a + 1; b < cats.length; b++) {
        var M = [];
        for (var i = 0; i < N; i++) { M.push(new Array(N).fill(0)); }
        G[a + '_' + b] = M;
      }
    }
    return G;
  }
  function cloneGrid(G) {
    var out = {};
    for (var k in G) {
      var M = G[k], R = [];
      for (var i = 0; i < M.length; i++) { R.push(M[i].slice()); }
      out[k] = R;
    }
    return out;
  }
  function gl(G, a, b, i, j) { return a < b ? G[a + '_' + b][i][j] : G[b + '_' + a][j][i]; }
  function sl(G, a, b, i, j, v) { if (a < b) G[a + '_' + b][i][j] = v; else G[b + '_' + a][j][i] = v; }

  /* ----- Constraint propagation to a fixpoint --------------------------
   * Returns true if consistent, false on contradiction. Mutates G.        */
  function propagate(G, clues, cats) {
    var K = cats.length, N = cats[0].values.length, v, r, m, n, l1, l2;

    // want(a,b,i,j,val): -1 conflict, 0 no-op, 1 changed
    function want(a, b, i, j, val) {
      var cur = gl(G, a, b, i, j);
      if (cur === 0) { sl(G, a, b, i, j, val); return 1; }
      return cur === val ? 0 : -1;
    }

    var changed = true;
    while (changed) {
      changed = false;

      // 1) clue constraints
      for (var ci = 0; ci < clues.length; ci++) {
        var cl = clues[ci];
        if (cl.kind === 'pos' || cl.kind === 'neg') {
          r = want(cl.e1[0], cl.e2[0], cl.e1[1], cl.e2[1], cl.kind === 'pos' ? 1 : -1);
          if (r < 0) return false; if (r > 0) changed = true;
        } else if (cl.kind === 'either') {
          // subject `a` is linked to exactly one of two mutually-exclusive opts
          var a = cl.a[0], ai = cl.a[1], o1 = cl.opts[0], o2 = cl.opts[1];
          l1 = gl(G, a, o1[0], ai, o1[1]); l2 = gl(G, a, o2[0], ai, o2[1]);
          if (l1 === 1 && l2 === 1) return false;
          if (l1 === -1 && l2 === -1) return false;
          if (l1 === -1) { r = want(a, o2[0], ai, o2[1], 1); if (r < 0) return false; if (r > 0) changed = true; }
          if (l2 === -1) { r = want(a, o1[0], ai, o1[1], 1); if (r < 0) return false; if (r > 0) changed = true; }
          if (l1 === 1) { r = want(a, o2[0], ai, o2[1], -1); if (r < 0) return false; if (r > 0) changed = true; }
          if (l2 === 1) { r = want(a, o1[0], ai, o1[1], -1); if (r < 0) return false; if (r > 0) changed = true; }
        }
      }

      // 2) row/column uniqueness inside every pair grid
      for (var key in G) {
        var parts = key.split('_'), a2 = +parts[0], b2 = +parts[1], M2 = G[key];
        // rows
        for (m = 0; m < N; m++) {
          var yes = -1, unk = [];
          for (n = 0; n < N; n++) { if (M2[m][n] === 1) { if (yes >= 0) return false; yes = n; } else if (M2[m][n] === 0) unk.push(n); }
          if (yes >= 0) { for (var u = 0; u < unk.length; u++) { M2[m][unk[u]] = -1; changed = true; } }
          else if (unk.length === 1) { M2[m][unk[0]] = 1; changed = true; }
          else if (unk.length === 0) return false;
        }
        // cols
        for (n = 0; n < N; n++) {
          var yc = -1, uc = [];
          for (m = 0; m < N; m++) { if (M2[m][n] === 1) { if (yc >= 0) return false; yc = m; } else if (M2[m][n] === 0) uc.push(m); }
          if (yc >= 0) { for (var u2 = 0; u2 < uc.length; u2++) { M2[uc[u2]][n] = -1; changed = true; } }
          else if (uc.length === 1) { M2[uc[0]][n] = 1; changed = true; }
          else if (uc.length === 0) return false;
        }
      }

      // 3) transitivity across category triples
      for (var a3 = 0; a3 < K; a3++) {
        for (var b3 = 0; b3 < K; b3++) {
          if (b3 === a3) continue;
          for (var c3 = 0; c3 < K; c3++) {
            if (c3 === a3 || c3 === b3) continue;
            for (var i3 = 0; i3 < N; i3++) {
              for (var j3 = 0; j3 < N; j3++) {
                if (gl(G, a3, b3, i3, j3) !== 1) continue;
                for (var k3 = 0; k3 < N; k3++) {
                  var ac = gl(G, a3, c3, i3, k3), bc = gl(G, b3, c3, j3, k3);
                  if (ac === 1 && bc !== 1) { r = want(b3, c3, j3, k3, 1); if (r < 0) return false; if (r > 0) changed = true; }
                  else if (ac === -1 && bc !== -1) { r = want(b3, c3, j3, k3, -1); if (r < 0) return false; if (r > 0) changed = true; }
                  if (bc === 1 && ac !== 1) { r = want(a3, c3, i3, k3, 1); if (r < 0) return false; if (r > 0) changed = true; }
                  else if (bc === -1 && ac !== -1) { r = want(a3, c3, i3, k3, -1); if (r < 0) return false; if (r > 0) changed = true; }
                }
              }
            }
          }
        }
      }
    }
    return true;
  }

  function firstUnknown(G) {
    for (var k in G) {
      var M = G[k];
      for (var i = 0; i < M.length; i++) for (var j = 0; j < M.length; j++) if (M[i][j] === 0) {
        var p = k.split('_'); return { a: +p[0], b: +p[1], i: i, j: j };
      }
    }
    return null;
  }

  // Count solutions consistent with clues, capped at `limit`.
  function countSolutions(cats, clues, baseG, limit) {
    var G = cloneGrid(baseG);
    if (!propagate(G, clues, cats)) return 0;
    var cell = firstUnknown(G);
    if (!cell) return 1;
    var total = 0;
    var tries = [1, -1];
    for (var t = 0; t < 2; t++) {
      var H = cloneGrid(G);
      sl(H, cell.a, cell.b, cell.i, cell.j, tries[t]);
      if (propagate(H, clues, cats)) {
        total += countSolutions(cats, clues, H, limit - total);
        if (total >= limit) return total;
      }
    }
    return total;
  }

  // Does pure propagation (no branching) fully solve it? -> "fair/easy".
  function propagationSolvable(cats, clues) {
    var G = emptyGrid(cats);
    if (!propagate(G, clues, cats)) return false;
    return firstUnknown(G) === null;
  }

  /* ----- Generator ----------------------------------------------------- */
  // Build a random solution: perm[c] maps suspect index -> value index.
  function randomSolution(cats, rng) {
    var N = cats[0].values.length, perm = [null];
    for (var c = 1; c < cats.length; c++) {
      var base = [];
      for (var i = 0; i < N; i++) base.push(i);
      perm.push(shuffle(base, rng));
    }
    return perm;
  }
  function makeSuspOf(cats, perm) {
    return function (c, v) {
      if (c === 0) return v;
      for (var s = 0; s < perm[c].length; s++) if (perm[c][s] === v) return s;
      return -1;
    };
  }

  function buildCluePool(cats, perm, rng) {
    var N = cats[0].values.length, suspOf = makeSuspOf(cats, perm), pool = [];
    function linked(c1, v1, c2, v2) { return suspOf(c1, v1) === suspOf(c2, v2); }

    // positive + negative facts for every cross-category element pair
    for (var c1 = 0; c1 < cats.length; c1++) {
      for (var c2 = c1 + 1; c2 < cats.length; c2++) {
        for (var v1 = 0; v1 < N; v1++) {
          for (var v2 = 0; v2 < N; v2++) {
            pool.push({ kind: linked(c1, v1, c2, v2) ? 'pos' : 'neg', e1: [c1, v1], e2: [c2, v2] });
          }
        }
      }
    }

    // a handful of "either/or" clues (subject = a suspect, two values one cat)
    var eithers = [];
    for (var s = 0; s < N; s++) {
      for (var c = 1; c < cats.length; c++) {
        var trueV = perm[c][s];
        var others = [];
        for (var vv = 0; vv < N; vv++) if (vv !== trueV) others.push(vv);
        shuffle(others, rng);
        eithers.push({ kind: 'either', a: [0, s], opts: [[c, trueV], [c, others[0]]] });
      }
    }
    shuffle(eithers, rng);

    return { pool: pool, eithers: eithers.slice(0, N + 1) };
  }

  // Produce a minimal clue set that yields a UNIQUE solution.
  function carveMinimalSet(cats, perm, rng) {
    var built = buildCluePool(cats, perm, rng);
    // Bias toward more interesting clues first: eithers + negatives, then positives.
    var ordered = built.eithers.concat(shuffle(built.pool.slice(), rng));
    var empty = emptyGrid(cats);

    var chosen = [], solvedUnique = false;
    for (var i = 0; i < ordered.length; i++) {
      chosen.push(ordered[i]);
      if (countSolutions(cats, chosen, empty, 2) === 1) { solvedUnique = true; break; }
    }
    if (!solvedUnique) return null;

    // Greedy prune to a minimal set (drop any clue we don't need).
    for (var p = chosen.length - 1; p >= 0; p--) {
      var trial = chosen.slice(0, p).concat(chosen.slice(p + 1));
      if (countSolutions(cats, trial, empty, 2) === 1) chosen = trial;
    }
    return chosen;
  }

  // Public: generate a full puzzle object from a theme + numeric seed.
  function generate(theme, seed) {
    var rng = makeRng(seed >>> 0);
    var cats = theme.categories;
    for (var attempt = 0; attempt < 40; attempt++) {
      var perm = randomSolution(cats, rng);
      var clues = carveMinimalSet(cats, perm, rng);
      if (!clues) continue;

      var suspOf = makeSuspOf(cats, perm);
      // solution[suspectIndex] = [valueIndex per category] (index 0 == suspect)
      var solution = [];
      for (var s = 0; s < cats[0].values.length; s++) {
        var row = [s];
        for (var c = 1; c < cats.length; c++) row.push(perm[c][s]);
        solution.push(row);
      }
      var guiltCat = theme.guilt.cat, guiltVal = theme.guilt.value;
      var culprit = suspOf(guiltCat, guiltVal);

      shuffle(clues, rng); // present clues in random order
      return {
        themeId: theme.id,
        cats: cats,
        clues: clues,
        clueText: clues.map(function (c) { return renderClue(c, cats); }),
        solution: solution,
        culprit: culprit,
        guilt: theme.guilt,
        difficulty: rateDifficulty(cats, clues)
      };
    }
    return null;
  }

  function rateDifficulty(cats, clues) {
    // Two signals: needing branching (no pure-propagation path) and a leaner
    // clue set both make a puzzle harder. Combine into a 4-band score.
    var fair = propagationSolvable(cats, clues);
    var n = clues.length;
    var score = (fair ? 0 : 2) + (n <= 7 ? 1 : 0);
    return ['Easy', 'Medium', 'Hard', 'Fiendish'][Math.min(score, 3)];
  }

  /* ----- Natural-language clue rendering ------------------------------- */
  function fill(tpl, v) { return tpl.replace('{v}', v); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function subj(cats, e) { return fill(cats[e[0]].subj, cats[e[0]].values[e[1]]); }
  function pred(cats, e) { return fill(cats[e[0]].pred, cats[e[0]].values[e[1]]); }
  function negp(cats, e) { return fill(cats[e[0]].neg, cats[e[0]].values[e[1]]); }

  function renderClue(cl, cats) {
    if (cl.kind === 'pos') return cap(subj(cats, cl.e1)) + ' ' + pred(cats, cl.e2) + '.';
    if (cl.kind === 'neg') return cap(subj(cats, cl.e1)) + ' ' + negp(cats, cl.e2) + '.';
    // either
    return cap(subj(cats, cl.a)) + ' either ' + pred(cats, cl.opts[0]) + ' or ' + pred(cats, cl.opts[1]) + '.';
  }

  var API = {
    makeRng: makeRng, hashStr: hashStr, shuffle: shuffle,
    emptyGrid: emptyGrid, cloneGrid: cloneGrid, gl: gl, sl: sl,
    propagate: propagate, countSolutions: countSolutions,
    propagationSolvable: propagationSolvable,
    generate: generate, renderClue: renderClue, rateDifficulty: rateDifficulty
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.DDEngine = API;
})(typeof window !== 'undefined' ? window : this);
