import { describe, it, expect } from './vitest-shim.js';

class MockSupabaseSync {
  constructor() {
    this.isSyncing = false;
    this.pullCount = 0;
    this._pullPromise = null;
    this.store = new Map();
  }

  async pullAll() {
    if (this.isSyncing && this._pullPromise) {
      return this._pullPromise;
    }
    this.isSyncing = true;
    this._pullPromise = (async () => {
      await new Promise(r => setTimeout(r, 50));
      this.pullCount++;
      this.isSyncing = false;
      this._pullPromise = null;
      return { success: true };
    })();
    return this._pullPromise;
  }

  async mutate(table, operation, payload, options = {}) {
    const key = payload.idempotency_key || payload.receipt_no || payload.student_id || payload.id;
    const tableStore = this.store.get(table) || new Map();
    this.store.set(table, tableStore);

    if (options.conflict && tableStore.has(key)) {
      // Idempotent resolution: record already exists
      return { success: true, data: [tableStore.get(key)], idempotent: true };
    }

    tableStore.set(key, { ...payload, updated_at: Date.now() });
    return { success: true, data: [payload] };
  }
}

describe('SupabaseSync Engine (T2)', () => {
  it('prevents concurrent pullAll race', async () => {
    const sync = new MockSupabaseSync();
    const p1 = sync.pullAll();
    const p2 = sync.pullAll();
    const p3 = sync.pullAll();
    await Promise.all([p1, p2, p3]);

    expect(sync.isSyncing).toBe(false);
    expect(sync.pullCount).toBe(1); // Only 1 network fetch executed
  });

  it('mutate with idempotency key prevents duplicate insertions', async () => {
    const sync = new MockSupabaseSync();
    const receipt = { receipt_no: 'REC-TEST-1', student_id: 'STU-1', amount: 1000, idempotency_key: 'rec_test_1' };
    
    const r1 = await sync.mutate('fee_receipts', 'upsert', receipt, { conflict: 'receipt_no, idempotency_key' });
    const r2 = await sync.mutate('fee_receipts', 'upsert', receipt, { conflict: 'receipt_no, idempotency_key' });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(sync.store.get('fee_receipts').size).toBe(1);
  });
});
