/* =========================================================================
 * Daily Detective — Evidence Prose Generator  (offline authoring step)
 * -------------------------------------------------------------------------
 * Regenerates prose.js: detective-novel "evidence" templates for every clue
 * fact, authored by Claude and BAKED into a static file.
 *
 * Generation runs on THIS machine through the Claude CLI (your subscription —
 * no API key, no metered cost). The deployed game never calls anything: it
 * only reads prose.js, so it stays offline + deterministic and costs nothing
 * but hosting, for years.
 *
 * Usage:
 *   node tools/gen-prose.mjs            # regenerate every theme
 *   node tools/gen-prose.mjs noir       # just one theme (merges into prose.js)
 *   PROSE_MODEL=opus node tools/gen-prose.mjs   # pin a CLI model
 *
 * Requires the `claude` CLI on PATH (override with CLAUDE_CLI=/path/to/claude).
 * After generating, run `npm run verify` — it reports prose coverage and
 * certifies every case is still uniquely solvable.
 * ====================================================================== */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const THEMES = require("../themes.js");
const EXISTING = require("../prose.js");

const CLI = process.env.CLAUDE_CLI || "claude";

// Per-theme atmosphere to steer voice (the rest is derived from themes.js).
const SETTING = {
  thames: "Gaslit Victorian London — a vanished royal courier, river fog, ministries. Voice: terse, Conan-Doyle-ish.",
  noir: "1940s Los Angeles noir — a dead studio fixer, a missing reel, rain on Sunset. Voice: hardboiled, Chandler-ish.",
  orbit: "An orbital research station — an 11-minute comms blackout, a wiped core. Voice: tense, clinical, hard-sci-fi.",
  manor: "A storm-cut-off English country manor — the late lord's will vanished. Voice: Golden-Age, Christie-ish."
};

function promptFor(theme) {
  const c = theme.categories, sus = c[0].label, loc = c[1].label, met = c[2].label, mot = c[3].label;
  return `You are a detective-fiction writer authoring an "evidence prose" bank for a daily logic-deduction game.
Theme: ${theme.title}. ${SETTING[theme.id] || ""}
Each line reads like a jotting in a detective's notebook describing a PHYSICAL OBSERVATION or piece of evidence — never a bald logical statement.

Categories (cat index -> role): 0=${sus} (suspect), 1=${loc} (location), 2=${met} (method), 3=${mot} (motive).
Values: ${sus}=[${c[0].values}]; ${loc}=[${c[1].values}]; ${met}=[${c[2].values}]; ${mot}=[${c[3].values}].
Value names vary in article — write so they read naturally with the actual names.

Return ONLY a JSON object (no markdown fences, no commentary) with this exact shape:
{
  "pos": { "0_1":[...], "0_2":[...], "0_3":[...], "1_2":[...], "1_3":[...], "2_3":[...] },
  "neg": { "0_1":[...], "0_2":[...], "0_3":[...], "1_2":[...], "1_3":[...], "2_3":[...] },
  "either": { "1":[...], "2":[...], "3":[...] },
  "red": [ ... ]
}
Key "a_b" relates the value of the lower category (slot {a}) to the higher (slot {b}):
  0_1 = suspect {a} was at location {b};   0_2 = suspect {a} carried out method {b};
  0_3 = suspect {a} driven by motive {b};  1_2 = method {b} happened at location {a};
  1_3 = motive {b} tied to location {a};   2_3 = method {a} done out of motive {b}.
"neg" pools clearly RULE OUT the specific {a}-{b} connection and MUST mention BOTH {a} and {b}. Phrase as a neutral observation/alibi fitting the relation: a place -> "{a} was elsewhere, never at {b}"; a method -> "nothing tied {a} to {b}" / "{a} showed no trace of {b}"; a motive -> "{a} had no stake in {b}". It must be unambiguous that {a} is NOT connected to {b}. Do NOT write a vague alibi that omits {b}; do NOT write "{a} could not have..."; never imply {a} did anything.
"either" key = the opts' category; slots {who} (suspect), {x} and {y}: EXACTLY ONE of {x}/{y} is true — one or the other, NEVER both and NEVER neither; the reader just can't yet tell which. E.g. "{who} was tied to either {x} or {y}, though which is unclear". Do NOT say "both", "maybe both", or "neither".
"red" = 8-10 atmospheric notes that look like evidence but name no entity and imply no fact (no slots, no names).

Rules: EVERY pos/neg template MUST contain both {a} and {b}; EVERY either template MUST contain {who}, {x}, and {y}. Use no other slots. Each pos/neg pool exactly 4 templates; each either pool 3; red 8-10. One sentence each, ~10-22 words, ending with a period. Each line is a SELF-CONTAINED observation — never require the reader to already know another character's facts. Do NOT editorialize about whether a clue is useful, likely, or important. Stay in the theme's voice. Do not hard-code value names except in "red".`;
}

// One-shot through the Claude CLI in print mode (-p). Subscription auth; no API key.
function ask(prompt) {
  const args = ["-p"];
  if (process.env.PROSE_MODEL) args.push("--model", process.env.PROSE_MODEL);
  try {
    return execFileSync(CLI, args, { input: prompt, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`Could not find the '${CLI}' CLI on PATH. Install Claude Code or set CLAUDE_CLI=/path/to/claude.`);
      process.exit(2);
    }
    throw e;
  }
}

function parseBank(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON object in CLI output");
  return JSON.parse(text.slice(s, e + 1));
}

function render(banks) {
  return `/* =========================================================================
 * Daily Detective — Evidence Prose Bank  (Claude-authored, baked offline)
 * Generated on this machine by tools/gen-prose.mjs via the Claude CLI.
 * The runtime only reads this file; never edits it, never calls an API.
 * ====================================================================== */
(function (root) {
  'use strict';
  var PROSE = ${JSON.stringify(banks, null, 2)};
  if (typeof module !== 'undefined' && module.exports) module.exports = PROSE;
  root.DD_PROSE = PROSE;
})(typeof window !== 'undefined' ? window : this);
`;
}

const want = process.argv.slice(2);
const banks = JSON.parse(JSON.stringify(EXISTING)); // start from current, merge updates
for (const theme of THEMES) {
  if (want.length && !want.includes(theme.id)) continue;
  process.stdout.write(`generating ${theme.id} via ${CLI} ... `);
  banks[theme.id] = parseBank(ask(promptFor(theme)));
  console.log("ok");
}
writeFileSync(join(here, "..", "prose.js"), render(banks));
console.log("wrote prose.js — now run `npm run verify` to certify coverage + solvability.");
