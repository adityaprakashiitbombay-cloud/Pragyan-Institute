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

export const CONFIG = {
  SUPABASE_URL: env.VITE_SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co',
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY, // No fallback - fail loudly if missing
  GEMINI_API_KEY: env.VITE_GEMINI_API_KEY || '',
  API_BASE: env.VITE_API_BASE || ''
};

// Validation: Fail fast if critical config is missing
if (typeof window !== 'undefined' && !CONFIG.SUPABASE_ANON_KEY) {
  console.error('🚨 SUPABASE_ANON_KEY is not configured. Application cannot initialize.');
  console.error('📋 Set VITE_SUPABASE_ANON_KEY in your .env file or deployment environment');
  throw new Error('Configuration error: SUPABASE_ANON_KEY is required');
}

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
