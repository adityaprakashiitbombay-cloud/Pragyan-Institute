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
  assert(portalCss.includes('@media (max-width: 768px)') && portalCss.includes('padding: 0.32rem 0.6rem !important'),
    'T35.13: css/portal.css defines mobile responsive compact bubble padding for small screens');
}
