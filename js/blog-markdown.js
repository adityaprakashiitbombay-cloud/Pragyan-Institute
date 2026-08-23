// ============================================================================
// PRAGYAN INSTITUTE — BLOG MARKDOWN RENDERER & SLUG UTILITIES
// ----------------------------------------------------------------------------
// Pure module shared by the public reader (js/app.js) and the admin editor
// preview (js/portal.js). Imported by tests/blog.test.js.
//
// SECURITY MODEL (the whole point of this file):
//   1. ESCAPE FIRST  — every character of author input is HTML-escaped before
//      any markup transform runs, so `<script>` in an article can never reach
//      the DOM as markup.
//   2. ALLOWLIST TRANSFORMS — only the patterns below generate tags, and link
//      hrefs are scheme-checked to http(s).
// ============================================================================

/** Escape &, <, >, ", ' — identical entity map to the site's escapeHtml. */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/**
 * URL-safe slug: lowercase, ascii-fold common punctuation, collapse runs of
 * non-alphanumerics into single hyphens, trim edges. "Board Exams: 10th &
 * 12th Strategy!" -> "board-exams-10th-12th-strategy"
 */
export function slugifyTitle(title) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['"’‘]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

/** Reading-time estimate at ~200 wpm, minimum 1. */
export function estimateReadingMinutes(markdown) {
  const words = String(markdown || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200) || 1);
}

const CALLOUT_KINDS = new Set(['info', 'warn', 'tip']);

function inline(text) {
  let out = text;
  // Links first so their inner text is not re-processed by emphasis passes.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (!/^https?:\/\//i.test(href)) return label;
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

/**
 * Render the allowlisted markdown subset to a safe HTML string.
 * Supported: #/##/### headings, - bullets, 1. numbered items, > quotes,
 * ``` fenced code, :::info|warn|tip callouts … ::: , **bold**, *em*,
 * `code`, [text](https:// links). Everything else becomes a paragraph.
 */
export function renderMarkdown(markdown) {
  const src = escapeHtml(String(markdown ?? '').replace(/\r\n?/g, '\n'));
  const lines = src.split('\n');
  const html = [];

  let para = [];
  let list = null;          // 'ul' | 'ol'
  let code = null;          // string buffer when inside ```
  let quote = [];
  let callout = null;       // { kind, body: [] }

  const flushPara = () => {
    if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { html.push(`</${list}>`); list = null; }
  };
  const flushQuote = () => {
    if (quote.length) {
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      quote = [];
    }
  };
  const flushCallout = () => {
    if (callout) {
      html.push(`<div class="md-callout md-callout-${callout.kind}">${inline(callout.body.join(' '))}</div>`);
      callout = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); flushCallout(); };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (code !== null) {
      if (/^```/.test(line.trim())) {
        html.push(`<pre><code>${code.join('\n')}</code></pre>`);
        code = null;
      } else {
        code.push(rawLine);
      }
      continue;
    }

    const trimmed = line.trim();

    if (/^```/.test(trimmed)) { flushAll(); code = []; continue; }

    const calloutOpen = /^:::(info|warn|tip)\b/i.exec(trimmed);
    if (calloutOpen) { flushAll(); callout = { kind: calloutOpen[1].toLowerCase(), body: [] }; continue; }
    if (callout && /^:::$/.test(trimmed)) { flushCallout(); continue; }
    if (callout) {
      // Callouts may contain simple bullet lines too.
      if (/^[-*]\s+/.test(trimmed)) callout.body.push(`• ${trimmed.replace(/^[-*]\s+/, '')}`);
      else if (trimmed === '') callout.body.push('<br>');
      else callout.body.push(trimmed);
      continue;
    }

    if (trimmed === '') { flushPara(); flushList(); flushQuote(); continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level + 2}>${inline(heading[2])}</h${level + 2}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushPara(); flushQuote();
      if (list !== 'ul') { flushList(); html.push('<ul>'); list = 'ul'; }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flushPara(); flushQuote();
      if (list !== 'ol') { flushList(); html.push('<ol>'); list = 'ol'; }
      html.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    // After HTML-escaping, a leading ">" lives as "&gt;".
    const quoted = /^(&gt;|>)\s?(.*)$/.exec(trimmed);
    if (quoted) {
      flushPara(); flushList();
      quote.push(quoted[2]);
      continue;
    }

    flushList(); flushQuote();
    para.push(trimmed);
  }

  // EOF with an unterminated fence: close it safely rather than leaking state.
  if (code !== null) html.push(`<pre><code>${code.join('\n')}</code></pre>`);
  flushAll();

  return html.join('\n');
}

// Browser binding for the classic-script pipeline (no bundler in this repo).
if (typeof window !== 'undefined') {
  window.PragyanBlogMarkdown = { renderMarkdown, slugifyTitle, estimateReadingMinutes, escapeHtml };
}
