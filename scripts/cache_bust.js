import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function getBaseVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version ? pkg.version.split('.').slice(0, 2).join('.') : '90.0';
  } catch (_) {
    return '90.0';
  }
}

function computeBuildHash() {
  const hash = crypto.createHash('sha256');
  const filesToHash = [
    'index.html',
    'pay.html',
    'css/variables.css',
    'css/main.css',
    'css/components.css',
    'css/animations.css',
    'css/portal.css',
    'js/config.js',
    'js/supabase-sync.js',
    'js/chat.js',
    'js/app.js',
    'js/portal.js'
  ];

  for (const rel of filesToHash) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) {
      hash.update(fs.readFileSync(full));
    }
  }

  const baseVer = getBaseVersion();
  const shortHash = hash.digest('hex').slice(0, 8);
  return `${baseVer}.${shortHash}`;
}

function updateCacheBusting() {
  const buildVersion = computeBuildHash();
  const baseVer = getBaseVersion();
  console.log(`[CacheBust] Generated Build Hash: ${buildVersion}`);

  // 1. Update index.html
  const indexPath = path.join(ROOT, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  indexHtml = indexHtml.replace(/(\.(css|js))\?v=[a-zA-Z0-9_.-]+/g, `$1?v=${buildVersion}`);
  indexHtml = indexHtml.replace(/(id="siteVersionBadge"[^>]*>|letter-spacing:0.5px; color:rgba\(255,255,255,0.5\);">)v[0-9.]+/g, `$1v${baseVer}`);
  indexHtml = indexHtml.replace(/register\(['"]\.\/sw\.js(\?v=[a-zA-Z0-9_.-]+)?['"]\)/g, `register('./sw.js?v=${buildVersion}')`);
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log(`[CacheBust] Updated index.html with v=${buildVersion} and footer badge v${baseVer}`);

  // 2. Update pay.html
  const payPath = path.join(ROOT, 'pay.html');
  if (fs.existsSync(payPath)) {
    let payHtml = fs.readFileSync(payPath, 'utf8');
    payHtml = payHtml.replace(/(\.(css|js))\?v=[a-zA-Z0-9_.-]+/g, `$1?v=${buildVersion}`);
    fs.writeFileSync(payPath, payHtml, 'utf8');
    console.log(`[CacheBust] Updated pay.html with v=${buildVersion}`);
  }

  // 3. Update sw.js
  const swPath = path.join(ROOT, 'sw.js');
  let swJs = fs.readFileSync(swPath, 'utf8');
  swJs = swJs.replace(/const CACHE_NAME = 'pragyan-portal-[^']+';/, `const CACHE_NAME = 'pragyan-portal-v${buildVersion}';`);
  swJs = swJs.replace(/(\.(css|js)|logo\.png)\?v=[a-zA-Z0-9_.-]+/g, `$1?v=${buildVersion}`);
  fs.writeFileSync(swPath, swJs, 'utf8');
  console.log(`[CacheBust] Updated sw.js with CACHE_NAME and precache tags`);
}

updateCacheBusting();
