---
description: Live Lecture System with Zero Sync Error ($0 Server Cost), Video Lectures Database (Unlimited 1080p Storage — $0 Cost) and 3. 📂 PDF Notes, Question Banks & Diagram Images ($0 Cost)
---

Here is the comprehensive architectural blueprint for implementing **0-Sync-Error Live Lectures**, **Infinite Video Lecture Hosting**, and **Massive PDF/Media Storage** with **₹0 / $0 Server Costs**:

---

# 🚀 Version 2.0 Architectural Blueprint: Live Lectures & Media Database (100% Free)

```
                       ┌─────────────────────────────────────────────────────────┐
                       │          PRAGYAN INSTITUTE PORTAL (V2)                  │
                       └────────────────────────────┬────────────────────────────┘
                                                    │
            ┌───────────────────────────────────────┼────────────────────────────────────────┐
            │                                       │                                        │
            ▼                                       ▼                                        ▼
┌───────────────────────┐               ┌───────────────────────┐                ┌───────────────────────┐
│ 🔴 LIVE CLASS ENGINE  │               │ 🎬 VIDEO LECTURE CDN  │                │ 📂 PDF & MEDIA CLOUD  │
│  Ultra-Low Latency    │               │  Unlimited 1080p      │                │  High-Speed Storage   │
│  Zero Sync Error      │               │  Zero Bandwidth Cost  │                │  Zero Egress Fees     │
├───────────────────────┤               ├───────────────────────┤                ├───────────────────────┤
│ • YouTube ULL Embed   │               │ • Unlisted Video API  │                │ • Cloudflare R2       │
│ • Jitsi/WebRTC Bridge │               │ • Adaptive Bitrate    │                │ • Supabase Storage    │
│ • Realtime Doubt Chat │               │ • In-Portal Player    │                │ • Cloudinary Media    │
│ • Floating Watermark  │               │ • Chapter Indexing    │                │ • 1-Click PDF Viewer  │
└───────────────────────┘               └───────────────────────┘                └───────────────────────┘
```

---

## 1. 🔴 Live Lecture System with Zero Sync Error ($0 Server Cost)

To achieve **broadcast quality, zero stutter, and real-time audio/video sync** without paying thousands for proprietary streaming servers, we utilize a dual-mode streaming architecture:

### 🌟 Mode A: **Broadcast Lecture Mode (For Entire Batches — Up to 500+ Students)**
* **Technology**: **YouTube Ultra-Low Latency (ULL) WebRTC Stream Engine**.
* **Server & Bandwidth Cost**: **₹0.00 Forever (Completely Free & Unlimited Bandwidth)**.
* **Sync Latency**: **< 1.2 to 1.5 seconds** (near-instant audio/video sync across all student devices).
* **How It Works for the Director/Teacher**:
  1. Teacher starts the stream from **OBS Studio, Laptop WebCam, or Mobile** directly to a private, unlisted institutional stream key.
  2. The Pragyan Portal embeds this inside a **Secured Student Classroom View** where only authenticated students with cleared fees can enter.
  3. **Anti-Piracy Watermarking**: The student's Roll Number and Name subtly float across the video player to prevent screen recording and link sharing.
  4. **Sub-50ms Live Doubt Chat**: A real-time chat pane alongside the video stream (powered by our Supabase Realtime channel) lets students ask questions while the teacher answers live.

### 👥 Mode B: **Interactive Doubt Room Mode (For Small Groups / 1-on-1 Sessions — Up to 50 Students)**
* **Technology**: **Cloudflare Calls WebRTC / Jitsi Meet Web SDK Embed**.
* **Server Cost**: **₹0.00** (Cloudflare provides 10,000 free participant-minutes every month).
* **Sync Latency**: **< 150ms (True real-time 2-way video call)** with 2-way microphone, student hand-raise, and digital whiteboard sharing.

---

## 2. 🎬 Video Lectures Database (Unlimited 1080p Storage — $0 Cost)

Storing hundreds of hours of recorded 1080p lectures requires gigabytes of video storage and massive bandwidth. Standard cloud providers (AWS S3) charge heavy egress fees, but our architecture bypasses all costs:

* **Storage Engine**: **YouTube Cloud CDN (Private/Unlisted Architecture)**.
* **Storage Limit**: **UNLIMITED Videos & Unlimited Terabytes of Storage**.
* **Bandwidth Cost**: **$0.00 (Zero Egress/Bandwidth Fees)**.
* **Adaptive Resolution (Auto-Bitrate)**: Automatically switches between `1080p`, `720p`, `480p`, and `360p` so students on slow mobile data in Lalganj can stream without buffering.
* **Custom Pragyan Video Player**:
  - Strips external YouTube branding, recommendations, and distracting related videos.
  - Adds EdTech playback controls: **0.75x, 1.0x, 1.25x, 1.5x, 2.0x speed**, **10s rewind/forward**, and **Chapter Timestamps**.
  - Direct 1-click download of the matching **Chapter Notes PDF** right below the video.

---

## 3. 📂 PDF Notes, Question Banks & Diagram Images ($0 Cost)

For storing syllabus PDFs, Daily Practice Papers (DPP), test solutions, and rich diagram graphics:

| Media Type | Recommended Free Storage Engine | Free Quota | Key Advantage |
| :--- | :--- | :--- | :--- |
| **📘 Lecture Notes & Exam PDFs** | **Cloudflare R2 Object Storage** | **10 GB Free + 10M Requests/mo** | **$0 Bandwidth/Egress fees forever**; blazing-fast global CDN delivery. |
| **🖼️ Rich Science/Math Diagrams** | **Cloudinary Free Media Tier** | **25 GB Monthly Bandwidth** | Auto-converts images to lightweight WebP format for fast mobile rendering. |
| **👤 Student Avatars & Receipts** | **Supabase Storage Buckets** | **1 GB Free Tier** | Directly integrated with student database records and authenticated access. |

---

## 4. 🗄️ Database Architecture for Version 2.0

We will structure three core database tables in Supabase Postgres to manage everything seamlessly:

```sql
-- 1. Video Lectures & Recorded Classes
CREATE TABLE video_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_batch VARCHAR(20) NOT NULL, -- '10th', '9th', '8th', 'junior'
  subject VARCHAR(50) NOT NULL,     -- 'Science', 'Mathematics', 'English', 'SST'
  chapter_no INT NOT NULL,
  chapter_title VARCHAR(255) NOT NULL,
  lecture_title VARCHAR(255) NOT NULL,
  video_source_id VARCHAR(100) NOT NULL, -- Unlisted video stream ID
  duration_minutes INT,
  pdf_notes_url TEXT,                    -- Direct link to Cloudflare R2 PDF
  thumbnail_url TEXT,
  is_live BOOLEAN DEFAULT false,
  live_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Digital Study Materials & Question Banks
CREATE TABLE study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_batch VARCHAR(20) NOT NULL,
  subject VARCHAR(50) NOT NULL,
  material_type VARCHAR(50) NOT NULL, -- 'NCERT Solution', 'Sample Paper', 'Formula Sheet'
  title VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size_kb INT,
  uploaded_by VARCHAR(100) DEFAULT 'Chandan Kumar'
);

-- 3. Live Doubt Stream & Real-Time Q&A
CREATE TABLE live_class_doubts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID REFERENCES video_lectures(id) ON DELETE CASCADE,
  student_roll VARCHAR(50) NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  doubt_text TEXT NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. 📱 User Experience in the Portal (How It Will Look & Function)

1. **For Students**:
   - New **"Live Class"** tab in their student portal with a countdown timer to scheduled lectures.
   - When the teacher goes live, a glowing red **`🔴 LIVE NOW`** banner appears; tapping it opens the full-screen classroom with the live video, digital board, and doubt chat.
   - A **"Video Library"** tab organized by Subject $\rightarrow$ Chapter $\rightarrow$ Lecture with embedded PDF notes and video progress tracking.

2. **For Directors (Chandan Sir & Ravi Sir)**:
   - In the Admin Dashboard, a **"Live Class Manager"** tab where directors can:
     - Schedule a new live lecture in 10 seconds.
     - Toggle `Go Live` or `End Stream`.
     - Upload chapter notes PDFs and attach them to any lecture in 1 click.
     - View and pin student doubts during the lecture.

---

### 💰 Total Cost Summary:
* **Live Streaming**: **₹0 / Month**
* **Video Lecture Storage & Bandwidth**: **₹0 / Month**
* **PDF & Study Material Hosting**: **₹0 / Month**
* **Real-Time Database & Doubt Chat**: **₹0 / Month**
* **Total Operational Cost**: **100% Free**

---

### 🚦 Next Steps:
Whenever you are ready to begin implementing this into the `v2-development` branch, let me know and we will start building the components step by step!