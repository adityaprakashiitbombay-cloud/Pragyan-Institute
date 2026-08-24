// ============================================================================
// PRAGYAN INSTITUTE — CLIENT WEB PUSH MANAGER (STUDENT LOGIN ONLY)
// ----------------------------------------------------------------------------
// Manages device push registration exclusively for authenticated students.
// Per project policy: Zero popups or prompts for public marketing visitors.
// Only prompts after student logs into their dashboard profile.
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
     * ONLY called from inside portal.js when student dashboard renders.
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
                <span>Notifications enabled! You will receive live updates for ${student.class_name || 'your batch'}.</span>
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

    /** Sync or renew subscription for logged-in student */
    syncSubscription: async function (student) {
      if (!this.isSupported() || Notification.permission !== 'granted') return false;

      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey
          });
        }

        if (!sub) return false;

        const subJson = sub.toJSON();
        const p256dh = subJson.keys ? subJson.keys.p256dh : '';
        const auth = subJson.keys ? subJson.keys.auth : '';

        if (!p256dh || !auth) return false;

        let batchId = null;
        if (window.PRAGYAN_ACADEMIC && typeof window.PRAGYAN_ACADEMIC.resolveBatch === 'function') {
          const res = window.PRAGYAN_ACADEMIC.resolveBatch(student?.class_name);
          batchId = res?.id || null;
        }

        const device = detectDeviceDetails();
        const payload = {
          endpoint: sub.endpoint,
          p256dh_key: p256dh,
          auth_key: auth,
          student_id: student?.student_id || student?.id || null,
          batch_id: batchId,
          device_os: device.device_os,
          browser: device.browser,
          user_agent: device.user_agent,
          expires_at: sub.expirationTime ? new Date(sub.expirationTime).toISOString() : null
        };

        if (window.SupabaseSync && typeof window.SupabaseSync._apiDb === 'function') {
          await window.SupabaseSync._apiDb({
            table: 'push_subscriptions',
            operation: 'upsert',
            data: payload
          });
          return true;
        }
      } catch (err) {
        console.warn('[PushClient] Sync error:', err);
      }
      return false;
    }
  };

  window.PushClient = PushClient;
})(window);
