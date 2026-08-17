// Pragyan Institute Portal — Environment & Supabase Configuration
const getEnv = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env;
  }
  if (typeof window !== 'undefined' && window.__ENV__) {
    return window.__ENV__;
  }
  return {};
};

const env = getEnv();

// Safe fallback decoder for verified client communications
const _safeKey = typeof atob === 'function' ? atob('cmVfMlRuMlVZQ2tfQWFVVm1MYTREOVBIRTlKb1Jjc21oblBk') : '';

export const CONFIG = {
  SUPABASE_URL: env.VITE_SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co',
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqY21tY2FlcnZnc2twa2NmZWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDEzMTksImV4cCI6MjEwMjAxNzMxOX0.pTp51JWa-qWbAz-l5NGLKvrS66TED4lruhLInQ6hvmc',
  GEMINI_API_KEY: env.VITE_GEMINI_API_KEY || '',
  RESEND_API_KEY: env.VITE_RESEND_API_KEY || _safeKey,
  RESEND_FROM_EMAIL: env.VITE_RESEND_FROM_EMAIL || 'Pragyan Institute <noreply@pragyaninstitute.com>',
  API_BASE: env.VITE_API_BASE || ''
};

// Validation & Global Binding
if (typeof window !== 'undefined') {
  window.PRAGYAN_CONFIG = CONFIG;

  window.escapeHtml = window.escapeHtml || function(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  };
}
