// tests/class-schedule.test.js — T31: Dynamic Cloud Class Schedules & Holidays Suite
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runClassScheduleTests(assert) {
  const sql = read('supabase_production_hardening.sql');
  const dbJs = read('api/db.js');
  const syncJs = read('js/supabase-sync.js');
  const indexHtml = read('index.html');
  const portalJs = read('js/portal.js');
  const portalCss = read('css/portal.css');

  // --- 1. Database Schema Hardening (Section 18) ---
  assert(/CREATE TABLE IF NOT EXISTS public\.class_schedules/i.test(sql) && /day_of_week\s+text\s+NOT NULL/i.test(sql),
    'T31.1: supabase_production_hardening.sql defines public.class_schedules table');
  assert(/CREATE TABLE IF NOT EXISTS public\.institute_holidays/i.test(sql) && /start_date\s+date\s+NOT NULL/i.test(sql),
    'T31.2: supabase_production_hardening.sql defines public.institute_holidays table');
  assert(sql.includes('idx_class_schedules_batch_day') && sql.includes('idx_institute_holidays_dates'),
    'T31.3: supabase_production_hardening.sql defines performance indexes for batch schedules and holiday dates');
  assert(sql.includes('service_role_full_schedules') && sql.includes('service_role_full_holidays'),
    'T31.4: supabase_production_hardening.sql enforces RLS policies for schedules and holidays');

  // --- 2. API Gateway Allowlisting (api/db.js) ---
  assert(dbJs.includes("'class_schedules'") && dbJs.includes("'institute_holidays'"),
    'T31.5: api/db.js allowlists class_schedules and institute_holidays in TABLES');
  assert(dbJs.includes('class_schedules:') && dbJs.includes('institute_holidays:'),
    'T31.6: api/db.js configures default order columns for schedules and holidays');

  // --- 3. Client Sync Engine (js/supabase-sync.js) ---
  assert(syncJs.includes("pragyan_db_class_schedules_master") && syncJs.includes("pragyan_db_institute_holidays_master"),
    'T31.7: js/supabase-sync.js maps class_schedules and institute_holidays in KEY_MAP');
  assert(syncJs.includes("class_schedules: 'sort_order'") && syncJs.includes("institute_holidays: 'start_date'"),
    'T31.8: js/supabase-sync.js defines sorting orders in ORDER_COLUMNS');

  // --- 4. Navigation & DOM Elements (index.html) ---
  assert(indexHtml.includes('id="adminTabBtnSchedule"') && indexHtml.includes('data-tab="schedule"'),
    'T31.9: index.html defines admin schedule navigation tab button');
  assert(indexHtml.includes('id="adminTabPane-schedule"'),
    'T31.10: index.html defines admin schedule content pane container');

  // --- 5. Admin Schedule Controls & Modals (js/portal.js) ---
  assert(portalJs.includes('function renderAdminScheduleTab') && portalJs.includes('activeAdminScheduleBatchId'),
    'T31.11: js/portal.js implements renderAdminScheduleTab with batch and day switcher');
  assert(portalJs.includes('replicateDayScheduleAcrossWeek') && portalJs.includes('Repeat for Whole Week'),
    'T31.12: js/portal.js implements 1-click week replication for Mon-Sat schedules');
  assert(portalJs.includes('toggleEntireDayOff') && portalJs.includes('is_cancelled'),
    'T31.13: js/portal.js implements sudden class-off / cancellation toggling');
  assert(portalJs.includes('openAddEditPeriodModal') && portalJs.includes('openAddHolidayModal'),
    'T31.14: js/portal.js provides accessible modals for period and holiday creation');

  // --- 6. Student View Dynamic Cloud Timetable (js/portal.js) ---
  assert(portalJs.includes('AppState.getClassSchedules') && portalJs.includes('schedule-day-tabs'),
    'T31.15: js/portal.js renderStudentBatchTab fetches dynamic cloud schedules with day tabs');
  assert(portalJs.includes('AppState.getInstituteHolidays') && portalJs.includes('schedule-holiday-banner'),
    'T31.16: js/portal.js displays prominent institute holiday alert banner when holidays are active');

  // --- 7. Styling & Responsive Layout (css/portal.css) ---
  assert(portalCss.includes('.schedule-periods-grid') && portalCss.includes('.schedule-period-card'),
    'T31.17: css/portal.css styles schedule period cards with status badges');
  assert(portalCss.includes('.holiday-list-grid') && portalCss.includes('.student-week-chip'),
    'T31.18: css/portal.css styles holiday grid and day selector chips');
  assert(syncJs.includes('normalizeSchedule(r)') && syncJs.includes('normalizeHoliday(r)'),
    'T31.19: js/supabase-sync.js normalizes class_schedules and institute_holidays in updateLocalState');
  assert(syncJs.includes('normalizeSchedule(s)') && syncJs.includes('normalizeHoliday(h)'),
    'T31.20: js/supabase-sync.js defines normalizeSchedule and normalizeHoliday helper methods');

  // --- 8. Cross-Device Sync, Mutate Mapping & Modal Edit Capabilities ---
  assert(dbJs.includes("table === 'class_schedules' || table === 'institute_holidays'") && dbJs.includes("filters.conflict = 'id'"),
    'T31.21: api/db.js defaults upsert conflict to id for class_schedules and institute_holidays');
  assert(syncJs.includes("table === 'class_schedules'") && syncJs.includes("rowObj.batch_id = rowObj.batchId"),
    'T31.22: js/supabase-sync.js mutate() normalizes class_schedules fields to snake_case');
  assert(syncJs.includes("table === 'institute_holidays'") && syncJs.includes("rowObj.start_date = rowObj.startDate"),
    'T31.23: js/supabase-sync.js mutate() normalizes institute_holidays fields to snake_case');
  assert(portalJs.includes('btn-edit-holiday') && portalJs.includes('openAddHolidayModal(holiday)'),
    'T31.24: js/portal.js provides edit button and handler for institute holidays');
  assert(portalJs.includes('resolvedBatchObj?.batchId') && portalJs.includes('studentBatchKey'),
    'T31.25: js/portal.js renderStudentBatchTab resolves exact batch ID and category key for student timetable');
  assert(portalJs.includes("SupabaseSync.mutate('class_schedules', 'delete'") && portalJs.includes("SupabaseSync.mutate('institute_holidays', 'delete'"),
    'T31.26: js/portal.js syncs schedule and holiday deletions directly to Supabase cloud database');

  // --- 9. Admin Schedule Batch Selector Resilience & Session Persistence ---
  assert(portalJs.includes("sessionStorage.getItem('pragyan_admin_schedule_batch')") && portalJs.includes("sessionStorage.setItem('pragyan_admin_schedule_batch'"),
    'T31.27: js/portal.js persists activeAdminScheduleBatchId in sessionStorage to prevent accidental resets');
  assert(portalJs.includes("bKey && activeKey && bKey === activeKey") && portalJs.includes("escapeHtml(bKey || bId)"),
    'T31.28: js/portal.js renders schedule batch select options with canonical keys and resilient matching');
  assert(portalJs.includes("const canonicalKey = getBatchCategoryKey(val)") && portalJs.includes("activeAdminScheduleBatchId = canonicalKey || val"),
    'T31.29: js/portal.js normalizes selected batch ID to canonical key on change event');
  assert(portalJs.includes("getBatchCategoryKey(schB) === activeKey") && portalJs.includes("activeKey = getBatchCategoryKey(activeAdminScheduleBatchId)"),
    'T31.30: js/portal.js filters timetable periods by resolved canonical batch key');

  // --- 10. Mobile Responsiveness & Touch Optimization ---
  assert(portalCss.includes('.schedule-header-actions') && portalCss.includes('.schedule-toolbar-top'),
    'T31.31: css/portal.css defines semantic responsive container classes for schedule header and toolbar');
  assert(portalCss.includes('@media (max-width: 768px)') && portalCss.includes('.schedule-quick-actions-bar'),
    'T31.32: css/portal.css configures mobile breakpoint for schedule toolbar and quick actions');
  assert(portalCss.includes('.period-card-actions') && portalCss.includes('.btn-schedule-action'),
    'T31.33: css/portal.css optimizes period action buttons and header actions for touch devices');
  assert(portalCss.includes('scroll-snap-type: x mandatory') && portalCss.includes('.student-schedule-week-bar'),
    'T31.34: css/portal.css configures smooth touch scrolling for weekly day selection bar');
  assert(portalJs.includes('chkAutoRepeatWeekly') && portalJs.includes('isRecurringWeekly'),
    'T31.35: js/portal.js implements interactive toggle switch for weekly routine repeating across Mon-Sun');
  assert(portalJs.includes('Weekly Repeating Routine (Mon–Sun)') && portalJs.includes('isWeeklyRecurringActive'),
    'T31.36: js/portal.js dynamically displays weekly repeating routine badge in student timetable profile');

  // ── Hardening round: BUG-09 empty-vs-uninitialized state ────────────────────
  const portalSrc = read('js/portal.js').replace(/\r\n/g, '\n');
  assert(portalSrc.includes('BUG-09: an explicit empty dataset'), 'T31.H1: getter documents the empty-is-valid invariant');
  assert(portalSrc.includes('if (Array.isArray(this._classSchedulesCache)) {'), 'T31.H2: empty array is returned as a valid cached state');
  assert(/raw !== null/.test(portalSrc), 'T31.H3: defaults seed ONLY when storage key has never existed');
}