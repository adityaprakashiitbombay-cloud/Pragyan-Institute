// ============================================================================
// SYNTAX CHECK — parse every JavaScript file in the project
// ----------------------------------------------------------------------------
// Replaces the hand-maintained `node --check a && node --check b && ...` chain
// in package.json, which had silently drifted: six JS files that ship to
// production were never being parsed because nobody remembered to add them.
//
// Walks the tree instead, so a new file is covered the moment it is created.
//
// `node --check` has to be told whether a file is a classic script or an ES
// module, and the whole point of the distinction here is to catch a browser file
// that uses `import`/`export` — legal as a module, a hard SyntaxError inside a
// plain <script> tag.
//
// Directory is the wrong signal for that (js/fee-calculator.js is an ESM helper
// that only the test runner imports; vite.config.js is ESM at the repo root), so
// the mode comes from scripts/_lib/asset-graph.js: anything a page loads without
// type="module" is a classic script, everything else is a module.
// ============================================================================

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanHtmlAssets, toRelative, walk } from './_lib/asset-graph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Loaded by the browser as a classic script but not via a <script> tag, so the
// HTML scan cannot see it.
const CLASSIC_EXTRA = ['sw.js'];

const { classicScripts } = scanHtmlAssets(ROOT);
for (const extra of CLASSIC_EXTRA) classicScripts.add(extra);

const files = walk(ROOT, '.js').sort();
const failures = [];
let classicCount = 0;
let moduleCount = 0;

for (const file of files) {
  const name = toRelative(ROOT, file);
  const asClassic = classicScripts.has(name);
  try {
    if (asClassic) {
      // Checked from stdin as commonjs: `node --check file.js` would honour the
      // root package.json "type": "module" and happily accept top-level import.
      execFileSync(process.execPath, ['--input-type=commonjs', '--check', '-'], {
        input: fs.readFileSync(file, 'utf8'),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      classicCount += 1;
    } else {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      moduleCount += 1;
    }
  } catch (error) {
    const detail = (error.stderr?.toString() || error.message || '').trim();
    const mode = asClassic ? 'classic script' : 'ES module';
    failures.push(`${name}  (checked as ${mode})\n    ${detail.split('\n').slice(0, 4).join('\n    ')}`);
  }
}

const parsed = classicCount + moduleCount;
console.log(
  `\n--- Syntax check: ${parsed}/${files.length} JavaScript files parsed ` +
  `(${classicCount} classic scripts, ${moduleCount} ES modules) ---`
);
if (failures.length) {
  console.error(`\n❌ ${failures.length} file(s) failed to parse:\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}
console.log('✅ All JavaScript files parse cleanly.\n');
