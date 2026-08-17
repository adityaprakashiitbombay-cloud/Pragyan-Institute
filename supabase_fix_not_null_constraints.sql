-- Fix PostgreSQL strict NOT NULL constraints on optional student columns
-- Prevents 400 Bad Request errors when adding students with custom date strings or empty emails

ALTER TABLE public.students ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN dob DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_name DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN guardian_mobile DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN mobile DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN class_name DROP NOT NULL;
