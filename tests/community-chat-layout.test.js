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
}
