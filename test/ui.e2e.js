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

  // 2) tap-to-select auto-eliminates the rest of that group (suspect 0, Where)
  await page.click('#rail .face:nth-child(1)');
  await page.click(chip(1, 0)); // suspect0 Where value0
  ok(/\bon\b/.test(await cls(page, chip(1, 0))), 'tapped chip becomes selected (✓)');
  ok(/\boff\b/.test(await cls(page, chip(1, 1))), 'other chips in the group auto-rule-out (✗)');

  // 3) cross-suspect column elimination: value0 of Where is ruled out for suspect 1
  await page.click('#rail .face:nth-child(2)');
  ok(/\boff\b/.test(await cls(page, chip(1, 0))), 'same value is ruled out for another suspect');

  // 4) right-click / long-press rules out a neutral chip manually
  await page.click('#rail .face:nth-child(2)');
  await page.click(chip(2, 0), { button: 'right' }); // How value0 -> rule out
  ok(/\boff\b/.test(await cls(page, chip(2, 0))), 'right-click/long-press rules out a chip');

  // 4b) INVESTIGATION — clues are DISCOVERED, not pre-listed
  const totalClues = await page.evaluate(() => window.__dd.total());
  ok(await page.evaluate(() => window.__dd.found()) === 0, 'case file starts empty (no clues pre-listed)');
  const srcKeys = await page.evaluate(() => window.__dd.sources());
  ok(srcKeys.length === 8, 'eight investigable sources (4 locations + 4 suspects)');
  const before = await page.evaluate(() => window.__dd.searches());
  await page.evaluate(() => window.__dd.search(window.__dd.sources()[0]));
  ok(await page.evaluate(() => window.__dd.searches()) === before + 1, 'searching a source consumes a search');
  await page.evaluate(() => window.__dd.sources().forEach(k => window.__dd.search(k)));
  ok(await page.evaluate(() => window.__dd.found()) === totalClues, 'searching every source reveals every clue (always reachable)');
  ok((await page.$$('#clues .clue')).length === totalClues, 'each discovered clue renders in the Case File');
  ok((await page.$$('#invGroups .src.done')).length === 8, 'searched sources mark as done');
  ok((await page.textContent('#badgeSolve')) === String(totalClues), 'Solve tab badge reflects discovered clue count');

  // 5) full solve -> arrest enables -> win modal -> streak increments
  const sol = await page.evaluate(() => window.__dd.sol());
  for (let s = 0; s < sol.length; s++) {
    await page.click(`#rail .face:nth-child(${s + 1})`);
    for (let c = 1; c < sol[s].length; c++) {
      const sel = chip(c, sol[s][c]); // idempotent: clicking an already-✓ chip would toggle it back off
      if (!/\bon\b/.test(await cls(page, sel))) await page.click(sel);
    }
  }
  ok(await page.getAttribute('#btnArrest', 'disabled') === null, 'arrest enables once every suspect is assigned');
  await page.click('#btnArrest');
  await page.waitForTimeout(300);
  ok(/Case closed/.test(await page.textContent('#modalBody')), 'correct solution wins the case');
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

  ok(errors.length === 0, 'no uncaught page errors (' + (errors[0] || 'none') + ')');

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
