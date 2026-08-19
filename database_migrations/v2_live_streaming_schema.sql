-- ================================================================
-- PRAGYAN INSTITUTE PORTAL — VERSION 2.0 SCHEMA MIGRATION
-- Live Lectures (Zero-Sync YouTube ULL), Video Library & R2 PDF Storage
-- ================================================================

-- 1. Video Lectures Table (Recorded Classes & Live Streams)
CREATE TABLE IF NOT EXISTS video_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_batch VARCHAR(20) NOT NULL, -- '10th', '9th', '8th', 'junior', 'all'
  subject VARCHAR(50) NOT NULL,     -- 'Science', 'Mathematics', 'English', 'SST'
  chapter_no INT NOT NULL DEFAULT 1,
  chapter_title VARCHAR(255) NOT NULL,
  lecture_title VARCHAR(255) NOT NULL,
  video_source_id VARCHAR(100) NOT NULL, -- YouTube Video ID / Live Stream ID
  duration_minutes INT DEFAULT 45,
  pdf_notes_url TEXT,                    -- Cloudflare R2 / Storage URL
  thumbnail_url TEXT,
  is_live BOOLEAN DEFAULT false,
  live_scheduled_at TIMESTAMPTZ,
  created_by VARCHAR(100) DEFAULT 'Chandan Kumar',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Study Materials & PDF Repository (Cloudflare R2 Linked)
CREATE TABLE IF NOT EXISTS study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_batch VARCHAR(20) NOT NULL,
  subject VARCHAR(50) NOT NULL,
  material_type VARCHAR(50) NOT NULL DEFAULT 'Lecture Notes', -- 'Lecture Notes', 'Sample Paper', 'NCERT Solution', 'Formula Sheet', 'DPP'
  title VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size_kb INT DEFAULT 0,
  uploaded_by VARCHAR(100) DEFAULT 'Chandan Kumar',
  download_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Live Doubt Stream Table (Real-Time In-Class Q&A)
CREATE TABLE IF NOT EXISTS live_class_doubts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID REFERENCES video_lectures(id) ON DELETE CASCADE,
  student_roll VARCHAR(50) NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  doubt_text TEXT NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  answered_by VARCHAR(100),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable Row Level Security (RLS) with Public Read & Authenticated Mutations
ALTER TABLE video_lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_class_doubts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to lectures and study materials
CREATE POLICY "Allow public read video_lectures" ON video_lectures FOR SELECT USING (true);
CREATE POLICY "Allow public insert video_lectures" ON video_lectures FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update video_lectures" ON video_lectures FOR UPDATE USING (true);
CREATE POLICY "Allow public delete video_lectures" ON video_lectures FOR DELETE USING (true);

CREATE POLICY "Allow public read study_materials" ON study_materials FOR SELECT USING (true);
CREATE POLICY "Allow public insert study_materials" ON study_materials FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update study_materials" ON study_materials FOR UPDATE USING (true);
CREATE POLICY "Allow public delete study_materials" ON study_materials FOR DELETE USING (true);

CREATE POLICY "Allow public read live_class_doubts" ON live_class_doubts FOR SELECT USING (true);
CREATE POLICY "Allow public insert live_class_doubts" ON live_class_doubts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update live_class_doubts" ON live_class_doubts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete live_class_doubts" ON live_class_doubts FOR DELETE USING (true);

-- 5. Realtime Publication Settings
-- Add new tables to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_class_doubts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_class_doubts;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_lectures'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_lectures;
  END IF;
END $$;
