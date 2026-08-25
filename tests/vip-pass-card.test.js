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

  // --- 2. Metallic Glowing Active Scholar Status Badge (No Payment Status on Card) ---
  assert(portalCss.includes('.metallic-credential-pill'),
    'T30.5: portal.css implements .metallic-credential-pill emerald credential badge');
  assert(portalCss.includes('.status-pulsing-gem'),
    'T30.6: portal.css implements pulsing micro-gem animation for active scholar status');
  assert(portalJs.includes('ACTIVE SCHOLAR') && portalJs.includes('SCHOLAR PASS'),
    'T30.7: js/portal.js renders clean ACTIVE SCHOLAR and SCHOLAR PASS credentials');
  assert(!portalJs.includes("highlight-dues-box") && !portalJs.includes("Tuition Clearance:") && !portalJs.includes("🟢 CLEARED"),
    'T30.8: js/portal.js completely removes fee status and payment dues from ID card faces');

  // --- 3. Inspiring Academic Quote & Complete Student Profile Details on Back ---
  assert(portalCss.includes('.back-quote-box') && portalCss.includes('.quote-text'),
    'T30.9: portal.css styles inspiring academic quote box on card back');
  assert(portalJs.includes('Education is the most powerful weapon which you can use to change the world'),
    'T30.10: js/portal.js renders inspiring academic quote on back of student card');
  assert(portalJs.includes('Pragyan Academic Motto') && portalJs.includes('Institutional Oath'),
    'T30.11: js/portal.js showcases prominent institutional quote and motto on back face');

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
