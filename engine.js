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

  // Card-only solver: the reach of the simple suspect-card UI. It stores only
  // the anchor grids (suspect×category) — the state a player holds from the
  // cards — and projects clues onto suspects through known anchor links. It
  // cannot reason about un-pinned non-anchor relationships (that needs the
  // Notebook). Returns true iff fully solvable this way. Used to label
  // difficulty honestly: card-solvable => Easy/Medium, else => Hard/Fiendish.
  function cardSolvable(cats, clues) {
    var K = cats.length, N = cats[0].values.length, A = {};
    for (var c = 1; c < K; c++) { A[c] = []; for (var i = 0; i < N; i++) A[c].push(new Array(N).fill(0)); }
    var st = { ch: true, bad: false };
    function set(c, s, v, val) { var cur = A[c][s][v]; if (cur === 0) { A[c][s][v] = val; st.ch = true; } else if (cur !== val) st.bad = true; }
    while (st.ch && !st.bad) {
      st.ch = false;
      for (var ci = 0; ci < clues.length; ci++) {
        var cl = clues[ci];
        if (cl.kind === 'pos' || cl.kind === 'neg') {
          var want = cl.kind === 'pos' ? 1 : -1, e1 = cl.e1, e2 = cl.e2;
          if (e1[0] === 0) set(e2[0], e1[1], e2[1], want);
          else if (e2[0] === 0) set(e1[0], e2[1], e1[1], want);
          else {
            var cA = e1[0], vA = e1[1], cB = e2[0], vB = e2[1];
            for (var s = 0; s < N; s++) {
              var aA = A[cA][s][vA], aB = A[cB][s][vB];
              if (want === 1) { if (aA === 1) set(cB, s, vB, 1); if (aB === 1) set(cA, s, vA, 1); }
              else { if (aA === 1) set(cB, s, vB, -1); if (aB === 1) set(cA, s, vA, -1); }
            }
          }
        } else if (cl.kind === 'either' && cl.a[0] === 0) {
          var s2 = cl.a[1], o1 = cl.opts[0], o2 = cl.opts[1], cc = o1[0];
          var l1 = A[cc][s2][o1[1]], l2 = A[cc][s2][o2[1]];
          if (l1 === -1) set(cc, s2, o2[1], 1); if (l2 === -1) set(cc, s2, o1[1], 1);
          if (l1 === 1) set(cc, s2, o2[1], -1); if (l2 === 1) set(cc, s2, o1[1], -1);
        }
      }
      for (var c2 = 1; c2 < K; c2++) {
        var M = A[c2];
        for (var r = 0; r < N; r++) { var y = -1, u = []; for (var j = 0; j < N; j++) { if (M[r][j] === 1) { if (y >= 0) st.bad = true; y = j; } else if (M[r][j] === 0) u.push(j); } if (y >= 0) { for (var k = 0; k < u.length; k++) { M[r][u[k]] = -1; st.ch = true; } } else if (u.length === 1) { M[r][u[0]] = 1; st.ch = true; } else if (!u.length) st.bad = true; }
        for (var col = 0; col < N; col++) { var yc = -1, uc = []; for (var ri = 0; ri < N; ri++) { if (M[ri][col] === 1) { if (yc >= 0) st.bad = true; yc = ri; } else if (M[ri][col] === 0) uc.push(ri); } if (yc >= 0) { for (var k2 = 0; k2 < uc.length; k2++) { M[uc[k2]][col] = -1; st.ch = true; } } else if (uc.length === 1) { M[uc[0]][col] = 1; st.ch = true; } else if (!uc.length) st.bad = true; }
      }
    }
    if (st.bad) return false;
    for (var c3 = 1; c3 < K; c3++) for (var i3 = 0; i3 < N; i3++) for (var j3 = 0; j3 < N; j3++) if (A[c3][i3][j3] === 0) return false;
    return true;
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

  // Produce a minimal clue set that is solvable by PURE LOGIC (propagation,
  // no guessing). This guarantees both fairness (no branching needed) and a
  // unique solution. Minimal = removing any clue breaks logical solvability.
  function carveLogicalSet(cats, perm, rng) {
    var built = buildCluePool(cats, perm, rng);
    // Bias toward more interesting clues first: eithers + negatives, then positives.
    var ordered = built.eithers.concat(shuffle(built.pool.slice(), rng));

    var chosen = [], ok = false;
    for (var i = 0; i < ordered.length; i++) {
      chosen.push(ordered[i]);
      if (propagationSolvable(cats, chosen)) { ok = true; break; }
    }
    if (!ok) return null;

    for (var p = chosen.length - 1; p >= 0; p--) {
      var trial = chosen.slice(0, p).concat(chosen.slice(p + 1));
      if (propagationSolvable(cats, trial)) chosen = trial;
    }
    return chosen;
  }

  function assemble(theme, cats, perm, clues, rng) {
    var suspOf = makeSuspOf(cats, perm);
    var solution = [];
    for (var s = 0; s < cats[0].values.length; s++) {
      var row = [s];
      for (var c = 1; c < cats.length; c++) row.push(perm[c][s]);
      solution.push(row);
    }
    shuffle(clues, rng); // present clues in random order
    var clueText = clues.map(function (c) { return renderClue(c, cats); });
    // Make the clues DISCOVERABLE instead of pre-listed: attach a source the
    // player searches/questions + atmospheric flavor. Deterministic and uses
    // no rng, so the underlying puzzle is byte-for-byte identical.
    var inv = attachInvestigation(theme, cats, clues, clueText);
    return {
      themeId: theme.id, cats: cats, clues: clues,
      clueText: clueText, sources: inv.sources, minSearches: inv.minSearches,
      solution: solution, culprit: suspOf(theme.guilt.cat, theme.guilt.value),
      guilt: theme.guilt, difficulty: rateDifficulty(cats, clues)
    };
  }

  // Public: generate a puzzle from a theme + numeric seed.
  // opts.target (optional): preferred difficulty band ('Easy'|'Medium'|'Hard'|'Fiendish').
  // Generation is deterministic; if the target isn't hit within the attempt
  // budget, the first valid puzzle is returned.
  function generate(theme, seed, opts) {
    opts = opts || {};
    var rng = makeRng(seed >>> 0), cats = theme.categories, fallback = null;
    for (var attempt = 0; attempt < 80; attempt++) {
      var perm = randomSolution(cats, rng);
      var clues = carveLogicalSet(cats, perm, rng);
      if (!clues) continue;
      // opts.cardSolvable: only serve cases solvable straight from the clues (no
      // cross-grid needed) — the game has no logic-grid notebook anymore.
      if (opts.cardSolvable && !cardSolvable(cats, clues)) continue;
      var puzzle = assemble(theme, cats, perm, clues, rng);
      if (!opts.target || puzzle.difficulty === opts.target) return puzzle;
      if (!fallback) fallback = puzzle;
    }
    return fallback;
  }

  function rateDifficulty(cats, clues) {
    // Honest difficulty: a puzzle that needs the Notebook (not solvable from
    // the cards alone) is Hard/Fiendish; one solvable from cards is Easy/Medium.
    // Leaner clue sets within each tier are the harder end.
    var notebook = !cardSolvable(cats, clues);
    var n = clues.length;
    // Within each tier, a leaner clue set is the harder end (less hand-holding).
    // Thresholds calibrated to the generator's natural clue-count distribution.
    if (!notebook) return n >= 11 ? 'Easy' : 'Medium';
    return n >= 10 ? 'Hard' : 'Fiendish';
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

  /* ----- Investigation: discoverable clue sources + flavor --------------
   * The fun of a detective game is the *hunt*, so each clue is attached to a
   * single source the player can investigate, rather than being listed up
   * front:
   *   - a LOCATION (category 1) named by the clue   -> "search the scene"
   *   - else a SUSPECT (category 0) named by the clue -> "question them"
   *   - else (a method×motive clue, naming neither)   -> a suspect chosen
   *     deterministically, who "lets the detail slip".
   * Every location and every suspect is a searchable source, so searching
   * them all ALWAYS surfaces every clue — the case stays guaranteed solvable
   * no matter how the player explores. Flavor framing is theme-supplied and
   * rotates per source for variety. No rng is consumed here.              */
  var DEFAULT_FLAVOR = {
    search: ['A search of {place} turns up something —',
      'You comb {place} and find a detail —',
      '{place} gives up a clue —'],
    question: ['Pressed for answers, {who} lets something slip —',
      '{who} hesitates, then admits —',
      'After some prodding, {who} reveals —']
  };
  function fillName(tpl, name) { return tpl.replace(/\{place\}|\{who\}/g, name); }
  function clueSourceOf(cl, N) {
    if (cl.kind === 'either') return { type: 'suspect', cat: 0, val: cl.a[1] };
    var es = [cl.e1, cl.e2], i;
    for (i = 0; i < 2; i++) if (es[i][0] === 1) return { type: 'location', cat: 1, val: es[i][1] };
    for (i = 0; i < 2; i++) if (es[i][0] === 0) return { type: 'suspect', cat: 0, val: es[i][1] };
    // method × motive names neither a place nor a person — surface it as scene
    // evidence at a location (deterministic) so QUESTIONING a suspect only ever
    // reveals things about THAT suspect, never abstract facts about others.
    return { type: 'location', cat: 1, val: (cl.e1[1] + cl.e2[1]) % N };
  }
  function attachInvestigation(theme, cats, clues, clueText) {
    var N = cats[0].values.length, sources = [], byKey = {}, i;
    function key(t, v) { return t + ':' + v; }
    for (i = 0; i < N; i++) sources.push({ type: 'location', cat: 1, val: i, key: key('location', i), clueIdx: [] });
    for (i = 0; i < N; i++) sources.push({ type: 'suspect', cat: 0, val: i, key: key('suspect', i), clueIdx: [] });
    sources.forEach(function (s) { byKey[s.key] = s; });
    clues.forEach(function (cl, idx) {
      var src = clueSourceOf(cl, N);
      cl.source = src; cl.sourceKey = key(src.type, src.val); cl.logic = clueText[idx];
      byKey[cl.sourceKey].clueIdx.push(idx);
    });
    var flav = theme.flavor || DEFAULT_FLAVOR;
    sources.forEach(function (s) {
      // Fall back per-key so a theme that defines only one of search/question still works.
      var pool = (s.type === 'location' ? flav.search : flav.question) ||
                 (s.type === 'location' ? DEFAULT_FLAVOR.search : DEFAULT_FLAVOR.question),
        name = cats[s.cat].values[s.val];
      s.clueIdx.forEach(function (ci, pos) { clues[ci].flavor = fillName(pool[pos % pool.length], name); });
    });
    var minSearches = sources.filter(function (s) { return s.clueIdx.length > 0; }).length;
    return { sources: sources, minSearches: minSearches };
  }
  /* ----- Deterministic completeness certificate ------------------------
   * Run on ANY case to certify it is fair. Returns:
   *   solvable   - at least one solution is consistent with the clues
   *   unique     - EXACTLY one solution exists (no ambiguity)
   *   sufficient - that solution is reachable by pure logic, no guessing
   *                (the clues are enough to deduce it)
   *   minimal    - no clue is redundant (every clue is needed)
   *   ok         - solvable AND unique AND sufficient
   * Deterministic: same (cats, clues) always yields the same certificate.   */
  function verify(catsOrPuzzle, maybeClues) {
    var cats = maybeClues ? catsOrPuzzle : catsOrPuzzle.cats;
    var clues = maybeClues ? maybeClues : catsOrPuzzle.clues;
    var count = countSolutions(cats, clues, emptyGrid(cats), 2); // capped at 2
    var solvable = count >= 1, unique = count === 1, sufficient = propagationSolvable(cats, clues);
    var minimal = true;
    for (var k = 0; k < clues.length; k++) {
      if (propagationSolvable(cats, clues.slice(0, k).concat(clues.slice(k + 1)))) { minimal = false; break; }
    }
    return {
      ok: solvable && unique && sufficient, solvable: solvable, unique: unique,
      sufficient: sufficient, minimal: minimal, solutionCount: count, clueCount: clues.length
    };
  }

  // Star rating for a solved case (1–3): each dead-end (a searched source that
  // held no clue) costs a star, floored at one.
  function investigationRating(wastedSearches) {
    var w = Math.max(0, wastedSearches || 0);
    return w === 0 ? 3 : (w === 1 ? 2 : 1);
  }

  /* ----- Accusation: name the culprit, not the whole grid ----------------
   * The player builds ONE accusation about the culprit: acc = { 0:suspectIdx,
   * 1:locationVal, 2:methodVal, 3:motiveVal } (any subset while in progress).
   * accusationConflicts() finds which of the DISCOVERED clues the accusation
   * directly contradicts, so the UI can light them — and the picks that caused
   * them — red. It reasons only about the accused suspect S (no full solve),
   * which is exactly what the player can see; deep deduction lives in the
   * Notebook. accusationCorrect() checks a finished accusation against truth. */
  function accusationConflicts(cats, clues, discoveredIdx, acc) {
    var S = acc[0];
    // Does value `val` of category `cat` belong to the accused culprit S?
    function belongs(cat, val) {
      if (cat === 0) return S == null ? 'unknown' : (val === S ? 'yes' : 'no');
      if (acc[cat] == null) return 'unknown';
      return acc[cat] === val ? 'yes' : 'no';
    }
    function link(cA, vA, cB, vB) {        // are these two the same person, per the accusation?
      var a = belongs(cA, vA), b = belongs(cB, vB);
      if (a === 'yes' && b === 'yes') return 'yes';
      if ((a === 'yes' && b === 'no') || (a === 'no' && b === 'yes')) return 'no';
      return 'unknown';
    }
    var badClues = [], badCats = {};
    (discoveredIdx || []).forEach(function (i) {
      var cl = clues[i], bad = false, ents;
      if (cl.kind === 'either') {
        var l1 = link(0, cl.a[1], cl.opts[0][0], cl.opts[0][1]),
          l2 = link(0, cl.a[1], cl.opts[1][0], cl.opts[1][1]);
        bad = (l1 === 'yes' && l2 === 'yes') || (l1 === 'no' && l2 === 'no');
        ents = [0, cl.opts[0][0], cl.opts[1][0]];
      } else {
        var st = link(cl.e1[0], cl.e1[1], cl.e2[0], cl.e2[1]);
        bad = (cl.kind === 'pos' && st === 'no') || (cl.kind === 'neg' && st === 'yes');
        ents = [cl.e1[0], cl.e2[0]];
      }
      if (bad) { badClues.push(i); ents.forEach(function (c) { if (c === 0 || acc[c] != null) badCats[c] = true; }); }
    });
    return { clues: badClues, cats: badCats };
  }
  function accusationCorrect(solution, culprit, acc) {
    if (acc[0] !== culprit) return false;
    for (var c = 1; c < solution[culprit].length; c++) if (acc[c] !== solution[culprit][c]) return false;
    return true;
  }

  var API = {
    makeRng: makeRng, hashStr: hashStr, shuffle: shuffle,
    emptyGrid: emptyGrid, cloneGrid: cloneGrid, gl: gl, sl: sl,
    propagate: propagate, countSolutions: countSolutions,
    propagationSolvable: propagationSolvable, cardSolvable: cardSolvable,
    generate: generate, renderClue: renderClue, rateDifficulty: rateDifficulty,
    investigationRating: investigationRating, verify: verify,
    accusationConflicts: accusationConflicts, accusationCorrect: accusationCorrect
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.DDEngine = API;
})(typeof window !== 'undefined' ? window : this);
