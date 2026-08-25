// ============================================================================
// PRAGYAN INSTITUTE — CLIENT WEB PUSH MANAGER (STUDENT & PORTAL NOTIFICATIONS)
// ----------------------------------------------------------------------------
// Manages device push registration with automatic key extraction,
// VAPID subscription handshakes, and resilient Supabase database synchronization.
// ============================================================================

(function (window) {
  'use strict';

  // Canonical VAPID Public Key for browser subscription handshake
  const VAPID_PUBLIC_KEY = (window.__ENV__ && window.__ENV__.VAPID_PUBLIC_KEY) ||
    'BP3tVwB7SjSNTEn7SsPHvzeTySIm17F7AA8Kdcbc0FMUHGBdE8K0tmvEmVVLY3dw9ypIMIG4oOKFNGJAZ1sndMQ';

  const STORAGE_DECLINED_KEY = 'pragyan_push_declined_until';

  /** Convert base64 / base64url string to Uint8Array for PushManager */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /** Convert ArrayBuffer to base64url string */
  function arrayBufferToBase64Url(buffer) {
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function detectDeviceDetails() {
    const ua = navigator.userAgent || '';
    let device_os = 'Other';
    if (/Android/i.test(ua)) device_os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) device_os = 'iOS';
    else if (/Windows/i.test(ua)) device_os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) device_os = 'macOS';
    else if (/Linux/i.test(ua)) device_os = 'Linux';

    let browser = 'Other';
    if (/Chrome/i.test(ua) && !/Edge|Edg|OPR/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Edg/i.test(ua)) browser = 'Edge';

    return { device_os, browser, user_agent: ua.slice(0, 200) };
  }

  const PushClient = {
    isSupported: function () {
      return ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    },

    getPermission: function () {
      if (!this.isSupported()) return 'unsupported';
      return Notification.permission;
    },

    /**
     * Mount student in-dashboard permission card if not granted/declined.
     * Called from portal.js when student dashboard renders.
     */
    renderStudentPrompt: function (containerEl, student) {
      if (!this.isSupported()) return;
      if (Notification.permission === 'granted') {
        // Silently sync device subscription if already granted
        this.syncSubscription(student);
        return;
      }
      if (Notification.permission === 'denied') return;

      // Check if user clicked 'Later' recently
      const declinedUntil = Number(localStorage.getItem(STORAGE_DECLINED_KEY) || 0);
      if (Date.now() < declinedUntil) return;

      if (!containerEl || document.getElementById('studentPushPromptCard')) return;

      const card = document.createElement('div');
      card.id = 'studentPushPromptCard';
      card.className = 'student-push-prompt-card';
      card.innerHTML = `
        <div class="push-prompt-header">
          <div class="push-prompt-icon">🔔</div>
          <div class="push-prompt-content">
            <h4 class="push-prompt-title">Enable Mobile Lockscreen Notifications</h4>
            <p class="push-prompt-desc">Receive instant updates for test dates, attendance, monthly fee receipts, and holiday notices directly on your phone.</p>
          </div>
        </div>
        <div class="push-prompt-actions">
          <button type="button" class="btn btn-sm btn-primary" id="btnAllowPush">
            <i aria-hidden="true" class="fa-solid fa-bell"></i> Enable Notifications
          </button>
          <button type="button" class="btn btn-sm btn-outline" id="btnDismissPush">
            Later
          </button>
        </div>
      `;

      containerEl.prepend(card);

      const btnAllow = card.querySelector('#btnAllowPush');
      const btnDismiss = card.querySelector('#btnDismissPush');

      if (btnAllow) {
        btnAllow.addEventListener('click', async () => {
          btnAllow.disabled = true;
          btnAllow.innerHTML = '<i aria-hidden="true" class="fa-solid fa-spinner fa-spin"></i> Subscribing...';
          const success = await PushClient.requestAndSubscribe(student);
          if (success) {
            card.innerHTML = `
              <div class="push-prompt-success">
                <i aria-hidden="true" class="fa-solid fa-circle-check text-success"></i>
                <span>Notifications enabled! You will receive live updates for ${student?.class_name || 'your batch'}.</span>
              </div>
            `;
            setTimeout(() => { card.remove(); }, 3500);
          } else {
            card.remove();
          }
        });
      }

      if (btnDismiss) {
        btnDismiss.addEventListener('click', () => {
          // Remind again in 14 days
          localStorage.setItem(STORAGE_DECLINED_KEY, String(Date.now() + 14 * 24 * 3600 * 1000));
          card.remove();
        });
      }
    },

    /** Request permission and save subscription to Supabase */
    requestAndSubscribe: async function (student) {
      if (!this.isSupported()) return false;

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;

        return await this.syncSubscription(student);
      } catch (err) {
        console.warn('[PushClient] Registration error:', err);
        return false;
      }
    },

    /** Sync or renew subscription for logged-in student or portal user */
    syncSubscription: async function (student) {
      if (!this.isSupported() || Notification.permission !== 'granted') return false;

      try {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js');
        }
        await navigator.serviceWorker.ready;

        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey
          });
        }

        if (!sub) return false;

        // Extract cryptographic keys from JSON or raw ArrayBuffers
        let p256dh = '';
        let auth = '';
        if (sub.toJSON) {
          const subJson = sub.toJSON();
          if (subJson.keys) {
            p256dh = subJson.keys.p256dh || '';
            auth = subJson.keys.auth || '';
          }
        }
        if (!p256dh && typeof sub.getKey === 'function') {
          try {
            const rawP256 = sub.getKey('p256dh');
            p256dh = arrayBufferToBase64Url(rawP256);
          } catch (_) {}
        }
        if (!auth && typeof sub.getKey === 'function') {
          try {
            const rawAuth = sub.getKey('auth');
            auth = arrayBufferToBase64Url(rawAuth);
          } catch (_) {}
        }

        if (!p256dh || !auth) {
          console.warn('[PushClient] Missing subscription keys p256dh or auth');
          return false;
        }

        const targetStudent = student || (typeof AppState !== 'undefined' && AppState.currentUser) || null;
        let studentId = targetStudent?.student_id || targetStudent?.roll_no || targetStudent?.rollNo || null;
        if (!studentId && targetStudent?.id && !String(targetStudent.id).includes('-')) {
          studentId = targetStudent.id;
        }

        let batchId = targetStudent?.batch_id || targetStudent?.batchId || null;
        if (!batchId && targetStudent?.class_name && window.PRAGYAN_ACADEMIC?.resolveBatch) {
          const res = window.PRAGYAN_ACADEMIC.resolveBatch(targetStudent.class_name);
          batchId = res?.id || null;
        }

        const device = detectDeviceDetails();
        const payload = {
          endpoint: sub.endpoint,
          p256dh_key: p256dh,
          auth_key: auth,
          student_id: studentId,
          batch_id: batchId,
          device_os: device.device_os,
          browser: device.browser,
          user_agent: device.user_agent,
          expires_at: sub.expirationTime ? new Date(sub.expirationTime).toISOString() : null,
          updated_at: new Date().toISOString()
        };

        // 1. Primary path: SupabaseSync authenticated gateway
        if (window.SupabaseSync && typeof window.SupabaseSync._apiDb === 'function') {
          try {
            await window.SupabaseSync._apiDb('push_subscriptions', 'upsert', {
              data: payload,
              filters: { conflict: 'endpoint' }
            });
            console.log('[PushClient] Device subscription synced via SupabaseSync._apiDb');
            return true;
          } catch (syncErr) {
            console.warn('[PushClient] _apiDb failed, trying direct gateway:', syncErr);
          }
        }

        // 2. Secondary path: Direct /api/db fetch
        const cfg = (typeof window !== 'undefined' && window.PRAGYAN_CONFIG) ? window.PRAGYAN_CONFIG : {};
        const apiBase = (cfg.API_BASE || (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) || '').replace(/\/$/, '');
        const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || null;

        const resp = await fetch(`${apiBase}/api/db`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            table: 'push_subscriptions',
            operation: 'upsert',
            data: payload,
            filters: { conflict: 'endpoint' }
          })
        });
        const resJson = await resp.json().catch(() => null);
        if (resJson && resJson.success) {
          console.log('[PushClient] Device subscription synced via /api/db');
          return true;
        }

        // 3. Tertiary fallback: Direct Supabase PostgREST
        if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
          try {
            const restResp = await fetch(`${cfg.SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': cfg.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token || cfg.SUPABASE_ANON_KEY}`,
                'Prefer': 'resolution=merge-duplicates,return=representation'
              },
              body: JSON.stringify(payload)
            });
            if (restResp.ok) {
              console.log('[PushClient] Device subscription synced via Supabase REST fallback');
              return true;
            }
          } catch (_) {}
        }
      } catch (err) {
        console.warn('[PushClient] Sync error:', err);
      }
      return false;
    },

    /** Immediately test native notification locally on this device */
    sendLocalTestNotification: async function (title, body) {
      if (!this.isSupported() || Notification.permission !== 'granted') return false;
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title || '🎉 Pragyan Institute Alerts Active!', {
            body: body || 'Your device is successfully configured to receive instant lockscreen notifications.',
            icon: '/assets/images/logo.png',
            badge: '/assets/images/logo.png',
            vibrate: [200, 100, 200, 100, 200],
            tag: 'test-alert-' + Date.now(),
            renotify: true,
            requireInteraction: true
          });
          return true;
        }
      } catch (err) {
        console.warn('[PushClient] Local test notification error:', err);
      }
      return false;
    },

    /** Test end-to-end cloud push notification via serverless endpoint */
    sendCloudTestNotification: async function () {
      try {
        const token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) || null;
        const res = await fetch('/api/send-push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            title: '🔔 Pragyan Institute Test Alert',
            body: 'Cloud push delivery test confirmed! Real-time notifications are active on this device.',
            priority: 'high'
          })
        });
        const data = await res.json();
        return data && data.success;
      } catch (err) {
        console.warn('[PushClient] Cloud test error:', err);
        return false;
      }
    }
  };

  window.PushClient = PushClient;
})(window);
