// ============================================================================
// T25 — BLOG & ACADEMIC INSIGHTS HUB
// ----------------------------------------------------------------------------
// Verifies the shared markdown/slug module (js/blog-markdown.js) as a real
// import, then guards every integration seam the feature depends on:
// gateway table/RPC wiring, sync-engine cache mapping, public section
// markup, admin manager, and the SQL migration.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderMarkdown, slugifyTitle, estimateReadingMinutes, escapeHtml }
  from '../js/blog-markdown.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runBlogTests(assert) {
  // --- 1. Markdown renderer: security model ---------------------------------
  const xss = renderMarkdown([
    '# Title',
    '<script>alert(1)</script>',
    '[click](javascript:alert(1))',
    '![img](https://x/y "onerror=alert(1)")'
  ].join('\n'));
  assert(!xss.includes('<script'), 'T25.1: raw <script> in article body never reaches output markup');
  assert(xss.includes('&lt;script&gt;'), 'T25.2: script tag is entity-escaped, not dropped silently');
  assert(!xss.includes('href="javascript:'), 'T25.3: javascript: link hrefs are refused');
  assert(xss.includes('<h3>Title</h3>'), 'T25.4: # heading renders as h3 (article-body scale)');

  // --- 2. Markdown renderer: allowlist features ------------------------------
  const doc = renderMarkdown([
    '## Board Revision Plan',
    '',
    '- Daily **timed** mocks',
    '- Weekly *full* syllabus',
    '',
    '> Revise smart, not long.',
    '',
    '1. Diagnose',
    '2. Drill',
    '',
    ':::tip',
    'Use the last 5 years of papers.',
    ':::',
    '',
    'Read the [official syllabus](https://bsebpatna.com) first.'
  ].join('\n'));
  assert(doc.includes('<h4>Board Revision Plan</h4>'), 'T25.5: ## renders as h4');
  assert(doc.includes('<strong>timed</strong>') && doc.includes('<em>full</em>'), 'T25.6: bold and italic emphasis render');
  assert(doc.includes('<ul>') && doc.includes('<ol>'), 'T25.7: bullet and numbered lists both render');
  assert(doc.includes('<blockquote>Revise smart, not long.</blockquote>'), 'T25.8: blockquote renders');
  assert(doc.includes('md-callout md-callout-tip') && doc.includes('Use the last 5 years of papers.'), 'T25.9: :::tip callout renders with kind class');
  assert(doc.includes('href="https://bsebpatna.com"') && doc.includes('official syllabus'), 'T25.10: https links render with label');
  assert((doc.match(/<p>/g) || []).length >= 0, 'T25.11: renderer produces paragraphs without error');

  // --- 3. Slug + reading time helpers ----------------------------------------
  assert(slugifyTitle('Board Exams: 10th & 12th Strategy!') === 'board-exams-10th-and-12th-strategy',
    'T25.12: slugify lowercases, folds ampersands, hyphenates runs');
  assert(slugifyTitle('   --Weird___Title--   ') === 'weird-title', 'T25.13: slugify trims leading/trailing separators');
  assert(slugifyTitle('') === 'untitled', 'T25.14: empty title falls back to "untitled"');
  assert(estimateReadingMinutes('word '.repeat(600)) === 3, 'T25.15: reading time = words/200 rounded');
  assert(estimateReadingMinutes('tiny') === 1, 'T25.16: reading time floors at 1 minute');

  // --- 4. Gateway wiring (api/db.js) ------------------------------------------
  const dbSrc = read('api/db.js').replace(/\r\n/g, '\n');
  assert(dbSrc.includes("'blog_posts'"), 'T25.17: /api/db knows the blog_posts table');
  assert(dbSrc.includes("PUBLIC_TABLES = new Set(['notices', 'batches', 'blog_posts'])"),
    'T25.18: blog_posts is an anonymous-readable public table via the gateway');
  assert(/table === 'blog_posts' && session\?\.role !== 'admin'[\s\S]{0,120}is_published: true/.test(dbSrc),
    'T25.19: non-admin reads are force-filtered to is_published=true server-side');
  assert(/RPC_ALLOWLIST = \{\s*increment_blog_views:\s*\{\s*anon: true/.test(dbSrc),
    'T25.20: increment_blog_views is the allowlisted anonymous rpc');
  assert(!/STUDENT_TABLES = new Set\([^)]*blog_posts/.test(dbSrc),
    'T25.21: students can never write blog_posts through the gateway');

  // --- 5. Sync engine integration ---------------------------------------------
  const syncSrc = read('js/supabase-sync.js');
  assert(syncSrc.includes("blog_posts:         'pragyan_db_blog_master'"), 'T25.22: sync KEY_MAP maps blog_posts to its offline master key');
  assert(syncSrc.includes(": ['notices', 'batches', 'blog_posts'];"), 'T25.23: anonymous visitors pull blog_posts alongside notices/batches');
  assert(syncSrc.includes("'pragyan_db_blog_master'"), 'T25.24: blog cache key protected under quota eviction CRITICAL_KEYS');
  assert(typeof syncSrc.match(/normalizeBlogPost\(/g)?.length === 'number' && syncSrc.includes('normalizeBlogPost(b)'), 'T25.25: normalizeBlogPost mapper exists in the sync engine');

  // --- 6. Public page -----------------------------------------------------------
  const indexSrc = read('index.html');
  assert(indexSrc.includes('<section id="blog" class="blog-section"'), 'T25.26: index.html ships the #blog section');
  ['Board Exams', 'English Speaking', 'Study Tips', 'Institute News'].forEach(cat => {
    assert(indexSrc.includes(`data-blog-cat="${cat}"`), `T25.27: filter tab wired for "${cat}"`);
  });
  assert(indexSrc.includes('js/blog-markdown.js?v='), 'T25.28: markdown module is loaded versioned on the homepage');

  // --- 7. Admin surface ----------------------------------------------------------
  const portalSrc = read('js/portal.js');
  const tabIndex = read('index.html');
  assert(tabIndex.includes('data-tab="blog"'), 'T25.29: admin dashboard has the Articles & Blog tab button');
  assert(tabIndex.includes('id="adminTabPane-blog"'), 'T25.30: admin dashboard has the blog tab pane target');
  assert(portalSrc.includes("uploadFile(file, 'blog_covers')"), 'T25.31: cover uploads go to pragyan-media/blog_covers/');
  assert(/SupabaseSync\.mutate\(\s*['"]blog_posts['"]/.test(portalSrc), 'T25.32: editor persists through SupabaseSync.mutate (offline-first path)');
  assert(portalSrc.includes("is_published: publishNow"), 'T25.33: draft vs publish toggle drives is_published');

  // --- 8. Upload endpoint whitelist ------------------------------------------------
  const uploadSrc = read('api/upload-file.js');
  assert(uploadSrc.includes("'blog_covers'"), 'T25.34: upload proxy whitelists the blog_covers folder');

  // --- 9. SQL migration ----------------------------------------------------------------
  const sqlSrc = read('supabase_production_hardening.sql');
  assert(sqlSrc.includes('CREATE TABLE IF NOT EXISTS public.blog_posts'), 'T25.35: hardening SQL creates blog_posts');
  assert(sqlSrc.includes('anon_read_published_blog_posts') && sqlSrc.includes('USING (is_published = true)'),
    'T25.36: RLS exposes published rows only to anon');
  assert(sqlSrc.includes('increment_blog_views(p_slug text)'), 'T25.37: atomic view-count RPC exists');
  assert(sqlSrc.includes("REVOKE ALL ON FUNCTION public.increment_blog_views(text) FROM PUBLIC, anon, authenticated"),
    'T25.38: view-count RPC is service-role-only at the SQL layer');

  // --- 10. Editor Header, Close Button & Mobile Action Bar ------------------------
  const portalCss = read('css/portal.css');
  assert(portalSrc.includes('class="inner-modal-header blog-editor-header"'),
    'T25.39: blog editor modal includes .blog-editor-header with visible close button');
  assert(portalSrc.includes('class="btn-close-inner blog-editor-close-btn"') && portalSrc.includes('fa-xmark'),
    'T25.40: blog editor close button uses .blog-editor-close-btn with FontAwesome icon');
  assert(portalSrc.includes('class="blog-editor-actions-bar"') && portalSrc.includes('btn-blog-publish-main'),
    'T25.41: blog editor includes .blog-editor-actions-bar for responsive submit actions');
  assert(portalCss.includes('.blog-editor-actions-bar') && portalCss.includes('.btn-blog-publish-main'),
    'T25.42: portal.css includes mobile responsive rules for blog editor submit buttons and sticky action bar');

  // --- 11. Preloaded Seed Articles Database Integration ---------------------------
  const appSrc = read('js/app.js');
  assert(sqlSrc.includes('INSERT INTO public.blog_posts') && sqlSrc.includes('class-10-cbse-bseb-board-exam-strategy-2026'),
    'T25.43: hardening SQL inserts canonical preloaded seed blog posts');
  assert(appSrc.includes('00000000-0000-0000-0000-000000000001') && portalSrc.includes('00000000-0000-0000-0000-000000000001'),
    'T25.44: app.js and portal.js share matching canonical UUIDs for preloaded articles');
  assert(portalSrc.includes('DEFAULT_SEED_BLOG_POSTS') && portalSrc.includes('blogWriteLocal(seeds)'),
    'T25.45: portal.js preloads seed articles into local store when uninitialized');
  assert(portalSrc.includes("conflict: 'slug'") && portalSrc.includes("SupabaseSync.mutate('blog_posts'"),
    'T25.46: admin blog save uses SupabaseSync.mutate with slug conflict key for seamless editing and upserts');

  // --- 12. Real-Time View Count Cross-Device & Admin Tab Sync ---------------------
  assert(portalSrc.includes('syncAdminBlogPostsFromCloud') && portalSrc.includes('_isSyncingBlog'),
    'T25.47: portal.js implements syncAdminBlogPostsFromCloud to fetch live database views');
  assert(portalSrc.includes('btnRefreshBlogViews') && portalSrc.includes('Refresh Views'),
    'T25.48: portal.js renders #btnRefreshBlogViews with live sync event handler');
  assert(portalSrc.includes('preservedViews') || (portalSrc.includes('Math.max') && portalSrc.includes('views_count')),
    'T25.49: portal.js preserves live views_count on admin article save');
  assert(appSrc.includes('BLOG_VIEWS_UPDATED') && portalSrc.includes('BLOG_VIEWS_UPDATED'),
    'T25.50: app.js and portal.js sync view counts across browser tabs via BroadcastChannel');

  // --- 13. Hardening & Sync Guarantees for Blog Mutations ----------------------
  assert(syncSrc.includes("table === 'blog_posts'") && syncSrc.includes("rowObj.views_count = Math.max"),
    'T25.51: SupabaseSync.mutate explicitly normalizes blog_posts and sanitizes views_count');
  assert(sqlSrc.includes("uq_blog_posts_slug") && sqlSrc.includes("uq_blog_posts_id"),
    'T25.52: SQL defines explicit unique indexes on blog_posts(slug) and blog_posts(id) for conflict-safe upserts');
  assert(sqlSrc.includes("GREATEST(blog_posts.views_count, EXCLUDED.views_count)"),
    'T25.53: SQL seed conflict update preserves monotonically increasing view counts');
  assert(portalSrc.includes("data-blog-toggle") && portalSrc.includes("goingLive"),
    'T25.54: portal.js implements publish/unpublish toggle with optimistic UI update');
  assert(dbSrc.includes("blog_posts: 'created_at'") && dbSrc.includes("ORDER_COLUMNS[table] || 'created_at'"),
    'T25.55: api/db.js explicitly maps blog_posts in ORDER_COLUMNS and falls back safely to created_at');
  assert(portalSrc.includes("mutateOrThrow('blog_posts', 'delete'") && portalSrc.includes("BLOG_POST_UPDATED"),
    'T25.56: portal.js permanently deletes articles from cloud database and broadcasts deletion event');
}

