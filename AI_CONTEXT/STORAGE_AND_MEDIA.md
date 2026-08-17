# 🖼️ Pragyan Institute — Storage & Media Architecture

---

## 1. Storage Bucket Configuration

- **Bucket Name**: `pragyan-media`
- **Visibility**: **Public** (`public = true`)
- **Max File Size Limit**: `15,728,640 bytes` (15 MB)
- **Allowed MIME Types**: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `text/plain`
- **Public URL Template**:
  ```
  https://ujcmmcaervgskpkcfekm.supabase.co/storage/v1/object/public/pragyan-media/{folder}/{filename}
  ```

---

## 2. Mandatory 2-Folder Directory Structure

To keep storage organized and avoid bucket clutter, the storage bucket contains **ONLY TWO exact root folders**:

```
pragyan-media/
  ├── profile_pictures/   (Student & Admin avatar profile photos)
  └── notifications/      (Notice circular attachments, PDFs, mock test files)
```

> ⚠️ **CRITICAL RULE**: Do not create or scaffold any other folders (e.g. do not create `student_profile`, `notice_attachments`, `admin_avatars`, `payment_proofs`, etc.). All image and profile uploads must go to `profile_pictures/`, and all announcements/attachments must go to `notifications/`.

---

## 3. Automatic Photo Lifecycle & Clean-Up

1. **Client-Side Auto-Compression**:
   - Before uploading, images are compressed on an HTML5 `<canvas>` (JPEG format, 85% quality, max 1200px dimension) to ensure fast mobile uploads and minimal storage usage.

2. **Old Photo Purging on Update/Approval**:
   - When a student's new photo is approved by an administrator, the previous photo file is automatically deleted from `profile_pictures/` via `SupabaseSync.deleteFile()`.

3. **Unapproved Photo Cleanup on Rejection**:
   - If an administrator declines a profile update request containing a new photo, the temporary unapproved photo is automatically deleted from storage to prevent orphaned files.
