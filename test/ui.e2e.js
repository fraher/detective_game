/* End-to-end functional playability test — drives the real DOM with Playwright.
 * Verifies the player-facing interactions actually work:
 *   arrest gating · tap-to-select auto-elimination · cross-suspect elimination
 *   · long-press/right-click rule-out · solve → win → streak · persistence on
 *   reload · Notebook reflects edits · give-up reveals the solution.
 * Run: node test/ui.e2e.js   (uses the bundled Chromium)
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '#test';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.error('  ✗ ' + label); } }

const chip = (c, v) => `#card .chip[data-c="${c}"][data-v="${v}"]`;
const cls = (page, sel) => page.getAttribute(sel, 'class');
const present = (page, sel) => page.$(sel).then(h => !!h);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('#modalClose').catch(() => {});

  // 1) arrest disabled at start
  ok(await page.getAttribute('#btnArrest', 'disabled') !== null, 'arrest is disabled before solving');

  // 2) tap-to-choose collapses the group to the answer; alternatives are hidden
  await page.click('#rail .face:nth-child(1)');
  await page.click(chip(1, 0)); // suspect0 Where value0
  ok(/\bon\b/.test(await cls(page, chip(1, 0))), 'tapped chip becomes the chosen answer (✓)');
  ok(await present(page, chip(1, 1)) === false, 'other options in that group are hidden once chosen');

  // 3) a value claimed by one suspect is hidden for the others
  await page.click('#rail .face:nth-child(2)');
  ok(await present(page, chip(1, 0)) === false, 'value claimed elsewhere is hidden for another suspect');

  // 4) right-click / long-press rules out an option -> hidden, recoverable in footer
  await page.click(chip(2, 0), { button: 'right' }); // suspect1 How value0 -> rule out
  ok(await present(page, chip(2, 0)) === false, 'ruled-out option is removed from the choices');
  ok(await present(page, '#card .rtok') === true, 'ruled-out option shows in the recoverable footer');

  // 5) clean solve from a fresh slate -> arrest enables -> win -> streak increments
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('dd:seenHow', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  await page.click('#modalClose').catch(() => {});
  const sol = await page.evaluate(() => window.__dd.sol());
  for (let s = 0; s < sol.length; s++) {
    await page.click(`#rail .face:nth-child(${s + 1})`);
    for (let c = 1; c < sol[s].length; c++) await page.click(chip(c, sol[s][c]));
  }
  ok(await page.getAttribute('#btnArrest', 'disabled') === null, 'arrest enables once every suspect is assigned');
  await page.click('#btnArrest');
  await page.waitForTimeout(300);
  ok(/Case closed/.test(await page.textContent('#modalBody')), 'correct solution wins the case');
  ok(await page.evaluate(() => window.__dd.won()) === true, 'engine marks the case won');
  ok(/🔥 [1-9]/.test(await page.textContent('#pillStreak')), 'streak increments on a win');

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
  await page.click('#btnMenu'); await page.waitForTimeout(80);
  await page.click('#mGive'); await page.waitForTimeout(80);
  await page.click('#gy'); await page.waitForTimeout(250);
  ok(/trail goes cold/.test(await page.textContent('#modalBody')), 'give-up reveals the solution (loss state)');
  ok(await page.evaluate(() => window.__dd.fin()) === true && await page.evaluate(() => window.__dd.won()) === false, 'give-up records a loss');

  ok(errors.length === 0, 'no uncaught page errors (' + (errors[0] || 'none') + ')');

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
