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

// WARNING: Never commit actual API keys to the repository
// All secrets MUST be set via environment variables in production
export const CONFIG = {
  SUPABASE_URL: env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
  GEMINI_API_KEY: env.VITE_GEMINI_API_KEY || '',
  RESEND_API_KEY: env.VITE_RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: env.VITE_RESEND_FROM_EMAIL || 'Pragyan Institute <noreply@pragyaninstitute.com>',
  API_BASE: env.VITE_API_BASE || ''
};

// Validation: Ensure critical config values are present
if (typeof window !== 'undefined') {
  window.PRAGYAN_CONFIG = CONFIG;

  // Display warning if critical config is missing
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    console.error('❌ CRITICAL: Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
  }

  window.escapeHtml = window.escapeHtml || function(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  };
}
