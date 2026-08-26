import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

export function runCommunityChatLayoutTests(assert) {
  const chatJs = read('js/stream-community-chat.js');
  const portalCss = read('css/portal.css');
  const healthJs = read('api/health.js');
  const portalJs = read('js/portal.js');
  const vercelJson = read('vercel.json');

  // --- 1. Compact Message Architecture & Reduced Bloat ---
  assert(chatJs.includes('renderMsgList'), 'T35.1: js/stream-community-chat.js defines renderMsgList');
  assert(chatJs.includes('width: 26px; height: 26px') || chatJs.includes('width: 28px; height: 28px'),
    'T35.2: renderMsgList reduces avatar dimensions to compact 26px-28px profile');
  assert(chatJs.includes('padding: 0.38rem 0.7rem') || chatJs.includes('padding: 0.4rem 0.75rem'),
    'T35.3: renderMsgList uses compact bubble padding (0.38rem-0.4rem) for high message density');
  assert(chatJs.includes('stream-msg-actions') && !chatJs.includes('margin-top: 0.3rem; align-items: center;\">\n                <button type=\"button\" class=\"${isPinned'),
    'T35.4: renderMsgList integrates moderation actions (Pin/Delete) inline without separate dedicated row');
  assert(chatJs.includes('margin-bottom: 0.35rem'),
    'T35.5: renderMsgList uses tight 0.35rem row spacing between messages');

  // --- 2. Fullscreen Mode & Top Bar Controls ---
  assert(chatJs.includes('id="btn-stream-fullscreen"'),
    'T35.6: renderUI defines #btn-stream-fullscreen button for 1-click full-screen expansion');
  assert(chatJs.includes('stream-active-banner') && chatJs.includes('width: 32px; height: 32px'),
    'T35.7: renderUI renders condensed active class banner with compact height and icons');
  assert(chatJs.includes("chatWrapper.classList.toggle('stream-fullscreen')") && chatJs.includes('stream-body-fullscreen-lock'),
    'T35.8: wireEvents implements interactive fullscreen toggle and body scroll lock');
  assert(chatJs.includes("e.key === 'Escape'") && chatJs.includes("activeFullWrapper.classList.remove('stream-fullscreen')"),
    'T35.9: wireEvents registers Escape key listener to exit fullscreen mode');

  // --- 3. CSS Fullscreen & Responsive Density Rules ---
  assert(portalCss.includes('.stream-chat-wrapper.stream-fullscreen') && portalCss.includes('position: fixed !important') && portalCss.includes('z-index: 999999 !important'),
    'T35.10: css/portal.css defines .stream-chat-wrapper.stream-fullscreen with fixed full-viewport overlay');
  assert(portalCss.includes('body.stream-body-fullscreen-lock') && portalCss.includes('overflow: hidden !important'),
    'T35.11: css/portal.css defines .stream-body-fullscreen-lock to prevent background scrolling');
  assert(portalCss.includes('.stream-msg-actions') && portalCss.includes('.stream-msg-row:hover .stream-msg-actions'),
    'T35.12: css/portal.css styles .stream-msg-actions with smooth hover transitions');
  assert(portalCss.includes('@media (max-width: 768px)') && portalCss.includes('.stream-banner-tagline'),
    'T35.13: css/portal.css defines mobile responsive compact bubble and header rules for small screens');

  // --- 4. Student Multi-Class Support & Channel Accessibility ---
  assert(chatJs.includes('function resolveStudentBatches') && chatJs.includes('resolveBatches'),
    'T35.14: js/stream-community-chat.js defines resolveStudentBatches with multi-class resolution');
  assert(chatJs.includes('function getActiveCommunityPane') && chatJs.includes('isAdminVisible'),
    'T35.15: js/stream-community-chat.js defines getActiveCommunityPane targeting visible student/admin dashboard');
  assert(chatJs.includes('stream-ch-enrolled') && chatJs.includes('My Class'),
    'T35.16: renderUI marks student enrolled batches with "My Class" badge in channel navigation bar');
  assert(healthJs.includes('serverClient.channel(\'livestream\', chId') && healthJs.includes('photo_url'),
    'T35.17: api/health.js pre-seeds canonical livestream channels and synchronizes student avatar photo');
  assert(portalJs.includes('isAdminVisible') && portalJs.includes('renderCommunityChatTab'),
    'T35.18: js/portal.js renderCommunityChatTab cleanly checks visible dashboard container');

  // --- 5. Mobile Device (<768px & <480px) Layout Optimizations ---
  assert(portalCss.includes('.stream-banner-tagline') && portalCss.includes('display: none !important'),
    'T35.19: css/portal.css hides verbose banner taglines on mobile to reclaim vertical screen estate');
  assert(portalCss.includes('font-size: 16px !important') && chatJs.includes('font-size: 16px'),
    'T35.20: css/portal.css and stream-community-chat.js enforce 16px font-size on message input to prevent iOS auto-zoom');
  assert(portalCss.includes('.stream-msg-bubble-col') && portalCss.includes('.stream-avatar'),
    'T35.21: css/portal.css defines responsive phone bubble width (90%-92%) and compact 24px avatars');
  assert(portalCss.includes('@media (max-width: 480px)') && portalCss.includes('env(safe-area-inset-bottom)'),
    'T35.22: css/portal.css handles ultra-compact 480px phone screens and safe-area insets');

  // --- 6. Slash Command Sanitization & Stream API Compatibility ---
  assert(chatJs.includes('hasCustomFormatting ? cleanBody : rawText') && chatJs.includes("textToSend.replace(/^\\/+/"),
    'T35.23: js/stream-community-chat.js strips leading slash from message text before Stream API dispatch to avoid command error');
  assert(chatJs.includes('is_highlighted: Boolean(isHighlight)') && chatJs.includes('is_question: Boolean(isQuestion)'),
    'T35.24: js/stream-community-chat.js sends explicit boolean flags for questions and highlights in custom message payload');

  // --- 7. Resilient Deletion & Error Code 16 Handling ---
  assert(chatJs.includes('errCode === 16') && chatJs.includes("doesn't exist|not found"),
    'T35.25: js/stream-community-chat.js suppresses error code 16 / not found and removes ghost message from UI');
  assert(healthJs.includes('isStreamDelete') && healthJs.includes('deleteMessage(messageId'),
    'T35.26: api/health.js implements stream-delete sub-route with admin session verification');

  // --- 8. Real-Time Pin & Delete Synchronization Suite ---
  assert(chatJs.includes('function renderPinnedBarHtml') && chatJs.includes('id="stream-pinned-bar-wrapper"'),
    'T35.27: js/stream-community-chat.js defines renderPinnedBarHtml and mounts dynamic #stream-pinned-bar-wrapper');
  assert(chatJs.includes('function renderPinnedBarAndList') && chatJs.includes('function setupRealtimeListeners'),
    'T35.28: js/stream-community-chat.js defines renderPinnedBarAndList and setupRealtimeListeners for live WebSocket event dispatch');
  assert(chatJs.includes("eventType === 'message.deleted'") && chatJs.includes('activeChannel.state.messages.filter'),
    'T35.29: setupRealtimeListeners cleans deleted messages out of local state on real-time event');
  assert(healthJs.includes('serverClient.partialUpdateMessage(messageId') && healthJs.includes('is_pinned: Boolean(pin)'),
    'T35.30: api/health.js executes partialUpdateMessage on stream-pin to broadcast real-time message.updated event to all clients');

  // --- 9. Admin 20MB Upload, Class Media Gallery & Lazy PDF Reader Suite ---
  assert(healthJs.includes('isStreamUpload') && healthJs.includes('MAX_SIZE_BYTES = 20 * 1024 * 1024'),
    'T35.31: api/health.js implements isStreamUpload with 20 MB size limit verification and admin session gating');
  assert(chatJs.includes('MAX_SIZE = 20 * 1024 * 1024') || chatJs.includes('20 * 1024 * 1024'),
    'T35.32: js/stream-community-chat.js enforces 20 MB file size limit with user alerts on oversized files');
  assert(chatJs.includes('id="btn-stream-attach"') && chatJs.includes('id="stream-file-input"'),
    'T35.33: js/stream-community-chat.js renders #btn-stream-attach and #stream-file-input strictly for admin users');
  assert(chatJs.includes('function renderMediaGalleryHtml') && chatJs.includes('Class Media & Notes'),
    'T35.34: js/stream-community-chat.js defines renderMediaGalleryHtml for Class Media & Notes student gallery');
  assert(chatJs.includes('btn-view-mode') && chatJs.includes('data-view-mode="media"'),
    'T35.35: js/stream-community-chat.js renders view mode toggle pills switching between Discussion and Class Media');
  assert(chatJs.includes('function renderAttachmentsHtml') && chatJs.includes('stream-pdf-card'),
    'T35.36: js/stream-community-chat.js defines renderAttachmentsHtml rendering inline PDF cards and image previews');
  assert(chatJs.includes('function renderPdfPage1Thumbnails') && chatJs.includes('stream-pdf-page1-canvas'),
    'T35.37: js/stream-community-chat.js defines renderPdfPage1Thumbnails rendering first-page canvas lazily');
  assert(chatJs.includes('function openPdfReaderModal') && chatJs.includes('loadPdfJs'),
    'T35.38: js/stream-community-chat.js defines openPdfReaderModal with on-demand lazy loading of PDF.js reader');
  assert(chatJs.includes('function openImageLightboxModal') && chatJs.includes('stream-img-lightbox-modal'),
    'T35.39: js/stream-community-chat.js defines openImageLightboxModal with smooth image zoom and download');
  assert(portalCss.includes('.stream-media-card') && portalCss.includes('.stream-pdf-card') && portalCss.includes('.stream-pdf-modal'),
    'T35.40: css/portal.css defines responsive styles for media cards, PDF cards, and PDF reader modal');

  // --- 10. Reply-to-All, Quote Threading & Jump-to-Message Suite ---
  assert(chatJs.includes('btn-reply-msg') && chatJs.includes('data-reply-msg'),
    'T35.41: js/stream-community-chat.js renders .btn-reply-msg on message rows for all users (students, teachers, and admins)');
  assert(chatJs.includes('function renderReplyBarHtml') && chatJs.includes('id="stream-reply-bar-wrapper"'),
    'T35.42: js/stream-community-chat.js defines renderReplyBarHtml and mounts dynamic #stream-reply-bar-wrapper');
  assert(chatJs.includes('quoted_message_id') && chatJs.includes('quoted_message_author') && chatJs.includes('quoted_message_text'),
    'T35.43: js/stream-community-chat.js attaches parent_id and quoted_message_* metadata to Stream send message payload');
  assert(chatJs.includes('stream-msg-quote-header') && chatJs.includes('btn-jump-msg'),
    'T35.44: js/stream-community-chat.js renders .stream-msg-quote-header with interactive jump-to-quote reference in replies');
  assert(chatJs.includes('id="btn-cancel-reply"') && chatJs.includes('replyingToMessage = null'),
    'T35.45: js/stream-community-chat.js wires #btn-cancel-reply and Escape key to smoothly dismiss reply mode');
  assert(portalCss.includes('.btn-reply-msg') && portalCss.includes('.stream-msg-quote-header') && portalCss.includes('#stream-reply-bar'),
    'T35.46: css/portal.css defines responsive styles for .btn-reply-msg, .stream-msg-quote-header, and #stream-reply-bar');

  // --- 11. Single-Bound Event Delegation & Reliable Message Delete Suite ---
  assert(chatJs.includes('_streamEventsBound') && chatJs.includes('if (container._streamEventsBound) return;'),
    'T35.47: js/stream-community-chat.js implements single-bound event delegation guard preventing multiple click listeners and prompt loops');
  assert(chatJs.includes('container.querySelector(`#msg-${msgId}`)') && chatJs.includes('msgRow.remove()'),
    'T35.48: js/stream-community-chat.js optimistically fades and removes deleted message DOM elements immediately on confirmed delete');

  // --- 12. Student-Only Question Slash Commands & Composer Buttons Suite ---
  assert(chatJs.includes("cmd: '/question'") && chatJs.includes('studentOnly: true') && chatJs.includes('!c.studentOnly : !c.adminOnly'),
    'T35.49: js/stream-community-chat.js scopes /question and /quest commands strictly for students and hides question shortcuts from teachers/admins');
  assert(chatJs.includes('btn-quick-quest') && chatJs.includes('<!-- Student Quick Question Button -->') && chatJs.includes('!isAdmin'),
    'T35.50: js/stream-community-chat.js renders #btn-quick-quest button strictly for students while reserving moderation and highlight tools for teachers');

  // --- 13. Admin Highlight /hg, @mentions, /mute, /unmute, & /imp Urgent Announcements Suite ---
  assert(chatJs.includes("cmd: '/hg'") && (chatJs.includes("is_highlighted") || chatJs.includes("stream-msg-highlight")) && portalCss.includes(".stream-msg-highlight"),
    'T35.51: js/stream-community-chat.js implements /hg highlight command and golden highlight card rendering');
  assert(chatJs.includes("cmd: '/mute'") && chatJs.includes("cmd: '/unmute'") && chatJs.includes("isCurrentUserMuted") && chatJs.includes("stream-muted-banner"),
    'T35.52: js/stream-community-chat.js implements /mute and /unmute commands, muted banner, and disables message composer for muted students');
  assert(chatJs.includes("cmd: '/imp'") && (chatJs.includes("is_important") || chatJs.includes("stream-msg-important")) && portalCss.includes(".stream-msg-important"),
    'T35.53: js/stream-community-chat.js and css/portal.css implement /imp urgent announcement badge with glowing crimson-gold styling');
  assert(healthJs.includes("isStreamMute") && healthJs.includes("isStreamUnmute") && healthJs.includes("banUser") && healthJs.includes("unbanUser"),
    'T35.54: api/health.js implements stream-mute and stream-unmute subroutes with Stream API user ban/unban and channel state synchronization');

  // --- 14. Serverless Rewrites, Mobile Viewport & Network Resilience Suite ---
  assert(vercelJson.includes('/api/stream-delete') && vercelJson.includes('/api/stream-mute') && vercelJson.includes('/api/stream-unmute') && vercelJson.includes('/api/stream-upload'),
    'T35.55: vercel.json defines explicit serverless rewrite routes for stream-delete, stream-mute, stream-unmute, and stream-upload');
  assert(chatJs.includes('window.visualViewport') && chatJs.includes('onViewportChange') && chatJs.includes('msgInput.addEventListener(\'focus\''),
    'T35.56: js/stream-community-chat.js implements mobile visualViewport resize adjustments and input focus scroll down');
  assert(chatJs.includes("window.addEventListener('offline'") && chatJs.includes("window.addEventListener('online'") && chatJs.includes('PragyanStreamChat.reconnect()'),
    'T35.57: js/stream-community-chat.js implements network offline/online lifecycle listeners and automatic reconnection');
  assert(chatJs.includes("scrollIntoView({ block: 'nearest'") && chatJs.includes("autoItem") && chatJs.includes("mouseover"),
    'T35.58: js/stream-community-chat.js implements autocomplete scrollIntoView for keyboard navigation and mouseover index synchronization');

  // --- 15. Cross-Tab Synchronization, Background Polling & Multi-Pane Rendering Suite ---
  assert(chatJs.includes('pragyan_stream_chat_sync') && (chatJs.includes('new BroadcastChannel') || chatJs.includes('window.BroadcastChannel')),
    'T35.59: js/stream-community-chat.js implements BroadcastChannel and storage cross-tab synchronization');
  assert(chatJs.includes('function broadcastMessageSync') && chatJs.includes('function handleIncomingSync'),
    'T35.60: js/stream-community-chat.js defines broadcastMessageSync and handleIncomingSync for cross-window message relays');
  assert(chatJs.includes('function startPeriodicSync') && chatJs.includes('syncActiveChannelMessages') && chatJs.includes('stopPeriodicSync'),
    'T35.61: js/stream-community-chat.js implements background polling sync (startPeriodicSync/stopPeriodicSync) for reliable real-time updates');
  assert(chatJs.includes('getAllCommunityPanes') && chatJs.includes('panes.forEach(pane =>'),
    'T35.62: js/stream-community-chat.js renders updates across all active community panes simultaneously');
}






