const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://crxolbapbfqthoxehhic.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyeG9sYmFwYmZxdGhveGVoaGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTA5OTgsImV4cCI6MjA4NjMyNjk5OH0.7Yt0dD7kXQ2w5_T5xL6M0O1g6P3U-5Q7a9E-8R2t4Vw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testV2Tables() {
  console.log('🔄 Checking Supabase V2 tables status...');
  
  // Test video_lectures table
  const { data: lectures, error: lecErr } = await supabase.from('video_lectures').select('id').limit(1);
  if (lecErr) {
    console.log('ℹ️ Table video_lectures status:', lecErr.message);
  } else {
    console.log('✅ Table video_lectures is active!');
  }

  // Test study_materials table
  const { data: materials, error: matErr } = await supabase.from('study_materials').select('id').limit(1);
  if (matErr) {
    console.log('ℹ️ Table study_materials status:', matErr.message);
  } else {
    console.log('✅ Table study_materials is active!');
  }

  // Test live_class_doubts table
  const { data: doubts, error: dbtErr } = await supabase.from('live_class_doubts').select('id').limit(1);
  if (dbtErr) {
    console.log('ℹ️ Table live_class_doubts status:', dbtErr.message);
  } else {
    console.log('✅ Table live_class_doubts is active!');
  }
}

testV2Tables();
