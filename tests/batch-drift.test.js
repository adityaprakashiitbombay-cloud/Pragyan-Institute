// ============================================================================
// T20 — CANONICAL BATCH DRIFT GUARD (JavaScript sources)
// ----------------------------------------------------------------------------
// T19 guards the shipped HTML. This guards the JS, where the same class of
// defect is invisible until a real record is written wrong.
//
// The portal used to identify a student's batch by substring — `className
// .includes('10th')`, `includes('8')`, `includes('Junior')` — and to key its
// filters off four short-lived labels: '10th', '9th', '8th', 'junio'. Both
// habits produced silent, permanent data damage:
//
//   * `includes('10')` matched "Class 1st to 5th (2010 intake)", so a Class
//     10th billing run could bill primary-school students at ₹1,000.
//   * `includes('9th')` matched "Special English 9th to 12th", so English
//     students were swept into Class 9th reminders.
//   * When resolution moved to canonical ids (BAT-10, BAT-ENG-912, …), every
//     `=== '10th'` comparison became permanently false. Those sites did not
//     throw — they quietly selected nobody, showed ₹0, or fell through to a
//     default. Four of them shipped that way: the email-campaign audience, the
//     student timetable, the faculty-lead filter and the collector tally.
//   * Two <select> blocks that *write* student.className offered 3 and 4 of the
//     twelve batches. Opening a Class 12th record in the editor and pressing
//     Save reassigned the student to Class 10th at ₹1,000 instead of ₹1,500.
//
// A grep is the right tool: each of these is "the source still says X while the
// config says Y", and it has to fail the build rather than a code review.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadBrowserConfig } from './academic-config.test.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// Sources that resolve or display batches. Deliberately not a glob: adding a
// file here should be a decision, so a new module cannot join silently.
const JS_SOURCES = ['js/portal.js', 'js/chat.js', 'js/supabase-sync.js'];

/**
 * Strip // line comments and block comments so the explanatory notes left at
 * each fixed site — which quote the very patterns being banned — do not trip
 * the guard. String literals containing "//" (URLs) are preserved by requiring
 * the // to be preceded by start-of-line or whitespace and not by a colon.
 *
 * Block comments are replaced by their own newlines rather than by '', so the
 * cleaned source keeps a 1:1 line mapping with the file on disk. Without that,
 * every reported line number after the first block comment points somewhere
 * else and the failure message sends you to the wrong code.
 *
 * CRLF is normalised first: these files are checked out with \r\n, and `.` does
 * not match \r in JavaScript, so `//comment.*$` matched nothing at all and the
 * stripper silently passed every comment through as live code.
 */
function stripJsComments(source) {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
    .split('\n')
    .map(line => line.replace(/(^|\s)\/\/(?![^\s]*['"`]).*$/, '$1'))
    .join('\n');
}

export function runBatchDriftTests(assert) {
  const academic = loadBrowserConfig();
  const BATCHES = academic.BATCHES;
  const canonicalIds = new Set(BATCHES.map(b => b.batchId));

  const cleaned = new Map(JS_SOURCES.map(file => [file, stripJsComments(read(file))]));

  // --- 1. No comparisons against retired batch keys --------------------------
  // These four strings were the portal's batch keys before canonical ids. A
  // comparison against one now can never be true.
  const RETIRED_KEYS = ['10th', '9th', '8th', 'junio', 'JUNIO', 'BAT-JUNIO'];
  const retiredHits = [];
  for (const [file, source] of cleaned) {
    source.split('\n').forEach((line, i) => {
      for (const key of RETIRED_KEYS) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // `=== '10th'`, `!== "junio"`, `case 'BAT-JUNIO':`
        if (new RegExp(`(===|!==|==|!=|case)\\s*(['"\`])${escaped}\\2`).test(line)) {
          retiredHits.push(`${file}:${i + 1} compares against '${key}'`);
        }
      }
    });
  }
  assert(
    retiredHits.length === 0,
    `T20.1: no JS source compares a batch key against a retired label${retiredHits.length ? ` (${retiredHits.join('; ')})` : ''}`
  );

  // --- 2. No substring class resolution -------------------------------------
  // `className.includes('10')` is the single most damaging pattern this repo
  // has carried: it matches any class name that happens to contain those
  // digits, including years in parentheses.
  const substringHits = [];
  const CLASS_VAR = /\b(className|class_name|batchName|batch_name|sClass|bName|targetBatch|targetClass)\b/;
  for (const [file, source] of cleaned) {
    source.split('\n').forEach((line, i) => {
      if (!CLASS_VAR.test(line)) return;
      const m = line.match(/\.includes\(\s*(['"`])((?:\d|1st|Junior|JUNIO|ACHIEVER|NURTURE|ALPHA)[^'"`]*)\1/);
      if (m) substringHits.push(`${file}:${i + 1} .includes('${m[2]}')`);
    });
  }
  assert(
    substringHits.length === 0,
    `T20.2: no JS source resolves a class by substring match${substringHits.length ? ` (${substringHits.join('; ')})` : ''}`
  );

  // --- 3. Batch-assignment selects offer every batch -------------------------
  // Selects that write student.className are generated from the config, so the
  // generator must be the only thing feeding them. A literal <option> next to
  // one of these ids means someone hand-listed a subset again.
  const portal = cleaned.get('js/portal.js');
  const ASSIGNMENT_SELECTS = ['newStuClass', 'mgmtStuClass1'];
  const handListed = [];
  for (const id of ASSIGNMENT_SELECTS) {
    const block = portal.match(new RegExp(`<select id="${id}"[\\s\\S]{0,900}?</select>`));
    if (!block) {
      handListed.push(`${id} (select not found)`);
      continue;
    }
    if (/<option\s/.test(block[0])) handListed.push(`${id} has literal <option> markup`);
    if (!/batch(?:Assignment|Select)Options\s*\(/.test(block[0])) handListed.push(`${id} does not call batchAssignmentOptions()`);
  }
  assert(
    handListed.length === 0,
    `T20.3: every batch-assignment <select> is generated from the config${handListed.length ? ` (${handListed.join('; ')})` : ''}`
  );

  // --- 4. Every canonical batch is reachable from the portal -----------------
  // The display metadata maps are hand-maintained by design (emoji, badge
  // colours, subject lists). Each must cover all twelve, or a student in an
  // uncovered batch sees a blank badge or an empty timetable.
  const MAPS = ['BATCH_UI', 'BATCH_BADGE', 'BATCH_SUBJECTS'];
  const mapGaps = [];
  for (const name of MAPS) {
    const block = portal.match(new RegExp(`const ${name} = \\{[\\s\\S]*?\\n  \\};`));
    if (!block) {
      mapGaps.push(`${name} (not found)`);
      continue;
    }
    const keys = new Set([...block[0].matchAll(/['"]([A-Z0-9-]+)['"]\s*:/g)].map(m => m[1]));
    const missing = [...canonicalIds].filter(id => !keys.has(id));
    const extra = [...keys].filter(id => !canonicalIds.has(id));
    if (missing.length) mapGaps.push(`${name} missing ${missing.join(',')}`);
    if (extra.length) mapGaps.push(`${name} has unknown ${extra.join(',')}`);
  }
  assert(
    mapGaps.length === 0,
    `T20.4: every per-batch display map covers exactly the ${canonicalIds.size} canonical batches${mapGaps.length ? ` (${mapGaps.join('; ')})` : ''}`
  );

  // --- 5. No flat fee fallback ----------------------------------------------
  // `|| 1000` after a fee lookup silently re-rates the four ₹1,500 senior
  // batches down by a third. Fee fallbacks must go through classMonthlyFee /
  // studentMonthlyFee, which read the config.
  const flatFeeHits = [];
  for (const [file, source] of cleaned) {
    source.split('\n').forEach((line, i) => {
      if (/\b(monthlyFee|monthly_fee|pendingFee|pending_fee|fee)\b/i.test(line) &&
          /(\?\?|\|\|)\s*(1000|1500|800|700|500)\b/.test(line)) {
        flatFeeHits.push(`${file}:${i + 1}`);
      }
    });
  }
  assert(
    flatFeeHits.length === 0,
    `T20.5: no fee lookup falls back to a hardcoded rate${flatFeeHits.length ? ` (${flatFeeHits.join('; ')})` : ''}`
  );

  // --- 6. Faculty attribution comes from the roster -------------------------
  // The audit ledger used to classify every receipt as Chandan-or-Ravi, which
  // reported Aditi Singh's collections under Prof. Ravi Ranjan's name.
  const attributionHits = [];
  for (const [file, source] of cleaned) {
    source.split('\n').forEach((line, i) => {
      if (/isChandan|chandanTotal|raviTotal|chandanCash|raviCash/.test(line)) {
        attributionHits.push(`${file}:${i + 1}`);
      }
    });
  }
  assert(
    attributionHits.length === 0,
    `T20.6: no two-way Chandan/Ravi collection split remains${attributionHits.length ? ` (${attributionHits.join('; ')})` : ''}`
  );

  // --- 7. The public assistant never states a fee of its own -----------------
  // js/chat.js is the only file whose output reaches a parent before they enrol,
  // and it had drifted furthest: it quoted a "₹1,200 – ₹1,500" band for Class
  // 11th/12th (the rate is a flat ₹1,500 and ₹1,200 is not charged for
  // anything), taught Gemini a "Junior Batch (JUNIO): ₹700" that conflated the
  // ₹500 and ₹700 batches, and omitted eight batches including all three
  // Special English ones. Every fee it speaks is now generated from the config,
  // so any surviving rupee literal is a regression.
  const chatFeeLiterals = [];
  cleaned.get('js/chat.js').split('\n').forEach((line, i) => {
    if (/₹\s*\d/.test(line)) chatFeeLiterals.push(`js/chat.js:${i + 1}`);
  });
  assert(
    chatFeeLiterals.length === 0,
    `T20.7: the AI assistant quotes no hardcoded fee${chatFeeLiterals.length ? ` (${chatFeeLiterals.join('; ')})` : ''}`
  );

  // --- 8. The assistant knows every batch and every faculty member -----------
  // A parent asking about a batch the assistant has never heard of gets the
  // generic fallback, which reads as "we don't offer that".
  const chatSrc = cleaned.get('js/chat.js');
  const chatGaps = [];
  ['feeTierLines', 'batchLines', 'facultyLines', 'classRangeLabel'].forEach(fn => {
    if (!new RegExp(`function ${fn}\\s*\\(`).test(chatSrc)) chatGaps.push(`${fn}() missing`);
  });
  // The system prompt is what Gemini is told; it must be built, not literal.
  if (!/function systemPrompt\s*\(/.test(chatSrc)) chatGaps.push('systemPrompt() is not a function');
  if (/const SYSTEM_PROMPT\s*=/.test(chatSrc)) chatGaps.push('SYSTEM_PROMPT is a load-time constant again');
  assert(
    chatGaps.length === 0,
    `T20.8: the AI assistant derives its batch, fee and faculty facts from the config${chatGaps.length ? ` (${chatGaps.join('; ')})` : ''}`
  );
}
