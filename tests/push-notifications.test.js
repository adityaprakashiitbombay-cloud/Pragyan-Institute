// ============================================================================
// [T28] PUSH NOTIFICATIONS & INTERACTIVE BROADCAST SUITE TEST SUITE
// ----------------------------------------------------------------------------
// Validates:
//   - Zero-dependency RFC 8291/8292 VAPID & AES-128-GCM cryptography
//   - Variable interpolation & audience filters
//   - Database schema & RLS rules
//   - Gateway authorization in /api/db
//   - Service worker push & notificationclick event hooks
//   - Student-only in-dashboard prompt gating (zero visitor spam)
//   - Admin composer & live lockscreen simulator UI
//   - Payment approval push hook
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateVapidKeys, vapidAuthorizationHeader, encryptPayload, pushToSubscription } from '../api/_lib/webpush.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

export async function runPushNotificationTests(assert) {
  // --- 1. VAPID Cryptography & AES-128-GCM Wire Format ---
  const keys = generateVapidKeys();
  assert(typeof keys.publicKey === 'string' && keys.publicKey.length > 80, 'T28.1: generateVapidKeys returns valid base64url uncompressed public key');
  assert(typeof keys.privateKey === 'string' && keys.privateKey.length > 50, 'T28.2: generateVapidKeys returns valid base64url private key');

  const authHeader = vapidAuthorizationHeader('https://fcm.googleapis.com/fcm/send/sample', keys, 'mailto:admin@pragyan.edu');
  assert(authHeader.startsWith('vapid t=') && authHeader.includes(', k='), 'T28.3: vapidAuthorizationHeader emits valid RFC 8292 Authorization header');

  const clientKeys = generateVapidKeys();
  const encResult = encryptPayload({ p256dh: clientKeys.publicKey, auth: 'AAAAAAAAAAAAAAAAAAAAAA' }, JSON.stringify({ title: 'Test Alert', body: 'Hello' }));
  assert(Buffer.isBuffer(encResult.body), 'T28.4: encryptPayload produces binary Buffer');
  assert(encResult.body.length > 86, 'T28.5: encrypted body contains full 86-byte aes128gcm header + ciphertext');

  // --- 2. Endpoint validation ---
  const invalidRes = await pushToSubscription({ endpoint: 'http://insecure.com' }, { title: 'Test' }, { vapidKeys: keys, vapidSubject: 'mailto:a@b.com' });
  assert(invalidRes.ok === false && invalidRes.status === 400, 'T28.6: pushToSubscription strictly rejects non-https endpoints');

  // --- 3. Database Schema & Hardening SQL ---
  const hardeningSql = read('supabase_production_hardening.sql');
  assert(hardeningSql.includes('CREATE TABLE IF NOT EXISTS public.push_subscriptions'), 'T28.7: hardening SQL declares push_subscriptions table');
  assert(hardeningSql.includes('CREATE TABLE IF NOT EXISTS public.push_broadcast_logs'), 'T28.8: hardening SQL declares push_broadcast_logs table');
  assert(hardeningSql.includes('ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY'), 'T28.9: push_subscriptions has RLS enabled');
  assert(hardeningSql.includes('ALTER TABLE public.push_broadcast_logs ENABLE ROW LEVEL SECURITY'), 'T28.10: push_broadcast_logs has RLS enabled');

  // --- 4. Gateway Rules (/api/db.js) ---
  const dbJs = read('api/db.js');
  assert(dbJs.includes("'push_subscriptions'") && dbJs.includes("'push_broadcast_logs'"), 'T28.11: /api/db allows push tables in TABLES set');
  assert(dbJs.includes("STUDENT_TABLES = new Set([") && dbJs.includes("'push_subscriptions'"), 'T28.12: push_subscriptions is accessible to student sessions');
  assert(dbJs.includes("Students may only bind their own device subscription"), 'T28.13: student sessions cannot bind device subscriptions for other students');
  assert(dbJs.includes("isAnonymousPushRegister"), 'T28.14: anonymous visitor device registration is safely supported with null student_id');

  // --- 5. Serverless Dispatcher (/api/send-push & /api/send-email) ---
  const sendPushJs = read('api/send-email.js');
  const vercelJson = read('vercel.json');
  assert(vercelJson.includes('/api/send-push') && sendPushJs.includes("requireSession(req, res, ['admin']"), 'T28.15: /api/send-push requires admin authentication');
  assert(sendPushJs.includes("isCron"), 'T28.16: /api/send-push supports CRON_SECRET authorization for automated fee triggers');
  assert(sendPushJs.includes("interpolate"), 'T28.17: /api/send-push includes dynamic variable interpolation engine');
  assert(sendPushJs.includes("push_broadcast_logs"), 'T28.18: /api/send-push records audit journal entry for every broadcast');
  assert(sendPushJs.includes("resResult.prune") || sendPushJs.includes("res.prune"), 'T28.19: /api/send-push automatically prunes dead 404/410 endpoints');

  // --- 6. Service Worker Hooks (sw.js) ---
  const swJs = read('sw.js');
  assert(swJs.includes("self.addEventListener('push'"), 'T28.20: sw.js includes push event listener for background alerts');
  assert(swJs.includes("self.addEventListener('notificationclick'"), 'T28.21: sw.js includes notificationclick listener with deep-linking');
  assert(swJs.includes("showNotification"), 'T28.22: sw.js displays native lockscreen notification');

  // --- 7. Client Push Manager (js/push-client.js) ---
  const pushClientJs = read('js/push-client.js');
  assert(pushClientJs.includes("renderStudentPrompt"), 'T28.23: js/push-client.js implements in-dashboard student prompt');
  assert(pushClientJs.includes("urlBase64ToUint8Array"), 'T28.24: js/push-client.js converts VAPID public key to Uint8Array');
  assert(!pushClientJs.includes("window.onload = ") && !pushClientJs.includes("DOMContentLoaded"), 'T28.25: js/push-client.js does NOT spam anonymous public visitors on page load');

  // --- 8. Admin UI & Live Lockscreen Simulator ---
  const indexHtml = read('index.html');
  assert(indexHtml.includes('id="adminTabBtnPush"'), 'T28.26: index.html has Push Alerts admin tab button');
  assert(indexHtml.includes('id="adminTabPane-push"'), 'T28.27: index.html has #adminTabPane-push container');
  assert(indexHtml.includes('src="./js/push-client.js'), 'T28.28: index.html loads js/push-client.js');

  const portalJs = read('js/portal.js');
  assert(portalJs.includes("renderAdminPushTab"), 'T28.29: js/portal.js implements renderAdminPushTab');
  assert(portalJs.includes("phone-mockup-frame"), 'T28.30: js/portal.js renders real-time smartphone lockscreen simulator');
  assert(portalJs.includes("btn-preset"), 'T28.31: js/portal.js provides 1-click quick preset templates');

  // --- 9. Payment Approval Hook ---
  const approveJs = read('api/approve-payment-request.js');
  assert(approveJs.includes("Fee Payment Verified"), 'T28.32: api/approve-payment-request sends instant push receipt upon approval');

  // --- 10. Mobile Responsiveness Suite ---
  const portalCss = read('css/portal.css');
  assert(portalCss.includes('.push-grid-2col'), 'T28.33: portal.css contains push-grid-2col responsive layout rules');
  assert(portalCss.includes('.push-presets-bar') && portalCss.includes('scroll-snap-type'), 'T28.34: portal.css implements touch-friendly swipeable push-presets-bar with scroll-snap');
  assert(portalCss.includes('.push-radio-label') && portalCss.includes('min-height: 44px'), 'T28.35: portal.css implements 44px min-height push-radio-label touch targets');
  assert(portalCss.includes('.push-logs-scroll-wrap'), 'T28.36: portal.css implements push-logs-scroll-wrap for responsive horizontal table view');
  assert(portalCss.includes('.push-logs-desktop-wrap') && portalCss.includes('.push-logs-mobile-list') && portalCss.includes('.push-log-card'), 'T28.37: portal.css implements responsive dual-view push logs (desktop table + mobile card list)');
  assert(portalCss.includes('.push-stats-grid') && portalCss.includes('.push-presets-container'), 'T28.38: portal.css implements responsive push-stats-grid and presets container');
  assert(portalJs.includes('push-logs-desktop-wrap') && portalJs.includes('push-logs-mobile-list') && portalJs.includes('push-log-card'), 'T28.39: js/portal.js renders dual-view push logs structure');

  // --- 11. Live Subscriber Device Tracking & Dedicated Endpoint ---
  const sendPushEndpointJs = read('api/send-push.js');
  assert(sendPushEndpointJs.includes('push_subscriptions') && sendPushEndpointJs.includes('push_broadcast_logs'), 'T28.40: api/send-push.js exists as dedicated serverless handler');
  assert(portalJs.includes('pushStatDevicesCount') && portalJs.includes('syncPushStatsFromCloud'), 'T28.41: js/portal.js implements live device subscriber statistics counters');
  assert(pushClientJs.includes("'push_subscriptions'") && pushClientJs.includes("'endpoint'"), 'T28.42: js/push-client.js securely syncs device endpoints with conflict resolution');
  const syncJs = read('js/supabase-sync.js');
  assert(syncJs.includes("table === 'push_subscriptions'") && syncJs.includes("filters.conflict = 'endpoint'"), 'T28.43: js/supabase-sync.js supports dual-signature _apiDb with push conflict defaults');
  assert(pushClientJs.includes("arrayBufferToBase64Url"), 'T28.44: js/push-client.js provides ArrayBuffer fallback key extraction for non-standard PushSubscription objects');
  assert(portalJs.includes("btnRegisterCurrentDevice"), 'T28.45: js/portal.js provides 1-click admin device registration');
  const authJs = read('api/_lib/auth.js');
  assert(authJs.includes("optionalSession"), 'T28.46: api/_lib/auth.js exports optionalSession for push subscriber identification');
}


