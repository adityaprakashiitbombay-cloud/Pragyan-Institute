// ============================================================================
// ASSET GRAPH — what the HTML pages actually load
// ----------------------------------------------------------------------------
// Two build scripts need to know how a file reaches the browser, and both used
// to guess from a hand-maintained list that silently drifted:
//
//   scripts/syntax_check.js  needs classic-script vs ES-module, because a stray
//                            `import` in a plain <script> is a hard SyntaxError.
//   scripts/cache_bust.js    needs the set of shipped assets, because anything
//                            missing from its hash keeps serving stale bytes.
//
// Deriving both from the <script>/<link> tags means adding a file to a page is
// the only step required — the build follows.
// ============================================================================

import fs from 'fs';
import path from 'path';

export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.vercel', 'dist', 'build', '.claude', 'coverage',
  // A third-party Adobe Express design export kept for reference. It is not part
  // of the shipped shell, so it must not enter the build hash or the a11y sweep.
  'adobe_express_export'
]);

const SCRIPT_TAG = /<script\b([^>]*)>/gi;
const LINK_TAG = /<link\b([^>]*)>/gi;
const SRC_ATTR = /\bsrc\s*=\s*["']([^"']+)["']/i;
const HREF_ATTR = /\bhref\s*=\s*["']([^"']+)["']/i;
const REL_STYLESHEET = /\brel\s*=\s*["']stylesheet["']/i;
const MODULE_TYPE = /\btype\s*=\s*["']module["']/i;
const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** Recursively collect files with the given extension, skipping build dirs. */
export function walk(dir, extension, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extension, out);
    else if (entry.isFile() && entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

/** Repo-relative, forward-slashed — the form both scripts compare against. */
export function toRelative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function resolveLocal(root, htmlFile, rawUrl) {
  const url = String(rawUrl || '').split(/[?#]/)[0];   // drop the ?v= cache-bust
  if (!url || ABSOLUTE_URL.test(url)) return null;     // CDN / protocol-relative
  return toRelative(root, path.resolve(path.dirname(htmlFile), url));
}

/**
 * Scan every HTML page once.
 *
 * @returns {{
 *   htmlFiles: string[],       // repo-relative page paths
 *   classicScripts: Set<string>, // <script src> without type="module"
 *   moduleScripts: Set<string>,  // <script type="module" src>
 *   stylesheets: Set<string>,    // <link rel="stylesheet" href>
 *   assets: Set<string>          // every local .js/.css above, deduped
 * }}
 */
export function scanHtmlAssets(root) {
  const htmlFiles = [];
  const classicScripts = new Set();
  const moduleScripts = new Set();
  const stylesheets = new Set();

  for (const htmlFile of walk(root, '.html').sort()) {
    htmlFiles.push(toRelative(root, htmlFile));
    const source = fs.readFileSync(htmlFile, 'utf8');

    SCRIPT_TAG.lastIndex = 0;
    let match;
    while ((match = SCRIPT_TAG.exec(source)) !== null) {
      const attributes = match[1];
      const src = SRC_ATTR.exec(attributes);
      if (!src) continue;                               // inline script
      const resolved = resolveLocal(root, htmlFile, src[1]);
      if (!resolved) continue;
      (MODULE_TYPE.test(attributes) ? moduleScripts : classicScripts).add(resolved);
    }

    LINK_TAG.lastIndex = 0;
    while ((match = LINK_TAG.exec(source)) !== null) {
      const attributes = match[1];
      if (!REL_STYLESHEET.test(attributes)) continue;
      const href = HREF_ATTR.exec(attributes);
      if (!href) continue;
      const resolved = resolveLocal(root, htmlFile, href[1]);
      if (resolved) stylesheets.add(resolved);
    }
  }

  const assets = new Set([...classicScripts, ...moduleScripts, ...stylesheets]);
  return { htmlFiles, classicScripts, moduleScripts, stylesheets, assets };
}
