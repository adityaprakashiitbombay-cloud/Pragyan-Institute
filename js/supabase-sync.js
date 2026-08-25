/**
 * Pragyan Institute — Supabase Direct Sync Engine
 * Connects DIRECTLY to Supabase REST API from the browser.
 * No serverless proxy dependency — works on any hosting (Vercel, GitHub Pages, etc.)
 * Bidirectional: pulls from DB on init/interval, pushes mutations immediately.
 */
(function () {
  'use strict';

  // ── Supabase Connection Config ──────────────────────────────────────────────
  const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqY21tY2FlcnZnc2twa2NmZWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDEzMTksImV4cCI6MjEwMjAxNzMxOX0.pTp51JWa-qWbAz-l5NGLKvrS66TED4lruhLInQ6hvmc';
  const _cfg = (typeof window !== 'undefined' && window.PRAGYAN_CONFIG) ? window.PRAGYAN_CONFIG : {};
  const SUPABASE_URL = _cfg.SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co';
  const SUPABASE_ANON_KEY = _cfg.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  const REST_BASE = `${SUPABASE_URL}/rest/v1`;

  // Authenticated data gateway (api/db.js). All table reads/writes route through
  // this JWT-gated endpoint so Row Level Security can lock PostgREST down to
  // public notices/batches only. The legacy REST_BASE above remains solely for
  // pre-auth fallback paths that are being retired.
  const API_BASE = (_cfg.API_BASE || (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) || '').replace(/\/$/, '');

  // ── localStorage key map ────────────────────────────────────────────────────
  const KEY_MAP = {
    students:           'pragyan_db_students_master',
    notices:            'pragyan_db_notices_master',
    fee_receipts:       'pragyan_db_fee_receipts_master',
    fee_billing_ledger: 'pragyan_db_fee_ledger_master',
    student_requests:   'pragyan_db_requests_master',
    batches:            'pragyan_db_batches_master',
    admins:             'pragyan_db_admins_master',
    audit_logs:         'pragyan_db_audit_logs_master',
    blog_posts:         'pragyan_db_blog_master',
    class_schedules:    'pragyan_db_class_schedules_master',
    institute_holidays: 'pragyan_db_institute_holidays_master'
  };

  const ORDER_COLUMNS = {
    students: 'student_id', notices: 'id', fee_receipts: 'receipt_no',
    fee_billing_ledger: 'created_at', student_requests: 'created_at',
    batches: 'batch_id', admins: 'admin_id', audit_logs: 'log_id',
    blog_posts: 'id', class_schedules: 'sort_order',
    institute_holidays: 'start_date'
  };

  const ALL_TABLES = Object.keys(KEY_MAP);

  // ── Core Sync Engine ────────────────────────────────────────────────────────
  const SupabaseSync = {
    callbacks: new Set(),
    isInitialized: false,
    isOfflineFallback: false,
    isSyncing: false,
    _pullPromise: null,
    _pendingPull: false,
    _pendingPullResolvers: [],
    _pullDebounceTimer: null,
    _pullAbort: null,
    _tabId: (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ('tab_' + Math.random().toString(36).slice(2, 9)),
    _pollIntervalMs: 60000,
    sessionToken: null,
    sessionRole: null,
    pollTimer: null,
    _bc: null,
    _connected: false,
    _supabaseClient: null,
    _realtimeChannel: null,
    _realtimeSubscribed: false,

    // ── Input Sanitization Helper ───────────────────────────────────────────
    _sanitizeForQuery(value) {
      if (value == null) return '';
      // Allow alphanumeric, spaces, hyphens, underscores, dots, and @ (safe for usernames, emails, roll numbers, mobiles)
      // Strips query-breaking delimiters: commas, parentheses, quotes, backslashes, semicolons, brackets
      const cleaned = String(value).replace(/[\r\n,()"';\\{}[\]]/g, '').trim();
      // Block operator injection attempts that try to inject sub-queries
      if (/\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is|not)\./i.test(cleaned) || /^(or|and)\(/i.test(cleaned)) {
        console.error('🚨 Potential filter injection detected:', value);
        return '';
      }
      return cleaned;
    },

    _encodeFilterValue(value) {
      if (value == null) return '';
      const cleaned = String(value).replace(/[\r\n,()"';\\{}[\]]/g, '').trim();
      if (/\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is|not)\./i.test(cleaned) || /^(or|and)\(/i.test(cleaned)) {
        console.error('🚨 Filter injection attempt blocked:', value);
        return '__INVALID__';
      }
      return encodeURIComponent(cleaned);
    },


    // ── Initialization ──────────────────────────────────────────────────────
    async init() {
      if (this.isInitialized) return this._pullPromise || Promise.resolve({ success: true });
      this.isInitialized = true;
      this.sessionToken = sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token') || null;
      this.sessionRole = sessionStorage.getItem('pragyan_portal_role') || localStorage.getItem('pragyan_portal_role') || null;
      this._bindLifecycle();
      this._listenForConnectivity();

      return this.pullAll();
    },

    setSession(token, role) {
      this.sessionToken = token || null;
      this.sessionRole = role || null;
      if (!this.isInitialized) {
        return this.init();
      }
      this._schedulePull(50);
      return Promise.resolve({ success: true });
    },

    clearSession() {
      this.sessionToken = null;
      this.sessionRole = null;
      if (!this.isInitialized) {
        return this.init();
      }
      this._schedulePull(50);
      return Promise.resolve({ success: true });
    },

    // ── Page lifecycle ───────────────────────────────────────────────────────
    /**
     * Binds the unload/restore handlers exactly once.
     *
     * The previous version registered a `visibilitychange` handler here in
     * init() while _listenForConnectivity() registered a second one, and the
     * "tab visible" branch called _listenForConnectivity() again — so every
     * hide/show cycle added another copy of the online + focus +
     * visibilitychange trio and another BroadcastChannel. On a phone, where
     * backgrounding the browser fires visibilitychange constantly, the handler
     * count grew without bound for as long as the portal stayed open.
     */
    _bindLifecycle() {
      if (this._lifecycleBound || typeof window === 'undefined') return;
      this._lifecycleBound = true;

      // pagehide rather than beforeunload: mobile Safari and Chrome for
      // Android routinely discard a backgrounded tab without ever firing
      // beforeunload, which left the WebSocket to time out server-side.
      // beforeunload also makes a page ineligible for the back/forward cache.
      window.addEventListener('pagehide', (event) => {
        if (event.persisted) {
          // Bound for the back/forward cache, so the page can come back.
          // Release the socket and timers but keep the registered subscribers:
          // onChange() is called once at DOMContentLoaded and nothing
          // re-registers it, so dropping them here would leave a restored page
          // rendering permanently stale data.
          this._suspend();
        } else {
          this.destroy();
        }
      });

      window.addEventListener('pageshow', (event) => {
        if (event.persisted) this._resume();
      });
    },

    /** Release network resources without forgetting who is listening. */
    _suspend() {
      this._teardownInProgress = true;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this._pullDebounceTimer) {
        clearTimeout(this._pullDebounceTimer);
        this._pullDebounceTimer = null;
      }
      this._closeRealtimeChannel();
      this._teardownInProgress = false;
    },

    /** Re-arm after a back/forward-cache restore. */
    _resume() {
      if (!this.isInitialized) return;
      this._connectRealtime();
      this._resetPollTimer();
      this._schedulePull(150);
    },

    /**
     * Unsubscribe and drop the realtime channel. Callers set
     * _teardownInProgress first so the resulting CLOSED status is recognised
     * as our own doing rather than logged as a connection failure.
     */
    _closeRealtimeChannel() {
      if (!this._realtimeChannel || !this._supabaseClient) return;
      try {
        this._realtimeChannel.unsubscribe();
        this._supabaseClient.removeChannel(this._realtimeChannel);
      } catch (e) {
        console.warn('[SupabaseSync] Realtime channel cleanup note:', e.message);
        try {
          this._supabaseClient.removeAllChannels();
        } catch (forceErr) {
          console.warn('[SupabaseSync] Force channel removal note:', forceErr.message);
        }
      }
      this._realtimeChannel = null;
      this._realtimeSubscribed = false;
    },

    // ── S1: Clear poll timer and tear down connections ───────────────────────
    destroy() {
      this._teardownInProgress = true;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this._pullDebounceTimer) {
        clearTimeout(this._pullDebounceTimer);
        this._pullDebounceTimer = null;
      }
      if (this._pullAbort) {
        try { this._pullAbort.abort(); } catch(e) {}
        this._pullAbort = null;
      }
      this._closeRealtimeChannel();
      if (this._bc) {
        try { this._bc.close(); } catch(e) {}
        this._bc = null;
      }
      // Subscribers registered through onChange() are deliberately kept. This
      // is called on logout, and onChange() is only ever called once, from
      // DOMContentLoaded — clearing the set here meant that logging out and
      // back in without reloading the page left the dashboard unable to
      // re-render on any subsequent database change.
      this.isInitialized = false;
      this.isSyncing = false;
      this._pullPromise = null;
      this._pendingPull = false;
      if (this._pendingPullResolvers && this._pendingPullResolvers.length > 0) {
        this._pendingPullResolvers.forEach(w => {
          try { w.resolve({ success: false, error: 'Sync destroyed' }); } catch (_) {}
        });
        this._pendingPullResolvers = [];
      }
      this.sessionToken = null;
      this.sessionRole = null;
      this._teardownInProgress = false;
    },

    // Debounced pull trigger: coalesces rapid events into a single execution
    _schedulePull(delay = 150) {
      if (this._pullDebounceTimer) clearTimeout(this._pullDebounceTimer);
      this._pullDebounceTimer = setTimeout(() => {
        this._pullDebounceTimer = null;
        this.pullAll().catch(e => console.warn('[SupabaseSync] Scheduled pull note:', e.message));
      }, delay);
    },

    // Adaptive polling: 60s when Realtime WebSocket is active, 30s when disconnected/polling fallback
    _resetPollTimer() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (typeof document !== 'undefined' && document.hidden) return; // Do not poll when tab is backgrounded
      const interval = this._realtimeSubscribed ? 60000 : 30000;
      this._pollIntervalMs = interval;
      this.pollTimer = window.setInterval(() => {
        if (typeof document !== 'undefined' && !document.hidden) {
          this._schedulePull(300);
        }
      }, interval);
    },

    _listenForConnectivity() {
      // Bound once for the life of the page. These are window/document
      // listeners with no removal path, so re-registering them on every
      // reconnect is a leak, not a refresh.
      if (!this._connectivityBound) {
        this._connectivityBound = true;
        window.addEventListener('online', () => {
          this._schedulePull(100);
          this._flushOutbox().catch(() => {});
        });
        window.addEventListener('focus', () => this._schedulePull(150));
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            // Coming back to the foreground. A backgrounded phone often has
            // its socket killed by the OS without a status callback, so the
            // channel is re-established rather than assumed alive.
            if (!this._realtimeSubscribed) this._connectRealtime();
            this._schedulePull(150);
            this._resetPollTimer();
          } else if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
          }
        });
      }

      // 1. Instant Realtime WebSocket Subscription via Supabase Client
      this._connectRealtime();

      // 2. Start adaptive smart polling
      this._resetPollTimer();

      // Cross-tab sync via BroadcastChannel (with tab echo suppression).
      // Guarded on _bc so a reconnect reuses the open channel instead of
      // orphaning it; destroy() nulls it out, which lets a fresh login on the
      // same page open a new one.
      if (typeof BroadcastChannel !== 'undefined' && !this._bc) {
        try {
          this._bc = new BroadcastChannel('pragyan_realtime_hub');
          this._bc.onmessage = (event) => {
            if (event.data?.sourceTabId && event.data.sourceTabId === this._tabId) {
              return; // Ignore local tab echo
            }
            if (event.data?.type === 'DATA_MUTATED') {
              this._schedulePull(150);
            }
          };
        } catch(e) {
          console.warn('[SupabaseSync] BroadcastChannel init note:', e.message);
        }
      }
    },

    /** Open the postgres_changes channel, unless one is already subscribed. */
    _connectRealtime() {
      if (typeof window === 'undefined' || !window.supabase) return;
      if (this._realtimeSubscribed || this._realtimeChannel) return;
      try {
        // Reuse global client to prevent connection leaks
        if (!window._pragyanSupabaseClient) {
          window._pragyanSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            },
            realtime: {
              params: {
                eventsPerSecond: 5 // Rate limit realtime events
              }
            },
            db: {
              schema: 'public'
            },
            global: {
              headers: {
                'X-Client-Info': 'pragyan-portal-web'
              }
            }
          });
        }

        this._supabaseClient = window._pragyanSupabaseClient;

        this._realtimeChannel = this._supabaseClient.channel('pragyan_realtime_sync_all')
          .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
            this._schedulePull(150);
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              this._realtimeSubscribed = true;
              this.updateStatus('synced');
              this._resetPollTimer();
              return;
            }
            // CLOSED is also how the server acknowledges our own unsubscribe,
            // so during a deliberate teardown it is not a fault — logging it
            // at error level put a red entry in the console on every page
            // unload and every logout.
            if (status === 'CLOSED' && this._teardownInProgress) return;
            // TIMED_OUT was previously unhandled: the socket was gone but
            // _realtimeSubscribed stayed true, so the badge kept claiming
            // "Cloud synced" and polling stayed on the slow 60s cadence.
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn(`[SupabaseSync] Realtime ${status} — falling back to polling`);
              this._realtimeSubscribed = false;
              this._realtimeChannel = null;
              this.updateStatus('local');
              this._resetPollTimer();
            }
          });
      } catch (rtErr) {
        console.warn('[SupabaseSync] Realtime setup note:', rtErr.message);
        this._realtimeChannel = null;
        this._realtimeSubscribed = false;
      }
    },

    // ── Direct Real-Time Supabase Authentication ────────────────────────────
    // ── Session Management ──────────────────────────────────────────────────
    async setSession(token, role) {
      this.sessionToken = token || null;
      this.sessionRole = role || null;
      if (token) {
        sessionStorage.setItem('pragyan_portal_token', token);
        sessionStorage.setItem('pragyan_portal_role', role || '');
        localStorage.setItem('pragyan_portal_token', token);
        localStorage.setItem('pragyan_portal_role', role || '');
      } else {
        sessionStorage.removeItem('pragyan_portal_token');
        sessionStorage.removeItem('pragyan_portal_role');
        localStorage.removeItem('pragyan_portal_token');
        localStorage.removeItem('pragyan_portal_role');
      }
      return this.pullAll();
    },

    // ── Direct Supabase REST API Call ────────────────────────────────────────
    /**
     * Makes a direct HTTP request to the Supabase REST API.
     * Uses the service key for full read/write access (bypasses RLS).
     */
    async _rest(method, table, queryParams = '', body = null, extraHeaders = {}, options = {}) {
      const url = `${REST_BASE}/${table}${queryParams ? '?' + queryParams : ''}`;
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'GET' ? 'count=exact' : 'return=representation',
        ...extraHeaders
      };
      const fetchOpts = { method, headers };
      if (options?.signal) fetchOpts.signal = options.signal;
      else if (method === 'GET' && this._pullAbort) fetchOpts.signal = this._pullAbort.signal;
      if (body && method !== 'GET') fetchOpts.body = JSON.stringify(body);
      const response = await fetch(url, fetchOpts);
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Supabase ${method} ${table} failed (${response.status}): ${errorText.slice(0, 200)}`);
      }
      const text = await response.text();
      return text ? JSON.parse(text) : [];
    },

    /**
     * Authenticated gateway transport (POST /api/db).
     * Resolves with the response `data` payload; throws on any failure with a
     * message that keeps the HTTP status prefix so existing catch-site logging
     * stays meaningful.
     */
    async _apiDb(tableOrConfig, operationArg, opts = {}) {
      let table = null;
      let operation = 'select';
      let data = null;
      let filters = {};
      let options = {};

      if (tableOrConfig && typeof tableOrConfig === 'object' && !Array.isArray(tableOrConfig)) {
        table = typeof tableOrConfig.table === 'string' ? tableOrConfig.table.trim() : tableOrConfig.table;
        operation = typeof tableOrConfig.operation === 'string' ? tableOrConfig.operation.trim() : (tableOrConfig.operation || 'select');
        data = tableOrConfig.data !== undefined ? tableOrConfig.data : null;
        filters = tableOrConfig.filters || {};
        options = tableOrConfig.options || {};
      } else {
        table = typeof tableOrConfig === 'string' ? tableOrConfig.trim() : tableOrConfig;
        if (typeof operationArg === 'object' && operationArg !== null && !Array.isArray(operationArg)) {
          // Signature: _apiDb(table, { operation, filters, data, options })
          operation = typeof operationArg.operation === 'string' ? operationArg.operation.trim() : (operationArg.operation || 'select');
          data = operationArg.data !== undefined ? operationArg.data : (opts.data !== undefined ? opts.data : null);
          filters = operationArg.filters || opts.filters || {};
          options = operationArg.options || opts.options || {};
        } else {
          // Signature: _apiDb(table, operation, opts)
          operation = typeof operationArg === 'string' ? operationArg.trim() : (operationArg || 'select');
          data = opts.data !== undefined ? opts.data : null;
          filters = opts.filters || {};
          options = opts.options || {};
        }
      }

      if (!table) {
        throw new Error(`Gateway ${operation} failed: table name is required`);
      }

      if (table === 'push_subscriptions' && operation === 'upsert' && !filters.conflict) {
        filters.conflict = 'endpoint';
      }
      if (table === 'blog_posts' && operation === 'upsert' && !filters.conflict) {
        filters.conflict = 'slug';
      }

      const token = this.sessionToken ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token')) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('pragyan_portal_token')) ||
        (typeof AppState !== 'undefined' && AppState.token) || null;
      if (!token) {
        // If public table read or push registration, anonymous access is permitted by /api/db
        const isPublicRead = (table === 'notices' || table === 'batches' || table === 'blog_posts' || table === 'class_schedules' || table === 'institute_holidays') && operation === 'select';
        const isPushRegister = table === 'push_subscriptions' && (operation === 'insert' || operation === 'upsert');
        if (!isPublicRead && !isPushRegister) {
          throw new Error(`Gateway ${operation} ${table} failed (401): no active session`);
        }
      }
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE}/api/db`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ table, operation, data, filters }),
        signal: options?.signal
      });
      let json = null;
      try { json = await response.json(); } catch (_) {}
      if (!response.ok || !json || json.success !== true) {
        const msg = json?.error || `HTTP ${response.status}`;
        throw new Error(`Gateway ${operation} ${table} failed (${response.status}): ${String(msg).slice(0, 200)}`);
      }
      return Array.isArray(json.data) ? json.data : (json.data ?? []);
    },

    getAll(table) {
      const key = KEY_MAP[table];
      if (!key) return [];
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    },

    // ── Read All Records from a Table ───────────────────────────────────────
    async readAll(table, extraQuery = '', options = {}) {
      const QUERY_TIMEOUT_MS = options.timeout || 15000; // 15 seconds default
      const pageSize = 1000;                            // gateway hard cap per page
      const maxRows = options.maxRows || 10000;
      let offset = 0;
      let allRows = [];
      const seenIds = new Set();                        // offset-paging drift guard
      const startTime = Date.now();

      while (offset < maxRows) {
        // Check timeout before each page fetch
        if (Date.now() - startTime > QUERY_TIMEOUT_MS) {
          console.warn(`⏱️ Query timeout for table '${table}' after ${QUERY_TIMEOUT_MS}ms`);
          throw new Error(`Query timeout: ${table} took longer than ${QUERY_TIMEOUT_MS}ms`);
        }

        // Create AbortController for this page fetch
        const pageAbortController = new AbortController();
        const pageTimeout = setTimeout(() => {
          pageAbortController.abort();
          console.warn(`⏱️ Page fetch timeout for ${table} at offset ${offset}`);
        }, 5000); // 5 seconds per page

        try {
          // Row scoping (student role) is enforced server-side by the gateway;
          // the legacy extraQuery filter string is no longer needed here.
          const page = await this._apiDb(table, 'select', {
            filters: { limit: pageSize, offset },
            options: { signal: pageAbortController.signal }
          });
          clearTimeout(pageTimeout);

          if (!Array.isArray(page) || page.length === 0) break;
          for (const row of page) {
            const dedupeKey = row && typeof row === 'object'
              ? (row.id ?? row.receipt_no ?? row.request_id ?? row.log_id ??
                 row.student_id ?? row.batch_id ?? row.admin_id ?? JSON.stringify(row))
              : row;
            if (seenIds.has(dedupeKey)) continue;
            seenIds.add(dedupeKey);
            allRows.push(row);
          }
          if (page.length < pageSize) break;
          offset += pageSize;
        } catch (err) {
          clearTimeout(pageTimeout);
          if (err.name === 'AbortError') {
            throw new Error(`Page fetch timeout for ${table} at offset ${offset}`);
          }
          throw err;
        }
      }
      return allRows;
    },

    // ── H1 & S2: Pull All Tables (Download from Supabase ➔ localStorage) ────
    async pullAll() {
      // H1: Mutex lock & pending queue
      if (this.isSyncing) {
        this._pendingPull = true;
        return new Promise((resolve, reject) => {
          if (!this._pendingPullResolvers) this._pendingPullResolvers = [];
          this._pendingPullResolvers.push({ resolve, reject });
        });
      }
      if (this._pullAbort) {
        try { this._pullAbort.abort(); } catch (_) {}
      }
      this._pullAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      this.isSyncing = true;
      this.updateStatus('syncing');

      this._pullPromise = (async () => {
        try {
          const activeRole = this.sessionRole || sessionStorage.getItem('pragyan_portal_role') || localStorage.getItem('pragyan_portal_role') || (typeof AppState !== 'undefined' && AppState.currentRole) || '';
          const currentStudent = (activeRole === 'student' && typeof AppState !== 'undefined' && AppState.currentUser) ? AppState.currentUser : null;
          const currentStudentId = currentStudent ? (currentStudent.id || currentStudent.student_id || currentStudent.rollNo) : null;

          // Role-aware table set. Row scoping for signed-in roles is enforced
          // SERVER-SIDE by the gateway; anonymous visitors may only pull the
          // public catalogue — every other table would 401 and poison the
          // failure accounting on the marketing site.
          const hasSession = Boolean(this.sessionToken ||
            sessionStorage.getItem('pragyan_portal_token') || localStorage.getItem('pragyan_portal_token'));
          const tables = hasSession
            ? ALL_TABLES
            : ['notices', 'batches', 'blog_posts'];

          // Fetch all tables in parallel with allSettled. Row scoping for the
          // student role is applied by the gateway from the signed session —
          // client-side filter strings are neither needed nor trusted.
          const fetchResults = await Promise.allSettled(
            tables.map(async table => {
              const rows = await this.readAll(table);
              return { table, rows };
            })
          );

          // S2: Transactional validation
          const data = {};
          const failedTables = [];

          fetchResults.forEach((res, idx) => {
            const table = tables[idx];
            if (res.status === 'fulfilled' && Array.isArray(res.value?.rows)) {
              data[table] = res.value.rows;
            } else {
              failedTables.push(table);
              console.warn(`⚠️ Failed to sync table: ${table}`, res.reason?.message || 'Unknown error');
            }
          });

          // If critical tables failed, rollback and preserve local cache
          const isCriticalFailure = failedTables.includes('students') && failedTables.includes('fee_receipts');
          if (failedTables.length === tables.length || isCriticalFailure) {
            console.error(`❌ Sync failed for critical tables: ${failedTables.join(', ')}. Preserving local state.`);
            this._connected = false;
            this.updateStatus('local');
            // Show user-friendly error message if online but sync failed
            if (navigator.onLine && typeof window !== 'undefined' && !window._syncErrorShown) {
              window._syncErrorShown = true;
              setTimeout(() => { window._syncErrorShown = false; }, 60000); // Reset after 1 minute
              console.error('⚠️ Unable to sync with database. You are viewing cached data. Please check your internet connection or contact support if the issue persists.');
            }
            return { success: false, error: 'Sync failed for critical tables', failedTables };
          }

          // Log warnings for non-critical table failures
          if (failedTables.length > 0) {
            console.warn(`⚠️ Partial sync: ${failedTables.length} table(s) failed to sync: ${failedTables.join(', ')}`);
          }

          // Atomic write of validated tables
          this.updateLocalState(data);
          this._connected = true;
          this.updateStatus('synced');
          // A successful sync proves the path to the server works — replay
          // anything the outbox has been holding from an outage.
          if (this._readOutbox().length) {
            this._flushOutbox().catch(err => console.warn('[Outbox] flush after sync failed:', err.message));
          }
          this.callbacks.forEach(cb => {
            try { cb('full_sync', data); } catch (e) { console.warn('Callback error:', e); }
          });
          return { success: true, data, failedTables: failedTables.length > 0 ? failedTables : undefined };
        } catch (error) {
          console.warn('[SupabaseSync] Cloud sync failed:', error.message);
          this._connected = false;
          this.updateStatus('local');
          return { success: false, error: error.message };
        } finally {
          this.isSyncing = false;
          this._pullPromise = null;
          // H1: Process queued pull if requested during in-flight fetch
          if (this._pendingPull) {
            this._pendingPull = false;
            const waiters = Array.isArray(this._pendingPullResolvers) ? this._pendingPullResolvers.splice(0) : [];
            this.pullAll()
              .then(nextRes => {
                waiters.forEach(w => {
                  try { w.resolve(nextRes); } catch (_) {}
                });
              })
              .catch(nextErr => {
                waiters.forEach(w => {
                  try { w.reject(nextErr); } catch (_) {}
                });
              });
          }
        }
      })();

      return this._pullPromise;
    },

    async pull() { return this.pullAll(); },

    // ── H2: Write Mutations (Push localStorage → Supabase) with Idempotency ───
    /**
     * mutate(table, operation, data, filters)
     * Operations: 'insert', 'upsert', 'update', 'delete'
     */
    async mutate(table, operation, data, filters = {}) {
      if (operation !== 'delete' && !data) return { success: false, error: 'No data provided' };
      try {
        let rows = Array.isArray(data) ? [...data] : (data ? [{ ...data }] : []);
        let result;

        // H2: Inject idempotency_key for tables supporting deduplication
        const conflictCol = filters.conflict || (table === 'student_requests' ? 'request_id' : (table === 'fee_receipts' ? 'receipt_no' : (ORDER_COLUMNS[table] || 'id')));
        const changedIds = [];

        rows = rows.map(r => {
          const rowObj = { ...r };
          // Strip client-only virtual keys
          delete rowObj.idempotency_key;

          if (table === 'fee_receipts') {
            const rNo = rowObj.receipt_no || rowObj.receiptNo || rowObj.id;
            if (rNo) {
              rowObj.receipt_no = rNo;
              changedIds.push(rNo);
            }
            delete rowObj.receiptNo;
            if (rowObj.date && !rowObj.payment_date) {
              rowObj.payment_date = rowObj.date;
            }
            delete rowObj.date;
            if (rowObj.mode && !rowObj.payment_mode) {
              rowObj.payment_mode = rowObj.mode;
            }
            delete rowObj.mode;
            if (rowObj.by && !rowObj.collected_by) {
              rowObj.collected_by = rowObj.by;
            }
            delete rowObj.by;

            // If student_id is not a UUID, resolve it to student UUID with fallback to master storage
            const rawId = String(rowObj.student_id || rowObj.studentId || '').trim();
            let isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

            if (!isUuid && rawId) {
              let students = [];
              if (typeof AppState !== 'undefined' && typeof AppState.getStudents === 'function') {
                try { students = AppState.getStudents() || []; } catch (e) {}
              }
              if (!students.length) {
                try {
                  const stored = localStorage.getItem('pragyan_db_students_master') || localStorage.getItem('pragyan_db_students');
                  if (stored) students = JSON.parse(stored);
                } catch (e) {}
              }

              const sLower = rawId.toLowerCase();
              const found = (students || []).find(s =>
                String(s.db_uuid || '').toLowerCase() === sLower ||
                String(s.id || '').toLowerCase() === sLower ||
                String(s.student_id || '').toLowerCase() === sLower ||
                String(s.studentId || '').toLowerCase() === sLower ||
                String(s.rollNo || '').toLowerCase() === sLower ||
                String(s.roll_no || '').toLowerCase() === sLower
              );

              if (found?.db_uuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(found.db_uuid)) {
                rowObj.student_id = found.db_uuid;
              } else if (found?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(found.id)) {
                rowObj.student_id = found.id;
              } else if (found?.student_id) {
                rowObj.student_id = found.student_id;
              } else {
                rowObj.student_id = rawId;
              }
            } else if (rawId) {
              rowObj.student_id = rawId;
            }

            // Strip any unsupported columns so Postgres doesn't throw 400
            delete rowObj.idempotency_key;
            delete rowObj.idempotencyKey;
            delete rowObj.amount_paid;
            delete rowObj.balance_due;
            delete rowObj.className;
            delete rowObj.class_name;
            delete rowObj.studentName;
            delete rowObj.student_name;
            delete rowObj.studentRoll;
            delete rowObj.student_roll;
            delete rowObj.rollNo;
            delete rowObj.roll_no;
            delete rowObj.receiptNo;
            delete rowObj.studentId;
          } else if (table === 'fee_billing_ledger') {
            const lId = rowObj.id || rowObj.idempotency_key;
            if (lId) changedIds.push(lId);
            if ((rowObj.batchName || rowObj.batchLabel || rowObj.className) && !rowObj.batch_label) {
              rowObj.batch_label = rowObj.batchName || rowObj.batchLabel || rowObj.className;
            }
            if (rowObj.previousDue !== undefined && rowObj.previous_due === undefined) {
              rowObj.previous_due = Number(rowObj.previousDue);
            }
            if (rowObj.updatedDue !== undefined && rowObj.updated_due === undefined) {
              rowObj.updated_due = Number(rowObj.updatedDue);
            }
            if (rowObj.billingMonth && !rowObj.billing_month) {
              rowObj.billing_month = rowObj.billingMonth;
            }
            if (rowObj.studentId && !rowObj.student_id) {
              rowObj.student_id = rowObj.studentId;
            }

            // Strip virtual and camelCase fields
            delete rowObj.batchName;
            delete rowObj.batchLabel;
            delete rowObj.className;
            delete rowObj.previousDue;
            delete rowObj.updatedDue;
            delete rowObj.billingMonth;
            delete rowObj.studentId;
            delete rowObj.studentName;
            delete rowObj.student_name;
            delete rowObj.rollNo;
            delete rowObj.roll_no;
            delete rowObj.currentMonthFee;
            delete rowObj.current_month_fee;
            delete rowObj.totalDue;
            delete rowObj.total_due;
            delete rowObj.paidThisMonth;
            delete rowObj.paid_this_month;
            delete rowObj.last_updated_at;
            delete rowObj.idempotencyKey;
          } else if (table === 'student_requests') {
            const reqId = rowObj.request_id || rowObj.id;
            if (reqId) {
              rowObj.request_id = reqId;
              changedIds.push(reqId);
            }
            if (rowObj.type && !rowObj.req_type) {
              rowObj.req_type = rowObj.type === 'payment' ? 'PAYMENT_VERIFICATION' : 'PROFILE_UPDATE';
            }
            delete rowObj.type;
            delete rowObj.paymentDetails;
            delete rowObj.date;
            delete rowObj.studentName;
            delete rowObj.studentRoll;
            delete rowObj.className;
          } else if (table === 'students') {
            const sId = rowObj.student_id || rowObj.id || rowObj.rollNo;
            if (sId) {
              rowObj.student_id = sId;
              changedIds.push(sId);
            }
            if (rowObj.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowObj.id)) {
              delete rowObj.id;
            }
            if (rowObj.className && !rowObj.class_name) rowObj.class_name = rowObj.className;
            if (rowObj.rollNo && !rowObj.roll_no) rowObj.roll_no = rowObj.rollNo;
            if (rowObj.guardianName && !rowObj.guardian_name) rowObj.guardian_name = rowObj.guardianName;
            if (rowObj.guardianMobile && !rowObj.guardian_mobile) rowObj.guardian_mobile = rowObj.guardianMobile;
            if (rowObj.bloodGroup && !rowObj.blood_group) rowObj.blood_group = rowObj.bloodGroup;
            if (rowObj.joiningMonth && !rowObj.joining_month) rowObj.joining_month = rowObj.joiningMonth;
            if (rowObj.admissionDate && !rowObj.admission_date) rowObj.admission_date = rowObj.admissionDate;
            if (rowObj.photoUrl && !rowObj.photo_url) rowObj.photo_url = rowObj.photoUrl;
            if (rowObj.photo && !rowObj.photo_url) rowObj.photo_url = rowObj.photo;
            if (rowObj.mobile) rowObj.mobile = this.sanitizeMobile(rowObj.mobile);
            if (rowObj.guardian_mobile) rowObj.guardian_mobile = this.sanitizeMobile(rowObj.guardian_mobile);
            if (rowObj.totalFee !== undefined && rowObj.total_fee === undefined) rowObj.total_fee = Number(rowObj.totalFee);
            if (rowObj.paidFee !== undefined && rowObj.paid_fee === undefined) rowObj.paid_fee = Number(rowObj.paidFee);
            if (rowObj.pendingFee !== undefined && rowObj.pending_fee === undefined) rowObj.pending_fee = Number(rowObj.pendingFee);
            if (rowObj.monthlyFee !== undefined && rowObj.monthly_fee === undefined) rowObj.monthly_fee = Number(rowObj.monthlyFee);

            delete rowObj.feeHistory;
            delete rowObj.photo;
            delete rowObj.photoUrl;
            delete rowObj.className;
            delete rowObj.rollNo;
            delete rowObj.guardianName;
            delete rowObj.guardianMobile;
            delete rowObj.bloodGroup;
            delete rowObj.joiningMonth;
            delete rowObj.admissionDate;
            delete rowObj.totalFee;
            delete rowObj.paidFee;
            delete rowObj.pendingFee;
            delete rowObj.monthlyFee;
          } else if (table === 'notices') {
            const nId = rowObj.id || rowObj.notice_id;
            if (nId) {
              changedIds.push(nId);
            }
            if (rowObj.content && !rowObj.message) {
              rowObj.message = rowObj.content;
            }
            delete rowObj.content;
            if (rowObj.targetBatch && !rowObj.target_batch) {
              rowObj.target_batch = rowObj.targetBatch;
            }
            delete rowObj.targetBatch;
            if (rowObj.attachmentUrl && !rowObj.attachment_url) {
              rowObj.attachment_url = rowObj.attachmentUrl;
            }
            delete rowObj.attachmentUrl;
            delete rowObj.notice_id;
            delete rowObj.date;
            delete rowObj.unread;
            delete rowObj._local_id;
            // If notice id is not a standard UUID, strip it so Postgres auto-generates a valid UUID
            if (rowObj.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowObj.id)) {
              delete rowObj.id;
            }
          } else if (table === 'batches') {
            const bId = rowObj.batch_id || rowObj.batchId || rowObj.id;
            if (bId) {
              rowObj.batch_id = bId;
              changedIds.push(bId);
            }
            if (rowObj.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowObj.id)) {
              delete rowObj.id;
            }
            if (rowObj.name || rowObj.batch_name || rowObj.batchName || rowObj.className) {
              rowObj.name = rowObj.name || rowObj.batch_name || rowObj.batchName || rowObj.className;
            }
            if (rowObj.class_name || rowObj.className || rowObj.name) {
              rowObj.class_name = rowObj.class_name || rowObj.className || rowObj.name;
            }
            if (rowObj.monthlyFee !== undefined && rowObj.monthly_fee === undefined) {
              rowObj.monthly_fee = Number(rowObj.monthlyFee);
            }
            delete rowObj.monthlyFee;
            if (rowObj.annualFee !== undefined && rowObj.annual_fee === undefined) {
              rowObj.annual_fee = Number(rowObj.annualFee);
            }
            delete rowObj.annualFee;
            if (rowObj.billingDay !== undefined && rowObj.billing_day === undefined) {
              rowObj.billing_day = Number(rowObj.billingDay);
            }
            delete rowObj.billingDay;
            if (rowObj.timings && !rowObj.timing) {
              rowObj.timing = rowObj.timings;
            }
            delete rowObj.timings;
            if (rowObj.room_no && !rowObj.room) {
              rowObj.room = rowObj.room_no;
            }
            delete rowObj.room_no;
            delete rowObj.teacher;
            delete rowObj.className;
            delete rowObj.batchName;
            delete rowObj.batchId;
          } else if (table === 'admins') {
            const aId = rowObj.admin_id || rowObj.id;
            if (aId) {
              rowObj.admin_id = aId;
              changedIds.push(aId);
            }
            if (rowObj.photoUrl && !rowObj.photo_url) rowObj.photo_url = rowObj.photoUrl;
            delete rowObj.photoUrl;
            if (rowObj.upiId && !rowObj.upi_id) rowObj.upi_id = rowObj.upiId;
            delete rowObj.upiId;
            if (rowObj.isHead !== undefined && rowObj.is_head === undefined) rowObj.is_head = !!rowObj.isHead;
            delete rowObj.isHead;
            delete rowObj.password;
            delete rowObj.passcode;
          } else if (table === 'blog_posts') {
            const pId = rowObj.id || rowObj.post_id;
            if (pId) changedIds.push(pId);
            if (rowObj.slug) changedIds.push(rowObj.slug);
            if (rowObj.contentMarkdown && !rowObj.content_markdown) rowObj.content_markdown = rowObj.contentMarkdown;
            if (rowObj.coverImageUrl && !rowObj.cover_image_url) rowObj.cover_image_url = rowObj.coverImageUrl;
            if (rowObj.authorName && !rowObj.author_name) rowObj.author_name = rowObj.authorName;
            if (rowObj.authorRole && !rowObj.author_role) rowObj.author_role = rowObj.authorRole;
            if (rowObj.isPublished !== undefined && rowObj.is_published === undefined) rowObj.is_published = Boolean(rowObj.isPublished);
            if (rowObj.readTimeMinutes !== undefined && rowObj.read_time_minutes === undefined) rowObj.read_time_minutes = Number(rowObj.readTimeMinutes);
            if (rowObj.viewsCount !== undefined && rowObj.views_count === undefined) rowObj.views_count = Number(rowObj.viewsCount);
            if (rowObj.publishedAt && !rowObj.published_at) rowObj.published_at = rowObj.publishedAt;
            if (rowObj.createdAt && !rowObj.created_at) rowObj.created_at = rowObj.createdAt;
            if (rowObj.updatedAt && !rowObj.updated_at) rowObj.updated_at = rowObj.updatedAt;

            rowObj.views_count = Math.max(Number(rowObj.views_count) || 0, 0);
            rowObj.read_time_minutes = Math.min(Math.max(Number(rowObj.read_time_minutes) || 3, 1), 120);
            if (typeof rowObj.tags === 'string') {
              rowObj.tags = rowObj.tags.split(',').map(t => t.trim()).filter(Boolean);
            } else if (!Array.isArray(rowObj.tags)) {
              rowObj.tags = [];
            }

            delete rowObj.contentMarkdown;
            delete rowObj.coverImageUrl;
            delete rowObj.authorName;
            delete rowObj.authorRole;
            delete rowObj.isPublished;
            delete rowObj.readTimeMinutes;
            delete rowObj.viewsCount;
            delete rowObj.publishedAt;
            delete rowObj.createdAt;
            delete rowObj.updatedAt;
            delete rowObj._local_id;
            delete rowObj.post_id;
            if (rowObj.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowObj.id)) {
              delete rowObj.id;
            }
          } else if (table === 'class_schedules') {
            const sId = rowObj.id;
            if (sId) changedIds.push(sId);
            if (rowObj.batchId && !rowObj.batch_id) rowObj.batch_id = rowObj.batchId;
            if (rowObj.dayOfWeek && !rowObj.day_of_week) rowObj.day_of_week = rowObj.dayOfWeek;
            if (rowObj.startTime && !rowObj.start_time) rowObj.start_time = rowObj.startTime;
            if (rowObj.endTime && !rowObj.end_time) rowObj.end_time = rowObj.endTime;
            if (rowObj.isCancelled !== undefined && rowObj.is_cancelled === undefined) rowObj.is_cancelled = Boolean(rowObj.isCancelled);
            if (rowObj.sortOrder !== undefined && rowObj.sort_order === undefined) rowObj.sort_order = Number(rowObj.sortOrder);
            delete rowObj.batchId;
            delete rowObj.dayOfWeek;
            delete rowObj.startTime;
            delete rowObj.endTime;
            delete rowObj.isCancelled;
            delete rowObj.sortOrder;
          } else if (table === 'institute_holidays') {
            const hId = rowObj.id;
            if (hId) changedIds.push(hId);
            if (rowObj.startDate && !rowObj.start_date) rowObj.start_date = rowObj.startDate;
            if (rowObj.endDate && !rowObj.end_date) rowObj.end_date = rowObj.endDate;
            if (rowObj.targetBatch && !rowObj.target_batch) rowObj.target_batch = rowObj.targetBatch;
            delete rowObj.startDate;
            delete rowObj.endDate;
            delete rowObj.targetBatch;
          } else if (rowObj.id) {
            changedIds.push(rowObj.id);
          }
          return rowObj;
        });

        if (operation === 'insert' || operation === 'upsert') {
          // Notices whose ids are client-minted non-UUIDs must go through a
          // plain insert so Postgres generates a real uuid; everything else
          // rides the conflict-targeted upsert (merge semantics preserved).
          const hasNonUuidNotice = table === 'notices' && rows.some(r => !r.id);
          const gatewayOp = (operation === 'upsert' && !hasNonUuidNotice && conflictCol)
            ? 'upsert'
            : 'insert';
          result = await this._apiDb(table, gatewayOp, {
            data: rows,
            filters: gatewayOp === 'upsert' ? { conflict: conflictCol } : {}
          });
        } else if (operation === 'update') {
          if (!filters.where || Object.keys(filters.where).length === 0) {
            return { success: false, error: 'Update requires a where clause' };
          }
          // Send the NORMALIZED row, not the raw caller object — the legacy
          // path PATCHed camelCase/virtual fields straight through and every
          // such write failed server-side with a silent 400.
          result = await this._apiDb(table, 'update', {
            data: rows.length ? rows[0] : {},
            filters: { where: { ...filters.where } }
          });
        } else if (operation === 'delete') {
          if (filters.all === true) {
            // Bulk purge: chunk by primary key so no unfiltered DELETE can ever
            // reach the wire (the gateway rejects those outright).
            const idCol = ORDER_COLUMNS[table] || 'id';
            const allRows = await this._apiDb(table, 'select', {
              filters: { columns: idCol, limit: 1000 }
            });
            const ids = (allRows || []).map(r => r?.[idCol]).filter(Boolean);
            for (let i = 0; i < ids.length; i += 500) {
              const chunk = ids.slice(i, i + 500);
              await this._apiDb(table, 'delete', { filters: { where: { [idCol]: chunk } } });
            }
            result = ids;
          } else {
            if (!filters.where || Object.keys(filters.where).length === 0) {
              return { success: false, error: 'Delete requires a where clause' };
            }
            result = await this._apiDb(table, 'delete', {
              filters: { where: { ...filters.where } }
            });
          }
        } else {
          return { success: false, error: `Unknown operation: ${operation}` };
        }

        // S5.5: Immediately synchronize local master store with confirmed database changes
        if (KEY_MAP[table]) {
          try {
            const masterKey = KEY_MAP[table];
            const rawStored = localStorage.getItem(masterKey);
            let localRows = rawStored ? JSON.parse(rawStored) : [];
            if (Array.isArray(localRows)) {
              if (operation === 'delete') {
                if (filters.all === true) {
                  localRows = [];
                } else if (filters.where) {
                  const w = filters.where;
                  localRows = localRows.filter(item => {
                    for (const [k, v] of Object.entries(w)) {
                      if (item[k] !== undefined && item[k] === v) return false;
                      if (k === 'id' && item.db_uuid && item.db_uuid === v) return false;
                      if (k === 'student_id' && item.id && item.id === v) return false;
                      if (k === 'slug' && item.slug && item.slug === v) return false;
                    }
                    return true;
                  });
                }
              } else if (operation === 'insert' || operation === 'upsert' || operation === 'update') {
                const returnedRows = Array.isArray(result) ? result : (result && typeof result === 'object' && Object.keys(result).length ? [result] : rows);
                returnedRows.forEach(retRow => {
                  if (!retRow || typeof retRow !== 'object') return;
                  const normalizedRow = table === 'blog_posts' ? this.normalizeBlogPost(retRow) :
                                        table === 'batches' ? this.normalizeBatch(retRow) :
                                        table === 'class_schedules' ? this.normalizeSchedule(retRow) :
                                        table === 'institute_holidays' ? this.normalizeHoliday(retRow) :
                                        retRow;
                  if (!normalizedRow) return;
                  const matchIdx = localRows.findIndex(x => {
                    if (normalizedRow.id && x.id === normalizedRow.id) return true;
                    if (table === 'blog_posts' && normalizedRow.slug && x.slug === normalizedRow.slug) return true;
                    if (table === 'batches' && (normalizedRow.batch_id || normalizedRow.batchId) && (x.batch_id === normalizedRow.batch_id || x.batchId === normalizedRow.batchId || x.id === (normalizedRow.batch_id || normalizedRow.batchId))) return true;
                    return false;
                  });
                  if (matchIdx >= 0) {
                    localRows[matchIdx] = Object.assign({}, localRows[matchIdx], normalizedRow);
                  } else {
                    localRows.unshift(normalizedRow);
                  }
                });
              }
              this.safeStore(masterKey, localRows);
            }
          } catch (_) {}
        }

        // S6: Broadcast with changed IDs payload
        this.broadcastChange({ table, operation, changedIds, data: rows });
        return { success: true, data: result };
      } catch (error) {
        // console.error, not warn: this function RETURNS its failures rather than
        // throwing them, and 23 of the 32 call sites in portal.js bare-await it
        // and discard the result. A caller that wrapped this in
        // `try { await mutate(...) } catch { console.warn(...) }` has dead code —
        // the catch never fires — and goes on to report success for a write that
        // never landed. Until every call site is converted, the log is the only
        // thing standing between a silent failure and a support call.
        console.error(`[SupabaseSync] Mutation FAILED [${table}:${operation}] — the local copy and the database now disagree:`, error.message);
        // Queue transient failures (network / 5xx / auth blips) for replay.
        // Permanent 4xx rejections are NOT queued — they would fail forever.
        const statusMatch = /\((\d{3})\):/.test(error.message) ? Number(RegExp.$1) : 0;
        const isTransient = statusMatch === 0 || statusMatch === 401 || statusMatch === 429 || statusMatch >= 500;
        if (isTransient && table !== 'audit_logs') {
          this._enqueueOutbox({ table, operation, data, filters });
        }
        return { success: false, error: error.message };
      }
    },

    /**
     * mutate(), but a failure is raised instead of returned.
     *
     * For call sites where proceeding on a failed write would be a lie — a request
     * marked Declined locally while the row is still Pending in the cloud, which
     * the very next pullAll() will resurrect after the student has already been
     * told it was declined. There is no outbox in this client: a mutation that
     * fails is not retried by anything, so it must not be treated as pending.
     */
    async mutateOrThrow(table, operation, data, filters = {}) {
      const result = await this.mutate(table, operation, data, filters);
      if (!result || result.success !== true) {
        throw new Error(result?.error || `Database rejected the ${operation} on ${table}`);
      }
      return result;
    },

    // ── Mutation outbox ──────────────────────────────────────────────────────
    // A failed write used to be simply lost: nothing retried it and the next
    // pullAll() overwrote the local claim with server truth. Failures that look
    // transient (network / 5xx / auth blips) are now queued — capped, oldest-
    // dropped — and replayed when connectivity or a successful sync returns.
    OUTBOX_KEY: 'pragyan_mutation_outbox',
    OUTBOX_MAX: 50,

    _readOutbox() {
      try {
        const raw = localStorage.getItem(this.OUTBOX_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_) { return []; }
    },

    _writeOutbox(entries) {
      try {
        localStorage.setItem(this.OUTBOX_KEY, JSON.stringify(entries.slice(-this.OUTBOX_MAX)));
        return true;
      } catch (e) {
        console.warn('[Outbox] could not persist queue:', e.message);
        return false;
      }
    },

    _enqueueOutbox(entry) {
      const entries = this._readOutbox();
      // Collapse exact duplicates (same table+op+key) so a flapping loop does
      // not fill the cap with copies of one write.
      const sig = JSON.stringify([entry.table, entry.operation, entry.filters, entry.data]);
      const deduped = entries.filter(e => JSON.stringify([e.table, e.operation, e.filters, e.data]) !== sig);
      deduped.push({ ...entry, queuedAt: new Date().toISOString() });
      return this._writeOutbox(deduped);
    },

    async _flushOutbox() {
      const entries = this._readOutbox();
      if (!entries.length || this._outboxFlushing) return 0;
      this._outboxFlushing = true;
      let delivered = 0;
      try {
        const remaining = [];
        for (const entry of entries) {
          try {
            const result = await this.mutate(entry.table, entry.operation, entry.data, entry.filters || {});
            if (result && result.success === true) { delivered++; continue; }
            // Permanent rejections (validation/permission/not-found) will never
            // succeed on retry — drop them rather than clogging the queue.
            if (/\((400|401|403|404|409)\):/.test(result?.error || '')) continue;
            remaining.push(entry);
          } catch (_) {
            remaining.push(entry);
          }
        }
        this._writeOutbox(remaining);
        if (delivered > 0) {
          console.log(`[Outbox] delivered ${delivered} queued mutation(s); ${remaining.length} still pending.`);
          this.broadcastChange({ type: 'OUTBOX_FLUSHED', delivered });
        }
      } finally {
        this._outboxFlushing = false;
      }
      return delivered;
    },

    // ── Normalize & Store Pulled Data ────────────────────────────────────────
    updateLocalState(data) {
      const normalized = {
        blog_posts:         Array.isArray(data.blog_posts)         ? data.blog_posts.map(r => this.normalizeBlogPost(r)).filter(Boolean) : undefined,
        students:           Array.isArray(data.students)           ? data.students.map(r => this.normalizeStudent(r)).filter(Boolean)  : undefined,
        notices:            Array.isArray(data.notices)            ? data.notices.map(r => this.normalizeNotice(r)).filter(Boolean)     : undefined,
        fee_receipts:       Array.isArray(data.fee_receipts)       ? data.fee_receipts.map(r => this.normalizeReceipt(r)).filter(Boolean) : undefined,
        fee_billing_ledger: Array.isArray(data.fee_billing_ledger) ? data.fee_billing_ledger.map(r => this.normalizeLedger(r)).filter(Boolean) : undefined,
        student_requests:   Array.isArray(data.student_requests)   ? data.student_requests.map(r => this.normalizeRequest(r)).filter(Boolean) : undefined,
        batches:            Array.isArray(data.batches)            ? data.batches.map(r => this.normalizeBatch(r)).filter(Boolean)     : undefined,
        admins:             Array.isArray(data.admins)             ? data.admins.map(r => this.normalizeAdmin(r)).filter(Boolean)      : undefined,
        audit_logs:         Array.isArray(data.audit_logs)         ? data.audit_logs.map(r => this.normalizeAuditLog(r)).filter(Boolean) : undefined,
        class_schedules:    Array.isArray(data.class_schedules)    ? data.class_schedules.map(r => this.normalizeSchedule(r)).filter(Boolean) : undefined,
        institute_holidays: Array.isArray(data.institute_holidays) ? data.institute_holidays.map(r => this.normalizeHoliday(r)).filter(Boolean) : undefined
      };

      // S4 & F8: Attach fee receipts to their respective students as feeHistory
      if (normalized.students && normalized.fee_receipts) {
        const byStudent = new Map();
        normalized.fee_receipts.forEach(receipt => {
          const rawId = (receipt.studentId || receipt.student_id || '').toString().trim().toLowerCase();
          if (!rawId) return;
          if (!byStudent.has(rawId)) byStudent.set(rawId, []);
          byStudent.get(rawId).push(receipt);
        });

        normalized.students.forEach(student => {
          const sUuid = (student.db_uuid || (student.id && String(student.id).includes('-') ? student.id : '')).toString().trim().toLowerCase();
          const sId = (student.id || student.student_id || '').toString().trim().toLowerCase();
          const sRoll = (student.rollNo || student.roll_no || '').toString().trim().toLowerCase();
          const receipts = [];
          if (sUuid && byStudent.has(sUuid)) {
            receipts.push(...byStudent.get(sUuid));
          }
          if (sId && sId !== sUuid && byStudent.has(sId)) {
            byStudent.get(sId).forEach(r => {
              const rNo = r.receiptNo || r.receipt_no;
              if (!receipts.some(existing => (existing.receiptNo || existing.receipt_no) === rNo)) {
                receipts.push(r);
              }
            });
          }
          if (sRoll && sRoll !== sId && sRoll !== sUuid && byStudent.has(sRoll)) {
            byStudent.get(sRoll).forEach(r => {
              const rNo = r.receiptNo || r.receipt_no;
              if (!receipts.some(existing => (existing.receiptNo || existing.receipt_no) === rNo)) {
                receipts.push(r);
              }
            });
          }
          // Also check all receipts if receipt_no contains the student ID
          normalized.fee_receipts.forEach(r => {
            const rNo = (r.receiptNo || r.receipt_no || '').toLowerCase();
            if ((sId && rNo.includes(sId)) || (sRoll && rNo.includes(sRoll))) {
              if (!receipts.some(existing => (existing.receiptNo || existing.receipt_no) === (r.receiptNo || r.receipt_no))) {
                receipts.push(r);
              }
            }
          });
          student.feeHistory = receipts;
        });
      }

      Object.entries(normalized).forEach(([table, rows]) => {
        if (Array.isArray(rows)) this.safeStore(KEY_MAP[table], rows);
      });
      if (typeof AppState !== 'undefined') {
        if (AppState.invalidateCaches) AppState.invalidateCaches();
        if (AppState._lastSavedStudentsMap && Array.isArray(normalized.students)) {
          AppState._lastSavedStudentsMap.clear();
          normalized.students.forEach(s => {
            const id = s.id || s.student_id || s.rollNo;
            if (id) AppState._lastSavedStudentsMap.set(id, { ...s });
          });
        }
        if (AppState._lastSavedReceiptsSet && Array.isArray(normalized.fee_receipts)) {
          AppState._lastSavedReceiptsSet.clear();
          normalized.fee_receipts.forEach(r => {
            const rNo = r.receiptNo || r.receipt_no;
            if (rNo) AppState._lastSavedReceiptsSet.add(rNo);
          });
        }
      }
    },

    safeStore(key, value) {
      const CRITICAL_KEYS = new Set([
        'pragyan_db_students_master',
        'pragyan_db_fee_receipts_master',
        'pragyan_db_requests_master',
        'pragyan_db_fee_ledger_master',
        'pragyan_db_batches_master',
        'pragyan_db_admins_master',
        'pragyan_portal_token',
        'pragyan_portal_role',
        'pragyan_session',
        'pragyan_portal_open',
        'pragyan_last_local_mutation',
        // Money-adjacent queues: storage pressure must never destroy a payment
        // that has not reached the office yet.
        'pragyan_mutation_outbox',
        'pragyan_undelivered_payment_submissions',
        'pragyan_db_blog_master'
      ]);

      try {
        const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, jsonStr);
        return true;
      } catch (e) {
        // Handle QuotaExceededError across browsers (Firefox, WebKit, Blink, Edge)
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.number === -2147024882) {
          console.warn(`⚠️ localStorage quota exceeded for '${key}'. Executing tiered cache eviction...`);

          // Stage 1: Evict non-critical disposable keys (temporary caches, logs, drafts)
          try {
            let freedCount = 0;
            Object.keys(localStorage).forEach(k => {
              if (!CRITICAL_KEYS.has(k) && k !== 'pragyan_db_notices_master' && k !== 'pragyan_db_audit_logs_master') {
                localStorage.removeItem(k);
                freedCount++;
              }
            });
            const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, jsonStr);
            console.log(`✅ [Quota Recovery] Stored '${key}' after freeing ${freedCount} disposable cache keys.`);
            return true;
          } catch (_) {}

          // Stage 2: Trim audit logs to last 25 entries if present
          try {
            const auditKey = KEY_MAP.audit_logs || 'pragyan_db_audit_logs_master';
            if (key === auditKey && Array.isArray(value) && value.length > 25) {
              const trimmed = value.slice(-25);
              localStorage.setItem(key, JSON.stringify(trimmed));
              console.log(`✅ [Quota Recovery] Trimmed audit logs to latest 25 records.`);
              return true;
            } else if (localStorage.getItem(auditKey)) {
              try {
                const logs = JSON.parse(localStorage.getItem(auditKey) || '[]');
                if (Array.isArray(logs) && logs.length > 25) {
                  localStorage.setItem(auditKey, JSON.stringify(logs.slice(-25)));
                }
              } catch (_) { localStorage.removeItem(auditKey); }
              const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
              localStorage.setItem(key, jsonStr);
              return true;
            }
          } catch (_) {}

          // Stage 3: Trim notices to last 15 if present
          try {
            const noticeKey = KEY_MAP.notices || 'pragyan_db_notices_master';
            if (key === noticeKey && Array.isArray(value) && value.length > 15) {
              const trimmed = value.slice(-15);
              localStorage.setItem(key, JSON.stringify(trimmed));
              return true;
            } else if (localStorage.getItem(noticeKey)) {
              try {
                const notices = JSON.parse(localStorage.getItem(noticeKey) || '[]');
                if (Array.isArray(notices) && notices.length > 15) {
                  localStorage.setItem(noticeKey, JSON.stringify(notices.slice(-15)));
                }
              } catch (_) { localStorage.removeItem(noticeKey); }
              const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
              localStorage.setItem(key, jsonStr);
              return true;
            }
          } catch (_) {}

          // Stage 4: Safety notification without corrupting critical state
          console.error(`❌ [Quota Exhaustion] Unable to persist '${key}' without compromising critical database integrity.`);
          if (typeof window !== 'undefined' && (key.includes('students') || key.includes('receipts') || key.includes('requests'))) {
            if (!window._storageQuotaWarningShown) {
              window._storageQuotaWarningShown = true;
              console.warn('⚠️ Storage quota reached. Active database tables are protected, but local browser cache is constrained.');
            }
          }
          return false;
        }

        console.warn(`Unable to cache '${key}':`, e.message);
        return false;
      }
    },

    // Helper: Strictly format phone numbers as 10 digits
    sanitizeMobile(phone) {
      if (!phone) return '';
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length === 10) return digits;
      if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
      if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
      if (digits.length > 10) return digits.slice(-10);
      return digits;
    },

    // ── H6: Normalizers (Supabase snake_case → App camelCase) ────────────────
    normalizeStudent(s) {
      if (!s) return null;
      const id = String(s.student_id || s.id || '').trim();
      if (!id) return null;
      const paidFee = Number(s.paid_fee ?? s.paidFee ?? 0);
      const pendingFee = Number(s.pending_fee ?? s.pendingFee ?? 0);
      const totalFee = Number(s.total_fee ?? s.totalFee ?? (paidFee + pendingFee));

      const rawMob = s.mobile || s.guardian_mobile || s.guardianMobile || '';
      const rawGrdMob = s.guardian_mobile || s.guardianMobile || s.mobile || '';
      const cleanMob = this.sanitizeMobile(rawMob);
      const cleanGrdMob = this.sanitizeMobile(rawGrdMob);

      return {
        id,
        db_uuid: (s.id && String(s.id).includes('-') && String(s.id).length > 20) ? String(s.id) : (s.db_uuid || ''),
        student_id: id,
        name: s.name || '',
        rollNo: s.roll_no || s.rollNo || id,
        className: s.class_name || s.className || '',
        batchName: s.batch_name || s.batchName || s.class_name || s.className || '',
        mobile: cleanMob,
        email: s.email || '',
        dob: s.dob || '',
        guardianName: s.guardian_name || s.guardianName || '',
        guardianMobile: cleanGrdMob || cleanMob,
        address: s.address || '',
        gender: s.gender || '',
        bloodGroup: s.blood_group || s.bloodGroup || '',
        totalFee: Math.max(totalFee, paidFee + pendingFee),
        paidFee,
        pendingFee,
        monthlyFee: Number(s.monthly_fee ?? s.monthlyFee ?? 0),
        status: s.status || 'Active',
        photo: s.photo_url || s.photoUrl || s.photo || '',
        photoUrl: s.photo_url || s.photoUrl || s.photo || '',
        joiningMonth: s.joining_month || s.joiningMonth || '',
        admissionDate: s.admission_date || s.admissionDate || '',
        created_at: s.created_at || s.createdAt || ''
      };
    },

    normalizeNotice(n) {
      if (!n) return null;
      const id = n.id || n.notice_id;
      return { ...n, id, notice_id: id, targetBatch: n.target_batch || n.targetBatch || 'All Batches', date: n.created_at || n.date || '', attachmentUrl: n.attachment_url || n.attachmentUrl || '' };
    },

    // Prefixes that mark a ledger entry rather than money that changed hands:
    // a monthly billing accrual, an opening carryover, a concession, a rate
    // change, an add-on. Kept in one place so this list and the portal's
    // isRealCollectedPayment() cannot drift apart.
    NON_CASH_RECEIPT_PREFIXES: ['REC-BILL-', 'OLD-DUE', 'ADJ-', 'RATE-', 'EDIT-', 'DUE-', 'NTC-', 'DISC-', 'ADDON-'],

    /**
     * S4: Normalize a receipt row, tagging non-cash entries instead of deleting
     * them.
     *
     * This used to `return null` for every adjustment, carryover and billing
     * accrual, and updateLocalState() then filtered those nulls out — so a row
     * that existed in fee_receipts in the cloud was erased from the local cache
     * on every pullAll(). The student fee history renders those rows with their
     * own badges (the "Adjusted" and "Pending Due" branches in portal.js), so a
     * concession the admin recorded was visible until the next sync and then
     * silently disappeared, leaving a balance nobody could account for.
     *
     * The exclusion itself is correct — a concession is not collected revenue —
     * but it belongs at the point where money is summed, not at the point where
     * data is cached. Every summing site in portal.js already calls
     * isRealCollectedPayment(), so the flag below is what those sites need and
     * the row survives for the history view.
     */
    normalizeReceipt(r) {
      if (!r) return null;
      const receiptNo = r.receipt_no || r.receiptNo;
      if (!receiptNo) return null;
      const recUpper = String(receiptNo).toUpperCase().trim();
      const mode = String(r.payment_mode || r.mode || '').toLowerCase();
      const isNonCash =
        this.NON_CASH_RECEIPT_PREFIXES.some(p => recUpper.startsWith(p)) ||
        mode.includes('non-cash') ||
        mode.includes('carryover') ||
        mode.includes('adjustment') ||
        mode.includes('waiver') ||
        mode.includes('concession');

      const studentId = (r.student_id || r.studentId || '').toString().trim();
      return {
        receiptNo,
        receipt_no: receiptNo,
        studentId,
        student_id: studentId,
        date: r.payment_date || r.date || '',
        mode: r.payment_mode || r.mode || 'Cash',
        amount: Number(r.amount || 0),
        status: r.status || 'Paid',
        by: r.collected_by || r.by || '',
        note: r.note || '',
        // Both spellings: the portal reads camelCase, a row round-tripped to the
        // cloud keeps the snake_case copy readable.
        isNonCash,
        is_non_cash: isNonCash
      };
    },

    normalizeRequest(r) {
      if (!r) return null;
      let newData = r.new_data || r.newData || null;
      let oldData = r.old_data || r.oldData || null;
      try { if (typeof newData === 'string') newData = JSON.parse(newData); } catch { newData = null; }
      try { if (typeof oldData === 'string') oldData = JSON.parse(oldData); } catch { oldData = null; }
      const id = r.request_id || r.id;
      const rawType = (r.req_type || r.type || '').toString().trim();
      const rawUpper = rawType.toUpperCase();

      // Normalize both ways: type is 'payment' | 'profile'
      const type = (rawUpper === 'PAYMENT_VERIFICATION' || rawUpper === 'PAYMENT' || rawType.toLowerCase() === 'payment') ? 'payment' : 'profile';
      const req_type = type === 'payment' ? 'PAYMENT_VERIFICATION' : 'PROFILE_UPDATE';
      const paymentDetails = r.paymentDetails || newData?.paymentDetails || (type === 'payment' ? (newData || {}) : null);

      return {
        ...r,
        id,
        request_id: id,
        studentId: r.student_id || r.studentId || '',
        studentName: r.student_name || r.studentName || '',
        rollNo: r.roll_no || r.rollNo || '',
        className: r.class_name || r.className || '',
        date: r.request_date || r.date || '',
        type,
        req_type,
        newData,
        oldData,
        paymentDetails
      };
    },

    normalizeLedger(l) {
      if (!l) return null;
      const id = l.id || l.idempotency_key;
      return {
        ...l,
        id,
        studentId: l.student_id || l.studentId || '',
        student_id: l.student_id || l.studentId || '',
        billingMonth: l.billing_month || l.billingMonth || '',
        billing_month: l.billing_month || l.billingMonth || '',
        batchLabel: l.batch_label || l.batchLabel || '',
        batch_label: l.batch_label || l.batchLabel || '',
        amount: Number(l.amount || 0),
        previousDue: Number(l.previous_due ?? l.previousDue ?? 0),
        previous_due: Number(l.previous_due ?? l.previousDue ?? 0),
        updatedDue: Number(l.updated_due ?? l.updatedDue ?? 0),
        updated_due: Number(l.updated_due ?? l.updatedDue ?? 0),
        idempotencyKey: l.idempotency_key || l.idempotencyKey || '',
        idempotency_key: l.idempotency_key || l.idempotencyKey || '',
        createdAt: l.created_at || l.createdAt || ''
      };
    },

    normalizeBatch(b) {
      if (!b) return null;
      const id = b.batch_id || b.id || '';
      const name = b.name || b.className || b.batch_name || b.batchName || '';

      // The canonical batch behind this row, matched on id first and then on the
      // stored class name. Every default below comes from it, because the ones
      // that used to be hardcoded here were the Class 10th batch's values applied
      // to all twelve: `?? 1000` re-rated the four ₹1,500 senior batches down by
      // a third on every pull, the timing claimed "4:00 PM – 6:30 PM" for batches
      // that sit in the afternoon, and the teacher list named CHANDAN KUMAR &
      // RAVI RANJAN on the three Special English batches that ADITI SINGH
      // teaches alone.
      const cfg = (typeof window !== 'undefined' && window.PRAGYAN_ACADEMIC) || null;
      const canon = cfg ? (cfg.resolveBatch(id) || cfg.resolveBatch(name)) : null;

      const storedFee = Number(b.monthly_fee ?? b.monthlyFee ?? NaN);
      // 0, not a guess: an unbillable ₹0 is visible to the admin, a plausible
      // wrong rate is not.
      const fee = Number.isFinite(storedFee) && storedFee > 0
        ? storedFee
        : (canon ? canon.monthlyFee : 0);

      // Left blank when unknown — every display site already falls back to
      // "As per timetable" rather than printing a window nobody teaches.
      const timing = b.timing || b.timings || b.schedule || '';
      const room = b.room || b.room_no || '';

      const roster = Array.isArray(b.teachers) && b.teachers.length > 0
        ? b.teachers
        : (canon ? canon.teachers.map(t => ({ name: t, subject: '' })) : []);
      const teacher = b.teacher || roster.map(t => t.name || t).join(' & ');

      return {
        ...b,
        id: id || (canon ? canon.batchId : ''),
        batch_id: id || (canon ? canon.batchId : ''),
        name: name || (canon ? canon.name : ''),
        className: name || (canon ? canon.className : ''),
        batchName: name || (canon ? canon.name : ''),
        batch_name: name || (canon ? canon.name : ''),
        monthlyFee: fee,
        monthly_fee: fee,
        timing: timing,
        timings: timing,
        room: room,
        teacher: teacher,
        teachers: roster
      };
    },

    normalizeAdmin(a) {
      if (!a) return null;
      const id = a.admin_id || a.id;
      const clean = {
        ...a,
        id,
        admin_id: id,
        upiId: a.upi_id || a.upiId || '',
        isHead: !!(a.is_head || a.isHead),
        photoUrl: a.photo_url || a.photoUrl || '',
        password_hash: a.password_hash || a.passwordHash || ''
      };
      delete clean.password;
      delete clean.passcode;
      return clean;
    },

    normalizeAuditLog(l) {
      if (!l) return null;
      const id = l.log_id || l.id;
      return {
        id,
        log_id: id,
        timestamp: l.timestamp || '',
        actor: l.actor || 'Admin',
        actionType: l.action_type || l.actionType || 'GENERAL_ACTION',
        studentName: l.student_name || l.studentName || 'System',
        studentRoll: l.student_roll || l.studentRoll || 'N/A',
        description: l.description || '',
        details: l.details || null
      };
    },

    // Blog & Academic Insights: snake_case row -> portal-friendly object.
    normalizeBlogPost(b) {
      if (!b) return null;
      const id = b.id || b.post_id;
      if (!id || !b.slug) return null;
      return {
        id,
        slug: String(b.slug || ''),
        title: b.title || '',
        excerpt: b.excerpt || '',
        content_markdown: b.content_markdown || b.contentMarkdown || '',
        cover_image_url: b.cover_image_url || b.coverImageUrl || '',
        category: b.category || 'Study Tips',
        tags: Array.isArray(b.tags) ? b.tags : [],
        author_name: b.author_name || b.authorName || 'Chandan Kumar',
        author_role: b.author_role || b.authorRole || 'Science Lead & Head Admin',
        is_published: Boolean(b.is_published),
        read_time_minutes: Number(b.read_time_minutes ?? b.readTimeMinutes ?? 3),
        views_count: Number(b.views_count ?? b.viewsCount ?? 0),
        published_at: b.published_at || b.publishedAt || null,
        created_at: b.created_at || b.createdAt || '',
        updated_at: b.updated_at || b.updatedAt || ''
      };
    },

    normalizeSchedule(s) {
      if (!s || typeof s !== 'object') return null;
      return {
        id: s.id || `SCHED-${s.batch_id || s.batchId || 'BAT-10'}-${(s.day_of_week || s.dayOfWeek || 'MON').slice(0, 3).toUpperCase()}-${s.sort_order || s.sortOrder || 1}`,
        batch_id: s.batch_id || s.batchId || 'BAT-10',
        batchId: s.batch_id || s.batchId || 'BAT-10',
        day_of_week: s.day_of_week || s.dayOfWeek || 'Monday',
        dayOfWeek: s.day_of_week || s.dayOfWeek || 'Monday',
        subject: s.subject || 'Lecture',
        start_time: s.start_time || s.startTime || '04:00 PM',
        startTime: s.start_time || s.startTime || '04:00 PM',
        end_time: s.end_time || s.endTime || '05:00 PM',
        endTime: s.end_time || s.endTime || '05:00 PM',
        teacher: s.teacher || 'Faculty',
        room: s.room || 'Classroom 1',
        is_cancelled: Boolean(s.is_cancelled || s.isCancelled),
        isCancelled: Boolean(s.is_cancelled || s.isCancelled),
        sort_order: Number(s.sort_order ?? s.sortOrder ?? 1),
        sortOrder: Number(s.sort_order ?? s.sortOrder ?? 1),
        created_at: s.created_at || s.createdAt || new Date().toISOString(),
        updated_at: s.updated_at || s.updatedAt || new Date().toISOString()
      };
    },

    normalizeHoliday(h) {
      if (!h || typeof h !== 'object') return null;
      return {
        id: h.id || `HOL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: h.title || 'Holiday',
        start_date: h.start_date || h.startDate || new Date().toISOString().split('T')[0],
        startDate: h.start_date || h.startDate || new Date().toISOString().split('T')[0],
        end_date: h.end_date || h.endDate || new Date().toISOString().split('T')[0],
        endDate: h.end_date || h.endDate || new Date().toISOString().split('T')[0],
        target_batch: h.target_batch || h.targetBatch || 'ALL',
        targetBatch: h.target_batch || h.targetBatch || 'ALL',
        description: h.description || '',
        created_at: h.created_at || h.createdAt || new Date().toISOString(),
        updated_at: h.updated_at || h.updatedAt || new Date().toISOString()
      };
    },

    // ── Change Notification & S6: Enriched Broadcast ────────────────────────
    onChange(callback) { this.callbacks.add(callback); return () => this.callbacks.delete(callback); },

    broadcastChange(details = {}) {
      const payload = {
        type: 'DATA_MUTATED',
        timestamp: Date.now(),
        sourceTabId: this._tabId,
        table: details.table || 'all',
        operation: details.operation || 'mutation',
        changedIds: details.changedIds || details.recordIds || (details.id ? [details.id] : []),
        ...details
      };
      if (this._bc) {
        try { this._bc.postMessage(payload); } catch(e) { console.warn('BroadcastChannel error:', e); }
      }
      this.callbacks.forEach(cb => {
        try { cb('mutation', payload); } catch(e) { console.warn('onChange callback error:', e); }
      });
    },

    // ── Mobile Image Compression ────────────────────────────────────────────
    async compressMobileImage(file, maxDimension = 800, quality = 0.80) {
      if (!file) return file;
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = event => {
          const image = new Image();
          image.onload = () => {
            let width = image.width; let height = image.height;
            if (width > maxDimension || height > maxDimension) {
              const scale = Math.min(maxDimension / width, maxDimension / height);
              width = Math.round(width * scale); height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(image, 0, 0, width, height);
            canvas.toBlob(blob => {
              if (blob) {
                const fileName = (file.name || 'photo.jpg').replace(/\.[^.]+$/, '.jpg');
                resolve(new File([blob], fileName, { type: 'image/jpeg' }));
              } else {
                resolve(file);
              }
            }, 'image/jpeg', quality);
          };
          image.onerror = () => resolve(file);
          image.src = event.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
      });
    },

    // ── Supabase Storage & Media Engine ─────────────────────────────────────
    _getStorageKey() {
      return SUPABASE_ANON_KEY;
    },

    async _ensureBucket(bucketName) {
      try {
        const storageKey = this._getStorageKey();
        const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${storageKey}`, 'apikey': storageKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: bucketName, name: bucketName, public: true, file_size_limit: 10485760 })
        });
        return r.ok || r.status === 400 || r.status === 409;
      } catch { return true; }
    },

    async uploadFile(file, folder = 'profile_pictures') {
      if (!file) return null;
      const isPdf = file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'));
      const compressed = isPdf ? file : await this.compressMobileImage(file, 600, 0.85);
      if (compressed.size > 10 * 1024 * 1024) throw new Error('Please choose a file smaller than 10 MB');

      // 1. Try server-side authenticated upload endpoint first if session is active
      const token = this.sessionToken || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pragyan_portal_token'));
      if (token && !this.isOfflineFallback && !String(token).startsWith('token_')) {
        try {
          const reader = new FileReader();
          const base64Data = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(compressed);
          });
          const apiBase = (typeof window !== 'undefined' && window.PRAGYAN_API_BASE) ? window.PRAGYAN_API_BASE : '';
          const apiRes = await fetch(`${apiBase}/api/upload-file`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              folder,
              fileName: compressed.name || (isPdf ? 'doc.pdf' : 'photo.jpg'),
              contentType: compressed.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
              base64: base64Data
            })
          });
          if (apiRes.ok) {
            const resJson = await apiRes.json().catch(() => ({}));
            if (resJson.success && resJson.url) {
              return resJson.url;
            }
          }
        } catch (apiErr) {
          console.warn('[SupabaseSync] /api/upload-file endpoint note:', apiErr.message);
        }
      }

      // 2. Direct Supabase Storage REST fallback using public anon authorization
      const BUCKET = 'pragyan-media';
      await this._ensureBucket(BUCKET);

      const rawExt = (compressed.name && compressed.name.split('.').pop()) || (isPdf ? 'pdf' : 'jpg');
      const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || (isPdf ? 'pdf' : 'jpg');
      const safeName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${safeName}`;
      const storageKey = this._getStorageKey();

      const maxRetries = 3;
      let lastError = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const backoffMs = Math.min(2000, 400 * Math.pow(2, attempt));
            await new Promise(r => setTimeout(r, backoffMs));
          }

          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${storageKey}`,
              'apikey': storageKey,
              'Content-Type': compressed.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
              'x-upsert': 'true'
            },
            body: compressed
          });

          if (response.ok) {
            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${safeName}`;
            return publicUrl;
          } else {
            const errData = await response.json().catch(() => ({}));
            lastError = new Error(errData.message || `Storage upload failed with HTTP ${response.status}`);
            console.warn(`Storage upload attempt ${attempt + 1} failed:`, response.status, errData);
            if (response.status >= 400 && response.status < 500) {
              break;
            }
          }
        } catch (err) {
          lastError = err;
          console.warn(`Storage upload attempt ${attempt + 1} exception:`, err.message);
        }
      }

      throw new Error(`Media upload failed: ${lastError?.message || 'Storage service unavailable. Please try again.'}`);
    },

    async deleteFile(fileUrl) {
      if (!fileUrl || typeof fileUrl !== 'string') return false;
      try {
        const BUCKET = 'pragyan-media';
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const idx = fileUrl.indexOf(marker);
        if (idx === -1) return false;
        const filePath = fileUrl.slice(idx + marker.length);
        const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`;
        const storageKey = this._getStorageKey();
        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${storageKey}`,
            'apikey': storageKey
          }
        });
        return response.ok;
      } catch (err) {
        console.warn('Storage deleteFile error:', err.message);
        return false;
      }
    },




    async login(role, identifier, credential) {
      // SECURITY: Sanitize all inputs before processing
      const cleanId = this._sanitizeForQuery(String(identifier || '').trim());
      const cleanCred = String(credential || '').trim();

      if (!cleanId || !cleanCred) {
        return { success: false, error: 'Please enter all credentials.' };
      }

      // ── PRIMARY AUTH PATH: Secure Verification via Serverless Endpoint ──
      let authRes = null;
      let authData = {};
      try {
        authRes = await fetch('/api/auth-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, identifier: cleanId, credential: cleanCred })
        });
        authData = await authRes.json().catch(() => ({}));
        if (authRes.ok && authData.success && authData.token) {
          this.isOfflineFallback = false;
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('pragyan_offline_fallback');
            sessionStorage.setItem('pragyan_portal_token', authData.token);
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pragyan_portal_token', authData.token);
          }
          await this.setSession(authData.token, role);
          await this.pullAll().catch(() => {});
          let finalUser = authData.user;
          if (role === 'student' && typeof AppState !== 'undefined' && AppState.getStudents) {
            const fresh = AppState.getStudents().find(s => s.id === finalUser.id || s.student_id === finalUser.id || s.rollNo === finalUser.rollNo);
            if (fresh) finalUser = fresh;
          }
          return { success: true, user: finalUser, token: authData.token };
        } else if (authRes.status === 401 || authRes.status === 400 || authRes.status === 429) {
          return { success: false, error: authData.error || 'Authentication failed. Please check your credentials.' };
        }
      } catch (apiErr) {
        console.warn('API /api/auth-login unreachable:', apiErr.message);
      }

      // ── SECURITY: FAIL CLOSED ──────────────────────────────────────────
      // There is deliberately NO client-side fallback authentication. Any
      // browser-side bcrypt/plaintext check against anon-fetched hashes, or
      // locally minted session tokens, is forgeable by definition. If the
      // server endpoint cannot be reached or fails, fail closed securely.
      return {
        success: false,
        error: (authData && authData.error) || 'Authentication service temporarily unavailable. Please check your connection and try again.'
      };
    },

    setSessionToken(token, role) {
      return this.setSession(token, role);
    },

    // ── UI Status Badge ─────────────────────────────────────────────────────
    /**
     * Reflects sync state on the header badge.
     *
     * Two versions of this method used to be declared on the object literal;
     * the later one silently won and it only ever recoloured the icon. The
     * .syncing / .offline classes that css/portal.css styles the pill with were
     * therefore never applied, so a badge reading "Offline cache" kept the
     * green "live" background. The class is the source of truth for the visual
     * state here, and the icon colour follows from it.
     *
     * The badge deliberately is not a live region. It flips syncing -> synced on
     * every poll, so announcing it would interrupt a screen-reader user roughly
     * twice a minute while they read a fee table. Only crossing into or out of
     * the offline state is worth saying out loud, and that goes through the
     * separate polite announcer below.
     */
    updateStatus(status) {
      if (typeof document === 'undefined') return;
      const STATES = {
        synced:  { icon: 'fa-cloud-arrow-up',        text: 'Cloud synced',  title: 'All data is live from the Supabase database' },
        syncing: { icon: 'fa-arrows-rotate fa-spin', text: 'Syncing…',      title: 'Downloading the latest data from the cloud…' },
        local:   { icon: 'fa-cloud-xmark',           text: 'Offline cache', title: 'Could not reach Supabase. Showing cached data.' }
      };
      const key = STATES[status] ? status : 'local';
      const state = STATES[key];
      const stateClass = key === 'syncing' ? 'syncing' : (key === 'synced' ? '' : 'offline');

      document.querySelectorAll('#adminCloudSyncBadge, #studentCloudSyncBadge').forEach(badge => {
        badge.classList.remove('syncing', 'offline');
        if (stateClass) badge.classList.add(stateClass);

        // The markup ships with an <i> and a <span>; recreate them if a
        // previous render or an innerHTML overwrite elsewhere removed them,
        // otherwise the state change would be silently dropped.
        let icon = badge.querySelector('i');
        let span = badge.querySelector('span');
        if (!icon) {
          icon = document.createElement('i');
          badge.insertBefore(icon, badge.firstChild);
        }
        if (!span) {
          span = document.createElement('span');
          badge.appendChild(span);
        }
        icon.className = `fa-solid ${state.icon}`;
        // Decorative: the adjacent <span> already carries the state as text,
        // and a Font Awesome glyph reads out as noise otherwise.
        icon.setAttribute('aria-hidden', 'true');
        span.textContent = state.text;
        badge.title = state.title;
      });

      this._announceOfflineTransition(key);
    },

    /** Say something only when the connection is actually lost or restored. */
    _announceOfflineTransition(key) {
      // 'syncing' is transient and tells the user nothing new either way.
      if (key === 'syncing') return;
      const isOffline = key === 'local';
      // The badge ships in a connected-looking state, so "was online" is the
      // right baseline — arriving offline really is a change from what the page
      // first showed the user.
      if (isOffline === (this._lastAnnouncedOffline === true)) return;
      this._lastAnnouncedOffline = isOffline;

      let announcer = document.getElementById('syncAnnouncer');
      if (!announcer) {
        if (!document.body) return;
        announcer = document.createElement('p');
        announcer.id = 'syncAnnouncer';
        announcer.className = 'sr-only';
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', 'polite');
        document.body.appendChild(announcer);
      }
      announcer.textContent = isOffline
        ? 'Connection lost. Showing saved data — any changes you make will be sent when you are back online.'
        : 'Connection restored. Showing live data.';
    },

    updateRealtimeBadge(connected) { if (connected) this.updateStatus('synced'); }
  };

  window.SupabaseSync = SupabaseSync;
})();
