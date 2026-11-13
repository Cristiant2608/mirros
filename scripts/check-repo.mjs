// Zero-dependency repository health check: validates CJS/MJS syntax and local links in Markdown/HTML.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, filter) {
  const results = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['node_modules', '.venv', '.git', 'dist', 'build', 'artifacts'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full, filter));
    else if (filter(full)) results.push(full);
  }
  return results;
}

// 1. Verify Node syntax for CommonJS and non-JSX ES modules
const jsFiles = [
  ...walk(path.join(root, 'desktop'), f => f.endsWith('.cjs')),
  ...walk(path.join(root, 'scripts'), f => f.endsWith('.cjs') || f.endsWith('.mjs')),
  ...walk(path.join(root, 'tests'), f => f.endsWith('.cjs') || f.endsWith('.mjs')),
];

for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], {stdio: 'pipe'});
}

// 2. Verify all relative links and image paths in READMEs and docs/
const docFiles = [
  path.join(root, 'README.md'),
  path.join(root, 'README.es.md'),
  path.join(root, 'CONTRIBUTING.md'),
  path.join(root, 'SECURITY.md'),
  ...walk(path.join(root, 'docs'), f => f.endsWith('.md') || f.endsWith('.html')),
];

const missing = [];
for (const file of docFiles) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);

  const refs = new Set();
  for (const m of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) refs.add(m[1]);
  for (const m of content.matchAll(/(?:src|href)=["']([^"']+)["']/g)) refs.add(m[1]);

  for (const raw of refs) {
    const clean = raw.split('#')[0].split('?')[0].trim();
    if (
      !clean ||
      clean.startsWith('http://') ||
      clean.startsWith('https://') ||
      clean.startsWith('mailto:') ||
      clean.startsWith('data:') ||
      clean.startsWith('#')
    ) {
      continue;
    }
    const target = path.resolve(dir, clean);
    if (!fs.existsSync(target)) {
      missing.push(`${path.relative(root, file)} -> ${raw}`);
    }
  }
}

if (missing.length > 0) {
  console.error('Broken local links detected:\n' + missing.map(item => `  - ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Repo check passed: ${jsFiles.length} JS/CJS/MJS files syntax-checked, ${docFiles.length} docs verified.`);
