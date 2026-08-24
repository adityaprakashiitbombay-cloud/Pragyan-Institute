import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runBatchManagementTests(assert) {
  const sql = read('supabase_production_hardening.sql');
  const gateway = read('api/db.js');
  const sync = read('js/supabase-sync.js');
  const portalJs = read('js/portal.js');
  const portalCss = read('css/portal.css');
  const indexHtml = read('index.html');

  // 1. SQL Hardening & Schema Definition
  assert(sql.includes('CREATE TABLE IF NOT EXISTS public.batches'), 'T33.1: public.batches table definition exists in SQL hardening');
  assert(sql.includes('subjects jsonb') && sql.includes('timing text') && sql.includes('room text'), 'T33.2: SQL hardening defines subjects, timing, and room in batches');
  assert(/ALTER TABLE public\.batches\s+ADD COLUMN IF NOT EXISTS subjects jsonb/i.test(sql), 'T33.3: SQL hardening provides column convergence for subjects');
  assert(/ALTER TABLE public\.batches\s+ADD COLUMN IF NOT EXISTS timing text/i.test(sql), 'T33.4: SQL hardening provides column convergence for timing');
  assert(/ALTER TABLE public\.batches\s+ADD COLUMN IF NOT EXISTS room text/i.test(sql), 'T33.5: SQL hardening provides column convergence for room');
  assert(/ALTER TABLE public\.batches\s+ADD COLUMN IF NOT EXISTS capacity integer/i.test(sql), 'T33.6: SQL hardening provides column convergence for capacity');

  // 2. Gateway Allowlisting & Authorization
  assert(gateway.includes("'batches'"), 'T33.7: api/db.js allows batches table in gateway');
  assert(gateway.includes('batches:'), 'T33.8: api/db.js maps table policy for batches');

  // 3. Client Sync Engine Normalization
  assert(sync.includes('normalizeBatch('), 'T33.9: js/supabase-sync.js defines normalizeBatch parser');
  assert(sync.includes('pragyan_db_batches_master'), 'T33.10: js/supabase-sync.js maps batches to local storage master key');

  // 4. HTML Navigation & Containers
  assert(indexHtml.includes('id="adminTabBtnBatches"'), 'T33.11: index.html contains admin navigation button for batches');
  assert(indexHtml.includes('id="adminTabPane-batches"'), 'T33.12: index.html contains admin tab pane for batches');

  // 5. Admin UI Management & Modal Controllers
  assert(portalJs.includes('function renderAdminBatchesTab()'), 'T33.13: js/portal.js defines renderAdminBatchesTab controller');
  assert(portalJs.includes('function openAddEditBatchModal('), 'T33.14: js/portal.js defines openAddEditBatchModal');
  assert(portalJs.includes('async function deleteBatch('), 'T33.15: js/portal.js defines deleteBatch');
  assert(portalJs.includes("tabName === 'batches'"), 'T33.16: js/portal.js wires switchAdminTab for batches');

  // 6. CSS Styling for Batches Master
  assert(portalCss.includes('.admin-batches-container'), 'T33.17: css/portal.css defines .admin-batches-container');
  assert(portalCss.includes('.admin-batch-card'), 'T33.18: css/portal.css defines .admin-batch-card');
  assert(portalCss.includes('.admin-batch-fee-val'), 'T33.19: css/portal.css defines .admin-batch-fee-val');

  // 7. Dynamic Student Batch Binding & Live Parity
  assert(portalJs.includes('renderStudentBatchTab()'), 'T33.20: js/portal.js includes dynamic student batch tab');
  assert(portalJs.includes('myBatch.room'), 'T33.21: Student batch view dynamically resolves live classroom room');
  assert(portalJs.includes('myBatch.timing'), 'T33.22: Student batch view dynamically resolves live lecture timing');
  assert(portalJs.includes('myBatch.subjects'), 'T33.23: Student batch view dynamically resolves live core subjects list');
}
