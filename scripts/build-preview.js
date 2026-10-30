// v5 batch 8: the local preview for Rogin. Copies dist/ and changes the copy so index.html also opens from a double-click:
// Chrome refuses module scripts and crossorigin assets on file://, so the bundle (one chunk, no imports) loads as a plain
// deferred script. dist/ itself is left as it is. Writes running-light-v5-rc.zip. Nothing is published.
// Run: npm run preview:rc (builds first). Argument: output folder, default /workspace/casino-games/running-light/v5-batch8
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const DIST = path.resolve(new URL('../dist/', import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] || '/workspace/casino-games/running-light/v5-batch8');
const NAME = 'running-light-v5-rc';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'rl-preview-'));
const root = path.join(tmp, NAME);
try {
  cpSync(DIST, root, { recursive: true });
  const scripts = readdirSync(path.join(root, 'assets')).filter((f) => f.endsWith('.js'));
  if (scripts.length !== 1) throw new Error(`expected one bundle, found ${scripts.length}`);
  const js = path.join(root, 'assets', scripts[0]);
  const code = readFileSync(js, 'utf8');
  if (/\bimport\.meta\b|\bimport\s*\(|^\s*(import|export)\s/m.test(code)) throw new Error('the bundle needs module loading');
  writeFileSync(js, `(function () { 'use strict';\n${code}\n})();\n`); // module scoping and strictness, kept
  const page = path.join(root, 'index.html');
  const html = readFileSync(page, 'utf8');
  const local = html.replace('<script type="module" crossorigin src=', '<script defer src=').replace('<link rel="stylesheet" crossorigin href=', '<link rel="stylesheet" href=');
  if (/type="module"|crossorigin/.test(local)) throw new Error('index.html still needs module or CORS loading');
  writeFileSync(page, local);
  const zip = path.join(OUT, `${NAME}.zip`);
  rmSync(zip, { force: true });
  execFileSync('python3', ['-I', '-m', 'zipfile', '-c', zip, NAME], { cwd: tmp, stdio: 'inherit' });
  console.log(`${zip} written`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
