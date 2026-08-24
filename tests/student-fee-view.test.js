import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runStudentFeeViewTests(assert) {
  const portalJs = read('js/portal.js');
  const portalCss = read('css/portal.css');

  // 1. js/portal.js renderStudentFeeTab
  assert(portalJs.includes('function renderStudentFeeTab()'), 'T32.1: js/portal.js defines renderStudentFeeTab');
  assert(portalJs.includes('class="fee-table-desktop-wrap table-responsive"'), 'T32.2: js/portal.js renders desktop table container');
  assert(portalJs.includes('class="fee-tx-mobile-list"'), 'T32.3: js/portal.js renders dedicated mobile transaction cards list');
  assert(portalJs.includes('class="fee-stat-box fee-stat-box-hero'), 'T32.4: js/portal.js renders hero net payable dues card');
  assert(portalJs.includes('class="fee-radial-meter-container"'), 'T32.5: js/portal.js renders circular fee clearance radial meter');
  assert(portalJs.includes('btn-download-receipt'), 'T32.6: js/portal.js supports computerized PDF receipt and voucher download across both views');
  assert(portalJs.includes('btn-hero-pay'), 'T32.7: js/portal.js includes instant UPI online dues payment button in hero card');

  // 2. css/portal.css responsive fee styles
  assert(portalCss.includes('.fee-table-desktop-wrap'), 'T32.8: css/portal.css declares .fee-table-desktop-wrap');
  assert(portalCss.includes('.fee-tx-mobile-list'), 'T32.9: css/portal.css declares .fee-tx-mobile-list');
  assert(portalCss.includes('.fee-tx-card'), 'T32.10: css/portal.css declares .fee-tx-card');
  assert(portalCss.includes('.fee-stat-box-hero'), 'T32.11: css/portal.css declares .fee-stat-box-hero');
  assert(portalCss.includes('.btn-hero-pay'), 'T32.12: css/portal.css declares .btn-hero-pay');

  // 3. Media query responsive switching
  const mobileBlock768 = portalCss.slice(portalCss.indexOf('@media (max-width: 768px)'));
  assert(mobileBlock768.includes('.fee-table-desktop-wrap') && mobileBlock768.includes('display: none'), 'T32.13: @media (max-width: 768px) hides desktop table');
  assert(mobileBlock768.includes('.fee-tx-mobile-list') && mobileBlock768.includes('display: flex'), 'T32.14: @media (max-width: 768px) displays mobile transaction cards');
  assert(mobileBlock768.includes('.fee-summary-cards-grid') && mobileBlock768.includes('repeat(2, 1fr)'), 'T32.15: @media (max-width: 768px) uses balanced 2-column grid for summary stats');
}
