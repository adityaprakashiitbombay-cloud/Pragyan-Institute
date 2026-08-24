// tests/vip-pass-card.test.js — T30: 3D Metallic VIP Pass & Student Card Suite
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runVipPassCardTests(assert) {
  const portalCss = read('css/portal.css');
  const portalJs = read('js/portal.js');

  // --- 1. Dimensions, Elevation & 3D Perspective (Android & Desktop) ---
  assert(portalCss.includes('.metallic-card-3d-container') && portalCss.includes('perspective: 1200px'),
    'T30.1: portal.css defines 3D perspective 1200px for metallic VIP card container');
  assert(portalCss.includes('height: 420px') && portalCss.includes('min-height: 420px'),
    'T30.2: portal.css increases card height to 420px to prevent base cutoff and reveal signatures');
  assert(portalCss.includes('border-radius: 20px'),
    'T30.3: portal.css provides ultra-luxurious 20px card border radius');
  assert(portalCss.includes('min-height: 400px !important'),
    'T30.4: mobile & Android media queries maintain at least 400px height');

  // --- 2. Metallic Glowing Status Badge ---
  assert(portalCss.includes('.metallic-status-pill.pill-cleared'),
    'T30.5: portal.css implements .metallic-status-pill.pill-cleared emerald badge');
  assert(portalCss.includes('.status-pulsing-gem'),
    'T30.6: portal.css implements pulsing micro-gem animation for active scholar status');
  assert(portalJs.includes('ACTIVE · CLEARED'),
    'T30.7: js/portal.js renders clean ACTIVE · CLEARED status text');
  assert(!portalJs.includes("🟢 CLEARED"),
    'T30.8: js/portal.js removes filthy raw emoji text string from card status');

  // --- 3. Fee Ledger Resolution (No ₹1 Dues Bug) ---
  assert(portalJs.includes('displayTotalFee') && portalJs.includes('displayPaidFee'),
    'T30.9: js/portal.js calculates displayTotalFee and displayPaidFee accurately');
  assert(portalJs.includes('displayTotalFee <= 1') && portalJs.includes('batchStandardFee'),
    'T30.10: js/portal.js falls back to batch fee when total_fee is uninitialized / 1');
  assert(portalJs.includes('isFeeCleared ? (rawPaid > 0 ? rawPaid : displayTotalFee) : rawPaid'),
    'T30.11: js/portal.js displays full tuition amount as paid when fee is 100% cleared');

  // --- 4. Back Card Signatories & Full Campus Address ---
  assert(portalCss.includes('.back-signatories-row') && portalCss.includes('.back-sign-title'),
    'T30.12: portal.css styles dedicated dual-signatory row with official titles');
  assert(portalJs.includes('DIRECTOR') && portalJs.includes('Chandan Kumar'),
    'T30.13: js/portal.js renders Director Chandan Kumar signature block');
  assert(portalJs.includes('ACADEMIC HEAD') && portalJs.includes('Prof. Ravi Ranjan'),
    'T30.14: js/portal.js renders Academic Head Prof. Ravi Ranjan signature block');
  assert(portalJs.includes('Moti Market, Near Jagdamba Sthan, Lalganj, Vaishali, Bihar 844121'),
    'T30.15: js/portal.js displays complete institutional campus address and PIN code');
  assert(portalCss.includes('.back-contact-help'),
    'T30.16: portal.css formats campus address with location pin icon and proper line height');
}
