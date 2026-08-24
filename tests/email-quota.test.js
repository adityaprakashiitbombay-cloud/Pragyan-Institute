// T22 — the email quota layer.
//
// Resend's free tier is a hard 100 messages per calendar day, and this system has
// three independent senders (the cron billing run, the admin manual trigger, and
// student receipt downloads) that can all fire on the same day. The gate only
// works if EVERY sender goes through it, so most of what follows is a structural
// guard rather than a unit test: the defects that shipped here were not wrong
// arithmetic, they were senders that bypassed the arithmetic entirely.
//
// Specifically locked in:
//   * a timeout must settle as 'unknown', never 'failed' — releasing that slot
//     lets the day's 101st message through
//   * siblings sharing a parent's inbox must each get their own slot
//   * no sender may define its own Resend transport (there were three)
//   * no sender may pass more than one address to a single Resend call (Resend
//     puts every address in the To header, so a 60-parent batch would show all 60
//     addresses to each family)
//   * reminders must carry a dedupe key, since they have no ledger row to claim
//   * every RPC name the JS calls must exist in the SQL

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// The three sender modules, plus the shared library they must all use.
const SENDER_FILES = ['api/send-email.js', 'api/cron-monthly-fees.js', 'api/admin-trigger-billing.js'];

export async function runEmailQuotaTests(assert) {
  const quota = await import('../api/_lib/email-quota.js');
  const { statusForSendResult, partitionByUniqueRecipient, reserveQuota, EMAIL_CATEGORIES } = quota;

  // --- Settle-status mapping ------------------------------------------------
  assert(statusForSendResult({ success: true }) === 'sent', 'T22.1: a delivered send settles as sent');
  assert(statusForSendResult({ success: false, error: 'bad address' }) === 'failed', 'T22.2: a provider rejection settles as failed (slot released for reuse)');
  assert(statusForSendResult({ success: false, timedOut: true }) === 'unknown', 'T22.3: a TIMEOUT settles as unknown, not failed — Resend may have delivered it, so the slot must stay consumed');
  assert(statusForSendResult(null) === 'failed' && statusForSendResult(undefined) === 'failed', 'T22.4: a missing result settles as failed rather than throwing');

  // A timed-out send must never release its slot. This is the boundary that
  // decides whether a busy day ends at 100 or at 101.
  assert(statusForSendResult({ success: false, timedOut: true }) !== 'failed', 'T22.5: timeout is never treated as a released slot');

  // --- Sibling handling -----------------------------------------------------
  // reserveQuota() collapses duplicate addresses, which is right for one message
  // to one address and wrong for a batch: two children at one address each need
  // their own statement, so the batch is split into waves instead.
  const siblings = [
    { id: 'A', email: 'parent@example.com' },
    { id: 'B', email: 'parent@example.com' },
    { id: 'C', email: 'other@example.com' }
  ];
  const waves = partitionByUniqueRecipient(siblings, s => s.email);
  assert(waves.length === 2, 'T22.6: two siblings at one address are split across two waves (one slot each)');
  assert(waves[0].length === 2 && waves[0].map(s => s.id).join('') === 'AC', 'T22.7: the first wave packs every distinct address');
  assert(waves[1].length === 1 && waves[1][0].id === 'B', 'T22.8: the repeated address falls to the second wave');
  assert(waves.flat().length === siblings.length, 'T22.9: wave partitioning loses nobody');

  const distinct = partitionByUniqueRecipient(
    [{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }],
    s => s.email
  );
  assert(distinct.length === 1, 'T22.10: a normal batch of distinct addresses produces exactly one wave (one reservation)');

  // Case and whitespace must not create a phantom second slot for one inbox.
  const casey = partitionByUniqueRecipient(
    [{ email: 'Parent@Example.com' }, { email: '  parent@example.com  ' }],
    s => s.email
  );
  assert(casey.length === 2, 'T22.11: address comparison is case- and whitespace-insensitive, so a re-cased duplicate still gets its own slot rather than colliding in one wave');

  // --- reserveQuota argument contract ---------------------------------------
  let misalignThrew = false;
  try {
    await reserveQuota({ category: EMAIL_CATEGORIES.REMINDER, recipients: ['a@x.com', 'b@x.com'], dedupeKeys: ['only-one'] });
  } catch (error) {
    misalignThrew = true;
  }
  assert(misalignThrew, 'T22.12: reserveQuota refuses dedupeKeys that do not align 1:1 with recipients (a silent misalignment would suppress the wrong student)');

  // --- Structural guard: every sender reserves before sending ---------------
  for (const file of SENDER_FILES) {
    const src = read(file);
    const importsQuota = /from\s+'\.\/_lib\/email-quota\.js'/.test(src);
    assert(importsQuota, `T22.13: ${file} imports the quota library (a sender that posts straight to Resend defeats the 100/day cap)`);
    const gated = /reserveQuota\(|dispatchWithQuota\(/.test(src);
    assert(gated, `T22.14: ${file} reserves a slot via reserveQuota/dispatchWithQuota before sending`);
  }

  // --- Structural guard: one Resend transport in the whole repo -------------
  // There used to be three: api/_lib/resend-sender.js plus a private copy in each
  // of the two GitHub Actions scripts, which is how the Actions path ended up
  // sending with no quota accounting and no verified-domain check.
  const transportOwners = [];
  for (const dir of ['api', 'api/_lib', '.github/scripts', 'js', 'scripts']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!name.endsWith('.js')) continue;
      const rel = `${dir}/${name}`;
      const src = read(rel);
      // A definition, not a call or a mention in a comment.
      if (/(function\s+sendEmailViaResend|const\s+sendEmailViaResend\s*=)/.test(src)) transportOwners.push(rel);
      if (/api\.resend\.com/.test(src)) transportOwners.push(`${rel} (raw endpoint)`);
    }
  }
  const unexpected = transportOwners.filter(o => !o.startsWith('api/_lib/resend-sender.js'));
  assert(unexpected.length === 0, `T22.15: exactly one module owns the Resend transport; found extra: ${unexpected.join(', ') || 'none'}`);

  // --- Structural guard: one address per Resend call ------------------------
  // Resend copies every address in `to` into the To header, so a batch call would
  // disclose the whole class's parent addresses to each family. The quota ledger
  // also reserves one slot per recipient, which only matches reality if each
  // recipient is its own message.
  for (const file of SENDER_FILES) {
    const lines = read(file).split(/\r?\n/);
    const toLines = lines
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(entry => /^to:\s*/.test(entry.line));
    assert(toLines.length > 0, `T22.16: ${file} has at least one recognisable Resend recipient argument`);
    for (const entry of toLines) {
      const single = /^to:\s*\[[^,\]]+\],?$/.test(entry.line);
      assert(single, `T22.17: ${file}:${entry.n} passes exactly one address per Resend call (found: ${entry.line})`);
    }
  }

  // --- Structural guard: reminders carry a dedupe key ----------------------
  // Statements are protected by claim_ledger_email. Reminders have no ledger row,
  // so the quota ledger's per-day dedupe key is their only guard against a parent
  // being chased twice by a cron retry plus an admin button press.
  for (const file of ['api/cron-monthly-fees.js', 'api/admin-trigger-billing.js']) {
    const src = read(file);
    const reminderBlocks = src.split('EMAIL_CATEGORIES.REMINDER').slice(1);
    assert(reminderBlocks.length > 0, `T22.18: ${file} sends reminders through the REMINDER category`);
    for (const block of reminderBlocks) {
      // Look only as far as the end of that dispatch call's option list.
      const head = block.slice(0, 600);
      assert(/getDedupeKey/.test(head), `T22.19: ${file} supplies getDedupeKey on its reminder dispatch (same-day duplicate suppression)`);
      assert(/REMIND-\$\{student\.student_id\}/.test(head), 'T22.20: the reminder dedupe key is keyed per STUDENT, not per email address — two siblings at one inbox must both be chased');
    }
  }

  // --- Structural guard: no Actions script holds a credential --------------
  const actionsDir = path.join(ROOT, '.github/scripts');
  if (fs.existsSync(actionsDir)) {
    for (const name of fs.readdirSync(actionsDir).filter(f => f.endsWith('.js'))) {
      const src = read(`.github/scripts/${name}`);
      assert(!/eyJhbGciOi/.test(src), `T22.21: .github/scripts/${name} contains no hardcoded JWT credential`);
      // Comments explaining the removal are fine; a live read is not.
      const liveEnvRead = /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY)/.test(src);
      assert(!liveEnvRead, `T22.22: .github/scripts/${name} does not read the Supabase service key or the Resend key — Actions only needs CRON_SECRET now`);
      assert(!/createClient\s*\(/.test(src), `T22.23: .github/scripts/${name} does not open its own database client (the API is the only billing engine)`);
    }
  }

  // --- Structural guard: every RPC the JS calls exists in the SQL ----------
  const sql = read('supabase_production_hardening.sql');
  const rpcNames = new Set();
  for (const dir of ['api', 'api/_lib']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js'))) {
      const src = read(`${dir}/${name}`);
      for (const match of src.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) rpcNames.add(match[1]);
    }
  }
  assert(rpcNames.size > 0, 'T22.24: found RPC call sites to verify');
  for (const rpc of [...rpcNames].sort()) {
    const defined = new RegExp(`FUNCTION\\s+public\\.${rpc}\\s*\\(`).test(sql);
    assert(defined, `T22.25: RPC ${rpc}() called from JS is defined in supabase_production_hardening.sql`);
  }

  // --- SQL guards on the quota ledger itself -------------------------------
  assert(/pg_advisory_xact_lock\(hashtext\('pragyan_email_quota_/.test(sql), 'T22.26: reserve_email_quota serialises the day on an advisory lock (count-then-send is a race: two callers both read 99)');
  assert(/status IN \('pending', 'sent', 'unknown'\)/.test(sql), "T22.27: the used-count includes pending and unknown, so an in-flight or timed-out send still holds its slot");
  assert(/CREATE UNIQUE INDEX IF NOT EXISTS uq_email_dispatch_dedupe_live/.test(sql), 'T22.28: a partial unique index enforces one live message per dedupe key per day');
  assert(/DROP FUNCTION IF EXISTS public\.reserve_email_quota\(text, text\[\], text, integer\);/.test(sql), 'T22.29: the pre-dedupe 4-argument reserve_email_quota is dropped, or it would survive as an overload and win every 4-arg call — silently disabling duplicate suppression');
  const dropIdx = sql.indexOf('DROP FUNCTION IF EXISTS public.reserve_email_quota(text, text[], text, integer);');
  const createIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.reserve_email_quota(');
  assert(dropIdx !== -1 && createIdx !== -1 && dropIdx < createIdx, 'T22.30: that DROP runs before the CREATE');

  // --- Actions must not schedule a second billing engine -------------------
  const workflow = read('.github/workflows/monthly-fees.yml');
  const hasCron = /^\s*-\s*cron:/m.test(workflow);
  assert(!hasCron, 'T22.31: monthly-fees.yml has no cron schedule — Vercel is the only scheduler, so the two engines cannot diverge on the billing amount');
  assert(/workflow_dispatch/.test(workflow), 'T22.32: monthly-fees.yml is still available as a manual re-run backstop');
}
