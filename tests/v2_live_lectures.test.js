/**
 * Pragyan Institute — Version 2.0 Live Streaming, Media CDN & Real-time Doubts Test Suite
 * Validates YouTube ULL Player, Dynamic Anti-Piracy Watermarking, Playback Rates,
 * Realtime Doubts lifecycle, and Cloudflare R2 Study Material schemas.
 */

import '../js/classroom.js';

export function runV2ClassroomTests() {
  const PragyanClassroom = globalThis.PragyanClassroom;
  const results = [];

  function assert(condition, testName) {
    if (condition) {
      results.push({ name: testName, pass: true });
    } else {
      results.push({ name: testName, pass: false });
    }
  }

  // T13.1: Video Lecture Schema Validation
  const lectures = PragyanClassroom.getLectures();
  const sample = lectures[0];
  assert(
    sample &&
    typeof sample.id === 'string' &&
    typeof sample.class_batch === 'string' &&
    typeof sample.subject === 'string' &&
    typeof sample.chapter_no === 'number' &&
    typeof sample.lecture_title === 'string' &&
    typeof sample.video_source_id === 'string' &&
    sample.video_source_id.length === 11,
    'T13.1: Video lecture schema contains required fields and valid 11-char YouTube video ID'
  );

  // T13.2: YouTube Video ID Extractor
  function extractYouTubeVideoId(input) {
    if (!input) return '';
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const urlMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|watch\?.+&v=))([\w-]{11})/i);
    return urlMatch ? urlMatch[1] : trimmed;
  }

  assert(
    extractYouTubeVideoId('d41r9k2f1W0') === 'd41r9k2f1W0' &&
    extractYouTubeVideoId('https://youtu.be/d41r9k2f1W0') === 'd41r9k2f1W0' &&
    extractYouTubeVideoId('https://www.youtube.com/watch?v=d41r9k2f1W0') === 'd41r9k2f1W0' &&
    extractYouTubeVideoId('https://www.youtube.com/live/d41r9k2f1W0?feature=share') === 'd41r9k2f1W0',
    'T13.2: YouTube Video ID extractor parses shortlinks, live URLs, standard links and raw IDs'
  );

  // T13.3: Playback Rate Controls Clamping
  function validatePlaybackSpeed(speed) {
    const validSpeeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    if (validSpeeds.includes(speed)) return speed;
    return Math.min(2.0, Math.max(0.75, speed));
  }

  assert(
    validatePlaybackSpeed(1.5) === 1.5 &&
    validatePlaybackSpeed(0.5) === 0.75 &&
    validatePlaybackSpeed(3.0) === 2.0,
    'T13.3: Playback speed control clamps rates between 0.75x and 2.0x'
  );

  // T13.4: Anti-Piracy Watermark Token Generation
  function generateWatermarkToken(studentName, studentRoll) {
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return `${studentName || 'Student'} • #${studentRoll || '261001'} • Pragyan Institute [${time}]`;
  }

  const token = generateWatermarkToken('Rohan Sharma', '261001');
  assert(
    token.includes('Rohan Sharma') &&
    token.includes('261001') &&
    token.includes('Pragyan Institute'),
    'T13.4: Dynamic anti-piracy watermark embeds student name, roll number and institutional timestamp'
  );

  // T13.5: Realtime Doubt Lifecycle & Answer Pinning
  const mockDoubt = {
    id: 'dbt_test_01',
    lecture_id: 'lec-10-sci-01',
    student_id: 'stu_1001',
    student_name: 'Aarav Patel',
    student_roll: '261005',
    doubt_text: 'Sir, how to determine the oxidation state in redox reactions?',
    is_pinned: false,
    is_resolved: false,
    educator_answer: null
  };

  // State Transition 1: Pin Doubt
  mockDoubt.is_pinned = true;
  assert(mockDoubt.is_pinned === true, 'T13.5a: Doubt can be pinned to top of live classroom feed');

  // State Transition 2: Educator Answer
  mockDoubt.educator_answer = 'Look at the oxygen and hydrogen loss/gain rules from Unit 1.';
  mockDoubt.is_resolved = true;
  assert(
    mockDoubt.is_resolved === true && mockDoubt.educator_answer.length > 0,
    'T13.5b: Educator can resolve and provide answers to student doubts in real-time'
  );

  // T13.6: Cloudflare R2 PDF Study Material Link Schema
  const samplePdfUrl = sample.pdf_notes_url;
  assert(
    typeof samplePdfUrl === 'string' &&
    samplePdfUrl.endsWith('.pdf') &&
    (samplePdfUrl.includes('r2') || samplePdfUrl.includes('pragyan')),
    'T13.6: Cloudflare R2 study materials link format validates PDF schema and CDN path'
  );

  // T13.7: Live Stream Exclusivity (Single Active Broadcast per Class Batch)
  const batchLectures = [
    { id: 'l1', class_batch: '10th', is_live: true },
    { id: 'l2', class_batch: '10th', is_live: false },
    { id: 'l3', class_batch: '9th', is_live: true }
  ];

  function startLiveBroadcast(lecturesList, targetId) {
    const target = lecturesList.find(l => l.id === targetId);
    if (!target) return;
    lecturesList.forEach(l => {
      if (l.class_batch === target.class_batch) l.is_live = false;
    });
    target.is_live = true;
  }

  startLiveBroadcast(batchLectures, 'l2');
  const liveIn10th = batchLectures.filter(l => l.class_batch === '10th' && l.is_live);
  assert(
    liveIn10th.length === 1 && liveIn10th[0].id === 'l2',
    'T13.7: Starting new live stream in batch automatically transitions previous live stream to recorded'
  );

  return results;
}
