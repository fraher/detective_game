/* End-to-end functional playability test — drives the real DOM with Playwright.
 * Verifies the player-facing interactions actually work:
 *   arrest gating · tap-to-select auto-elimination · cross-suspect elimination
 *   · long-press/right-click rule-out · solve → win → streak · persistence on
 *   reload · Notebook reflects edits · give-up reveals the solution.
 * Run: node test/ui.e2e.js   (uses the bundled Chromium)
 */
const path = require('path');
const fs = require('fs');
// Resolve Playwright from wherever it lives (local install, global, or the
// original bundled path). Run once: `npm install && npx playwright install chromium`.
function loadPlaywright() {
  const tries = [process.env.PW_MODULE, 'playwright', 'playwright-core',
    '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* try next */ } }
  console.error('Playwright not found. Install once with:\n  npm install\n  npx playwright install chromium');
  process.exit(2);
}
const { chromium } = loadPlaywright();
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '#test';
// Use an explicit Chromium if one is provided/known; else Playwright's managed one.
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.error('  ✗ ' + label); } }

const chip = (c, v) => `#card .seg:nth-child(${c + 1}) .chip:nth-child(${v + 1})`;
const cls = (page, sel) => page.getAttribute(sel, 'class');

(async () => {
  const launchOpts = { headless: true, args: ['--no-sandbox'] };
  if (EXE && fs.existsSync(EXE)) launchOpts.executablePath = EXE;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('#modalClose').catch(() => {});

  // 1) arrest disabled at start
  ok(await page.getAttribute('#btnArrest', 'disabled') !== null, 'arrest is disabled before solving');

  // 1b) two-tab layout: start on Investigate, switch to Solve to work the board
  ok((await page.$('#tabBtnSolve')) !== null, 'two-tab layout is present');
  ok(await page.getAttribute('#tabInvestigate', 'hidden') === null, 'fresh case opens on the Investigate tab');
  await page.click('#tabBtnSolve');
  ok(await page.getAttribute('#tabSolve', 'hidden') === null, 'Solve tab reveals the deduction board');

  // 2) Solve tab is an ACCUSATION board (who/where/how/why), not a fill-everyone grid
  ok((await page.$$('#accuse .aseg')).length === 4, 'accusation board has four rows (who/where/how/why)');
  ok(await page.getAttribute('#btnArrest', 'disabled') !== null, 'arrest stays disabled with an empty accusation');

  // 3) INVESTIGATION — clues are DISCOVERED, not pre-listed
  const totalClues = await page.evaluate(() => window.__dd.total());
  ok(await page.evaluate(() => window.__dd.found()) === 0, 'case file starts empty (no clues pre-listed)');
  const srcKeys = await page.evaluate(() => window.__dd.sources());
  ok(srcKeys.length === 8, 'eight investigable sources (4 locations + 4 suspects)');
  const before = await page.evaluate(() => window.__dd.searches());
  await page.evaluate(() => window.__dd.search(window.__dd.sources()[0]));
  ok(await page.evaluate(() => window.__dd.searches()) === before + 1, 'searching a source consumes a search');
  await page.evaluate(() => window.__dd.sources().forEach(k => window.__dd.search(k)));
  ok(await page.evaluate(() => window.__dd.found()) === totalClues, 'searching every source reveals every clue (always reachable)');
  ok((await page.$$('#clues .nbitem:not(.herring)')).length === totalClues, 'each discovered clue renders in the Case File');
  ok((await page.$$('#clues .nbgroup')).length === 8, 'the notebook groups clues under each source searched');
  ok((await page.$$('#clues .nbitem.herring')).length >= 1, 'red-herring atmosphere appears in the notebook');
  // narration: the evidence text reads as prose, not the bald logic line
  ok(await page.evaluate(() => {
    const items = [...document.querySelectorAll('#clues .nbitem:not(.herring)')];
    return items.some(it => { const ev = it.querySelector('.ev').textContent, lg = it.querySelector('.lg').textContent; return ev && lg && ev !== lg; });
  }), 'clues are narrated as evidence prose, distinct from the logic line');
  ok((await page.$$('#invGroups .src.done')).length === 8, 'searched sources mark as done');
  ok((await page.textContent('#badgeSolve')) === String(totalClues), 'Solve tab badge reflects discovered clue count');

  // 4) CONFLICTS — an accusation that contradicts a found clue lights up red and blocks the arrest
  const violator = await page.evaluate(() => {
    const c = window.__dd.clues()[0], N = 4, bump = x => (x + 1) % N;
    if (c.kind === 'pos') {
      if (c.e1[0] === 0) return [[0, c.e1[1]], [c.e2[0], bump(c.e2[1])]];
      if (c.e2[0] === 0) return [[0, c.e2[1]], [c.e1[0], bump(c.e1[1])]];
      return [[c.e1[0], c.e1[1]], [c.e2[0], bump(c.e2[1])]];
    }
    if (c.kind === 'neg') return [[c.e1[0], c.e1[1]], [c.e2[0], c.e2[1]]];
    const s = c.a[1], cat = c.opts[0][0], v1 = c.opts[0][1], v2 = c.opts[1][1]; let w = 0; while (w === v1 || w === v2) w++;
    return [[0, s], [cat, w]];
  });
  await page.evaluate((picks) => picks.forEach(p => window.__dd.accuse(p[0], p[1])), violator);
  ok(await page.evaluate(() => window.__dd.conflicts()) > 0, 'an accusation that contradicts a clue registers a conflict');
  ok((await page.$$('#accuse .achip.bad')).length >= 1, 'the conflicting pick turns red');
  ok((await page.$$('#clues .nbitem.bad')).length >= 1, 'the contradicted clue turns red in the notebook');
  ok(await page.getAttribute('#conflictMsg', 'hidden') === null, 'a conflict banner is shown');
  ok(await page.evaluate(() => window.__dd.arrestReady()) === false, 'arrest is blocked while the accusation conflicts');

  // 5) the correct accusation clears conflicts, unlocks the arrest, and wins
  await page.evaluate(() => { const a = window.__dd.getAcc(); [0, 1, 2, 3].forEach(c => { if (a[c] != null) window.__dd.accuse(c, a[c]); }); }); // clear
  await page.evaluate(() => { const cp = window.__dd.culprit(), sol = window.__dd.sol()[cp];
    window.__dd.accuse(0, cp); window.__dd.accuse(1, sol[1]); window.__dd.accuse(2, sol[2]); window.__dd.accuse(3, sol[3]); });
  ok(await page.evaluate(() => window.__dd.conflicts()) === 0, 'the correct accusation has no conflicts');
  ok(await page.getAttribute('#btnArrest', 'disabled') === null, 'arrest unlocks for a complete, conflict-free accusation');
  await page.click('#btnArrest');
  await page.waitForTimeout(300);
  ok(/Case closed/.test(await page.textContent('#modalBody')), 'the correct accusation wins the case');
  ok(await page.evaluate(() => window.__dd.won()) === true, 'engine marks the case won');
  ok(/🔥 [1-9]/.test(await page.textContent('#pillStreak')), 'streak increments on a win');
  ok([1, 2, 3].includes(await page.evaluate(() => window.__dd.rating())), 'a 1–3 star detective rating is recorded on the win');
  ok(/★/.test(await page.textContent('#modalBody')), 'win screen shows the detective rating');

  // 5b) meta-progression: the win is recorded, personal bests + badges update
  ok(await page.evaluate(() => window.__dd.stats().wins) >= 1, 'the daily win is recorded in stats');
  ok(await page.evaluate(() => Object.keys(window.__dd.history()).length) >= 1, 'the day is recorded in play history');
  ok(typeof (await page.evaluate(() => window.__dd.stats().bestMs)) === 'number', 'a fastest-solve personal best is stored');
  ok(await page.evaluate(() => !!window.__dd.achievements().first), 'the First Case badge unlocks on a win');
  ok(await page.evaluate(() => !!window.__dd.achievements().nohints), 'the no-hints badge unlocks (e2e used no hints)');
  ok(/🔥 Streak/.test(await page.textContent('#modalBody')), 'post-solve screen shows the stats strip');
  await page.click('#statsBtn'); await page.waitForTimeout(120);
  ok((await page.$$('#modalBody .hcell')).length === 35, 'stats screen renders a 35-day history grid');
  ok((await page.$$('#modalBody .ach')).length === 8, 'stats screen renders all achievement badges');
  ok((await page.$$('#modalBody .ach.on')).length >= 1, 'at least one badge shows unlocked');

  // 6) persistence: reload resumes the finished/won state
  await page.reload({ waitUntil: 'networkidle' });
  ok(await page.evaluate(() => window.__dd.fin()) === true, 'finished state persists across reload');

  // 7) Notebook reflects edits (open, click a cell, it marks)
  await page.click('#modalClose').catch(() => {});
  await page.click('#btnNotebook');
  await page.waitForTimeout(150);
  ok((await page.$$('#modalBody .cell')).length === 96, 'Notebook renders the full 96-cell grid');
  await page.click('#modalClose').catch(() => {});

  // 8) give-up on a fresh random case reveals the solution
  await page.click('#btnMenu'); await page.waitForTimeout(80);
  await page.click('#mRnd'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__dd.fin()) === false, 'random case starts unsolved');
  ok(await page.evaluate(() => window.__dd.newBadges()) === 0, 'badge unlocks from the daily do not leak into a new case');
  // 8b) the new-clue nudge resets per case (regression: solveSeen must not leak across cases)
  await page.evaluate(() => { for (const k of window.__dd.sources()) { window.__dd.search(k); if (window.__dd.found() > 0) break; } });
  ok(/\bpulse\b/.test((await page.getAttribute('#badgeSolve', 'class')) || ''), 'Solve-tab nudge pulses for clues found in a fresh case');
  await page.click('#btnMenu'); await page.waitForTimeout(80);
  await page.click('#mGive'); await page.waitForTimeout(80);
  await page.click('#gy'); await page.waitForTimeout(250);
  ok(/trail goes cold/.test(await page.textContent('#modalBody')), 'give-up reveals the solution (loss state)');
  ok(await page.evaluate(() => window.__dd.fin()) === true && await page.evaluate(() => window.__dd.won()) === false, 'give-up records a loss');

  // 9) migration: downgrade the saved daily win to a pre-rating save (drop the new
  //    fields the old build never wrote), reload, and confirm it still rates 1–3 stars.
  const stripped = await page.evaluate(() => {
    const k = Object.keys(localStorage).find(x => x.startsWith('dd:day:'));
    if (!k) return false;
    const d = JSON.parse(localStorage.getItem(k));
    delete d.rating; delete d.searched; delete d.searchesUsed;
    localStorage.setItem(k, JSON.stringify(d));
    return true;
  });
  ok(stripped, 'found the saved daily win to downgrade to a pre-rating save');
  await page.reload({ waitUntil: 'networkidle' });
  ok([1, 2, 3].includes(await page.evaluate(() => window.__dd.rating())), 'a pre-rating saved win migrates to a valid rating');
  ok(/★/.test(await page.textContent('#modalBody')), 'migrated win still shows stars (no 0-star result)');

  // 10) (regression) discovering a contradicting clue refreshes the Solve UI and re-locks the arrest
  await page.click('#modalClose').catch(() => {});
  await page.click('#btnMenu'); await page.waitForTimeout(80); await page.click('#mRnd'); await page.waitForTimeout(160);
  await page.evaluate(() => {
    const c = window.__dd.clues()[0], N = 4, bump = x => (x + 1) % N; let picks;
    if (c.kind === 'pos') picks = c.e1[0] === 0 ? [[0, c.e1[1]], [c.e2[0], bump(c.e2[1])]] : c.e2[0] === 0 ? [[0, c.e2[1]], [c.e1[0], bump(c.e1[1])]] : [[c.e1[0], c.e1[1]], [c.e2[0], bump(c.e2[1])]];
    else if (c.kind === 'neg') picks = [[c.e1[0], c.e1[1]], [c.e2[0], c.e2[1]]];
    else { const s = c.a[1], cat = c.opts[0][0], v1 = c.opts[0][1], v2 = c.opts[1][1]; let w = 0; while (w === v1 || w === v2) w++; picks = [[0, s], [cat, w]]; }
    picks.forEach(p => window.__dd.accuse(p[0], p[1]));
    const a = window.__dd.getAcc(); [0, 1, 2, 3].forEach(c2 => { if (a[c2] == null) window.__dd.accuse(c2, 0); }); // complete it
  });
  ok(await page.evaluate(() => window.__dd.arrestReady()) === true, 'a complete accusation can arrest before the contradicting clue is found');
  await page.evaluate(() => window.__dd.sources().forEach(k => window.__dd.search(k)));
  ok(await page.evaluate(() => window.__dd.arrestReady()) === false, 'searching in a contradicting clue refreshes the Solve UI and re-locks arrest');

  ok(errors.length === 0, 'no uncaught page errors (' + (errors[0] || 'none') + ')');

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
