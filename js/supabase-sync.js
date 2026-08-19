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

  // ── localStorage key map ────────────────────────────────────────────────────
  const KEY_MAP = {
    students:           'pragyan_db_students_master',
    notices:            'pragyan_db_notices_master',
    fee_receipts:       'pragyan_db_fee_receipts_master',
    fee_billing_ledger: 'pragyan_db_fee_ledger_master',
    student_requests:   'pragyan_db_requests_master',
    batches:            'pragyan_db_batches_master',
    admins:             'pragyan_db_admins_master',
    audit_logs:         'pragyan_db_audit_logs_master'
  };

  const ORDER_COLUMNS = {
    students: 'student_id', notices: 'id', fee_receipts: 'receipt_no',
    fee_billing_ledger: 'created_at', student_requests: 'created_at',
    batches: 'batch_id', admins: 'admin_id', audit_logs: 'log_id'
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
      this._listenForConnectivity();

      // Register cleanup on page unload
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          console.log('🔌 Page unloading - cleaning up Supabase connections...');
          this.destroy();
        });

        // Also handle visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            console.log('👁️ Tab hidden - pausing realtime sync');
            // Don't destroy, just pause polling
            if (this.pollTimer) {
              clearInterval(this.pollTimer);
              this.pollTimer = null;
            }
          } else {
            console.log('👁️ Tab visible - resuming realtime sync');
            this._listenForConnectivity();
          }
        });
      }

      return this.pullAll();
    },

    // ── S1: Clear poll timer and tear down connections ───────────────────────
    destroy() {
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
      if (this._realtimeChannel && this._supabaseClient) {
        try {
          // CORRECT: Unsubscribe first, then remove
          this._realtimeChannel.unsubscribe();
          this._supabaseClient.removeChannel(this._realtimeChannel);
          console.log('✅ Realtime channel unsubscribed and removed');
        } catch(e) {
          console.error('❌ Realtime channel cleanup failed:', e.message);
          // Force disconnect as fallback
          try {
            this._supabaseClient.removeAllChannels();
          } catch(forceErr) {
            console.error('❌ Force channel removal failed:', forceErr.message);
          }
        }
        this._realtimeChannel = null;
        this._realtimeSubscribed = false;
      }
      if (this._bc) {
        try { this._bc.close(); } catch(e) {}
        this._bc = null;
      }
      this.callbacks.clear();
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
      window.addEventListener('online', () => this._schedulePull(100));
      window.addEventListener('focus', () => this._schedulePull(150));
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this._schedulePull(150);
          this._resetPollTimer();
        } else if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      });

      // 1. Instant Realtime WebSocket Subscription via Supabase Client
      if (typeof window !== 'undefined' && window.supabase && !this._realtimeSubscribed) {
        try {
          // Reuse global client to prevent connection leaks
          if (!window._pragyanSupabaseClient) {
            console.log('🔌 Creating new Supabase client instance');
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
              console.log('⚡ [Supabase Realtime] Change received from database:', payload.table, payload.eventType);
              this._schedulePull(150);
            })
            .subscribe((status) => {
              console.log('⚡ [Supabase Realtime] Subscription status:', status);
              if (status === 'SUBSCRIBED') {
                this._realtimeSubscribed = true;
                this.updateStatus('synced');
                this._resetPollTimer();
              }
              if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                console.error(`❌ Realtime connection ${status}`);
                this._realtimeSubscribed = false;
                this.updateStatus('local');
                this._resetPollTimer();
              }
            });
        } catch (rtErr) {
          console.error('❌ Supabase Realtime setup failed:', rtErr.message);
        }
      }

      // 2. Start adaptive smart polling
      this._resetPollTimer();

      // Cross-tab sync via BroadcastChannel (with tab echo suppression)
      if (typeof BroadcastChannel !== 'undefined') {
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

    updateStatus(status) {
      if (typeof document === 'undefined') return;
      const studentBadge = document.getElementById('studentCloudSyncBadge');
      const adminBadge = document.getElementById('adminCloudSyncBadge');
      const badges = [studentBadge, adminBadge].filter(Boolean);

      badges.forEach(badge => {
        badge.classList.remove('syncing', 'offline');
        if (status === 'syncing') {
          badge.classList.add('syncing');
          badge.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin" style="color: #F59E0B;"></i> <span>Syncing...</span>';
        } else if (status === 'synced') {
          badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" style="color: #10B981;"></i> <span>Cloud Live</span>';
        } else {
          badge.classList.add('offline');
          badge.innerHTML = '<i class="fa-solid fa-hard-drive" style="color: #6B7280;"></i> <span>Local Cache</span>';
        }
      });
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

    // ── Read All Records from a Table ───────────────────────────────────────
    async readAll(table, extraQuery = '', options = {}) {
      const QUERY_TIMEOUT_MS = options.timeout || 15000; // 15 seconds default
      const orderCol = ORDER_COLUMNS[table] || 'id';
      const dir = (table === 'student_requests' || table === 'notices' || table === 'audit_logs') ? 'desc' : 'asc';
      const pageSize = 1000;
      const maxRows = options.maxRows || 10000;
      let offset = 0;
      let allRows = [];
      const startTime = Date.now();

      while (offset < maxRows) {
        // Check timeout before each page fetch
        if (Date.now() - startTime > QUERY_TIMEOUT_MS) {
          console.warn(`⏱️ Query timeout for table '${table}' after ${QUERY_TIMEOUT_MS}ms`);
          throw new Error(`Query timeout: ${table} took longer than ${QUERY_TIMEOUT_MS}ms`);
        }

        let params = `select=*&order=${orderCol}.${dir}&limit=${pageSize}&offset=${offset}`;
        if (extraQuery) params += `&${extraQuery}`;

        // Create AbortController for this page fetch
        const pageAbortController = new AbortController();
        const pageTimeout = setTimeout(() => {
          pageAbortController.abort();
          console.warn(`⏱️ Page fetch timeout for ${table} at offset ${offset}`);
        }, 5000); // 5 seconds per page

        try {
          const page = await this._rest('GET', table, params, null, {}, {
            ...options,
            signal: pageAbortController.signal
          });
          clearTimeout(pageTimeout);

          if (!Array.isArray(page) || page.length === 0) break;
          allRows.push(...page);
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

          const tables = ALL_TABLES;

          // Fetch all tables in parallel with allSettled
          const fetchResults = await Promise.allSettled(
            tables.map(async table => {
              let filter = '';
              if (activeRole === 'student' && currentStudentId) {
                // SECURITY: Sanitize all user input before using in queries
                const sanitizedId = this._sanitizeForQuery(currentStudentId);
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedId);
                const sRoll = this._sanitizeForQuery(String(currentStudent.rollNo || currentStudent.roll_no || ''));
                const sStuId = this._sanitizeForQuery(String(currentStudent.student_id || currentStudent.id || ''));

                if (table === 'students') {
                  if (isUuid) {
                    filter = `or=(student_id.eq.${this._encodeFilterValue(sStuId || sanitizedId)},id.eq.${this._encodeFilterValue(sanitizedId)})`;
                  } else {
                    const clauses = [`student_id.eq.${this._encodeFilterValue(sanitizedId)}`];
                    if (sRoll && sRoll !== sanitizedId) clauses.push(`roll_no.eq.${this._encodeFilterValue(sRoll)}`);
                    filter = clauses.length > 1 ? `or=(${clauses.join(',')})` : clauses[0];
                  }
                } else if (table === 'fee_receipts') {
                  const dbUuid = this._sanitizeForQuery(currentStudent.db_uuid || (isUuid ? sanitizedId : ''));
                  if (dbUuid) {
                    filter = `student_id.eq.${this._encodeFilterValue(dbUuid)}`;
                  }
                } else if (table === 'fee_billing_ledger') {
                  const sStuId = this._sanitizeForQuery(String(currentStudent.student_id || currentStudent.id || sanitizedId));
                  filter = `student_id.eq.${this._encodeFilterValue(sStuId)}`;
                } else if (table === 'student_requests') {
                  const clauses = [`student_id.eq.${this._encodeFilterValue(sanitizedId)}`];
                  if (sRoll && sRoll !== sanitizedId) clauses.push(`roll_no.eq.${this._encodeFilterValue(sRoll)}`);
                  filter = clauses.length > 1 ? `or=(${clauses.join(',')})` : clauses[0];
                }
              }
              const rows = await this.readAll(table, filter);
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
            const bId = rowObj.batch_id || rowObj.id;
            if (bId) {
              rowObj.batch_id = bId;
              changedIds.push(bId);
            }
            if (rowObj.monthlyFee !== undefined && rowObj.monthly_fee === undefined) {
              rowObj.monthly_fee = Number(rowObj.monthlyFee);
            }
            delete rowObj.monthlyFee;
            if (rowObj.className && !rowObj.name) {
              rowObj.name = rowObj.className;
            }
            delete rowObj.className;
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
          } else if (rowObj.id) {
            changedIds.push(rowObj.id);
          }
          return rowObj;
        });

        if (operation === 'insert') {
          const hasNonUuidNotice = table === 'notices' && rows.some(r => !r.id);
          const params = (conflictCol && !hasNonUuidNotice) ? `on_conflict=${conflictCol}` : '';
          result = await this._rest('POST', table, params, rows, {
            'Prefer': 'return=representation,resolution=merge-duplicates'
          });
        } else if (operation === 'upsert') {
          const hasNonUuidNotice = table === 'notices' && rows.some(r => !r.id);
          const params = (conflictCol && !hasNonUuidNotice) ? `on_conflict=${conflictCol}` : '';
          result = await this._rest('POST', table, params, rows, {
            'Prefer': 'return=representation,resolution=merge-duplicates'
          });
        } else if (operation === 'update') {
          if (!filters.where || Object.keys(filters.where).length === 0) {
            return { success: false, error: 'Update requires a where clause' };
          }
          const whereParams = Object.entries(filters.where)
            .map(([col, val]) => `${col}=eq.${val}`).join('&');
          result = await this._rest('PATCH', table, whereParams, data);
        } else if (operation === 'delete') {
          if (!filters.where || Object.keys(filters.where).length === 0) {
            return { success: false, error: 'Delete requires a where clause' };
          }
          const whereParams = Object.entries(filters.where)
            .map(([col, val]) => `${col}=eq.${val}`).join('&');
          result = await this._rest('DELETE', table, whereParams);
        } else {
          return { success: false, error: `Unknown operation: ${operation}` };
        }

        // S6: Broadcast with changed IDs payload
        this.broadcastChange({ table, operation, changedIds, data: rows });
        return { success: true, data: result };
      } catch (error) {
        console.warn(`Mutation failed [${table}:${operation}]:`, error.message);
        return { success: false, error: error.message };
      }
    },

    // ── Normalize & Store Pulled Data ────────────────────────────────────────
    updateLocalState(data) {
      const normalized = {
        students:           Array.isArray(data.students)           ? data.students.map(r => this.normalizeStudent(r)).filter(Boolean)  : undefined,
        notices:            Array.isArray(data.notices)            ? data.notices.map(r => this.normalizeNotice(r)).filter(Boolean)     : undefined,
        fee_receipts:       Array.isArray(data.fee_receipts)       ? data.fee_receipts.map(r => this.normalizeReceipt(r)).filter(Boolean) : undefined,
        fee_billing_ledger: Array.isArray(data.fee_billing_ledger) ? data.fee_billing_ledger.map(r => this.normalizeLedger(r)).filter(Boolean) : undefined,
        student_requests:   Array.isArray(data.student_requests)   ? data.student_requests.map(r => this.normalizeRequest(r)).filter(Boolean) : undefined,
        batches:            Array.isArray(data.batches)            ? data.batches.map(r => this.normalizeBatch(r)).filter(Boolean)     : undefined,
        admins:             Array.isArray(data.admins)             ? data.admins.map(r => this.normalizeAdmin(r)).filter(Boolean)      : undefined,
        audit_logs:         Array.isArray(data.audit_logs)         ? data.audit_logs.map(r => this.normalizeAuditLog(r)).filter(Boolean) : undefined
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
        'pragyan_last_local_mutation'
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

    // S4: Normalize receipts with consistent studentId
    normalizeReceipt(r) {
      if (!r) return null;
      const receiptNo = r.receipt_no || r.receiptNo;
      if (!receiptNo) return null;
      const studentId = (r.student_id || r.studentId || '').toString().trim();
      return {
        receiptNo,
        studentId,
        date: r.payment_date || r.date || '',
        mode: r.payment_mode || r.mode || 'Cash',
        amount: Number(r.amount || 0),
        by: r.collected_by || r.by || '',
        note: r.note || ''
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
      const id = b.batch_id || b.id;
      return { ...b, id, batch_id: id, name: b.name || b.batch_name || '', monthlyFee: Number(b.monthly_fee ?? b.monthlyFee ?? 0), timing: b.timing || b.schedule || '', room: b.room || b.room_no || '' };
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

    // ── Direct Real-Time Database Authentication ────────────────────────────
    _normalizeDob(d) {
      if (!d) return [];
      const str = String(d).trim();
      const results = [];

      // 1. ISO format: YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        results.push(str);
      }

      // 2. 8 continuous digits: DDMMYYYY (Primary) or YYYYMMDD
      if (/^\d{8}$/.test(str)) {
        // DDMMYYYY
        const day = str.slice(0, 2);
        const month = str.slice(2, 4);
        const year = str.slice(4, 8);
        const yNum = parseInt(year, 10);
        const mNum = parseInt(month, 10);
        const dNum = parseInt(day, 10);
        if (yNum >= 1970 && yNum <= 2035 && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
          results.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        }

        // YYYYMMDD
        const y2 = str.slice(0, 4);
        const m2 = str.slice(4, 6);
        const d2 = str.slice(6, 8);
        const yNum2 = parseInt(y2, 10);
        const mNum2 = parseInt(m2, 10);
        const dNum2 = parseInt(d2, 10);
        if (yNum2 >= 1970 && yNum2 <= 2035 && mNum2 >= 1 && mNum2 <= 12 && dNum2 >= 1 && dNum2 <= 31) {
          results.push(`${y2}-${m2.padStart(2, '0')}-${d2.padStart(2, '0')}`);
        }
      }

      // 3. Separator-based dates: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
      const parts = str.split(/[-/.]/);
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          const y = parts[2];
          const m = parts[1].padStart(2, '0');
          const day = parts[0].padStart(2, '0');
          results.push(`${y}-${m}-${day}`);
        } else if (parts[0].length === 4) {
          const y = parts[0];
          const m = parts[1].padStart(2, '0');
          const day = parts[2].padStart(2, '0');
          results.push(`${y}-${m}-${day}`);
        }
      }

      // 4. Standard Date parse
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        try {
          results.push(parsed.toISOString().split('T')[0]);
        } catch(e) {}
      }

      return [...new Set(results)];
    },

    _dobMatches(inputDob, studentDob) {
      if (!inputDob || !studentDob) return false;
      const inputStr = String(inputDob).trim().toLowerCase();
      const stuStr = String(studentDob).trim().toLowerCase();
      if (inputStr === stuStr) return true;

      const inputNorms = this._normalizeDob(inputDob);
      const studentNorms = this._normalizeDob(studentDob);
      if (inputNorms.some(i => studentNorms.includes(i))) return true;

      const inputDigits = inputStr.replace(/\D/g, '');
      const stuDigits = stuStr.replace(/\D/g, '');
      if (inputDigits && stuDigits) {
        if (inputDigits === stuDigits) return true;

        const stuNorm = studentNorms[0];
        if (stuNorm && /^\d{4}-\d{2}-\d{2}$/.test(stuNorm)) {
          const [y, m, d] = stuNorm.split('-');
          const stuDDMMYYYY = `${d}${m}${y}`;
          const stuYYYYMMDD = `${y}${m}${d}`;
          if (inputDigits === stuDDMMYYYY || inputDigits === stuYYYYMMDD) return true;
        }
      }
      return false;
    },

    async _verifyPasswordHash(password, storedHash) {
      if (!password || !storedHash) return false;
      if (String(password).trim() === String(storedHash).trim()) return true;

      // 1. Check bcrypt hash if bcryptjs is loaded
      if (storedHash.startsWith('$2')) {
        try {
          if (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) {
            return dcodeIO.bcrypt.compareSync(String(password), storedHash);
          }
          if (typeof window !== 'undefined' && window.bcrypt && window.bcrypt.compareSync) {
            return window.bcrypt.compareSync(String(password), storedHash);
          }
        } catch (_) {}
      }

      // 2. Check SHA-256 hex hash (64 characters) via Web Crypto API
      if (/^[a-f0-9]{64}$/i.test(storedHash)) {
        try {
          const msgBuffer = new TextEncoder().encode(String(password));
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          return hashHex.toLowerCase() === storedHash.toLowerCase();
        } catch (_) {}
      }

      return false;
    },

    async login(role, identifier, credential) {
      // SECURITY: Sanitize all inputs before processing
      const cleanId = this._sanitizeForQuery(String(identifier || '').trim());
      const cleanCred = String(credential || '').trim();

      if (!cleanId || !cleanCred) {
        return { success: false, error: 'Please enter all credentials.' };
      }

      // ── PRIMARY AUTH PATH: Secure Verification via Serverless Endpoint ──
      try {
        const authRes = await fetch('/api/auth-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, identifier: cleanId, credential: cleanCred })
        });
        const authData = await authRes.json().catch(() => ({}));
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
        console.warn('API /api/auth-login unreachable, evaluating direct database auth fallback:', apiErr.message);
      }

      // ── FALLBACK AUTH PATH: Direct Database Query Authentication ──
      if (role === 'admin') {
        try {
          const sanitizedId = this._sanitizeForQuery(cleanId);
          const encoded = this._encodeFilterValue(sanitizedId);
          const filter = `or=(username.ilike.${encoded},email.ilike.${encoded},mobile.eq.${encoded},admin_id.ilike.${encoded})&select=*&limit=5`;
          const admins = await this._rest('GET', 'admins', filter);
          if (Array.isArray(admins) && admins.length > 0) {
            for (const admin of admins) {
              const hash = admin.password_hash || admin.passwordHash || '';
              let isMatch = false;
              if (hash) {
                isMatch = await this._verifyPasswordHash(cleanCred, hash);
              }
              if (!isMatch && admin.password) {
                isMatch = (String(admin.password).trim() === cleanCred);
              }
              if (isMatch) {
                const norm = this.normalizeAdmin(admin);
                const token = `token_adm_${admin.id || admin.admin_id}_${Date.now()}`;
                this.isOfflineFallback = true;
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.setItem('pragyan_offline_fallback', 'true');
                }
                await this.setSession(token, 'admin');
                await this.pullAll().catch(() => {});
                return {
                  success: true,
                  user: norm,
                  token,
                  isFallback: true
                };
              }
            }
          }
        } catch (e) {
          console.warn('Live admin auth query note:', e.message);
        }

        // Local Admin Check using password_hash and password fallback
        const localAdmins = (typeof AppState !== 'undefined' && AppState.getAdmins) ? AppState.getAdmins() : [];
        for (const a of localAdmins) {
          const idMatch = (
            a.username?.toLowerCase() === cleanId.toLowerCase() || 
            a.email?.toLowerCase() === cleanId.toLowerCase() || 
            a.mobile === cleanId ||
            (a.id || a.admin_id)?.toLowerCase() === cleanId.toLowerCase()
          );
          if (idMatch) {
            const hash = a.password_hash || a.passwordHash || '';
            let isMatch = false;
            if (hash) {
              isMatch = await this._verifyPasswordHash(cleanCred, hash);
            }
            if (!isMatch && a.password) {
              isMatch = (String(a.password).trim() === cleanCred);
            }
            if (isMatch) {
              const cleanUser = this.normalizeAdmin(a) || a;
              const token = `token_adm_${a.id || a.admin_id || 'ADM'}_${Date.now()}`;
              this.isOfflineFallback = true;
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('pragyan_offline_fallback', 'true');
              }
              await this.setSession(token, 'admin');
              await this.pullAll().catch(() => {});
              return {
                success: true,
                user: cleanUser,
                token,
                isFallback: true
              };
            }
          }
        }
        return { success: false, error: 'Incorrect Admin Username, Email or Password.' };
      }

      // Student Role:
      try {
        const sanitizedId = this._sanitizeForQuery(cleanId);
        const filter = `or=(mobile.eq.${this._encodeFilterValue(sanitizedId)},roll_no.ilike.${this._encodeFilterValue(sanitizedId)},student_id.ilike.${this._encodeFilterValue(sanitizedId)})&select=*&limit=5`;
        const students = await this._rest('GET', 'students', filter);
        if (Array.isArray(students) && students.length > 0) {
          let matched = null;
          for (const s of students) {
            const sId = this._sanitizeForQuery(s.student_id || s.id);
            const rollNo = this._sanitizeForQuery(s.roll_no || sId);
            try {
              const reqFilter = `req_type=eq.PASSWORD_UPDATE&or=(student_id.eq.${this._encodeFilterValue(sId)},student_id.eq.${this._encodeFilterValue(rollNo)},roll_no.eq.${this._encodeFilterValue(rollNo)})&order=created_at.desc&limit=1`;
              const pwdReqs = await this._rest('GET', 'student_requests', reqFilter);
              const activeReq = pwdReqs && pwdReqs[0] && pwdReqs[0].status === 'Active' ? pwdReqs[0] : null;
              if (activeReq && activeReq.new_data) {
                const newD = typeof activeReq.new_data === 'string' ? JSON.parse(activeReq.new_data) : activeReq.new_data;
                const hash = newD.password_hash || newD.passwordHash || '';
                const isPwdMatch = hash ? (await this._verifyPasswordHash(cleanCred, hash)) : (newD.password === cleanCred);
                if (isPwdMatch) {
                  matched = s;
                  break;
                }
              }
            } catch (_) {}

            if (this._dobMatches(cleanCred, s.dob)) {
              matched = s;
              break;
            }
          }

          if (matched) {
            const token = `token_stu_${matched.id || matched.student_id}_${Date.now()}`;
            this.isOfflineFallback = true;
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('pragyan_offline_fallback', 'true');
            }
            await this.setSession(token, 'student');
            await this.pullAll().catch(() => {});
            let norm = this.normalizeStudent(matched);
            if (typeof AppState !== 'undefined' && AppState.getStudents) {
              const fresh = AppState.getStudents().find(st => st.id === matched.id || st.student_id === matched.student_id || st.rollNo === matched.roll_no);
              if (fresh) norm = fresh;
            }
            return {
              success: true,
              user: norm,
              token,
              isFallback: true,
              warning: 'Offline session: Server-dependent operations require an active internet connection.'
            };
          }
          return { success: false, error: 'Incorrect Password or Date of Birth for this student.' };
        }
      } catch (e) {
        console.warn('Live student auth query failed, checking local state:', e.message);
      }

      // Local Student Check
      const localStudents = (typeof AppState !== 'undefined' && AppState.getStudents) ? AppState.getStudents() : [];
      const localRequests = (typeof AppState !== 'undefined' && AppState.getRequests) ? AppState.getRequests() : [];

      let matchedStudent = null;
      for (const s of localStudents) {
        const idMatch = (s.mobile === cleanId || s.rollNo?.toLowerCase() === cleanId.toLowerCase() || s.student_id?.toLowerCase() === cleanId.toLowerCase() || s.id?.toLowerCase() === cleanId.toLowerCase());
        if (!idMatch) continue;

        const sId = s.student_id || s.id;
        const rollNo = s.rollNo || s.roll_no || sId;
        const pwdReq = localRequests.find(r =>
          (r.req_type === 'PASSWORD_UPDATE' || r.type === 'PASSWORD_UPDATE') &&
          r.status === 'Active' &&
          (r.studentId === sId || r.student_id === sId || r.rollNo === rollNo || r.roll_no === rollNo)
        );

        const hash = pwdReq?.newData?.password_hash || pwdReq?.newData?.passwordHash || s.password_hash || '';
        if (hash && (await this._verifyPasswordHash(cleanCred, hash))) {
          matchedStudent = s;
          break;
        }
        if (this._dobMatches(cleanCred, s.dob)) {
          matchedStudent = s;
          break;
        }
      }

      if (matchedStudent) {
        const token = `token_stu_${matchedStudent.id || 'STU'}_${Date.now()}`;
        this.isOfflineFallback = true;
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('pragyan_offline_fallback', 'true');
        }
        await this.setSession(token, 'student');
        await this.pullAll().catch(() => {});
        let norm = this.normalizeStudent(matchedStudent) || matchedStudent;
        if (typeof AppState !== 'undefined' && AppState.getStudents) {
          const fresh = AppState.getStudents().find(st => st.id === matchedStudent.id || st.student_id === matchedStudent.student_id || st.rollNo === matchedStudent.rollNo);
          if (fresh) norm = fresh;
        }
        return {
          success: true,
          user: norm,
          token,
          isFallback: true,
          warning: 'Offline session: Server-dependent operations require an active internet connection.'
        };
      }

      return { success: false, error: 'Student record not found. Please check your registered Mobile number / Roll No and Password or Date of Birth.' };
    },

    setSessionToken(token, role) {
      return this.setSession(token, role);
    },

    // ── UI Status Badge ─────────────────────────────────────────────────────
    updateStatus(status) {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('#adminCloudSyncBadge, #studentCloudSyncBadge').forEach(badge => {
        const icon = badge.querySelector('i');
        const span = badge.querySelector('span');
        if (status === 'synced') {
          if (icon) { icon.className = 'fa-solid fa-cloud-arrow-up'; icon.style.color = '#34D399'; }
          if (span) span.textContent = 'Cloud synced';
          badge.title = 'All data is live from Supabase database';
        } else if (status === 'syncing') {
          if (icon) { icon.className = 'fa-solid fa-arrows-rotate fa-spin'; icon.style.color = '#FBBF24'; }
          if (span) span.textContent = 'Syncing…';
          badge.title = 'Downloading latest data from cloud…';
        } else {
          if (icon) { icon.className = 'fa-solid fa-cloud-xmark'; icon.style.color = '#EF4444'; }
          if (span) span.textContent = 'Offline cache';
          badge.title = 'Could not reach Supabase. Using cached data.';
        }
      });
    },

    updateRealtimeBadge(connected) { if (connected) this.updateStatus('synced'); }
  };

  window.SupabaseSync = SupabaseSync;
})();
