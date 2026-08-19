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

  const CONFIG = {
    IS_EXPERIMENT_MODE: true,
    USE_LIVE_SUPABASE: false,
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    GEMINI_API_KEY: '',
    API_BASE: ''
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG };
  }
})();

