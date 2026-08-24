// ============================================================================
// T26 — INTERACTIVE FACULTY & MENTOR RATINGS
// ----------------------------------------------------------------------------
// Verifies real-time rating widgets, SQL table/RPC definitions, gateway
// allowlist entries, and accessible DOM structures.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runMentorRatingTests(assert) {
  // --- 1. SQL Hardening & Schema --------------------------------------------
  const sql = read('supabase_production_hardening.sql');
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.mentor_ratings'),
    'T26.1: hardening SQL declares mentor_ratings table');
  assert(sql.includes("CHECK (mentor_id IN ('chandan-kumar', 'ravi-ranjan', 'aditi-singh'))"),
    'T26.2: mentor_id is strictly validated against canonical faculty ids');
  assert(sql.includes('CHECK (rating BETWEEN 1 AND 5)'),
    'T26.3: rating is constrained to 1-5 integer range');
  assert(sql.includes('CONSTRAINT uq_mentor_client UNIQUE (mentor_id, client_id)'),
    'T26.4: unique constraint prevents duplicate vote spamming per client');
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.submit_mentor_rating'),
    'T26.5: atomic submit_mentor_rating RPC is defined in SQL');
  assert(sql.includes('CREATE OR REPLACE FUNCTION public.get_mentor_ratings'),
    'T26.6: aggregated get_mentor_ratings RPC is defined in SQL');
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.submit_mentor_rating(text, integer, text) TO service_role'),
    'T26.7: submit_mentor_rating execution is granted to service_role');
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.get_mentor_ratings() TO service_role'),
    'T26.8: get_mentor_ratings execution is granted to service_role');

  // --- 2. Gateway Allowlist (api/db.js) --------------------------------------
  const dbSrc = read('api/db.js');
  assert(/submit_mentor_rating:\s*\{\s*anon:\s*true,\s*params:\s*\['p_mentor_id',\s*'p_rating',\s*'p_client_id'\]/.test(dbSrc),
    'T26.9: submit_mentor_rating is allowlisted with anon: true in /api/db');
  assert(/get_mentor_ratings:\s*\{\s*anon:\s*true/.test(dbSrc),
    'T26.10: get_mentor_ratings is allowlisted with anon: true in /api/db');

  // --- 3. Public Section Markup (index.html) --------------------------------
  const html = read('index.html');
  const mentors = ['chandan-kumar', 'ravi-ranjan', 'aditi-singh'];
  mentors.forEach(id => {
    assert(html.includes(`data-mentor-id="${id}"`),
      `T26.11: index.html contains rating widget for mentor "${id}"`);
  });
  assert(html.includes('class="star-rating interactive-stars"'),
    'T26.12: interactive star rating container is present');
  assert(html.includes('data-star="1"') && html.includes('data-star="5"'),
    'T26.13: 1 to 5 star rating buttons are present');
  assert(html.includes('data-rating-score') && html.includes('data-rating-count'),
    'T26.14: rating score and review count targets exist');

  // --- 4. Logic & Handlers (js/app.js) --------------------------------------
  const appSrc = read('js/app.js');
  assert(appSrc.includes('initMentorRatings'),
    'T26.15: initMentorRatings exists in js/app.js');
  assert(appSrc.includes('submit_mentor_rating'),
    'T26.16: js/app.js calls submit_mentor_rating RPC');
  assert(appSrc.includes('get_mentor_ratings'),
    'T26.17: js/app.js calls get_mentor_ratings RPC');
  assert(appSrc.includes('pragyan_mentor_all_votes') || appSrc.includes('pragyan_user_mentor_ratings'),
    'T26.18: user voting state is cached in localStorage');
  assert(appSrc.includes('initPublicFeatures'),
    'T26.19: public features are bundled and initialized on DOM load');
}
