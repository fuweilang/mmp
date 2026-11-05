#!/usr/bin/env node
/**
 * Single source: ground/config/version.json
 * Syncs into shared TS (+ dist so Node 运行时立刻生效), Octop pyproject/__init__.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = path.join(root, 'config', 'version.json');
const { version } = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
if (!version || typeof version !== 'string') {
  console.error('invalid version in', versionPath);
  process.exit(1);
}

const banner = '/** Auto-synced from ground/config/version.json — do not edit by hand. */';

const sharedSrc = path.join(root, 'packages/shared/src/version.ts');
fs.writeFileSync(sharedSrc, `${banner}\nexport const APP_VERSION = '${version}';\n`);

// Backend resolves @mammoth/shared via dist/; keep dist in lockstep without requiring tsc.
const sharedDistJs = path.join(root, 'packages/shared/dist/version.js');
const sharedDistDts = path.join(root, 'packages/shared/dist/version.d.ts');
if (fs.existsSync(path.dirname(sharedDistJs))) {
  fs.writeFileSync(
    sharedDistJs,
    `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.APP_VERSION = void 0;\n${banner}\nexports.APP_VERSION = '${version}';\n`,
  );
  fs.writeFileSync(sharedDistDts, `${banner}\nexport declare const APP_VERSION = "${version}";\n`);
}

const octopRoot = path.resolve(root, '../Octop');
const pyproject = path.join(octopRoot, 'pyproject.toml');
if (fs.existsSync(pyproject)) {
  let text = fs.readFileSync(pyproject, 'utf8');
  text = text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  fs.writeFileSync(pyproject, text);
}
const initPy = path.join(octopRoot, 'src/octop/__init__.py');
if (fs.existsSync(initPy)) {
  let text = fs.readFileSync(initPy, 'utf8');
  text = text.replace(/^__version__\s*=\s*"[^"]+"/m, `__version__ = "${version}"`);
  fs.writeFileSync(initPy, text);
}

console.log(`MAMMOTH_APP_VERSION=${version}`);
