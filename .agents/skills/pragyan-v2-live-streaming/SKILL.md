---
name: pragyan-v2-live-streaming
description: Architecture, embedding patterns, and zero-sync error live streaming implementation guide for Pragyan Institute Portal Version 2.0.
---

# Pragyan Institute V2 Live Streaming & Media Skill Guide

## 1. Zero-Sync Live Lecture Architecture ($0 Cost)

### A. YouTube Ultra-Low Latency (ULL) WebRTC Stream Mode
- **Teacher Workflow**: Director streams from OBS Studio / Mobile directly to unlisted stream key (`rtmp://a.rtmp.youtube.com/live2`).
- **Student Portal View**: Embedded inside a custom HTML5 container:
  ```html
  <div class="live-player-wrapper">
    <iframe
      id="liveStreamFrame"
      src="https://www.youtube-nocookie.com/embed/VIDEO_ID?autoplay=1&modestbranding=1&rel=0&controls=1"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen>
    </iframe>
    <div class="floating-watermark">${student.name} • ${student.rollNo}</div>
  </div>
  ```
- **Real-Time Doubt Stream**: Connected via Supabase Realtime channel on `live_class_doubts` table.

## 2. Cloudflare R2 Free PDF Object Storage Integration

### Uploading & Serving Study Materials ($0 Bandwidth Fee)
- **Bucket**: `pragyan-study-materials`
- **S3 API Compatibility**:
  ```javascript
  import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  ```
- **Public Delivery**: Served via Cloudflare CDN `https://pub-xxxx.r2.dev/notes/class10-science-ch1.pdf` with instant global caching.

## 3. Database Schema Reference

```sql
CREATE TABLE IF NOT EXISTS video_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_batch VARCHAR(20) NOT NULL,
  subject VARCHAR(50) NOT NULL,
  chapter_no INT NOT NULL,
  chapter_title VARCHAR(255) NOT NULL,
  lecture_title VARCHAR(255) NOT NULL,
  video_source_id VARCHAR(100) NOT NULL,
  duration_minutes INT,
  pdf_notes_url TEXT,
  thumbnail_url TEXT,
  is_live BOOLEAN DEFAULT false,
  live_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
