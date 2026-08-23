// ============================================================================
// T19 — SHIPPED MARKUP DRIFT GUARD
// ----------------------------------------------------------------------------
// Every defect this file checks for has actually shipped in this repo:
//
//   * index.html priced the Class 1st–5th Junior card at ₹700 (the Class 6th–7th
//     rate) while carrying data-price-key="junior", so the JS pricing toggle
//     silently repriced the card under the wrong label.
//   * A stray ₹900 sat in the FAQPage JSON-LD and was indexed by Google.
//   * js/academic-config.js was added to index.html but not to sw.js, so the
//     offline shell had no fee table.
//   * pay.html loaded js/config.js with no ?v= tag, so a deploy never reached
//     anyone who had already opened the payment page.
//
// A regex sweep is the right tool here: these are all "the file on disk says X,
// the canonical config says Y" mismatches, and they need to fail the build, not
// a manual read-through.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadBrowserConfig } from './academic-config.test.js';
import { scanHtmlAssets } from '../scripts/_lib/asset-graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** Strip <!-- comments --> so commented-out markup is never inspected. */
const stripComments = source => source.replace(/<!--[\s\S]*?-->/g, '');

const attrValues = (source, attribute) =>
  [...source.matchAll(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, 'gi'))].map(m => m[1]);

const digits = text => Number(String(text).replace(/[^0-9]/g, ''));

export function runMarkupTests(assert) {
  const academic = loadBrowserConfig();
  const PRICE_TABLE = academic.PRICE_TABLE;
  const BATCHES = academic.BATCHES;
  const { htmlFiles, assets } = scanHtmlAssets(ROOT);

  const sources = new Map(htmlFiles.map(page => [page, read(page)]));
  const index = stripComments(sources.get('index.html'));

  // --- Batch cards vs the canonical price table ------------------------------
  const priced = [...index.matchAll(/data-price-key\s*=\s*["']([^"']+)["'][^>]*>\s*([^<]*?)\s*</gi)]
    .map(m => ({ key: m[1], text: m[2] }));

  const unknown = priced.filter(p => !PRICE_TABLE[p.key]).map(p => p.key);
  assert(
    unknown.length === 0,
    `T19.1: every [data-price-key] in index.html exists in PRICE_TABLE${unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''}`
  );

  const rendered = new Set(priced.map(p => p.key));
  const absent = Object.keys(PRICE_TABLE).filter(key => !rendered.has(key));
  assert(
    absent.length === 0,
    `T19.2: all ${Object.keys(PRICE_TABLE).length} canonical batches have a card in index.html${absent.length ? ` (missing: ${absent.join(', ')})` : ''}`
  );

  assert(priced.length === 12, `T19.3: index.html renders exactly 12 priced batch cards (got ${priced.length})`);

  // The bug this catches: the right key on a card showing another batch's fee.
  const mispriced = priced.filter(p => PRICE_TABLE[p.key] && digits(p.text) !== PRICE_TABLE[p.key].monthlyValue);
  assert(
    mispriced.length === 0,
    `T19.4: each card's printed fee matches its data-price-key${mispriced.length ? ` (wrong: ${mispriced.map(p => `${p.key}=${p.text}`).join(', ')})` : ''}`
  );

  // --- No stray fee figures anywhere on the public page ----------------------
  const canonicalAmounts = new Set();
  for (const batch of BATCHES) {
    canonicalAmounts.add(batch.monthlyFee);
    canonicalAmounts.add(academic.annualPrice(batch.monthlyFee));
    canonicalAmounts.add(batch.monthlyFee * 12);           // "instead of ₹18,000"
  }
  const quoted = [...index.matchAll(/₹\s?([0-9][0-9,]{2,})/g)].map(m => digits(m[1]));
  const strays = [...new Set(quoted.filter(amount => !canonicalAmounts.has(amount)))];
  assert(
    strays.length === 0,
    `T19.5: no non-canonical ₹ figure appears in index.html${strays.length ? ` (stray: ${strays.map(a => `₹${a}`).join(', ')})` : ''}`
  );

  // --- Contact form must offer every batch ----------------------------------
  const selectBlock = /<select\b[^>]*id=["']studentClass["'][\s\S]*?<\/select>/i.exec(index);
  assert(!!selectBlock, 'T19.6: index.html has a #studentClass batch selector');
  if (selectBlock) {
    const optionCount = (selectBlock[0].match(/<option\b[^>]*value=["'][^"']+["']/gi) || []).length;
    assert(optionCount === 12, `T19.7: the enquiry form lists all 12 batches (got ${optionCount} non-empty options)`);
  }

  // --- Cache busting: every shipped asset carries a build hash ---------------
  const untagged = [];
  for (const [page, source] of sources) {
    for (const value of [...attrValues(source, 'src'), ...attrValues(source, 'href')]) {
      if (!/^(?:\.{0,2}\/)?(?:js|css)\/[^?#]+\.(?:js|css)$/.test(value)) continue;
      untagged.push(`${page} -> ${value}`);
    }
  }
  assert(
    untagged.length === 0,
    `T19.8: every local js/css reference carries a ?v= build hash${untagged.length ? ` (untagged: ${untagged.join(', ')})` : ''}`
  );

  // --- Offline shell: nothing a page loads may be missing from the SW --------
  const swSource = read('sw.js');
  const precacheBlock = /const PRECACHE_ASSETS = \[([\s\S]*?)\];/.exec(swSource);
  assert(!!precacheBlock, 'T19.9: sw.js declares a PRECACHE_ASSETS list');
  if (precacheBlock) {
    const precached = new Set(
      [...precacheBlock[1].matchAll(/['"]\.\/([^'"]+?)(?:\?v=[^'"]*)?['"]/g)].map(m => m[1])
    );
    const offlineGaps = [...assets, ...htmlFiles].filter(asset => !precached.has(asset));
    assert(
      offlineGaps.length === 0,
      `T19.10: every page and asset is precached by sw.js${offlineGaps.length ? ` (offline-unavailable: ${offlineGaps.join(', ')})` : ''}`
    );
  }

  // --- Mobile & document basics --------------------------------------------
  const noViewport = htmlFiles.filter(page => !/<meta\s+name=["']viewport["']/i.test(sources.get(page)));
  assert(
    noViewport.length === 0,
    `T19.11: every page declares a responsive viewport${noViewport.length ? ` (missing: ${noViewport.join(', ')})` : ''}`
  );

  const noLang = htmlFiles.filter(page => !/<html\b[^>]*\blang\s*=\s*["'][a-z]/i.test(sources.get(page)));
  assert(
    noLang.length === 0,
    `T19.12: every page declares <html lang>${noLang.length ? ` (missing: ${noLang.join(', ')})` : ''}`
  );

  // --- Accessibility: images, dangling ARIA references, duplicate ids --------
  const missingAlt = [];
  for (const page of htmlFiles) {
    for (const tag of stripComments(sources.get(page)).match(/<img\b[^>]*>/gi) || []) {
      if (!/\balt\s*=/i.test(tag)) missingAlt.push(`${page}: ${tag.slice(0, 70)}`);
    }
  }
  assert(
    missingAlt.length === 0,
    `T19.13: every <img> has an alt attribute${missingAlt.length ? ` (missing: ${missingAlt.join(' | ')})` : ''}`
  );

  // A broken aria-controls / aria-labelledby / for is silent in the browser and
  // strands the screen-reader user with an unnamed or uncontrolled widget.
  const ID_REFERENCE_ATTRS = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for'];
  const dangling = [];
  for (const page of htmlFiles) {
    const source = stripComments(sources.get(page));
    const ids = new Set(attrValues(source, 'id'));
    for (const attribute of ID_REFERENCE_ATTRS) {
      for (const value of attrValues(source, attribute)) {
        for (const token of value.trim().split(/\s+/).filter(Boolean)) {
          if (!ids.has(token)) dangling.push(`${page}: ${attribute}="${token}"`);
        }
      }
    }
  }
  assert(
    dangling.length === 0,
    `T19.14: every ARIA/label id reference resolves${dangling.length ? ` (dangling: ${dangling.join(', ')})` : ''}`
  );

  const duplicates = [];
  for (const page of htmlFiles) {
    const seen = new Set();
    for (const id of attrValues(stripComments(sources.get(page)), 'id')) {
      if (seen.has(id)) duplicates.push(`${page}: #${id}`);
      seen.add(id);
    }
  }
  assert(
    duplicates.length === 0,
    `T19.15: no page repeats an id${duplicates.length ? ` (duplicates: ${duplicates.join(', ')})` : ''}`
  );

  // --- Governance & faculty copy -------------------------------------------
  // T17 asserts the roster in the database; this asserts the public page agrees.
  const facultyGaps = academic.FACULTY.filter(person => {
    const needle = person.name.replace(/^PROF\.\s*/i, '');
    return !new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(index);
  }).map(p => p.name);
  assert(
    facultyGaps.length === 0,
    `T19.16: index.html names every canonical faculty member${facultyGaps.length ? ` (absent: ${facultyGaps.join(', ')})` : ''}`
  );
}
