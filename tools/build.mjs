/* =========================================================================
 * Daily Detective — Deploy Build
 * -------------------------------------------------------------------------
 * Assembles ONLY the static runtime into dist/. Deploy dist/ — never the repo
 * root. The generator (tools/), tests (test/), node_modules, and package.json
 * are authoring/CI machinery and must never be served on the web.
 *
 * Run:  npm run build   ->   dist/  (index.html, engine.js, themes.js, prose.js)
 * ====================================================================== */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rmSync, mkdirSync, copyFileSync, statSync, existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// The complete set of files the hosted game loads. If index.html ever <script>s
// or links a new file, add it here — nothing else ships.
const RUNTIME = ["index.html", "engine.js", "themes.js", "prose.js"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

let total = 0;
for (const f of RUNTIME) {
  const src = join(root, f);
  if (!existsSync(src)) { console.error(`missing runtime file: ${f}`); process.exit(1); }
  copyFileSync(src, join(dist, f));
  const kb = (statSync(src).size / 1024).toFixed(1);
  total += statSync(src).size;
  console.log(`  + ${f}  (${kb} KB)`);
}
console.log(`\ndist/ ready — ${RUNTIME.length} files, ${(total / 1024).toFixed(1)} KB total. Deploy this folder.`);
