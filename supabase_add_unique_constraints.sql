-- Fix: Add UNIQUE constraints so REST upsert (on_conflict) works correctly
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_id_key;
ALTER TABLE public.students ADD CONSTRAINT students_student_id_key UNIQUE (student_id);

ALTER TABLE public.fee_receipts DROP CONSTRAINT IF EXISTS fee_receipts_receipt_no_key;
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_receipt_no_key UNIQUE (receipt_no);

ALTER TABLE public.admins DROP CONSTRAINT IF EXISTS admins_admin_id_key;
ALTER TABLE public.admins ADD CONSTRAINT admins_admin_id_key UNIQUE (admin_id);

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS student_requests_request_id_key;
ALTER TABLE public.student_requests ADD CONSTRAINT student_requests_request_id_key UNIQUE (request_id);

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_log_id_key;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_log_id_key UNIQUE (log_id);

ALTER TABLE public.batches DROP CONSTRAINT IF EXISTS batches_batch_id_key;
ALTER TABLE public.batches ADD CONSTRAINT batches_batch_id_key UNIQUE (batch_id);
