// ============================================================================
// T21 — STATIC ACCESSIBILITY & MOBILE GUARD
// ----------------------------------------------------------------------------
// tests/a11y.test.js is a Playwright + axe audit. It needs a browser and an axe
// build, neither of which is a dependency of this repo, so it has never run in
// CI or locally — `npm test` skips it entirely. Everything it was meant to catch
// regressed unnoticed.
//
// This file is the part that can run with no browser: a static read of the
// shipped HTML, the JS-injected markup and the stylesheets. It is not a
// substitute for a real axe run, but it holds the specific defects this codebase
// actually shipped:
//
//   * 66 form controls with no accessible name. The portal's markup pattern is a
//     correctly-placed <label> that was missing `for`, so every filter, search
//     box, fee amount and date of birth field announced as bare "edit text", and
//     clicking the label did not focus the field.
//   * 11 modal close buttons whose only content was a Font Awesome <i>. All
//     eleven announced as an unnamed "button", and one inside a <form> would
//     have submitted it, since a <button> with no type defaults to submit.
//   * 352 decorative icons in the accessibility tree, injecting a junk token
//     before almost every label in the dashboard.
//   * Form controls between 12.8px and 15.2px. Mobile Safari zooms the viewport
//     whenever a focused control is under 16px and does not zoom back out, so
//     tapping any search box left the dashboard scrolled sideways.
//   * Panels hidden with `opacity: 0; pointer-events: none` but no
//     `visibility: hidden`, which blocks the mouse and nothing else: the closed
//     chat window stayed fully tabbable, and all three hero slides were read at
//     once.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Normalised to LF on read. These files are checked out CRLF, and a trailing
// \r defeats any pattern anchored with $ — `.` does not match \r in JavaScript.
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8').split('\r\n').join('\n');

const MARKUP_SOURCES = ['index.html', 'pay.html', 'features.html', 'js/portal.js', 'js/app.js', 'js/chat.js'];
const STYLE_SOURCES = ['css/main.css', 'css/components.css', 'css/portal.css', 'css/animations.css'];

const lineAt = (src, index) => src.slice(0, index).split('\n').length;

/**
 * Index just past the '>' closing the tag that starts at `start`, or -1 if the
 * tag cannot be resolved.
 *
 * This needs a context stack rather than a single "in a quote" flag, because the
 * markup here nests three languages. An attribute value is delimited by " or ',
 * a ${...} inside it is JavaScript with its own independent quoting, and a
 * string inside that expression can contain either delimiter. Nine controls are
 * written as
 *   value="${(admin.name || '').replace(/"/g, '&quot;')}"
 * where a flat flag reads the " inside the regex as closing the attribute, then
 * re-opens on the next quote it finds. Eight of those resolved to a *wrong* end
 * index — the audit read the following attributes as if they belonged to this
 * tag — and the ninth ran to end of file. Neither showed up as an error.
 *
 * Also has to ignore '>' inside an expression: several icons interpolate a
 * ternary, e.g. <i class="fa-solid ${s.pendingFee > 0 ? 'a' : 'b'}">.
 */
function tagEnd(src, start) {
  // 'tag'  — inside the tag, outside any attribute value
  // 'attr' — inside an attribute value delimited by q
  // 'expr' — inside a ${...} template expression
  // 'brace'— inside an object/block literal within an expression
  // 'str'  — inside a string literal within an expression
  const stack = [{ kind: 'tag' }];
  // Characters that can precede a regex literal but not a division operator.
  const REGEX_PRECEDES = '(,=:[!&|?{;+*%~^<>-';
  let i = start;

  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i];

    if (top.kind === 'tag') {
      if (c === '"' || c === "'") stack.push({ kind: 'attr', q: c });
      else if (c === '$' && src[i + 1] === '{') { stack.push({ kind: 'expr' }); i++; }
      else if (c === '>') return i + 1;
    } else if (top.kind === 'attr') {
      if (c === '$' && src[i + 1] === '{') { stack.push({ kind: 'expr' }); i++; }
      else if (c === top.q) stack.pop();
    } else if (top.kind === 'expr' || top.kind === 'brace') {
      if (c === '"' || c === "'" || c === '`') stack.push({ kind: 'str', q: c });
      else if (c === '{') stack.push({ kind: 'brace' });
      else if (c === '}') stack.pop();
      else if (c === '/') {
        if (src[i + 1] === '/') {                       // line comment
          const nl = src.indexOf('\n', i);
          if (nl === -1) return -1;
          i = nl;
        } else if (src[i + 1] === '*') {                // block comment
          const close = src.indexOf('*/', i);
          if (close === -1) return -1;
          i = close + 1;
        } else {
          let j = i - 1;
          while (j >= start && /\s/.test(src[j])) j--;
          if (j < start || REGEX_PRECEDES.includes(src[j])) {
            let k = i + 1, inClass = false, closed = false;
            while (k < src.length && src[k] !== '\n') {
              if (src[k] === '\\') k++;
              else if (src[k] === '[') inClass = true;
              else if (src[k] === ']') inClass = false;
              else if (src[k] === '/' && !inClass) { closed = true; break; }
              k++;
            }
            if (closed) i = k;                          // land on the closing slash
          }
        }
      }
    } else if (top.kind === 'str') {
      if (c === '\\') i++;
      else if (c === top.q) stack.pop();
      else if (top.q === '`' && c === '$' && src[i + 1] === '{') { stack.push({ kind: 'expr' }); i++; }
    }
    i++;
  }
  return -1;
}

/** True when `index` sits inside an unclosed <label> opening tag's element. */
function insideLabel(src, index) {
  // Scan backwards for the nearest <label or </label>. A <label ...> found first
  // means this control is wrapped by it. The lookback is unbounded rather than a
  // fixed character window: one wrapping <label> in js/portal.js carries 252
  // characters of inline style, which a 220-character window read as "unlabelled".
  const open = src.lastIndexOf('<label', index);
  if (open === -1) return false;
  const close = src.lastIndexOf('</label', index);
  return close < open;
}

export function runStaticA11yTests(assert) {
  const sources = new Map(MARKUP_SOURCES.map(f => [f, read(f)]));
  const styles = new Map(STYLE_SOURCES.map(f => [f, read(f)]));

  // Tags the scanner could not resolve. These must be reported, not skipped: a
  // `continue` here means the element is dropped from every check below, so a
  // genuinely unlabelled control could hide behind a parser limitation and the
  // suite would still read as green.
  const unscannable = [];

  // --- 1. Every form control has an accessible name -------------------------
  const unnamed = [];
  for (const [file, src] of sources) {
    // \s, not \b, before every attribute name. \b matches after a hyphen, so a
    // \b-anchored `aria-label=` is also satisfied by `data-aria-label=` — the
    // negative test caught exactly that class of false pass elsewhere in this
    // file. Attributes in these sources are always whitespace-separated.
    const boundIds = new Set([...src.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map(m => m[1]));
    const re = /<(input|select|textarea)(?=[\s>])/g;
    let m;
    while ((m = re.exec(src))) {
      const end = tagEnd(src, m.index);
      if (end === -1) { unscannable.push(`${file}:${lineAt(src, m.index)} <${m[1]}>`); continue; }
      const tag = src.slice(m.index, end);
      const type = (tag.match(/\stype="([^"]+)"/) || [])[1] || 'text';
      if (/^(hidden|submit|button|reset|image)$/i.test(type)) continue;
      if (/\saria-label(?:ledby)?=/.test(tag)) continue;
      const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
      if (id && boundIds.has(id)) continue;
      if (insideLabel(src, m.index)) continue;
      unnamed.push(`${file}:${lineAt(src, m.index)} <${m[1]}${id ? ' #' + id : ''}>`);
    }
  }
  assert(
    unnamed.length === 0,
    `T21.1: every form control has an accessible name${unnamed.length ? ` (${unnamed.slice(0, 8).join('; ')}${unnamed.length > 8 ? `; +${unnamed.length - 8} more` : ''})` : ''}`
  );

  // --- 2. Icon-only buttons and links are named -----------------------------
  // A control whose entire content is an <i> glyph has no text to announce.
  const namelessControls = [];
  for (const [file, src] of sources) {
    const re = /<(button|a)(?=[\s>])/g;
    let m;
    while ((m = re.exec(src))) {
      const open = tagEnd(src, m.index);
      if (open === -1) { unscannable.push(`${file}:${lineAt(src, m.index)} <${m[1]}>`); continue; }
      const tag = src.slice(m.index, open);
      const closeIdx = src.indexOf(`</${m[1]}`, open);
      if (closeIdx === -1 || closeIdx - open > 400) continue;
      const inner = src.slice(open, closeIdx);
      // A nested image's alt text names the control — that is how an image link
      // gets its accessible name — so pull the alt out before stripping tags.
      const altText = [...inner.matchAll(/\salt="([^"]*)"/g)].map(a => a[1]).join(' ');
      const text = (altText + ' ' + inner)
        .replace(/<i(?=[\s>])[\s\S]*?<\/i>/g, '')
        .replace(/<svg[\s\S]*?<\/svg>/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&[a-z]+;|&#\d+;/gi, '')
        .replace(/\$\{[^}]*\}/g, 'X')
        .trim();
      if (text.length > 0) continue;
      if (/\saria-label(?:ledby)?=|\stitle=|\saria-hidden="true"/.test(tag)) continue;
      namelessControls.push(`${file}:${lineAt(src, m.index)} <${m[1]}>`);
    }
  }
  assert(
    namelessControls.length === 0,
    `T21.2: every icon-only button and link has an accessible name${namelessControls.length ? ` (${namelessControls.slice(0, 8).join('; ')})` : ''}`
  );

  // --- 3. Decorative icons stay out of the accessibility tree ---------------
  const exposedIcons = [];
  for (const [file, src] of sources) {
    const re = /<i(?=[\s>])/g;
    let m;
    while ((m = re.exec(src))) {
      const end = tagEnd(src, m.index);
      if (end === -1) { unscannable.push(`${file}:${lineAt(src, m.index)} <i>`); continue; }
      const tag = src.slice(m.index, end);
      if (!/\sclass=/.test(tag) || !/fa[srlbd]?[- ]/.test(tag)) continue;
      if (/\saria-hidden=/.test(tag)) continue;
      exposedIcons.push(`${file}:${lineAt(src, m.index)}`);
    }
  }
  assert(
    exposedIcons.length === 0,
    `T21.3: every decorative Font Awesome icon is aria-hidden${exposedIcons.length ? ` (${exposedIcons.slice(0, 8).join('; ')}${exposedIcons.length > 8 ? `; +${exposedIcons.length - 8} more` : ''})` : ''}`
  );

  // Reported after the scans above have filled it in.
  assert(
    unscannable.length === 0,
    `T21.3b: every element tag resolves, so none is silently dropped from the audit${unscannable.length ? ` (${unscannable.join('; ')})` : ''}`
  );

  // --- 4. Hidden panels leave the tab order --------------------------------
  // `opacity: 0; pointer-events: none` blocks the mouse and nothing else. Only
  // these two rules are allowed to skip visibility: neither can ever contain a
  // focusable node, and toggling visibility on the glimmer would kill its fade.
  const TAB_TRAP_ALLOWED = new Set(['.site-toast', '.metallic-card-glimmer']);
  const tabTraps = [];
  for (const [file, src] of styles) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
      const selector = m[1].trim().split('\n').pop().trim();
      const body = m[2];
      if (!/opacity:\s*0\s*[;}]/.test(body)) continue;
      if (!/pointer-events:\s*none/.test(body)) continue;
      if (/visibility:\s*hidden/.test(body) || /display:\s*none/.test(body)) continue;
      if (TAB_TRAP_ALLOWED.has(selector)) continue;
      tabTraps.push(`${file}:${lineAt(src, m.index)} ${selector}`);
    }
  }
  assert(
    tabTraps.length === 0,
    `T21.4: no panel is hidden by opacity alone while staying focusable${tabTraps.length ? ` (${tabTraps.join('; ')})` : ''}`
  );

  // --- 5. The touch-device 16px form control floor is in place -------------
  // A dozen declarations sit under 16px by design for desktop density. Rather
  // than bumping each one, a single `pointer: coarse` rule raises them all on
  // touch devices. If that rule ever goes, every one of them zooms iOS again.
  const mainCss = styles.get('css/main.css');
  const coarseBlocks = mainCss.match(/@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\n\}/g) || [];
  const hasFontFloor = coarseBlocks.some(b =>
    /font-size:\s*16px\s*!important/.test(b) && /\bselect\b/.test(b) && /\btextarea\b/.test(b));
  assert(
    hasFontFloor,
    'T21.5: a pointer:coarse rule floors input, select and textarea at 16px so iOS does not auto-zoom'
  );

  // --- 6. Reduced motion zeroes delays, not just durations ----------------
  // The visibility toggles above hide themselves with `transition: visibility 0s
  // linear 0.3s`. Zeroing only the duration leaves that delay intact, so with
  // reduced motion on a dismissed panel stayed focusable for the full delay —
  // the exact trap T21.4 exists to prevent.
  const reducedBlocks = mainCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) || [];
  const zeroesDelay = reducedBlocks.some(b => /transition-delay:\s*0s?\s*!important/.test(b));
  assert(
    zeroesDelay,
    'T21.6: the reduced-motion reset zeroes transition-delay as well as transition-duration'
  );

  // --- 7. The chat widget's dialog contract -------------------------------
  // The floating assistant is the only dialog built entirely in JS, so no HTML
  // guard covers it. It shipped with a closed panel that was invisible and fully
  // tabbable, a toggle whose label permanently read "Open", a silent transcript,
  // and a 14.4px input that zoomed iOS on tap.
  const chat = sources.get('js/chat.js');
  const chatGaps = [];
  // Patterns require a leading \s before an attribute name so a prefixed
  // attribute cannot satisfy them by substring — `data-role="dialog"` contains
  // `role="dialog"`, and a negative test confirmed the unanchored version passed
  // against markup where the real role attribute had been renamed away.
  const require_ = (pattern, description) => {
    if (!new RegExp(pattern).test(chat)) chatGaps.push(description);
  };
  require_('id="chatWindow"[^>]*\\srole="dialog"', '#chatWindow is not role="dialog"');
  require_('id="chatWindow"[^>]*\\saria-labelledby="chatWindowTitle"', '#chatWindow has no aria-labelledby');
  require_('id="chatMessages"[^>]*\\srole="log"', '#chatMessages is not role="log"');
  require_('\\saria-live="polite"', 'the transcript is not announced (no aria-live)');
  require_('id="chatToggleBtn"[^>]*\\saria-expanded=', 'the toggle has no aria-expanded');
  require_('function setChatOpen', 'open/close state is not centralised in setChatOpen()');
  require_("addEventListener\\('keydown'[\\s\\S]{0,200}'Escape'", 'Escape does not close the chat');
  require_('id="chatResetBtn"[^>]*\\saria-label=', 'the reset button has no aria-label');
  require_('id="chatKeySettingsBtn"[^>]*\\saria-label=', 'the settings button has no aria-label');
  require_('\\sfor="chatInput"', 'the message box has no associated label');
  require_('\\sfor="customApiKeyInput"', 'the API key field has no associated label');
  require_('\\.sr-only-chat', 'the visually-hidden label class is missing');
  require_('#chatInput[\\s\\S]{0,400}font-size: 16px', '#chatInput is under the 16px iOS threshold');
  require_('prefers-reduced-motion', 'the widget has no reduced-motion block');
  // The closed panel must leave the accessibility tree, not just fade out.
  const closedRule = (chat.match(/\.chat-window \{[\s\S]*?\n      \}/) || [''])[0];
  if (!/visibility:\s*hidden/.test(closedRule)) chatGaps.push('.chat-window is hidden by opacity alone');
  assert(
    chatGaps.length === 0,
    `T21.7: the chat widget meets its dialog and mobile contract${chatGaps.length ? ` (${chatGaps.join('; ')})` : ''}`
  );

  // --- 8. Every suggestion chip still has a preloaded answer ---------------
  // The five chips were duplicated between the initial render and the reset
  // handler. Renaming the fee chip updated one copy, so after a reset that chip
  // asked a question preloadedChipAnswers() no longer had a key for and fell
  // through to a live Gemini call — slow, quota-burning, and prone to inventing
  // a fee figure. The markup now comes from one chipsMarkup(); this checks the
  // other half of the contract, that the two lists still agree.
  const chipsBlock = (chat.match(/const SUGGESTION_CHIPS = \[[\s\S]*?\n  \];/) || [''])[0];
  const chipQueries = [...chipsBlock.matchAll(/query:\s*'([^']*)'/g)].map(m => m[1]);
  const answersStart = chat.indexOf('function preloadedChipAnswers()');
  const answersBlock = answersStart === -1 ? '' : chat.slice(answersStart, chat.indexOf('\n  }', answersStart));
  const answerKeys = new Set([...answersBlock.matchAll(/^\s{6}"([^"]+)":/gm)].map(m => m[1]));

  const orphanChips = chipQueries.filter(q => !answerKeys.has(q));
  const orphanAnswers = [...answerKeys].filter(k => !chipQueries.includes(k));
  assert(
    chipQueries.length >= 5 && answerKeys.size >= 5 &&
      orphanChips.length === 0 && orphanAnswers.length === 0 &&
      /function chipsMarkup\s*\(/.test(chat),
    `T21.8: every suggestion chip resolves to a preloaded answer${
      orphanChips.length ? ` — chips with no answer: ${orphanChips.join(', ')}` : ''}${
      orphanAnswers.length ? ` — answers with no chip: ${orphanAnswers.join(', ')}` : ''}${
      chipQueries.length < 5 || answerKeys.size < 5
        ? ` (parsed ${chipQueries.length} chips, ${answerKeys.size} answers)` : ''}`
  );

  // The chip markup must be built once, not pasted into both render paths.
  const inlineChipMarkup = (chat.match(/data-query="[^"$]/g) || []).length;
  assert(
    inlineChipMarkup === 0,
    `T21.9: no hand-written data-query chip markup outside chipsMarkup() (found ${inlineChipMarkup})`
  );
}
