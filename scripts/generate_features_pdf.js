import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const htmlFile = path.join(ROOT, 'features.html');
const pdfFile = path.join(ROOT, 'Pragyan_Institute_Portal_Features.pdf');

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

let browserPath = null;
for (const p of edgePaths) {
  if (fs.existsSync(p)) {
    browserPath = p;
    break;
  }
}

if (!browserPath) {
  console.error('Error: Headless browser not found on system.');
  process.exit(1);
}

console.log(`Using Browser: ${browserPath}`);
console.log(`Generating PDF from: ${htmlFile}`);

const cmd = `"${browserPath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfFile}" "file://${htmlFile.replace(/\\/g, '/')}"`;

try {
  execSync(cmd, { stdio: 'inherit' });
  if (fs.existsSync(pdfFile)) {
    const stats = fs.statSync(pdfFile);
    console.log(`\n✅ PDF Generated Successfully!`);
    console.log(`File: ${pdfFile}`);
    console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB\n`);
  } else {
    console.error('Error: PDF file was not created.');
    process.exit(1);
  }
} catch (err) {
  console.error('Failed to generate PDF:', err.message);
  process.exit(1);
}
