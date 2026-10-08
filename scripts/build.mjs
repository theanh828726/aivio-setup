#!/usr/bin/env node
/**
 * Build dist/ from src/.
 *
 * dist/ is committed so `npx github:theanh828726/aivio-setup` and clones run without a build
 * step. This script is the single way to regenerate it: never edit dist/ by hand, edit src/
 * and run `npm run build`.
 *
 * Layout (src → dist):
 *   src/cli/cli.src.js      → dist/cli.js            (../server/ imports rewritten, made executable)
 *   src/server/*.js         → dist/server/*.js
 *   src/setup/data/*.js     → dist/setup/data/*.js
 *   src/setup/shared/*.js   → dist/setup/shared/*.js
 *   src/web/*               → dist/web/*
 * Editor-only files (src/setup/globals.d.ts, src/setup/jsconfig.json) are not shipped.
 *
 * Flags:
 *   --check   Build into a temp dir and compare with the committed dist/. Exit 1 when they
 *             differ, so CI or a pre-commit hook can catch a forgotten rebuild.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');

const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.md']);
const SKIP = new Set([
  path.join('setup', 'globals.d.ts'),
  path.join('setup', 'jsconfig.json'),
]);
const BOM = '﻿';
const CLI_IMPORT_FROM = "import('../server/";
const CLI_IMPORT_TO = "import('./server/";

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

/** Text files lose any UTF-8 BOM: a BOM before `#!` breaks the CLI on macOS/Linux. */
function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (TEXT_EXT.has(path.extname(from))) {
    let text = fs.readFileSync(from, 'utf8');
    if (text.startsWith(BOM)) text = text.slice(1);
    fs.writeFileSync(to, text, 'utf8');
  } else {
    fs.copyFileSync(from, to);
  }
}

function build(outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const sub of ['server', path.join('setup', 'data'), path.join('setup', 'shared'), 'web']) {
    const from = path.join(SRC, sub);
    for (const rel of walk(from)) {
      if (SKIP.has(path.join(sub, rel))) continue;
      copyFile(path.join(from, rel), path.join(outDir, sub, rel));
    }
  }

  const cliSrc = path.join(SRC, 'cli', 'cli.src.js');
  let cli = fs.readFileSync(cliSrc, 'utf8');
  if (cli.startsWith(BOM)) cli = cli.slice(1);
  if (!cli.includes(CLI_IMPORT_FROM)) {
    throw new Error(`build: expected ${CLI_IMPORT_FROM}… in src/cli/cli.src.js - update scripts/build.mjs if the CLI entry moved`);
  }
  // src/cli/ sits one level below src/server/, dist/cli.js sits next to dist/server/.
  cli = cli.split(CLI_IMPORT_FROM).join(CLI_IMPORT_TO);
  const cliOut = path.join(outDir, 'cli.js');
  fs.writeFileSync(cliOut, cli, 'utf8');
  fs.chmodSync(cliOut, 0o755);
}

function diffTrees(a, b) {
  const left = new Set(walk(a));
  const right = new Set(walk(b));
  const changed = [];
  for (const rel of new Set([...left, ...right])) {
    if (!left.has(rel) || !right.has(rel)) { changed.push(rel); continue; }
    if (!fs.readFileSync(path.join(a, rel)).equals(fs.readFileSync(path.join(b, rel)))) changed.push(rel);
  }
  return changed.sort();
}

if (CHECK) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aivio-dist-'));
  try {
    build(tmp);
    const changed = diffTrees(tmp, DIST);
    if (changed.length) {
      console.error('dist/ is out of date with src/. Run `npm run build`. Differences:');
      for (const rel of changed) console.error(`  ${rel}`);
      process.exit(1);
    }
    console.log('dist/ matches src/.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
} else {
  build(DIST);
  console.log(`Built dist/ from src/ (${walk(DIST).length} files).`);
}
