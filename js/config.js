// Pragyan Institute Portal — Environment & Supabase Configuration
(function() {
  'use strict';

  const getEnv = () => {
    if (typeof window !== 'undefined' && window.__ENV__) {
      return window.__ENV__;
    }
    return {};
  };

  const env = getEnv();

  // Public Supabase Anon Key (Designed for public client-side browser consumption)
  const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqY21tY2FlcnZnc2twa2NmZWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDEzMTksImV4cCI6MjEwMjAxNzMxOX0.pTp51JWa-qWbAz-l5NGLKvrS66TED4lruhLInQ6hvmc';

  const CONFIG = {
    SUPABASE_URL: env.VITE_SUPABASE_URL || 'https://ujcmmcaervgskpkcfekm.supabase.co',
    SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
    GEMINI_API_KEY: env.VITE_GEMINI_API_KEY || '',
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

    window.sanitizeUrl = window.sanitizeUrl || function(value) {
      if (!value || typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (trimmed.startsWith('data:image/')) {
        if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
          return trimmed;
        }
        return '';
      }
      try {
        const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://pragyaninstitute.com';
        const url = new URL(trimmed, base);
        return ['https:', 'http:', 'blob:'].includes(url.protocol) ? url.href : '';
      } catch (_) {
        return '';
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG };
  }
})();

